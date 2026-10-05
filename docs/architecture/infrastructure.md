# Infrastructure and Capacity Baseline

Canonical source of truth for project infrastructure resources, agreed operational constraints, and pending technical decisions.

## 1. Scope and Status

- **Purpose:** Host a functional demonstration environment for an e-commerce platform (backend, database, external services, and webhooks), with potential future evolution into a personal production store.
- **Acquisition and provisioning status:** NOT CONFIRMED. Server purchase, provisioning, and deployment are currently unconfirmed. Do not assume services are active or purchased.
- **Capacity and performance:** No benchmarked capacity or concurrency measurements exist. Performance is not guaranteed.
- **Precedence over historical documents:** `docs/plan-payload.md` represents an early historical proposal (e.g., references to Cloudflare/Vercel). It does not override decisions in this document or approve any pending technology stack.

## 2. Hardware and Provider Specifications

| Parameter | Specification | Status / Source |
|---|---|---|
| Provider | Contabo | Approved selection |
| Base plan | 4 vCPU / 8 GB RAM / 100 GB SSD / 1 snapshot | Approved selection |
| Disk type | Standard SSD (not NVMe) | Approved selection |
| Network | 200 Mbit/s advertised port speed | Approved selection (advertised port speed, not guaranteed sustained throughput) |
| Region | US East (+€1.55/month over base plan) | Planned selection (observed in purchase configuration) |
| Operating system | Ubuntu (specific version pending) | Planned selection (specific release version unresolved) |
| Reported cost | €7.05/month | User-reported figure (unverified breakdown of term, tax, or setup fees) |

## 3. Known Constraints and Operational Limits

- **Single virtual server (no high availability):** The environment is planned on a single virtual machine, presenting a single point of failure (SPOF) without automated failover or redundant nodes.
- **Proposed service placement:** Placing all application, database, and auxiliary services on this single VPS is a proposed deployment topology, not an approved or finalized architectural decision.
- **Snapshots are not independent backups:** The included provider snapshot resides within Contabo infrastructure and does not replace off-site, independent backups.
- **Network port speed vs. throughput:** The 200 Mbit/s port speed is an advertised port limit, not a guaranteed sustained throughput. Avoid assuming specific external network topologies.
- **Bounded host resources:** Total host capacity (8 GB RAM, 100 GB SSD) must accommodate the operating system, all running services, databases, media, and logs without pre-allocated overflow.

## 4. Recommended Technical Safeguards

The following safeguards mitigate single-node failure risks and resource contention:

- **External backups:** Automated, off-provider backups (e.g., S3-compatible object storage) for database dumps and media assets (strategy approved in Section 5; provider and retention pending).
- **Container isolation:** Containerization (e.g., Docker Compose) with explicit CPU and memory resource limits per service (approved in Section 5).
- **Reverse proxy and TLS:** Lightweight reverse proxy (e.g., Caddy or Nginx) handling TLS termination, compression, and basic header security (pending approval).
- **Resource monitoring:** Proactive monitoring with threshold alerts for storage exhaustion and RAM pressure (pending approval).

## 5. Architectural Decisions (Checked = Approved, Unchecked = Pending)

The following items require explicit user authorization before implementation, provisioning, or stack commitment:

- [ ] Confirmation of VPS purchase, billing term, provisioning, and activation.
- [ ] Selection of specific Ubuntu release version.
- [x] Backend framework and runtime selection: Go Modular Monolith (Pragmatic Hexagonal Architecture, standard library `net/http`, `pgx/v5` + `sqlc`, `goose` migrations, in-memory cache via `CachePort`). Detailed in [system-architecture.md](system-architecture.md).
- [x] Frontend architecture and rendering framework selection: Astro with React Islands (`@astrojs/react`), Storefront UI (`@storefront-ui/react`), and Tailwind CSS. Detailed in [system-architecture.md](system-architecture.md).
- [x] Database engine, configuration, and data persistence topology: PostgreSQL 18 (supported until November 2030) with isolated schemas per domain module (`catalog`, `orders`, `payments`, etc.) and zero cross-schema foreign keys. Detailed in [system-architecture.md](system-architecture.md) and [data-modeling.md](data-modeling.md).
- [x] Service placement and containerization strategy: single VPS running all services with Docker Compose and per-service memory limits (Go backend, PostgreSQL 18, reverse proxy); local development uses Docker for PostgreSQL and Testcontainers while Go and Astro run natively. Detailed in [system-architecture.md](system-architecture.md).
- [ ] Reverse proxy selection, domain configuration, and TLS certificate automation.
- [x] External backup strategy: daily `pg_dump -Fc` on the VPS plus restic to off-site S3-compatible object storage with client-side encryption and deduplication, including media if stored on disk; monthly restore drill into a separate database. Point-in-time recovery (pgBackRest) deferred until sales scale. Detailed in [system-architecture.md](system-architecture.md).
- [ ] External backup provider, cadence, and retention policy (initial proposal: 7 daily, 4 weekly, 6 monthly; provider and retention pending user authorization).
- [x] CI/CD pipeline and deployment automation workflow: project script run from developer machine (preflight checks / local CI, Linux container builds, `docker save | ssh docker load`, pre-deploy `pg_dump -Fc`, goose migrations with expand-migrate-contract, Docker Compose start, health check, automatic rollback, release record). No GitHub Actions required. Detailed in [system-architecture.md](system-architecture.md) and the `deployment` skill.
