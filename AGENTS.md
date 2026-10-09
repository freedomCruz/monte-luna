# Agent Guidelines: Infrastructure and Technical Decisions

This document defines mandatory operating rules for any agent working in this repository when assessing, proposing, or modifying architecture, dependencies, deployment, or project artifacts.

## 1. Canonical Infrastructure and Architecture Sources

The exclusive sources of truth for physical hardware, known limits, and active system architecture decisions are:

👉 Infrastructure Baseline: [docs/architecture/infrastructure.md](docs/architecture/infrastructure.md)  
👉 System Architecture Baseline: [docs/architecture/system-architecture.md](docs/architecture/system-architecture.md)  
👉 Data Modeling Conventions: [docs/architecture/data-modeling.md](docs/architecture/data-modeling.md)  
👉 Invoicing and Taxes: [docs/architecture/invoicing-and-taxes.md](docs/architecture/invoicing-and-taxes.md)  
👉 Catalog Domain: [docs/domain/catalog.md](docs/domain/catalog.md)  
👉 Orders Domain: [docs/domain/orders.md](docs/domain/orders.md)  
👉 Shipping Domain: [docs/domain/shipping.md](docs/domain/shipping.md)  
👉 Identity Domain: [docs/domain/identity.md](docs/domain/identity.md)  
👉 Notifications Domain: [docs/domain/notifications.md](docs/domain/notifications.md)  
👉 Payments Domain: [docs/domain/payments.md](docs/domain/payments.md)  
👉 Promotions Domain: [docs/domain/promotions.md](docs/domain/promotions.md)

- **Mandatory prior consultation:** Agents must read these canonical documents before proposing architectural changes, introducing dependencies, or designing deployment workflows.
- **Precedence over proposals and memory:** Decisions recorded in these canonical documents supersede historical proposals (including `docs/plan-payload.md`) and information stored in contextual or persistent memory (Engram). Historical plans or past proposals do not authorize pending technical choices.

## 2. Language and Artifact Conventions

- **Project artifacts:** All newly created code, inline comments, documentation, configuration files, commit messages, and agent skills must be written in English.
- **User conversation:** User interaction and conversation replies must remain in Spanish (professional and neutral Spanish, matching the user's communication language, addressing the user informally with "tú"; never "usted", no voseo or regional slang).

## 3. Operating Rules

1. **Evaluate capacity impact:** Assess every architectural proposal and service addition against the resource limits recorded in `docs/architecture/infrastructure.md`. Do not assume unconstrained resources or propose stacks that exceed available capacity without documenting trade-offs.
2. **Respect pending decisions:** Technical choices designated as pending in the canonical document (backend, frontend, database, reverse proxy, containerization, backups, OS release, and service placement) require explicit user authorization. Do not assume default selections or implement unapproved stacks.
3. **Require authorization for changes:** Do not alter previously agreed decisions (provider, base plan, or constraints) without explicit user authorization.
4. **Maintain the canonical source:** When the user approves a pending choice or alters an existing decision, update `docs/architecture/infrastructure.md` immediately to reflect the agreed state. Store authoritative decisions in the canonical document rather than duplicating them in memory or prompt instructions.
5. **Do not duplicate specifications:** Do not duplicate hardware specifications across agent instructions, and do not invent unvalidated operational procedures. Reference `docs/architecture/infrastructure.md` directly.

## 4. Project Skills

Before working in an area, read every matching skill's `SKILL.md`. Skills define how to build and verify; the canonical documents above define what was decided. When a change touches several areas, load all matching skills.

| Skill | Load when | Path |
|---|---|---|
| `backend-go-modules` | Any Go code under `backend/` | [.agents/skills/backend-go-modules/SKILL.md](.agents/skills/backend-go-modules/SKILL.md) |
| `catalog-domain` | Any code, schema, migration, endpoint, admin screen, or event of the catalog module | [.agents/skills/catalog-domain/SKILL.md](.agents/skills/catalog-domain/SKILL.md) |
| `changelog-releases` | User-visible changes, releases, or tags | [.agents/skills/changelog-releases/SKILL.md](.agents/skills/changelog-releases/SKILL.md) |
| `conventional-commits` | Writing a commit message | [.agents/skills/conventional-commits/SKILL.md](.agents/skills/conventional-commits/SKILL.md) |
| `database-postgres` | Tables, migrations, indexes, or sqlc queries | [.agents/skills/database-postgres/SKILL.md](.agents/skills/database-postgres/SKILL.md) |
| `dependency-audit` | Before proposing, adding, or updating any dependency, toolchain, action, or image | [.agents/skills/dependency-audit/SKILL.md](.agents/skills/dependency-audit/SKILL.md) |
| `deployment` | Deployment scripts, releases to the VPS, Docker Compose, production migrations, backups, or rollback | [.agents/skills/deployment/SKILL.md](.agents/skills/deployment/SKILL.md) |
| `domain-events-outbox` | Cross-module side effects, events, consumers, or webhook deduplication | [.agents/skills/domain-events-outbox/SKILL.md](.agents/skills/domain-events-outbox/SKILL.md) |
| `frontend-astro-islands` | Anything under `frontend/` (storefront or `/admin`) | [.agents/skills/frontend-astro-islands/SKILL.md](.agents/skills/frontend-astro-islands/SKILL.md) |
| `identity-domain` | Any code, schema, migration, endpoint, admin screen, or event of the identity module | [.agents/skills/identity-domain/SKILL.md](.agents/skills/identity-domain/SKILL.md) |
| `invoicing-taxes` | Taxes, fiscal data, fiscal documents, or payment settlements with withholdings | [.agents/skills/invoicing-taxes/SKILL.md](.agents/skills/invoicing-taxes/SKILL.md) |
| `monorepo` | Repository layout, root files, Taskfile tasks, Node.js or npm versions, environment variables, line endings, or editor settings | [.agents/skills/monorepo/SKILL.md](.agents/skills/monorepo/SKILL.md) |
| `notifications-domain` | Any code, schema, migration, endpoint, admin screen, or event of the notifications module | [.agents/skills/notifications-domain/SKILL.md](.agents/skills/notifications-domain/SKILL.md) |
| `orders-domain` | Any code, schema, migration, endpoint, admin screen, or event of the orders module | [.agents/skills/orders-domain/SKILL.md](.agents/skills/orders-domain/SKILL.md) |
| `payments-domain` | Any code, schema, migration, endpoint, admin screen, or event of the payments module | [.agents/skills/payments-domain/SKILL.md](.agents/skills/payments-domain/SKILL.md) |
| `promotions-domain` | Any code, schema, migration, endpoint, admin screen, or event of the promotions module | [.agents/skills/promotions-domain/SKILL.md](.agents/skills/promotions-domain/SKILL.md) |
| `shipping-domain` | Any code, schema, migration, endpoint, admin screen, or event of the shipping module | [.agents/skills/shipping-domain/SKILL.md](.agents/skills/shipping-domain/SKILL.md) |
| `testing` | Writing or changing any test or verification step | [.agents/skills/testing/SKILL.md](.agents/skills/testing/SKILL.md) |

Each business module has a `<module>-domain` skill; invoicing rules live in `invoicing-taxes`. Load the domain skill together with the technical skills it lists.
