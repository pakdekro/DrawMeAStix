# --- Étape 1 : build du frontend -------------------------------------------
FROM node:22-alpine AS front
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- Étape 2 : image finale - fichiers statiques uniquement ------------------
# Local-first : toute la logique (STIX, stockage IndexedDB) tourne dans le
# navigateur. Le serveur n'héberge que du code, jamais de données.
FROM nginx:alpine
COPY --from=front /build/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY nginx-security-headers.conf /etc/nginx/conf.d/dmas-security-headers.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
    CMD ["wget", "-q", "--spider", "http://127.0.0.1/"]
