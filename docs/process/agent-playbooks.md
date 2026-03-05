# Agent Playbooks

> How Oscar selects agents, spawns work, and completes tasks in the Mission Claw system.

---

## Agent Types

| Agent | ID | Use When |
|---|---|---|
| **Developer** | `72e5814f` | Writing code, opening PRs, infra changes, debugging, deployments |
| **Researcher** | `1354b64e` | Research spikes, technology evaluation, competitive analysis, gathering context |
| **Writer** | `74f764ae` | Documentation, copy, process docs, changelogs, onboarding content |
| **Blueprint** | `813008d4` | Architecture planning, system design, ADRs, high-level technical decisions |
| **SEO Content Editor** | `39b73ae6` | SEO-optimized content, meta copy, keyword research, content audits |
| **Orchestrator** | `0d6529a4` | Multi-agent tasks requiring coordination across multiple workstreams |

### Selection Heuristic

Oscar routes tasks based on keywords and task type. If a task involves:
- **Code, PRs, infra** → Developer
- **Research, evaluation, spikes** → Researcher
- **Docs, copy, writing** → Writer
- **Architecture, planning, design** → Blueprint
- **SEO, content ranking** → SEO Content Editor
- **Multiple agent types needed** → Orchestrator (which spawns sub-agents)

---

## How Oscar Spawns Agents

1. **MC task created first** — every unit of work starts as an MC task in the inbox.
2. **Task ID injected** — the MC task ID is passed into the agent's context so it can reference and update the task.
3. **Worktree setup** — for Developer agents, Oscar creates an isolated git worktree so the agent works on a clean branch without touching main or other in-flight work.
4. **Agent executes** — the agent completes the work (code, docs, research, etc.).
5. **TASK_COMPLETE signal** — when done, the agent prints to stdout:

```
TASK_COMPLETE: <one-line summary> | deliverables: <url or path>
```

6. **No openclaw system event** — Oscar reads `TASK_COMPLETE` from stdout only. Agents must NOT emit an openclaw system event on completion.

---

## MC Task Lifecycle

Tasks flow through these statuses:

```
inbox → planning → assigned → in_progress → testing → review → done
```

| Status | Meaning |
|---|---|
| `inbox` | Task created, not yet reviewed |
| `planning` | Oscar or a human is defining scope/approach |
| `assigned` | Agent assigned, not yet started |
| `in_progress` | Agent actively working |
| `testing` | Work complete, automated or manual checks running |
| `review` | Deliverable ready for human approval in MC review tab |
| `done` | Approved and closed |

---

## Two-Lifecycle Flow

The system distinguishes between **defining** work and **implementing** work.

### Lifecycle 1 — Definition (Request → Issue)

Used when there is no pre-existing GitHub Issue. The agent's deliverable *is* the Issue.

```
Human or Oscar request
        ↓
   MC task created
        ↓
   Agent does work
        ↓
GitHub Issue opened as deliverable
        ↓
      done
```

Example: Oscar asks a Blueprint agent to design a new feature. The deliverable is a GitHub Issue describing the spec.

### Lifecycle 2 — Implementation (Issue → PR)

Used when a GitHub Issue already exists. The agent closes the Issue with a PR.

```
GitHub Issue exists
        ↓
MC task references Issue #N
        ↓
   Agent does work
        ↓
PR opened with "Closes #N"
        ↓
      done
```

Example: A Developer agent implements a feature described in Issue #42, opens a PR with `Closes #42`.

---

## Completion Signal Pattern

Agents must emit this exact format to stdout when work is complete:

```
TASK_COMPLETE: <summary> | deliverables: <url>
```

Examples:

```
TASK_COMPLETE: implemented user auth flow | deliverables: https://github.com/reubadoob/gearswitchr/pull/17
TASK_COMPLETE: architecture doc for trade matching | deliverables: https://github.com/reubadoob/gearswitchr/issues/55
TASK_COMPLETE: 3 process docs written | deliverables: https://github.com/reubadoob/mission-control/pull/4
```

Oscar parses this signal to:
- Mark the MC task as `review`
- Link the deliverable in the MC task record
- Notify Reuben via Discord
