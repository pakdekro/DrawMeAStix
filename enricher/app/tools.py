"""Safe execution of the enrichment binaries + selector validation.

Security rules (the binaries are handed user-controlled input):
- arguments passed as an ARRAY, never through a shell;
- the shape of the selector is validated BEFORE any spawn;
- hard timeout on every call.

Also holds the HTTP groundwork for the slow remote sources (#124).
"""

from __future__ import annotations

import ipaddress
import json
import re
import subprocess
import time
import urllib.error
import urllib.request
from typing import Any

from app import config
from app.config import TOOL_TIMEOUT_SECONDS, logger

# re.ASCII is INDISPENSABLE here: on a str pattern, re.IGNORECASE applies full
# Unicode case folding, so [a-z] also matches U+017F (ſ) and U+212A (K). Those
# values passed validation and then went out into an outgoing URL, where
# putrequest does a .encode("ascii") - UnicodeEncodeError is a ValueError,
# caught by nobody, hence a 500. A domain name is ASCII by construction (an
# IDN reaches us already in punycode).
_DOMAIN_RE = re.compile(
    r"^(?=.{1,253}$)([a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$",
    re.IGNORECASE | re.ASCII,
)


class ToolError(Exception):
    """A binary failed to run (not found, timed out, non-zero exit code)."""


class SourceUnavailable(ToolError):
    """The remote source did not answer - message meant for the analyst.

    Kept apart from ToolError because the cause is external and temporary:
    there is nothing for the user to fix, they just have to retry. The
    message carried by this exception is the only one that travels up to the
    browser (ToolError stays generic so nothing about the host leaks).
    """


def is_domain(value: str) -> bool:
    return bool(_DOMAIN_RE.match(value.strip()))


def is_ip(value: str) -> bool:
    """True for a literal IP address, WITHOUT an RFC 4007 scope id.

    Rejecting the scope is a security measure, not purism.
    ipaddress.ip_address() accepts "fe80::1%<anything>": CPython only
    refuses a scope that is empty or that contains '%'. Spaces, semicolons,
    newlines and 200 KB of padding therefore passed validation.
    With no shell and no argv splitting this was not an RCE, but:
      - GNU whois writes the query as is followed by a CRLF, so a newline
        injects one extra line of protocol (the Team Cymru interface has a
        bulk begin/end mode);
      - a scope past MAX_ARG_STRLEN makes the exec fail with E2BIG.
    Careful: str(ip_address(v)) is NOT enough, it KEEPS the scope.
    A scope id only means something locally, never for a CTI selector.
    """
    try:
        addr = ipaddress.ip_address(value.strip())
    except ValueError:
        return False
    return getattr(addr, "scope_id", None) is None


_CVE_RE = re.compile(r"^CVE-\d{4}-\d{4,}$", re.IGNORECASE | re.ASCII)


def validate_selector(stix_type: str, value: str) -> str:
    """Return the cleaned selector if its shape fits the type, otherwise raise."""
    v = value.strip()
    if stix_type == "domain-name" and is_domain(v):
        return v.lower()
    if stix_type in ("ipv4-addr", "ipv6-addr") and is_ip(v):
        # Canonical form (lowercase, compressed): main.py keys its cache on the
        # lowercased selector, so 2001:DB8::1 and 2001:db8::1 already land on
        # one entry - without this they would share that entry without sharing
        # the request that filled it.
        return str(ipaddress.ip_address(v))
    if stix_type == "vulnerability" and _CVE_RE.match(v):
        return v.upper()
    # The refused selector is NOT echoed in the message: main.py logs the text
    # of the exception, and config.py promises never to write selectors to the
    # logs. The type alone is enough to diagnose.
    raise ToolError(f"invalid selector for {stix_type}")


_USER_AGENT = "drawmeastix-enricher"

# Codes that mean a saturated source, not a faulty request: worth replaying.
# Measured on crt.sh: a 502 comes back in 0.1 s, so a retry costs almost
# nothing where giving up costs the whole enrichment.
RETRYABLE_STATUS = frozenset({429, 500, 502, 503, 504})


