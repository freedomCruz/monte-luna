# Infrastructure documentation baseline

## Goal and scope

Record approved infrastructure decisions in `docs/architecture/infrastructure.md` and direct agents to that source from `AGENTS.md`. Prevent historical proposals or memory from silently approving pending technology choices.

Only those two documents and this tracking file may change. Do not modify `docs/plan-payload.md`, deploy, purchase services, create skills, or implement application code.

## Constraints

- User explicitly requires English for all new project artifacts; conversation remains Spanish. This supersedes the earlier Spanish documentation convention.
- Provider and plan chosen: Contabo, 4 vCPU, 8 GB RAM, 100 GB SSD, 200 Mbit/s port, one snapshot.
- Planned selections: US East and Ubuntu, version unspecified.
- Purchase, provisioning and deployment are not confirmed. EUR 7.05/month is user-reported, not a verified invoice.
- Frontend, backend, database, proxy, containers, backup strategy and service placement remain pending.
- No secrets or access credentials.
- No staging, commits, pushes or PRs without an explicit request.

## Tasks

- [x] T1 — Create and check infrastructure documentation and agent guidance. Status: complete.
  - Route: delegated writer because two non-trivial documents change.
  - Acceptance: English artifacts; approved facts and pending decisions separated; agent guidance links to the canonical source without duplicating hardware values; historical plan identified as a proposal; no claims of deployment, guaranteed performance or unapproved technologies.
  - Checks: complete readback of both files, relative link destinations and scope inspection; no executable tests apply.
  - Progress: English rewrite completed. Parent read both final files; independent documentation verifier returned PASS. Agent instructions do not duplicate hardware; unknown acquisition status and proposed service placement are explicit.

## Verification and delivery

- TDD: not applicable to documentation without executable behavior; general configuration and runner not established.
- Estimated scope: fewer than 180 authored lines across the two documents; `ask-on-risk` strategy.
- Branch: `docs/infrastructure-baseline`; repository has no initial commits.
- Pre-existing untracked changes preserved: `.gitignore` and `docs/`.
- Evidence: complete parent readback of both documents and independent read-only verification passed; canonical link destination exists. No executable tests apply and none were run.
- Native review: assessment unavailable because untracked files require an explicit scope declaration. The returned risk-gated plan required an independent verifier, which passed. No native approval or receipt claimed; no source code changed.
- Commit: not created; requires explicit user request.

## Next step

Discuss architectural options with the user before committing to a stack. Keep proposals separate from approved decisions. No deployment, application implementation, or skill creation is authorized by that discussion.
