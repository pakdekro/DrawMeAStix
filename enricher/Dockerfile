# Sidecar d'enrichissement passif de Draw Me A STIX.
# Contexte de build : ./enricher

# --- Étape 1 : binaires ProjectDiscovery (Go), versions épinglées ----------
# asnmap NON inclus : sa v1.1.1 route par l'API cloud PDCP (clé obligatoire),
# incompatible « binaires sans API ». L'enricher asnmap passe par le whois
# Team Cymru (binaire whois ci-dessous), sans clé.
FROM golang:1.23-bookworm AS gotools
RUN go install github.com/projectdiscovery/subfinder/v2/cmd/subfinder@v2.6.6

# --- Étape 2 : image finale -------------------------------------------------
FROM python:3.13-slim
# uv épinglé comme les binaires Go ci-dessus : `:latest` rendait l'image
# non reproductible, alors que tout le reste du fichier l'est - et `uv sync
# --frozen` mérite un outil dont on connaît la version.
COPY --from=ghcr.io/astral-sh/uv:0.12.3 /uv /usr/local/bin/uv

# dig (dnsutils) et whois depuis Debian ; certs pour les sorties HTTPS
RUN apt-get update && apt-get install -y --no-install-recommends \
      dnsutils whois ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=gotools /go/bin/subfinder /usr/local/bin/

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

# Dépendances d'abord (cache Docker), sans les dépendances de dev
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY app ./app
RUN uv sync --frozen --no-dev

# Les binaires d'enrichissement reçoivent une entrée contrôlée par
# l'utilisateur : ne pas les exécuter en root.
RUN useradd --create-home --uid 10001 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8001/health', timeout=2)"]

# uvicorn directement depuis le venv : pas de resync uv au démarrage (le venv
# est figé au build), boot rapide et rien à écrire au runtime.
CMD ["/app/.venv/bin/uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
