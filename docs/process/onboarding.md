# Onboarding Guide

> Welcome to the Mission Claw agent system. This doc explains the tools, the workflow, and how to get work done.

---

## What Is This?

### Oscar

Oscar is an AI agent (built on OpenClaw) running on **LegionBox** — the home server. Oscar lives in `~/.openclaw/workspace` and monitors Discord, picks up tasks, spawns specialized sub-agents to do the work, and reports back. Think of Oscar as the always-on technical lead who routes and executes work 24/7.

### Mission Control (MC)

Mission Control is the **task dashboard** at `http://192.168.1.64:4000`. It's the source of truth for what work exists, who's doing it, and what state it's in. Every piece of work — whether initiated by a human or Oscar — lives as an MC task.

---

## The Two-Lifecycle Flow

Work in this system follows two distinct patterns depending on whether a GitHub Issue already exists.

```
┌─────────────────────────────────────────────────────────────────┐
│  Lifecycle 1 — Definition          Lifecycle 2 — Implementation │
│                                                                  │
│  Idea / request                    GitHub Issue #N exists        │
│       ↓                                    ↓                    │
│  MC task created                   MC task references #N        │
│       ↓                                    ↓                    │
│  Agent does work                   Agent does work              │
│       ↓                                    ↓                    │
│  GitHub Issue opened               PR opened "Closes #N"        │
│       ↓                                    ↓                    │
│       Done                                Done                  │
└─────────────────────────────────────────────────────────────────┘
```

### Lifecycle 1 — Definition (Request → Issue)

Use this when you have an idea or request but no formal spec yet. The *output* is a GitHub Issue.

**Example:** "Oscar, research the best approach for real-time trade notifications." The Researcher agent produces a GitHub Issue with findings and a recommendation.

### Lifecycle 2 — Implementation (Issue → PR)

Use this when a GitHub Issue already exists and you want the work done. The *output* is a PR that closes the Issue.

**Example:** Issue #12 describes a bug. You create an MC task referencing it. A Developer agent fixes the bug and opens a PR with `Closes #12`.

---

## How to Request Work

### Option 1 — Direct request to Oscar (no ticket)
Just message Oscar in Discord. He'll create the MC task and assign an agent automatically. Use this for quick, informal requests.

```
@Oscar add a loading spinner to the trade confirmation modal
```

### Option 2 — `mc-task:` prefix in Discord
Prefix your message with `mc-task:` to explicitly tell Oscar to create a tracked task.

```
mc-task: Title | Description of the work you want done
```

Example:
```
mc-task: Write post-mortem for March 4 outage | Cover timeline, root cause, and prevention steps
```

### Option 3 — MC Dashboard UI
Go to `http://192.168.1.64:4000`, click **+ New Task**, fill in the title, description, and optionally assign an agent type. Good for batching up multiple tasks or when you want to add detailed context.

---

## Agent Types

| Agent | Best For |
|---|---|
| **Developer** | Code, PRs, bug fixes, infra, deployments |
| **Researcher** | Research spikes, tech evals, competitive analysis |
| **Writer** | Docs, copy, changelogs, process guides |
| **Blueprint** | Architecture, system design, ADRs |
| **SEO Content Editor** | SEO copy, keyword research, content audits |
| **Orchestrator** | Complex tasks requiring multiple agents in parallel |

If you don't specify, Oscar picks the best fit based on the task description.

---

## How to Review and Approve Work

1. Go to the **MC Dashboard** → `http://192.168.1.64:4000`
2. Click the **Review** tab — tasks awaiting approval appear here.
3. Click a task to see the deliverable (PR link, doc link, etc.).
4. Review the work on GitHub or wherever it lives.
5. Click **Approve** in MC to mark it done, or **Reject** with a reason to send it back.

For PRs on GitHub: review and merge the PR directly. Oscar monitors GitHub and will close the corresponding MC task once the PR is merged.

---

## Key URLs and Repos

| Resource | Location |
|---|---|
| **Mission Control dashboard** | `http://192.168.1.64:4000` |
| **GearSwitchr repo** | `https://github.com/reubadoob/gearswitchr` |
| **Mission Control repo** | `https://github.com/reubadoob/mission-control` |
| **GearSwitchr production** | `https://gearswitchr.com` |
| **API health check** | `https://api.gearswitchr.com/health` |

---

## Tips

- **Check MC before asking** — the task you want might already be in flight.
- **Be specific in requests** — "fix the bug" is harder to route than "fix the null pointer in `trade_service.py` line 42".
- **Lifecycle 2 is preferred** — if work is substantial, open a GitHub Issue first so there's a clear spec before an agent touches code.
- **Agents work in worktrees** — Developer agents create isolated git branches. You won't see their changes on main until a PR is merged.