def http_get_json(
    url: str,
    *,
    source: str,
    timeout: int | None = None,
    budget: int | None = None,
    attempts: int | None = None,
    retry_status: frozenset[int] = RETRYABLE_STATUS,
) -> Any:
    """JSON GET that puts up with temperamental sources (#124).

    Retries as long as the source answers with a "saturated" code or does not
    answer at all, bounded by `attempts` tries AND by a total budget: a try is
    only started if there is enough left to carry it through, so the analyst
    never waits much beyond the budget that was announced.

    `retry_status` widens that list when a source bends a code away from its
    usual meaning (see crtsh.py for the 404 case).
    """
    timeout = config.HTTP_TIMEOUT_SECONDS if timeout is None else timeout
    budget = config.HTTP_BUDGET_SECONDS if budget is None else budget
    attempts = config.HTTP_MAX_ATTEMPTS if attempts is None else attempts

    deadline = time.monotonic() + budget
    req = urllib.request.Request(
        url, headers={"User-Agent": _USER_AGENT, "Accept": "application/json"}
    )
    last = "no response"
    tried = 0
    rate_limited: str | None = None

    for attempt in range(1, attempts + 1):
        remaining = deadline - time.monotonic()
        # do not start a try we would have to cut off in flight: without
        # enough margin it would burn the wait without ever completing
        if remaining <= 1:
            break
        tried = attempt
        try:
            with urllib.request.urlopen(req, timeout=min(timeout, int(remaining))) as resp:
                return json.load(resp)
        except urllib.error.HTTPError as exc:
            last = f"HTTP {exc.code}"
            if exc.code == 429:
                # quota reached: the source itself says when to come back (#175).
                # The selector has nothing to do with it, the IP is what counts.
                rate_limited = exc.headers.get("Retry-After") if exc.headers else None
            if exc.code not in retry_status:
                raise SourceUnavailable(f"{source} refused the request ({last}).") from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            # the reason is read by the analyst: a Python class name teaches
            # them nothing, so we put it in their words
            last = "timed out" if isinstance(exc, TimeoutError) else "connection failed"
        except json.JSONDecodeError as exc:
            # truncated response or an HTML error page: worth replaying
            last = "unreadable response"
            logger.warning("%s: non-JSON response (%s)", source, exc)

        # only the technical reason gets logged, never the selector
        logger.info("%s: attempt %d/%d failed (%s)", source, attempt, attempts, last)
        _backoff(attempt, deadline)

    if rate_limited is not None:
        # A distinct message, and above all an honest one about what to do.
        # Measured on CIRCL (#175): the 429 is CACHED by their Varnish for
        # 30 minutes, on the exact URL. Retrying the same CVE right away is
        # therefore useless, even when the quota is in fact free again -
        # while another CVE will go through. Without this, the analyst
        # believes the tool is broken and keeps hammering.
        raise SourceUnavailable(
            f"{source} refused with a rate limit, and caches that refusal for "
            "about 30 minutes on this exact request. Retrying the same item now "
            "will not help; another one will most likely work."
        )
    raise SourceUnavailable(
        f"{source} did not answer after {tried} attempt(s) in {budget}s ({last}). "
        "This source is regularly saturated: try again in a few minutes."
    )


def _backoff(attempt: int, deadline: float) -> None:
    """Growing pause between two tries, never beyond the deadline."""
    delay = min(2 ** (attempt - 1), 8)
    time.sleep(max(0.0, min(delay, deadline - time.monotonic())))


def run_tool(args: list[str], timeout: int = TOOL_TIMEOUT_SECONDS) -> str:
    """Run a binary (array of arguments, no shell) and give back stdout."""
    try:
        proc = subprocess.run(
            args,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
    except FileNotFoundError as exc:
        raise ToolError(f"binary not found: {args[0]}") from exc
    except subprocess.TimeoutExpired as exc:
        raise ToolError(f"timeout ({timeout}s) on {args[0]}") from exc
    except OSError as exc:
        # E2BIG (argv too long), EMFILE, ENOMEM... Without this net, the
        # OSError climbs up to FastAPI and comes out as a bare 500.
        raise ToolError(f"could not run {args[0]}: {exc.strerror}") from exc
    if proc.returncode != 0 and not proc.stdout.strip():
        # stderr stays on the server side (ToolError does not reach the
        # browser), but dig and whois repeat the requested name in it, so we
        # do not log it: the "zero selector logging" promise holds for error
        # messages too.
        raise ToolError(f"{args[0]} exited with code {proc.returncode}")
    return proc.stdout
