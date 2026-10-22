# syntax=docker/dockerfile:1

# Build stage: compiles api and migrate binaries using audited Go 1.27.3
FROM golang:1.27.3-trixie@sha256:604106102d33b1084e37ca08adf98ac0813624ae8595bd0d7f3965ecebded09c AS builder

WORKDIR /src

# Download dependencies first for layer caching
COPY go.mod go.sum ./
RUN go mod download

# Copy source files
COPY . .

# Build static binaries
RUN CGO_ENABLED=0 go build -mod=readonly -trimpath -o /app/api ./cmd/api && \
    CGO_ENABLED=0 go build -mod=readonly -trimpath -o /app/migrate ./cmd/migrate

# Runtime stage: minimal distroless static Debian 13 nonroot image
FROM gcr.io/distroless/static-debian13:nonroot@sha256:516757106de35205efb70b91ba03f6f1298424a0678c603255cf2852a7000087

WORKDIR /app

COPY --from=builder /app/api /app/api
COPY --from=builder /app/migrate /app/migrate

USER 65532:65532
ENV API_ADDR=:8080

ENTRYPOINT ["/app/api"]
