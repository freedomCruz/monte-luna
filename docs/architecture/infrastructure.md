# Infrastructure and Capacity Baseline

Canonical source of truth for project infrastructure resources, agreed operational constraints, and pending technical decisions.

## 1. Scope and Status

- **Purpose:** Host a functional demonstration environment for an e-commerce platform (backend, database, external services, and webhooks), with potential future evolution into a personal production store.
- **Acquisition and provisioning status:** PURCHASED, PROVISIONED, AND ACTIVE. The user confirmed the purchase on 2026-10-20 and supplied host-observed provisioning evidence on 2026-10-21. Ubuntu is running and accessible; baseline host hardening was completed and verified on 2026-10-21 (key-only SSH for a non-root administrator, SSH-only host firewall, current updates, bounded swap, verified provider console recovery), with Contabo follow-ups for the cloud-init `bootcmd` failure and CPU microcode mitigation still open. Billing term, exact region, and deployment remain unconfirmed. Do not assume application services are installed or running.
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
| Operating system | Ubuntu 24.04.5 LTS (Noble Numbat), kernel `6.8.0-147-generic`, x86-64 | Confirmed after the controlled update and reboot on 2026-10-21 |
| Virtualization | KVM full virtualization on QEMU | Confirmed from host output supplied by the user on 2026-10-21 |
| Observed CPU | 4 online vCPUs, AMD EPYC Processor, 1 thread per core | Confirmed from host output; shared-host performance remains unbenchmarked |
| Observed memory | 7.8 GiB RAM; approximately 7.3 GiB available at observation time | Confirmed from host output; transient utilization only |
| Configured swap | 2 GiB `/swapfile` (root-owned, mode `600`), persistent through `/etc/fstab`; `vm.swappiness=10` | Approved and verified on the host on 2026-10-21 |
| Observed disk | 100 GB virtual disk; 96 GiB root filesystem with approximately 94 GiB available at observation time | Confirmed from host output; transient utilization only |
| Reported cost | €7.05/month | User-reported figure (unverified breakdown of term, tax, or setup fees) |

Host-specific machine IDs, boot IDs, and hostnames are intentionally not recorded in the repository because they are unnecessary for architecture and deployment decisions.

## 3. Known Constraints and Operational Limits

- **Single virtual server (no high availability):** The environment is planned on a single virtual machine, presenting a single point of failure (SPOF) without automated failover or redundant nodes.
- **Proposed service placement:** Placing all application, database, and auxiliary services on this single VPS is a proposed deployment topology, not an approved or finalized architectural decision.
- **Snapshots are not independent backups:** The included provider snapshot resides within Contabo infrastructure and does not replace off-site, independent backups.
- **Network port speed vs. throughput:** The 200 Mbit/s port speed is an advertised port limit, not a guaranteed sustained throughput. Avoid assuming specific external network topologies.
- **Bounded host resources:** Total host capacity (7.8 GiB observed RAM, 100 GB virtual disk) must accommodate the operating system, all running services, databases, media, and logs without pre-allocated overflow.
- **Bounded swap as a safety margin:** A 2 GiB swap file with `vm.swappiness=10` absorbs short peaks (image loads, migrations, `pg_dump`, backups, rollback overlap) instead of letting the kernel OOM killer terminate PostgreSQL. It is not additional capacity: the disk is standard SSD, so sustained swap use is a sizing alert that requires adjusting service limits or the plan. Docker Compose services must set `memswap_limit` explicitly so containers cannot silently consume host swap. Re-measure memory and swap with the deployed services.
- **CPU mitigation status:** After applying the available Ubuntu updates and rebooting into kernel `6.8.0-147-generic`, the kernel vulnerability file still reports `Spec rstack overflow: Vulnerable: Safe RET, no microcode`. Escalate the missing microcode mitigation to Contabo before production traffic; guest package updates did not resolve the provider-controlled CPU exposure.

### 3.1 Observed Host Readiness (2026-10-21)

