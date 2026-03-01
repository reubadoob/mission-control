# Mission-Claw Sprint Log

## Sprint: 2026-03-01 — Full System Integration

### Summary
Complete overhaul of Mission-Claw to fully implement the Elvis Sun two-tier orchestration model. Started with a dual code review (Codex + Gemini) scoring the setup 6.5/10, and shipped 6 feature PRs + 2 automation PRs in a single session.

### What Was Built

#### Quick Wins (commit 490d6ea)
- `broadcast(task_updated)` on webhook completion (tasks were completing silently)
- `task_completed` added to Discord relay allowlist
- PM2 hardcoded Mac path removed
- TaskModal hardcoded project path → env-driven
- Subagent route async params fixed
- Manual events POST now broadcasts SSE

#### PR #7 — GearSwitchr Context Injection
Live business context from `GET https://api.gearswitchr.com/ai/context` injected into every agent dispatch prompt. Context API has 3s timeout with graceful fallback. `GIT_REPO_ROOT` replaces all hardcoded repo paths.

#### PR #8 — Structured Prompt Templates
`buildDispatchPrompt()` in `src/lib/prompts/dispatch.ts` generates token-budgeted prompts. Stable per-template checksum (not per-dispatch). Prompt metadata stored in `metadata` JSON column. Description truncated before critical fields.

#### PR #9 — Git Worktree Isolation
Each task gets `git worktree add` at `os.tmpdir()/mc-task-<id>`. `GIT_REPO_ROOT` env var required. `WORKTREE_BASE_BRANCH` configurable. `cleanupWorktree(repoPath, worktreePath)` runs from repo root. Validates stale directories.

#### PR #10 — Discord Threads + DM Intake
Each task gets a Discord thread. Relay events route to the correct thread via `discord_thread_id` on tasks table (migration 009). `extractMessageId` and thread ID extraction restricted to specific keys to avoid picking up wrong IDs. `deliverable_added` events now route to threads.

#### PR #11 — Live Session Console UI
`SessionConsole.tsx` polls session history every 5s. Auto-stops when status is `null` or terminal. `listSessions()` cached with 10s TTL to reduce gateway load. Show more/less truncation for long outputs.

#### PR #12 — Power-User Discord Commands
`!task title | desc | agent:Dev | priority:urgent` — pipe-safe parser (all segments after second pipe treated as options). Quick actions (`!task-status`, `!task-list`, `!task-blockers`, `!task-review`) bypass 5-min dedupe with 10s TTL. SSE broadcast after `!task-review`. `workspace_id` scoping on all task queries.

#### PR #13 — Consolidated Review Fixes
All 41 Copilot/Codex inline review comments across PRs #7–#12 addressed and merged as a single consolidation PR.

#### PR #14 — Mandatory TASK_COMPLETE Signal
`buildDispatchPrompt()` always appends a non-truncatable `REQUIRED FINAL OUTPUT` section. `enforceDispatchTokenBudget()` preserves the suffix under all truncation scenarios. Tests verify it's always present.

#### PR #15 / #16 — GitHub PR Webhook
`POST /api/webhooks/github` with HMAC-SHA256 verification. Atomic DB transactions. Live Feed events inserted. Middleware exempts route from bearer auth. Tailscale Funnel used to expose endpoint publicly.

### Architecture Decisions
- **Two-tier model**: Oscar (orchestrator) holds business context; coding agents hold code context only
- **`mission-claw` is canonical remote**: `origin` points to upstream `crshdn/mission-control` — never push features there
- **Codex for implementation, Gemini for analysis**: Gemini skips Write tool calls; all code written by Codex
- **Consolidation pattern**: Feature PRs → review feedback addressed → single consolidation PR → merge

### New Env Vars Added This Sprint
| Var | Purpose |
|---|---|
| `GIT_REPO_ROOT` | Git repo root for worktree operations |
| `WORKTREE_BASE_BRANCH` | Base branch (default: main) |
| `INTERNAL_CONTEXT_API_KEY` | GearSwitchr internal context API |
| `DISCORD_TASK_DM_ENABLED` | Enable DM task intake |
| `DISCORD_TASK_DM_AUDIT_CHANNEL` | Mirror DM tasks to channel |
| `OPENCLAW_DISCORD_TASK_OWNER_IDS` | Owner IDs that bypass rate limits |
| `GITHUB_WEBHOOK_SECRET` | HMAC secret for GitHub webhook |

### Infrastructure
- Mission-Control now runs as a **systemd service** (`mission-control.service`) — auto-starts on boot, auto-restarts on crash
- **Tailscale Funnel** enabled on port 4000 — `https://legionbox.tailf9f2ae.ts.net` is publicly accessible for GitHub webhooks
- `better-sqlite3` native module rebuilt for Node v24
