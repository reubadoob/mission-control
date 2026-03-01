# Mission-Claw: End-to-End User Story

> How a single Discord message becomes shipped code — zero manual intervention.

---

## The Cast

| Role | Tool | Purpose |
|---|---|---|
| You | Discord | Send tasks, get updates |
| Oscar (OpenClaw) | Gateway | Parses commands, orchestrates |
| Mission-Claw | Dashboard @ :4000 | Task tracking, agent dispatch |
| Codex / Sonnet | Agent | Does the actual work |
| GitHub | Webhook | Closes the loop on merge |

---

## Step 1 — You type in Discord

In any connected channel (e.g. `#gearswitchr`):

```
!task Add FFL transfer fee to dealer profile page | Show transfer fee field when viewing an FFL dealer, pull from DB | agent:Developer | priority:high
```

**What's required:** Only `!task` + a title. Everything else is optional.

```
!task Fix the login button              ✅ works — title only
!task Fix login | More detail here      ✅ works — title + desc
!task Fix login | desc | agent:Writer   ✅ works — with agent
!task Fix login | desc | priority:high  ✅ works — with priority
```

**If the format is wrong**, Oscar replies with a helpful guide — not silence.

**Agent options:** Developer, Writer, Researcher, Blueprint, Designer, Orchestrator, SEO Content Editor, MCPAuditor, DevEnvVerifier

**Priority options:** `low`, `normal`, `high`, `urgent`

---

## Step 2 — OpenClaw parses the command

Oscar's Discord observer sees the `!task` prefix and parses:
- **Title** — first segment before `|`
- **Description** — second segment (defaults to title if omitted)
- **Agent** — case-insensitive match against live agent roster
- **Priority** — defaults to `normal`

Your Discord user ID is in `OPENCLAW_DISCORD_TASK_OWNER_IDS` so you bypass rate limits entirely.

> **If no agent is specified:** Task lands in `inbox` unassigned.
> *(Issue #23 — Orchestrator auto-routing — will fix this so Orchestrator picks the right agent automatically)*

---

## Step 3 — Task created in Mission-Claw

OpenClaw calls `POST /api/tasks` on Mission-Claw. The task:
- Lands in `assigned` status with the chosen agent
- Gets a **Discord thread** created in your channel — all future updates route there
- Appears on the Kanban board in real-time via SSE

---

## Step 4 — Auto-dispatch fires

Because the task was created with an assigned agent, MC dispatches immediately.

The dispatch route does 6 things:

1. **Fetches live GearSwitchr context** — user count, listings, DB schema — from `api.gearswitchr.com/ai/context` (3s timeout, graceful fallback)
2. **Builds a structured prompt** — title, description, business context, constraints, all within a token budget. Critical fields (priority, task ID, output dir) always come before the description so they're never truncated.
3. **Appends the mandatory TASK_COMPLETE block** — the very last section of every prompt. Cannot be truncated. Agent must emit it or the task stays open forever.
4. **Logs estimated tokens + cost** — inserted into `task_costs` table with model and estimated USD
5. **Creates a git worktree** — isolated at `/tmp/mc-task-<uuid>` on a fresh branch. Each task gets its own code sandbox. Agents never contaminate each other.
6. **Dispatches to the agent** — enriched prompt sent via OpenClaw session

Task moves to `in_progress`.

---

## Step 5 — Agent works

The agent (Sonnet 4.6 by default) is in its isolated worktree, with:
- The task context + business context
- The codebase at a clean branch
- No noise from other tasks

It edits code, runs `npx tsc --noEmit`, commits, pushes a branch, and opens a PR with `mc-task: <uuid>` in the body.

---

## Step 6 — Agent signals completion

The agent's mandatory final line (enforced by the dispatch prompt — cannot be skipped):

```
TASK_COMPLETE: Added transfer fee field to FFL dealer profile | deliverables: https://github.com/reubadoob/gearswitchr/pull/42
```

OpenClaw's completion observer picks this up and sends it to MC's webhook. MC:
- Moves task to `review`
- Auto-ingests the PR URL as a **deliverable** (visible in Deliverables tab)
- Logs the completion to **Activity tab**
- Broadcasts SSE → Kanban card moves live
- Sends a notification to the **Discord thread** for this task

---

## Step 7 — You review

The task is now in `review`. You have two paths:

### Path A — Merge the PR on GitHub (recommended)
GitHub fires the webhook → `POST /api/webhooks/github` on MC → task moves directly to `done`.

A merged PR **is** the human approval. No second confirmation needed — that would be double-checking the same thing.

### Path B — Manual approve/reject in MC dashboard
On the task card in `review` status:
- ✅ **Approve** → task moves to `done`
- ❌ **Reject** → task moves back to `in_progress` (optionally with a reason)

---

## Step 8 — If the PR is closed without merging

Task drops back to `inbox` with a note: *"PR closed without merge."*
You can re-dispatch or reassign from there.

---

## What You See Throughout

| Where | What |
|---|---|
| **Discord thread** | Created on task creation. Gets updates on dispatch, progress, completion, approval |
| **MC Kanban board** | Live card moving: inbox → assigned → in_progress → review → done |
| **Activity tab** | Full audit trail — every status change, signal, dispatch note |
| **Deliverables tab** | PR URLs and file paths auto-populated from TASK_COMPLETE signal |
| **Settings → Cost Tracking** | Token usage + estimated USD per agent/model/day |

---

## Quick Reference — Discord Commands

| Command | What it does |
|---|---|
| `!task <title>` | Create task, unassigned |
| `!task <title> \| <desc> \| agent:<name> \| priority:<level>` | Full syntax |
| `!task-status <task-id>` | Get current status of a task |
| `!task-list` | List all open tasks |
| `!task-blockers` | List tasks currently blocked |
| `!task-review <task-id>` | Move a task to review |

---

## Agent Signals (for reference)

Agents communicate back to MC via structured signals in their output:

| Signal | Format | Effect |
|---|---|---|
| Complete | `TASK_COMPLETE: <summary> \| deliverables: <url-or-path>` | Task → review, deliverables ingested |
| Blocked | `BLOCKED: <reason> \| need: <what> \| meanwhile: <what>` | Task flagged, operator notified |
| Progress | `PROGRESS_UPDATE: <message>` | Activity logged, no status change |

---

## Known Gaps (Issues)

| Issue | Status |
|---|---|
| **#23** — Orchestrator should auto-route tasks with no `agent:` specified | Open — next to implement |
| `!task-dispatch <id> agent:<name>` — assign + fire from Discord | Part of #23 |

---

*Last updated: 2026-03-01 — Mission-Claw sprint*
