---
name: parallel-agents-orca
description: "Trigger: parallel agents, Orca, orchestration run, worker, coordinator, task DAG, gate, worktree per agent, agentes en paralelo. Coordinate a feature built by Pi agents under Orca following AGENTS.md section 5."
license: Apache-2.0
metadata:
  author: ecommerce-project
  version: "1.0"
---

## Activation Contract

Use when planning, coordinating, or working as a worker or verifier in a feature built by parallel agents with Orca and Pi.

The rules (roles, path ownership, gates, merge flow) live in `AGENTS.md` section 5 and win over this skill. This skill only describes how to apply them with Orca. Load `conventional-commits`, `testing`, and the domain and technical skills of the feature as well.

## Hard Rules

- Read `AGENTS.md` section 5 before creating a Run.
- Orca CLI flags change between versions and agents invent them. Before every command run `orca <command> --help`; for the full workflow run `orca skills get orchestration` and `orca skills get orca-cli`. Those outputs are authoritative over this file.
- One Run per feature. Every ODD task in `odd/tasks/<feature>.md` maps to exactly one Orca task whose spec cites the task id and its spec ids, and names the owned paths.
- Express order only with task dependencies. The contract task (C1) is the first node; every parallel task depends on it through a decision gate the user resolves.
- A contract change is a new task behind a new gate, never an edit inside a running implementation task.
- Workers receive tasks; they do not create tasks, write `odd/` or `docs/`, or merge. Only the coordinator merges worker branches into `feat/<feature>`.
- The verifier is dispatched as a read-only task on the integrated feature branch and reports a verdict per spec id.
- Never pass secrets in task specs, messages, or kickoff prompts.

## Decision Gates

| Situation | Action |
| --- | --- |
| Contract task C1 reported done | Create a gate, show the contract to the user, start parallel tasks only after it is resolved |
| Frontend needs a field or endpoint not in the contract | Worker uses `orca orchestration ask`; coordinator adds a contract-change task behind a new gate |
| Worker reports done | Review the report and checks, merge its branch into `feat/<feature>`, then tick the ODD task with the commit id |
| A dependency must be added | Stop; run `dependency-audit` and get user approval before any install |
| Worker stuck or silent | Read its output with `orca orchestration worker-read`; ask before stopping or abandoning it |

## Execution Steps

1. Repository setup (once): register the repository in Orca and set its base ref to `main` (check `orca repo --help`). Worktree setup runs the project `task setup` provided by Wave 0, which installs dependencies, creates the worktree's own database, and assigns its own ports. `.env` reaches each worktree only through the local, untracked include mechanism Orca provides.
2. Coordinator writes `odd/tasks/<feature>.md` and commits it on `feat/<feature>`.
3. Create the Run and the task graph with dependencies: C1 contract → gate → backend tasks and frontend tasks in parallel → integration → verifier.
4. Launch every worker unattended with its role model; never ask the user to pick a model. `worker-start --model` does not support Pi and cannot combine with `--terminal`, so the coordinator first creates the terminal with the model, then attaches the worker to it:
   - `orca terminal create --worktree <selector> --title <ROLE> --command "pi --model <provider/id>" --json`
   - `orca orchestration worker-start --task <task_id> --terminal <handle> --worktree <same selector>`
   Pi terminals can be reused across dispatches. Role models (confirm ids with `pi --list-models`):

   | Role | Model |
   | --- | --- |
   | Coordinator and important decisions | `claude-bridge/claude-opus-5-5` |
   | Backend worker | `openai-codex/gpt-6.1-sol` |
   | Frontend worker | `local-proxy/gemini-3.8-flash-high` |
   | Verifier (read-only, different model from both writers) | `claude-bridge/claude-sonnet-5-5` |
5. Worker branches are named after the worktree; rename them to `feat/<feature>-backend` and `feat/<feature>-frontend` with `git branch -m` when they differ.
6. Wait for worker reports with `orca orchestration check`; handle questions and gates as above.
7. After integration and a passing verifier, open the pull request from `feat/<feature>` to `main` and hand it to the user.

## Known Pitfalls

- `node_modules` and Go caches are per worktree; run the setup task before tests in a fresh worktree, including the coordinator checkout.
- Pi sessions appear lazily and peer session lists can be stale; rely on Orca task state, not on session lists.
- A shared database across worktrees breaks migrations; never point two worktrees at the same database.

## Output Contract

Report:
- Run id and the task graph with each task's owner, dependencies, and status.
- Gates created and how the user resolved them.
- Merged worker commits into `feat/<feature>` and the verifier verdict per spec id.
- The pull request URL to `main`, and any open questions.

## References

- `AGENTS.md` — section 5, Parallel Agent Work.
- `docs/architecture/system-architecture.md` — section 3 (HTTP API contract) and section 6 (Git workflow, delivery sequence).
- `docs/architecture/api-conventions.md` — rules every contract follows.
- `orca skills get orchestration` and `orca skills get orca-cli` — authoritative Orca usage for the installed version.
