/**
 * Passive enrichment (#67): talks to the enrichment sidecar(s).
 *
 * Endpoints live in localStorage - a global setting, local, forgettable.
 * No endpoint configured = guaranteed offline mode: no network call is
 * possible at all, and that is demonstrable in the network tab.
 *
 * The TOKEN, though, is a secret and not a setting (#227). By default it does
 * not survive closing the tab: it goes to sessionStorage, not to
 * localStorage. This is not encryption - both are read just as easily - but
 * it bounds the token's life to the working session instead of leaving it on
 * disk indefinitely. Whoever prefers the opposite asks for it explicitly,
 * endpoint by endpoint.
 */

export interface EnrichEndpoint {
  id: string;
  label: string;
  url: string;
  token: string;
  /** true when the token is written to disk rather than kept for the session */
  remember: boolean;
}

export interface EnricherInfo {
  id: string;
  label: string;
  description: string;
  accepts: string[];
}

interface EnrichCandidate {
  ref: string;
  stix_type: string;
  name: string;
  properties: Record<string, unknown>;
}

interface EnrichRelation {
  source_ref: string;
  rel_type: string;
  target_ref: string;
  description: string;
}

interface EnrichNote {
  target_ref: string;
  content: string;
}

interface EnrichResponse {
  enricher: string;
  candidates: EnrichCandidate[];
  relations: EnrichRelation[];
  notes?: EnrichNote[];
}

/** The enriched selection, referenced by the relationships that come back. */
export const SOURCE_REF = "source";

const STORAGE_KEY = "dmas.enrich.endpoints";

/**
 * Tokens that are not remembered. sessionStorage and not localStorage: wiped
 * when the tab closes, and never picked up by a backup file, which only reads
 * localStorage.
 */
const SESSION_TOKENS_KEY = "dmas.enrich.tokens";

/** What is really written to disk: the token is absent when `remember` is false. */
type StoredEndpoint = Omit<EnrichEndpoint, "remember"> & { remember?: boolean };

function sessionTokens(): Record<string, string> {
  try {
    const raw = sessionStorage.getItem(SESSION_TOKENS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function loadEndpoints(): EnrichEndpoint[] {
  let stored: StoredEndpoint[];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    stored = raw ? (JSON.parse(raw) as StoredEndpoint[]) : [];
  } catch {
    return [];
  }
  const session = sessionTokens();
  return stored.map((endpoint) => {
    // A record written before this setting existed carries its token and no
    // flag: read it as "remembered", otherwise the update would silently wipe
    // the configuration of anyone who had already set it up.
    const remember = endpoint.remember ?? true;
    return {
      ...endpoint,
      remember,
      token: remember ? endpoint.token : (session[endpoint.id] ?? ""),
    };
  });
}

export function saveEndpoints(endpoints: EnrichEndpoint[]): void {
  const session: Record<string, string> = {};
  const stored: StoredEndpoint[] = endpoints.map((endpoint) => {
    if (endpoint.remember) return endpoint;
    if (endpoint.token) session[endpoint.id] = endpoint.token;
    return { ...endpoint, token: "" };
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  try {
    if (Object.keys(session).length > 0) {
      sessionStorage.setItem(SESSION_TOKENS_KEY, JSON.stringify(session));
    } else {
      sessionStorage.removeItem(SESSION_TOKENS_KEY);
    }
  } catch {
    // sessionStorage unavailable (locked-down private browsing): the token
    // stays in the tab's state and holds for this session, it will have to be
    // typed again after a reload. Losing a token is repairable; making the
    // endpoint fail to save would not be.
  }
}

export function newEndpointId(): string {
  return crypto.randomUUID();
}

function baseUrl(endpoint: EnrichEndpoint): string {
  return endpoint.url.trim().replace(/\/+$/, "");
}

/**
 * Browser-side waiting ceiling (#124). Deliberately wider than the sidecar's
 * own budget on slow sources (crt.sh can legitimately take a minute and a
 * half, retries included): this delay is only here so the interface is not
 * left blocked forever when the connection itself stays hung.
 */
const REQUEST_TIMEOUT_MS = 150_000;

/** Error message from the sidecar (FastAPI's `detail` field), if readable. */
async function serverDetail(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as { detail?: unknown };
    return typeof body.detail === "string" && body.detail.trim() ? body.detail : null;
  } catch {
    return null;
  }
}

async function call<T>(endpoint: EnrichEndpoint, path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  try {
    res = await fetch(`${baseUrl(endpoint)}${path}`, {
      ...init,
      signal: timeout,
      headers: {
        Authorization: `Bearer ${endpoint.token}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch (e) {
    if ((e as Error).name === "TimeoutError") {
      throw new Error(
        "timed out - the queried source is not answering, try again in a few minutes",
      );
    }
    // network failure: usually mixed content (HTTPS app → HTTP endpoint) or
    // CORS. The browser gives no detail - so we point the user at the causes.
    throw new Error(
      "endpoint unreachable - check the URL, HTTPS (an HTTPS app cannot call an HTTP endpoint) and the sidecar CORS list",
    );
  }
  if (res.status === 401) throw new Error("token rejected (401)");
  if (!res.ok) {
    // 503 = remote source saturated (#124): the sidecar says which one and
    // what to do, that message is worth more than a bare code.
    throw new Error((await serverDetail(res)) ?? `error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function fetchCatalog(endpoint: EnrichEndpoint): Promise<EnricherInfo[]> {
  return call<EnricherInfo[]>(endpoint, "/enrichers");
}

export function runEnrich(
  endpoint: EnrichEndpoint,
  enricher: string,
  type: string,
  value: string,
): Promise<EnrichResponse> {
  return call<EnrichResponse>(endpoint, "/enrich", {
    method: "POST",
    body: JSON.stringify({ enricher, type, value }),
  });
}
