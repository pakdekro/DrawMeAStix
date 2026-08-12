"""Sidecar API contract (see #62).

The sidecar knows nothing about the canvas: it returns *candidates* (entities
to create) and *relations* between them, where the enriched selector is named
by the special reference "source". The app puts it all in the triage tray.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

# Reference of the enriched node in the relations we return.
SOURCE_REF = "source"

# Length caps on incoming fields.
#
# They have to live HERE, in the code, and not only in a reverse proxy: the
# analyst who self-hosts the sidecar will not have our Caddy. These are the
# only guardrails guaranteed in every deployment.
#
# They do not replace a body size limit on the proxy side though: FastAPI
# reads and decodes the JSON BEFORE running the dependencies, so
# `dependencies=[Auth]` structurally does not cover that step and a huge body
# is buffered then parsed even without a token. These caps bound the object
# after parsing; the proxy limit bounds the bytes received. Both are needed.
MAX_ID_LEN = 64       # enricher id and STIX type: slugs
MAX_VALUE_LEN = 512   # an FQDN caps at 253, an IPv6 at 45, a CVE at ~20


class EnricherInfo(BaseModel):
    id: str
    label: str
    description: str
    # STIX types the enricher knows how to take as input
    accepts: list[str]


class EnrichRequest(BaseModel):
    enricher: str = Field(max_length=MAX_ID_LEN)
    type: str = Field(max_length=MAX_ID_LEN)
    value: str = Field(max_length=MAX_VALUE_LEN)


class Candidate(BaseModel):
    # reference local to the response (e.g. "c0"), cited by the relations
    ref: str
    stix_type: str
    name: str
    properties: dict = {}


class Relation(BaseModel):
    # "source" = the enriched node; otherwise the ref of a candidate
    source_ref: str
    rel_type: str
    target_ref: str
    description: str = ""


class Note(BaseModel):
    # information attached to an entity (the enriched "source" node or a
    # candidate) that does not deserve a STIX entity of its own: registrar,
    # dates, BGP prefix... Becomes a STIX `note` object on export.
    target_ref: str
    content: str


class EnrichResponse(BaseModel):
    enricher: str
    candidates: list[Candidate]
    relations: list[Relation]
    notes: list[Note] = []