| Check | Observed state | Readiness consequence |
|---|---|---|
| Time | `Europe/Berlin`; NTP enabled and synchronized | Functional; decide whether production operations standardize the host on UTC |
| Cloud-init | Provider-supplied NoCloud user-data from the virtual media has valid schema but its `bootcmd` exits with status 1 on boot; it also uses deprecated `chpasswd.list`; `cloud-init.service` remains failed | Provider-owned provisioning defect: do not inspect/publish raw user-data, rerun or clean cloud-init, or disable it blindly; request Contabo remediation before production |
| Failed units | `cloud-init.service`; the prior `systemd-networkd-wait-online.service` failure cleared after reboot | Diagnose or document the remaining cloud-init failure before production; network is operational |
| Package updates | Controlled update completed and rebooted into kernel `6.8.0-147-generic`; only `cloud-init` 26.2 remains deferred by Ubuntu phased updates; unattended upgrades remain active; no further reboot required | Do not bypass Ubuntu phasing; diagnose cloud-init separately and recheck normal updates before production |
| Recovery access | Contabo VNC console reached the Ubuntu login prompt independently of SSH; protected by a unique VNC password | Keep available during lockout-sensitive hardening because changing the provider VNC state requires a restart |
| Host firewall | UFW active and enabled at startup; logging `low`; default deny incoming, allow outgoing, routed traffic disabled; only OpenSSH TCP/22 allowed on IPv4 and IPv6 | Verified by a third fresh key-authenticated SSH session after enablement; future HTTP/HTTPS rules belong to the deployment task |
| Listening sockets | Only SSH is externally bound (`0.0.0.0:22` and `[::]:22`); resolver sockets are loopback-only | Small current attack surface, but SSH is reachable on every assigned IPv4/IPv6 interface |
| SSH policy | Direct root login, password authentication, and keyboard-interactive authentication disabled through a validated drop-in; public-key authentication enabled; dedicated `monteluna` key login and sudo verified after reload | Key-only `monteluna` access, password rejection, root rejection, existing-session continuity, and VNC recovery were verified |
| Container runtime | Docker and Docker Compose absent | Deployment cannot start until an exact installation source/version is audited and approved |
| Filesystem | ext4 root filesystem; inode use approximately 1%; 2 GiB swap file active | Healthy initial capacity; idle baseline showed no memory pressure or OOM events |

No public IP address is required in this repository baseline. Deployment automation should accept the target host through protected operator configuration rather than committing it.

## 4. Recommended Technical Safeguards

The following safeguards mitigate single-node failure risks and resource contention:

- **External backups:** Automated, off-provider backups (e.g., S3-compatible object storage) for database dumps and media assets (strategy approved in Section 5; provider and retention pending).
- **Container isolation:** Containerization (e.g., Docker Compose) with explicit CPU and memory resource limits per service (approved in Section 5).
- **Reverse proxy and TLS:** Caddy reverse proxy handling automatic HTTPS, compression (`encode zstd gzip` with `precompressed` sidecars), static asset serving, and reverse proxying to the Go backend (approved in Section 5).
- **Rate limiting and abuse prevention (Denial of Inventory / Database Bloating):** Defense-in-depth against automated fake order spikes and database bloat:
  1. *Edge/Proxy layer:* Caddy rate-limiting rules and Cloudflare Turnstile bot verification on checkout mutation endpoints (`POST /api/v1/orders`), capping submission attempts per IP.
  2. *Application layer:* Strict 30-minute stock reservation ceiling with automatic background release, lot-bound allocations failing closed (`422 insufficient_stock`), and DIVIPOLA input validation in memory before database writes.
  3. *Database hygiene:* Periodic archival or pruning of unpaid, expired orders older than 14 days to keep transactional tables performant on the 100 GB SSD.
- **Resource monitoring:** Proactive monitoring with threshold alerts for storage exhaustion and RAM pressure (pending approval).

## 5. Architectural Decisions (Checked = Approved, Unchecked = Pending)

The following items require explicit user authorization before implementation, provisioning, or stack commitment:

