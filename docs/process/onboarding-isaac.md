# Isaac's Onboarding — Mission Claw & Oscar (March 2026)

> This doc is specifically for Isaac. It assumes you know the GearSwitchr codebase. It focuses on what's changed and how the agent system works now.

---

## What's New Since You Were Last In

A lot has been automated. Oscar (the AI agent) now handles most day-to-day dev work — research, writing code, opening PRs, deploying to ECS. Your role is primarily **reviewing, approving, and directing** rather than writing code yourself (unless you want to).

The key tools:
- **Oscar** — AI agent on LegionBox, always on, responds in Discord
- **Mission Control** — task dashboard at `http://192.168.1.64:4000` — this is the source of truth for all agent work

---

## Architecture Decisions You Should Know

| Decision | What it means |
|---|---|
| **ECS is the backend** | `api.gearswitchr.com` → ALB → ECS → FastAPI. Lambda is deprecated — don't add new features there. |
| **CloudFront/S3 frontend** | Amplify builds, but CloudFront/S3 serves. Deploys go via Amplify postBuild hook syncing to S3. |
| **Agent-driven deployments** | Oscar spawns a Developer agent for ECS deploys via aws-mcp. No manual CLI needed. |
| **Free marketplace** | Pivoted Feb 16. Revenue model is FFL Intelligence platform ($49–$149/mo). |
| **Pricing (live Stripe)** | FFL Intelligence Monthly: `price_1T2gIjIP7aF2Kbu2ClKzTFPt` · Annual: `price_1T4rBRIP7aF2Kbu2d6qsRB1N` |

---

## How to Request Work

**Quick ask → tell Oscar in Discord:**
```
@Oscar add a loading state to the trade confirmation modal
```
Oscar handles it directly — no ticket needed.

**Agent task → use mc-task: prefix:**
```
mc-task: Fix FFL radius filter returning wrong results | Users report FFLs outside their radius appearing in results
```
Oscar creates the MC task, assigns the right agent, and reports back when done.

**Check what's in flight:**
Go to `http://192.168.1.64:4000` — you'll see every active task, who's working on it, and what's in review.

---

## The Two-Lifecycle Flow (Important)

Every significant piece of work follows this pattern:

**Lifecycle 1 — Define it (output = GitHub Issue)**
```
Idea → MC task → Agent does research/spec → Oscar opens GitHub Issue → done
```

**Lifecycle 2 — Build it (output = PR)**
```
GitHub Issue exists → MC task referencing Issue # → Agent codes → PR with "Closes #N" → you review → merge → done
```

You don't need to create MC tasks yourself — Oscar does that. Your job is:
1. Tell Oscar what you want
2. Review the GitHub Issue (Lifecycle 1) or PR (Lifecycle 2)
3. Merge the PR when it looks good

---

## How to Review Work

1. Go to `http://192.168.1.64:4000` → Review column
2. Click a task to see the PR or deliverable link
3. Review on GitHub
4. Merge the PR — Oscar will auto-close the MC task

If something's wrong, reject it in MC with a note and Oscar will re-queue it.

---

## Key Repos

| Repo | What's in it |
|---|---|
| `github.com/reubadoob/gearswitchr` | GearSwitchr product (React frontend + FastAPI backend) |
| `github.com/reubadoob/mission-control` | The MC dashboard itself |

---

## Key URLs

| Resource | URL |
|---|---|
| Mission Control | `http://192.168.1.64:4000` |
| GearSwitchr production | `https://gearswitchr.com` |
| API health | `https://api.gearswitchr.com/health` |
| ECS cluster | `gs-production-cluster` (us-east-1) |

---

## What Oscar Can Do Without Being Asked

- Monitor ECS health and alert on failures
- Open GitHub Issues and PRs
- Write and update docs
- Run database queries via coding agents
- Deploy to ECS (with your approval to merge the PR)
- Research competitors and summarize findings

## What Oscar Won't Do Without You

- Merge PRs (you merge)
- Make strategic product decisions
- Send external-facing communications (emails, social posts) without explicit sign-off

---

## Your Trust Level

You're an owner — same trust level as Reuben. Oscar knows this. You can direct Oscar the same way Reuben does.

---

## Questions?

Ask Oscar directly in Discord. Or ping Reuben. The general onboarding doc lives at `docs/process/onboarding.md` if you want more detail on any of the above.
