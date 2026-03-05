# Onboarding Guide

> Welcome to the Mission Claw agent system. This doc explains the tools, the workflow, and how to get work done.

---

## What Is This?

### Oscar

Oscar is an AI agent (built on OpenClaw) running on **LegionBox** — the home server. Oscar monitors Discord, picks up tasks, spawns specialized sub-agents to do the work, and reports back. Think of Oscar as the always-on technical lead who routes and executes work.

### Mission Claw (MC)

Mission Claw is the **task dashboard** at `http://192.168.1.64:4000`. It's the source of truth for what work exists, who's doing it, and what state it's in. Every piece of work — whether initiated by a human or Oscar — lives as an MC task.

---

## The Two-Lifecycle Flow

Work in this system follows two distinct patterns depending on whether a GitHub Issue already exists.

### Lifecycle 1 — Definition (Request → Issue)

Use this when you have an idea or request but no formal spec yet. The *output* is a GitHub Issue.

```
You tell Oscar (or create MC task)
          ↓
   Agent does the work
          ↓
GitHub Issue opened as deliverable
          ↓
        Done
```

**Example:** "Oscar, research the best approach for real-time trade notifications." The Researcher agent produces a GitHub Issue with findings and a recommendation.

### Lifecycle 2 — Implementation (Issue → PR)

Use this when a GitHub Issue already exists and you want the work done. The *output* is a PR that closes the Issue.

```
GitHub Issue #N exists
          ↓
MC task references Issue #N
          ↓
   Agent does the work
          ↓
PR opened with "Closes #N"
          ↓
        Done
```

**Example:** Issue #12 describes a bug. You create an MC task referencing it. A Developer agent fixes the bug and opens a PR with `Closes #12`.

---

## How to Create Work

### Option 1 — Direct request to Oscar (no ticket)
Just message Oscar in Discord. He'll create the MC task and assign an agent automatically. Use this for quick, informal requests.

```
@Oscar add a loading spinner to the trade confirmation modal
```

### Option 2 — `mc-task:` prefix in Discord
Prefix your message with `mc-task:` to explicitly tell Oscar to create a tracked task.

```
mc-task: write a post-mortem for the March 4 outage
```

### Option 3 — MC Dashboard UI
Go to `http://192.168.1.64:4000`, click **+ New Task**, fill in the title, description, and optionally assign an agent type. Good for batching up multiple tasks or when you want to add detailed context.

---

## Agent Types Quick Reference

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

For PRs on GitHub: you can also approve directly there. Oscar will pick up the merged PR and close the MC task.

---

## Key URLs and Tools

| Thing | Where |
|---|---|
| **Mission Claw dashboard** | `http://192.168.1.64:4000` |
| **GearSwitchr repo** | `https://github.com/reubadoob/gearswitchr` |
| **Mission Claw repo** | `https://github.com/reubadoob/mission-control` |
| **GearSwitchr production** | `https://gearswitchr.com` |
| **API health check** | `https://api.gearswitchr.com/health` |

### Tools

- **OpenClaw** — the agent runtime Oscar runs on. Lives on LegionBox.
- **Claude Code** — AI coding assistant used by Developer and Writer agents for implementation.
- **Gemini CLI** — alternative LLM CLI, used for large-context tasks (e.g. reading big codebases).

---

## Tips

- **Check MC before asking** — the task you want might already be in flight.
- **Be specific in requests** — "fix the bug" is harder to route than "fix the null pointer in `trade_service.py` line 42".
- **Lifecycle 2 is preferred** — if work is substantial, open a GitHub Issue first so there's a clear spec before an agent touches code.
- **Agents work in worktrees** — Developer agents create isolated git branches. You won't see their changes on main until a PR is merged.