- [x] VPS purchase: confirmed by the user on 2026-10-20.
- [x] VPS provisioning and activation: confirmed from host output supplied by the user on 2026-10-21.
- [ ] Record of billing term and exact purchased region.
- [x] Operating system: Ubuntu 24.04.5 LTS (Noble Numbat), x86-64, kernel `6.8.0-147-generic`, confirmed after the controlled update and reboot on the active host.
- [x] Backend framework and runtime selection: Go Modular Monolith (Pragmatic Hexagonal Architecture, standard library `net/http`, `pgx/v5` + `sqlc`, `goose` migrations, in-memory cache via `CachePort`). Detailed in [system-architecture.md](system-architecture.md).
- [x] Frontend architecture and rendering framework selection: Astro with React Islands (`@astrojs/react`), shadcn/ui (Radix primitives), and Tailwind CSS. Detailed in [system-architecture.md](system-architecture.md).
- [x] Frontend development and build runtime: Node.js 24 LTS, pinned to 24.21.0 in root `.node-version` and used via fnm. The merchant chose an already-LTS version on 2026-10-13 rather than waiting for Node 26 LTS. npm 12.2.0 remains the approved package manager; see [system-architecture.md](system-architecture.md).
- [x] Database engine, configuration, and data persistence topology: PostgreSQL 18 (supported until November 2030) with isolated schemas per domain module (`catalog`, `orders`, `payments`, etc.) and zero cross-schema foreign keys. Detailed in [system-architecture.md](system-architecture.md) and [data-modeling.md](data-modeling.md).
- [x] Service placement and containerization strategy: single VPS running all services with Docker Compose and per-service memory limits (Go backend, PostgreSQL 18, Caddy reverse proxy); local development uses Docker for PostgreSQL and Testcontainers while Go and Astro run natively. Detailed in [system-architecture.md](system-architecture.md).
- [x] Reverse proxy and TLS certificate automation: Caddy v2.11.7 compiled from its official module source with Go 1.27.3 and golang.org/x/net v0.60.0 through a minimal pinned Go module (no plugins, no xcaddy), because the official 2.11.7 image embeds Go 1.26.8 with HTTP/2 denial-of-service CVEs fixed in 1.26.9 (approved by the user on 2026-10-21; return to the official image once it ships a patched toolchain) handling automatic HTTPS (certificate issuance and renewal, HTTP-to-HTTPS redirect), compression (`encode zstd gzip` with `precompressed` sidecars), static Astro build serving, and proxying `/api` to the Go backend. Certificate directory persisted in a volume and backed up; admin API bound locally; Caddy security advisories monitored under `dependency-audit`. Detailed in [system-architecture.md](system-architecture.md).
- [x] Domain: `montelunaco.com`, purchased by the user on 2026-10-21.
- [x] DNS provider: Cloudflare in DNS-only mode (grey cloud, no proxy) so Caddy obtains and renews certificates directly; approved by the user on 2026-10-21. The registrar's nameservers point to Cloudflare. Records are created during deploy-v1; email records (SPF, DKIM, DMARC) remain pending with Resend.
- [x] First deployment environment: `staging.montelunaco.com` with Wompi sandbox; the apex `montelunaco.com` stays reserved for production; approved by the user on 2026-10-21.
- [x] VPS container runtime: Docker Engine 29.9.2 from Docker's official APT repository for Ubuntu Noble (`docker-ce`, `docker-ce-cli`, `containerd.io`, `docker-compose-plugin`; no buildx because nothing builds on the VPS). Approved by the user on 2026-10-21 as a release-quarantine exception (released 2026-10-20) because it blocks compromised eMudhra TLS intermediates (CVE-2026-111943). Only Caddy publishes host ports; Docker-published ports bypass UFW. Installed on 2026-10-21 with the repository key fingerprint verified, exact versions (`containerd.io` 2.4.2-3, `docker-compose-plugin` 5.6.1-1), `--no-install-recommends`, and all four packages on `apt-mark hold`; updates are deliberate and audited.
- [x] External backup strategy: daily `pg_dump -Fc` on the VPS plus restic to off-site S3-compatible object storage with client-side encryption and deduplication; media assets stored in Cloudflare R2 ($0 egress); monthly restore drill into a separate database. Point-in-time recovery (pgBackRest) deferred until sales scale. Detailed in [system-architecture.md](system-architecture.md).
- [x] External backup provider, cadence, and retention policy: Cloudflare R2 (S3-compatible) as the restic repository, daily, retaining 7 daily, 4 weekly, and 6 monthly snapshots; approved by the user on 2026-10-21. A separate R2 bucket and dedicated credentials from the media bucket; the restic repository password requires its own independent backup.
- [x] Media storage provider and architecture: Cloudflare R2 (S3-compatible object storage, $0 egress fees, global CDN). Backend accesses via `aws-sdk-go-v2/service/s3` behind Go `MediaStorePort`. Detailed in [system-architecture.md](system-architecture.md) and [catalog.md](../domain/catalog.md).
- [x] Secret management for application encryption key and payment secrets: protected `.env` file on VPS outside repository with `0600` permissions loaded by Docker Compose and validated at Go startup (`APP_ENCRYPTION_KEY`). External secret managers (Vault/Doppler) deferred post-v1. Detailed in [system-architecture.md](system-architecture.md).
- [x] CI/CD pipeline and deployment automation workflow: project script run from developer machine (preflight checks / local CI, Linux container builds, `docker save | ssh docker load`, pre-deploy `pg_dump -Fc`, goose migrations with expand-migrate-contract, Docker Compose start, health check, automatic rollback, release record). No GitHub Actions required. Detailed in [system-architecture.md](system-architecture.md) and the `deployment` skill.
