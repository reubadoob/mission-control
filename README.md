<p align="center">
  <img src="mission-control.png" alt="Mission-Claw" width="600" />
</p>

<h1 align="center">🦞 Mission-Claw</h1>

<p align="center">
  <strong>AI Agent Orchestration — Powered by Discord + OpenClaw</strong><br>
  The nerve center of the GearSwitchr agent swarm.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.2.0-blue?style=flat-square" alt="Version" />
  <img src="https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/SQLite-3-003B57?style=flat-square&logo=sqlite&logoColor=white" alt="SQLite" />
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="MIT License" />
</p>

---

## What is Mission-Claw?

Mission-Claw is a fork and significant extension of [Mission-Control](https://github.com/crshdn/mission-control) — a beautiful open-source AI agent orchestration dashboard built by [@crshdn](https://github.com/crshdn) and contributors. We owe the original team a huge debt. The Kanban UI, SSE real-time layer, SQLite persistence, and core agent dispatch architecture are all their work.

**What Mission-Claw adds:**

Mission-Control is a dashboard you *visit*. Mission-Claw is a system that *operates* — primarily through Discord and OpenClaw, with the web UI as secondary visibility.

The key difference: **Discord is the primary operator interface.** You don't need to open a browser to create tasks, monitor agents, or get notified when work completes. Everything flows through the Discord ↔ OpenClaw ↔ Mission-Claw triangle.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      DISCORD                            │
│  Human operator lives here. Creates tasks, reads        │
│  notifications, monitors agent progress.                │
└─────────────────┬───────────────────────┬───────────────┘
                  │ commands               │ notifications
                  ▼                       ▲
┌─────────────────────────────────────────────────────────┐
│                      OPENCLAW                           │
│  AI backbone. Routes messages, manages agent sessions,  │
│  parses completion signals (TASK_COMPLETE, BLOCKED,     │
│  PROGRESS_UPDATE), dispatches work to sub-agents.       │
└─────────────────┬───────────────────────┬───────────────┘
                  │ tasks/dispatch         │ SSE events
                  ▼                       ▲
┌─────────────────────────────────────────────────────────┐
│                    MISSION-CLAW                         │
│  Persistent store (SQLite). Kanban UI. Task lifecycle.  │
│  Agent roster. Real-time event bus. Webhook receiver.   │
│  The source of truth for what's happening.              │
└─────────────────────────────────────────────────────────┘
```

---

## Philosophy

Mission-Claw implements a **Two-Tier Context Model**, separating business intelligence from coding execution.

### Tier 1: The Orchestrator (OpenClaw/Oscar)
Oscar acts as the "Business Brain." He holds the full context of GearSwitchr: meeting notes, customer data, architectural decisions, what worked/failed, and market intel. His job is to translate this broad context into precise, actionable prompts.

### Tier 2: The Coding Agents (Codex/Claude Code)
The agents act as the "Code Brain." They see **ONLY code**. They are focused execution units with no business noise.

**Why this split?**
Context windows are zero-sum. If you fill an agent's context with customer history, there's no room for the codebase. If you fill it with code, there's no room for business context. By splitting them, we get specialization through context: Oscar knows *why* we're building it, and the agent knows *how* to build it.

---

## Real Results (Proof It Works)

This architecture is validated by the "Stripe Minions" pattern described by Elvis Sun. Just like Stripe built internal "Minions" (parallel coding agents backed by centralized orchestration), Mission-Claw provides a self-hosted version of the same powerful workflow.

**Validated Performance:**
- **High Velocity:** Capable of handling ~100 commits/day across multiple agents.
- **Parallelism:** Multiple agents run in isolated sessions simultaneously (e.g., 7 PRs in 30 minutes).
- **Efficiency:** Idea-to-production cycles often reduced to a single day.
- **Success Rate:** "One-shot" success on almost all small-to-medium tasks.

*Reference: [Elvis Sun's Article on OpenClaw + Codex Architecture](https://x.com/elvissun/article/2025920521871716562)*

---

## Cost & Transparency

This architecture is built for professional velocity, not free tiers.

- **Orchestration (OpenClaw):** Uses smarter models (Anthropic Claude 3.5 Sonnet / GPT-4o) for high-level reasoning and context management.
- **Execution (Codex/Claude Code):** Uses focused, context-heavy coding models.
- **Approximate Breakdown:** Expect ~$100-$200/month for heavy usage (similar to hiring a junior dev for pennies). The ROI comes from shipping features in hours instead of days.

---

## The Loop (Plain English)

1. **Context Injection** — Oscar fetches live business metrics (T-minus to launch, user counts, DB schema) via `get-agent-context.sh` and enriches the prompt.
2. **Isolation** — Each task gets a dedicated `git worktree` and isolated session. This prevents agents from contaminating each other's context.
3. **Dispatch** — OpenClaw sends the enriched prompt to a specialized agent (Tier 2).
4. **Execution** — The agent works in its isolated bubble, seeing only the code and the specific task.
5. **Signal** — Agent emits `PROGRESS_UPDATE:`, `BLOCKED:`, or `TASK_COMPLETE:` signals.
6. **Completion** — OpenClaw parses the signal, hits the webhook, Mission-Claw moves task to `review`.
7. **Notification** — Discord relay picks up the completion event and notifies the operator.

---

## Key Features

### From Mission-Control (upstream)
- Kanban board with task lifecycle: `inbox → planning → assigned → in_progress → testing → review → done`
- AI planning phase with structured Q&A before dispatch
- Real-time SSE event bus with live feed UI
- Agent roster with persistent identity and session tracking
- Deliverables + activity log per task
- File preview and upload

### Mission-Claw Extensions
- **Discord command ingestion** — Create MC tasks from Discord with `!task`
- **Discord relay** — Task events (created, updated, completed, activities, deliverables) relayed back to Discord
- **OpenClaw session bridge** — Agents maintain persistent sessions across tasks; session state tracked in DB
- **Completion signal parsing** — `TASK_COMPLETE:`, `PROGRESS_UPDATE:`, `BLOCKED:` parsed automatically from agent output
- **Auto-dispatch** — Tasks assigned to agents trigger immediate dispatch without manual intervention
- **Diagnostics layer** — All OpenClaw ↔ MC handoffs are logged for debugging (`/api/openclaw/diagnostics`)
- **Bootstrap** — One-shot agent session initialization from MC UI

---

## Agent Roster

| Agent | Role | ID |
|---|---|---|
| **Orchestrator** | Routes tasks, multi-agent coordination | `0d6529a4-22e5-4182-b82c-15654c0ac0f6` |
| **Developer** | Code, PRs, infrastructure | `72e5814f-3932-4249-81bb-049cda09d7cf` |
| **Researcher** | Web research, competitive analysis | `1354b64e-8a51-4773-aab9-ee88612e7768` |
| **Writer** | Blog posts, docs, copy | `74f764ae-f22c-47b1-a766-5ae9d7a37155` |
| **Blueprint** | Architecture, planning, ADRs | `813008d4-26dd-4c7a-b303-fb04c9ba511b` |
| **SEO Content Editor** | SEO-optimized content | `39b73ae6-124c-42fd-accf-9adb27b84b41` |

---

## Discord Commands

| Command | Description |
|---|---|
| `!task <title> \| <description>` | Create a new task in Mission-Claw inbox |
| `!task <title> \| <description> \| agent:<name>` | Create task and target a specific agent by name (case-insensitive) |
| `!task <title> \| <description> \| priority:<low\|normal\|high\|urgent>` | Create task with explicit priority |
| `!task <title> \| <description> \| agent:<name> \| priority:<...>` | Combine explicit assignee + priority |
| `!task-status <id>` | Show task status and most recent activity |
| `!task-list` | List in-progress tasks (id, title, assigned agent) |
| `!task-blockers` | List in-progress tasks with active BLOCKED activity |
| `!task-review <id>` | Move a task to `review` |

Commands are deduped and allowlist-protected. Rate limits apply per user, but IDs in `OPENCLAW_DISCORD_TASK_OWNER_IDS` bypass only the min-interval throttle.

---

## Setup

### Prerequisites
- Node.js 18+
- OpenClaw running and accessible
- Discord bot configured in OpenClaw with a relay channel

### Environment Variables

```env
# OpenClaw connection
OPENCLAW_GATEWAY_URL=http://localhost:3001
OPENCLAW_API_KEY=your-api-key
INTERNAL_CONTEXT_API_KEY=your-internal-context-api-key

# Discord relay — the OpenClaw session key for the Discord channel
DISCORD_RELAY_SESSION_KEY=agent:main:discord:channel:<channel-id>

# Discord task command ingestion
OPENCLAW_DISCORD_TASK_COMMANDS_ENABLED=true
OPENCLAW_DISCORD_TASK_COMMAND_USER_ALLOWLIST=user-id-1,user-id-2
OPENCLAW_DISCORD_TASK_OWNER_IDS=discord-owner-id-1,discord-owner-id-2

# File paths
PROJECTS_PATH=~/projects
NEXT_PUBLIC_PROJECTS_PATH=~/projects

# App
NODE_ENV=production
PORT=4000
```

### Local Development

```bash
git clone https://github.com/your-org/mission-claw
cd mission-claw
npm install
cp .env.example .env.local  # fill in your values
npm run dev
```

App runs at `http://localhost:3000`.

### Docker (Production)

```bash
docker-compose up -d
```

Default port: `4000`. MC dashboard: `http://<host>:4000/workspace/default`.

### GitHub Integration

Mission-Claw can automatically transition task status based on linked GitHub pull requests.

1. Go to your repository: **Settings → Webhooks → Add webhook**
2. Set **Payload URL** to: `https://your-mc-url/api/webhooks/github`
3. Set **Content type** to: `application/json`
4. Set a webhook secret and add it to `.env.local`:
   - `GITHUB_WEBHOOK_SECRET=<your-secret>`
5. Choose **Let me select individual events** and enable **Pull requests** only

Notes:
- `/api/webhooks/github` is exempt from `MC_API_TOKEN` bearer auth in middleware.
- Security for this endpoint is enforced via GitHub HMAC (`X-Hub-Signature-256`) using `GITHUB_WEBHOOK_SECRET`.

To link a PR to a Mission-Claw task, include this anywhere in the PR body (or title):

```text
mc-task: <uuid>
```

When linked:
- PR opened/synchronized → task moves to `review`
- PR merged → task moves to `done`
- PR closed without merge → task moves to `inbox`

### PM2

```bash
npm run build
pm2 start ecosystem.config.cjs
pm2 save
```

---

## API Reference (Quick)

| Method | Path | Description |
|---|---|---|
| `GET/POST` | `/api/tasks` | List / create tasks |
| `PATCH` | `/api/tasks/:id` | Update task status/fields |
| `POST` | `/api/tasks/:id/activities` | Log activity |
| `POST` | `/api/tasks/:id/deliverables` | Log deliverable |
| `POST` | `/api/tasks/:id/dispatch` | Dispatch task to agent |
| `GET` | `/api/events/stream` | SSE event stream |
| `POST` | `/api/webhooks/agent-completion` | Agent completion webhook (called by OpenClaw) |
| `POST` | `/api/webhooks/github` | GitHub pull request webhook for task status automation |
| `GET` | `/api/openclaw/status` | OpenClaw connection status |
| `GET` | `/api/openclaw/diagnostics` | Integration diagnostics log |

---

## Credits

Mission-Claw is built on top of **[Mission-Control](https://github.com/crshdn/mission-control)** by [@crshdn](https://github.com/crshdn) and contributors. The core architecture, UI design, and agent orchestration patterns are their work. We've extended it for our specific Discord-first, OpenClaw-integrated workflow — but none of this exists without the foundation they built.

If you're looking for a clean, standalone agent orchestration dashboard without the GearSwitchr-specific integrations, check out the upstream project.

---

## License

MIT — same as upstream Mission-Control.
