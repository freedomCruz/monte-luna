# syntax=docker/dockerfile:1

# Stage 1: Build Caddy with standard modules using audited Go 1.27.3
FROM golang:1.27.3-trixie@sha256:604106102d33b1084e37ca08adf98ac0813624ae8595bd0d7f3965ecebded09c AS caddy-builder

WORKDIR /src/deploy/caddy

COPY deploy/caddy/go.mod deploy/caddy/go.sum ./
RUN go mod download

COPY deploy/caddy/main.go ./
RUN CGO_ENABLED=0 go build -mod=readonly -trimpath -o /usr/bin/caddy .

# Prepare data and config directories owned by nonroot (65532:65532)
RUN mkdir -p /data /config && chown -R 65532:65532 /data /config

# Stage 2: Build frontend static assets using Node 24.21.0 and npm 12.2.0
FROM node:24.21.0-trixie-slim@sha256:173f125896c3b47ddf056734c7ea789d04595a6a08769a8f78e0df642781fb66 AS frontend-builder

ARG CATALOG_API_URL=""
ENV CATALOG_API_URL=${CATALOG_API_URL}

# Enforce npm 12.2.0 as specified by devEngines
RUN npm install -g npm@12.2.0

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json frontend/.npmrc ./
RUN npm ci

COPY frontend/ ./
RUN npm run build
RUN if [ ! -f dist/404.html ]; then echo '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>404 - No encontrado</title></head><body><h1>404 - Página no encontrada</h1></body></html>' > dist/404.html; fi

# Stage 3: Minimal distroless nonroot runtime image
FROM gcr.io/distroless/static-debian13:nonroot@sha256:516757106de35205efb70b91ba03f6f1298424a0678c603255cf2852a7000087

COPY --from=caddy-builder /usr/bin/caddy /usr/bin/caddy
COPY --from=caddy-builder --chown=65532:65532 /data /data
COPY --from=caddy-builder --chown=65532:65532 /config /config

COPY deploy/caddy/Caddyfile /etc/caddy/Caddyfile
COPY --from=frontend-builder --chown=65532:65532 /app/frontend/dist /srv

ENV XDG_DATA_HOME=/data
ENV XDG_CONFIG_HOME=/config

USER 65532:65532

EXPOSE 80 443 443/udp

ENTRYPOINT ["/usr/bin/caddy"]
CMD ["run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
