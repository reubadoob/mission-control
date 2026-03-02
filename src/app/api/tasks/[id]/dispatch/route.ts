import { createHash, randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryAll, run } from '@/lib/db';
import { getOpenClawClient } from '@/lib/openclaw/client';
import { broadcast } from '@/lib/events';
import { getProjectsPath, getMissionControlUrl } from '@/lib/config';
import { fetchAgentContext } from '@/lib/context/agent-context';
import {
  buildDispatchPrompt,
  buildRoutingPrompt,
  estimateTokens,
  REQUIRED_FINAL_OUTPUT_SECTION,
} from '@/lib/prompts/dispatch';
import { estimateCostUsd } from '@/lib/costs';
import { prepareWorktree, WORKTREE_BASE_BRANCH } from '@/lib/workspace';
import type { Task, Agent, OpenClawSession } from '@/lib/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const MAX_DISPATCH_PROMPT_TOKENS = 4000;
const ORCHESTRATOR_AGENT_ID = '0d6529a4-22e5-4182-b82c-15654c0ac0f6';
const DEVELOPER_AGENT_ID = '72e5814f-3932-4249-81bb-049cda09d7cf';

type RoutingMetadata = { routing_mode?: string; [key: string]: unknown };

function parseTaskMetadata(raw: string | null | undefined): RoutingMetadata {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as RoutingMetadata;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function extractRoutingJson(content: string): { agentId: string; agentName: string; rationale: string } | null {
  const fenced = content.match(/```json\s*([\s\S]*?)\s*```/i)?.[1] ?? content;
  const start = fenced.indexOf('{');
  const end = fenced.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    const parsed = JSON.parse(fenced.slice(start, end + 1)) as { agentId?: unknown; agentName?: unknown; rationale?: unknown };
    if (typeof parsed.agentId !== 'string' || typeof parsed.agentName !== 'string' || typeof parsed.rationale !== 'string') {
      return null;
    }
    return { agentId: parsed.agentId, agentName: parsed.agentName, rationale: parsed.rationale };
  } catch {
    return null;
  }
}

function enforceDispatchTokenBudget(prompt: string): string {
  const requiredSuffix = `\n\n${REQUIRED_FINAL_OUTPUT_SECTION}`;

  const basePrefix = prompt.endsWith(requiredSuffix)
    ? prompt.slice(0, -requiredSuffix.length)
    : prompt;
  const fullPrompt = `${basePrefix.trimEnd()}${requiredSuffix}`;

  if (estimateTokens(fullPrompt) <= MAX_DISPATCH_PROMPT_TOKENS) {
    return fullPrompt;
  }

  const availableChars = (MAX_DISPATCH_PROMPT_TOKENS * 4) - requiredSuffix.length;
  if (availableChars <= 0) {
    return REQUIRED_FINAL_OUTPUT_SECTION;
  }

  return `${basePrefix.slice(0, availableChars).trimEnd()}${requiredSuffix}`;
}

async function runOrchestratorRouting(params: {
  task: Task & { assigned_agent_name?: string; workspace_id: string; metadata?: string | null };
  client: ReturnType<typeof getOpenClawClient>;
  now: string;
}): Promise<{ resolvedAgentId: string; resolvedAgentName: string; rationale: string }> {
  const { task, client, now } = params;

  const liveAgents = queryAll<Array<Pick<Agent, 'id' | 'name' | 'description'>>[number]>(
    `SELECT id, name, description
     FROM agents
     WHERE workspace_id = ?
       AND status != 'offline'
       AND id != ?`,
    [task.workspace_id, ORCHESTRATOR_AGENT_ID],
  );

  const agentContext = await fetchAgentContext();
  const routingPrompt = buildRoutingPrompt({
    taskId: task.id,
    title: task.title,
    description: task.description || task.title,
    agents: liveAgents,
    context: agentContext || undefined,
  });

  const fallbackAgent = queryOne<Pick<Agent, 'id' | 'name'>>(
    `SELECT id, name FROM agents WHERE workspace_id = ? AND status != 'offline' AND (id = ? OR lower(name) = 'developer') LIMIT 1`,
    [task.workspace_id, DEVELOPER_AGENT_ID]
  ) || liveAgents[0] || null;

  let resolvedAgentId = fallbackAgent?.id ?? DEVELOPER_AGENT_ID;
  let resolvedAgentName = fallbackAgent?.name ?? 'Developer';
  let rationale = 'Orchestrator routing failed — defaulted to Developer';

  try {
    const routingSession = await client.createSession('mission-control');
    await client.sendMessage(routingSession.id, routingPrompt);

    let routingResponse: string | null = null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const history = await client.getSessionHistory(routingSession.id, 25, 0);
      const assistantMessage = [...history]
        .reverse()
        .find((entry) => entry && typeof entry === 'object' && (entry as { role?: unknown }).role === 'assistant') as { content?: unknown; text?: unknown; message?: unknown } | undefined;
      const responseText = typeof assistantMessage?.content === 'string'
        ? assistantMessage.content
        : typeof assistantMessage?.text === 'string'
          ? assistantMessage.text
          : typeof assistantMessage?.message === 'string'
            ? assistantMessage.message
            : null;
      if (responseText?.trim()) {
        routingResponse = responseText;
        break;
      }
    }

    const parsed = routingResponse ? extractRoutingJson(routingResponse) : null;
    if (parsed) {
      const selected = queryOne<Pick<Agent, 'id' | 'name'>>(
        `SELECT id, name FROM agents WHERE workspace_id = ? AND id = ? AND status != 'offline' LIMIT 1`,
        [task.workspace_id, parsed.agentId],
      );
      if (selected) {
        resolvedAgentId = selected.id;
        resolvedAgentName = selected.name;
        rationale = parsed.rationale;
      }
    }
  } catch (error) {
    console.warn('Orchestrator routing failed, defaulting to Developer:', error);
  }

  const currentMetadata = parseTaskMetadata(task.metadata);
  const { routing_mode: _routingMode, ...remainingMetadata } = currentMetadata;
  const updatedMetadata = Object.keys(remainingMetadata).length > 0 ? JSON.stringify(remainingMetadata) : null;

  run(
    `UPDATE tasks
     SET assigned_agent_id = ?, metadata = ?, updated_at = ?
     WHERE id = ?`,
    [resolvedAgentId, updatedMetadata, now, task.id],
  );

  run(
    `INSERT INTO task_activities (id, task_id, workspace_id, agent_id, activity_type, message, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      task.id,
      task.workspace_id,
      resolvedAgentId,
      'updated',
      resolvedAgentId === DEVELOPER_AGENT_ID && rationale.includes('defaulted to Developer')
        ? 'Orchestrator routing failed — defaulted to Developer'
        : `Orchestrator routed to ${resolvedAgentName}: ${rationale}`,
      now,
    ],
  );

  return { resolvedAgentId, resolvedAgentName, rationale };
}

/**
 * POST /api/tasks/[id]/dispatch
 * 
 * Dispatches a task to its assigned agent's OpenClaw session.
 * Creates session if needed, sends task details to agent.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Get task with agent info
    const task = queryOne<Task & { assigned_agent_name?: string; workspace_id: string; metadata?: string | null }>(
      `SELECT t.*, a.name as assigned_agent_name, a.is_master
       FROM tasks t
       LEFT JOIN agents a ON t.assigned_agent_id = a.id
       WHERE t.id = ?`,
      [id]
    );

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    if (!task.assigned_agent_id) {
      return NextResponse.json(
        { error: 'Task has no assigned agent' },
        { status: 400 }
      );
    }

    // Get agent details
    const agent = queryOne<Agent>(
      'SELECT * FROM agents WHERE id = ?',
      [task.assigned_agent_id]
    );

    if (!agent) {
      return NextResponse.json({ error: 'Assigned agent not found' }, { status: 404 });
    }

    const taskMetadata = parseTaskMetadata(task.metadata);

    // Orchestrator auto-routing mode: choose the best active agent, then continue normal dispatch.
    if (taskMetadata.routing_mode === 'orchestrator' && agent.id === ORCHESTRATOR_AGENT_ID) {
      const client = getOpenClawClient();
      if (!client.isConnected()) {
        try {
          await client.connect();
        } catch (err) {
          console.error('Failed to connect to OpenClaw Gateway for routing:', err);
        }
      }

      const now = new Date().toISOString();
      await runOrchestratorRouting({ task, client, now });

      const routedTask = queryOne<Task & { assigned_agent_name?: string; workspace_id: string; metadata?: string | null }>(
        `SELECT t.*, a.name as assigned_agent_name, a.is_master
         FROM tasks t
         LEFT JOIN agents a ON t.assigned_agent_id = a.id
         WHERE t.id = ?`,
        [id],
      );

      if (!routedTask || !routedTask.assigned_agent_id) {
        return NextResponse.json({ error: 'Failed to route task via Orchestrator' }, { status: 500 });
      }

      task.assigned_agent_id = routedTask.assigned_agent_id;
      task.metadata = routedTask.metadata ?? null;
      task.assigned_agent_name = routedTask.assigned_agent_name;

      const routedAgent = queryOne<Agent>('SELECT * FROM agents WHERE id = ?', [routedTask.assigned_agent_id]);
      if (!routedAgent) {
        return NextResponse.json({ error: 'Routed agent not found' }, { status: 404 });
      }

      Object.assign(agent, routedAgent);
    }

    // Check if dispatching to the master agent while there are other orchestrators available
    if (agent.is_master) {
      // Check for other master agents in the same workspace (excluding this one)
      const otherOrchestrators = queryAll<{
        id: string;
        name: string;
        role: string;
      }>(
        `SELECT id, name, role
         FROM agents
         WHERE is_master = 1
         AND id != ?
         AND workspace_id = ?
         AND status != 'offline'`,
        [agent.id, task.workspace_id]
      );

      if (otherOrchestrators.length > 0) {
        return NextResponse.json({
          success: false,
          warning: 'Other orchestrators available',
          message: `There ${otherOrchestrators.length === 1 ? 'is' : 'are'} ${otherOrchestrators.length} other orchestrator${otherOrchestrators.length === 1 ? '' : 's'} available in this workspace: ${otherOrchestrators.map(o => o.name).join(', ')}. Consider assigning this task to them instead.`,
          otherOrchestrators,
        }, { status: 409 }); // 409 Conflict - indicating there's an alternative
      }
    }

    // Connect to OpenClaw Gateway
    const client = getOpenClawClient();
    if (!client.isConnected()) {
      try {
        await client.connect();
      } catch (err) {
        console.error('Failed to connect to OpenClaw Gateway:', err);
        return NextResponse.json(
          { error: 'Failed to connect to OpenClaw Gateway' },
          { status: 503 }
        );
      }
    }

    // Get or create OpenClaw session for this agent
    let session = queryOne<OpenClawSession>(
      'SELECT * FROM openclaw_sessions WHERE agent_id = ? AND status = ?',
      [agent.id, 'active']
    );

    const now = new Date().toISOString();

    if (!session) {
      // Create session record
      const sessionId = uuidv4();
      const openclawSessionId = `mission-control-${agent.name.toLowerCase().replace(/\s+/g, '-')}`;

      const conflictingSession = queryOne<OpenClawSession>(
        'SELECT * FROM openclaw_sessions WHERE openclaw_session_id = ? AND status = ?',
        [openclawSessionId, 'active']
      );

      if (conflictingSession && conflictingSession.agent_id !== agent.id) {
        return NextResponse.json(
          {
            error: 'OpenClaw session key already linked to another active agent',
            session_id: openclawSessionId,
            conflicting_agent_id: conflictingSession.agent_id,
          },
          { status: 409 }
        );
      }

      run(
        `INSERT INTO openclaw_sessions (id, agent_id, openclaw_session_id, channel, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [sessionId, agent.id, openclawSessionId, 'mission-control', 'active', now, now]
      );

      session = queryOne<OpenClawSession>(
        'SELECT * FROM openclaw_sessions WHERE id = ?',
        [sessionId]
      );

      // Log session creation
      run(
        `INSERT INTO events (id, type, agent_id, message, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [uuidv4(), 'agent_status_changed', agent.id, `${agent.name} session created`, now]
      );
    }

    if (!session) {
      return NextResponse.json(
        { error: 'Failed to create agent session' },
        { status: 500 }
      );
    }

    const sessionKey = `agent:main:${session.openclaw_session_id}`;

    // Build task message for agent
    const priorityEmoji = {
      low: '🔵',
      normal: '⚪',
      high: '🟡',
      urgent: '🔴'
    }[task.priority] || '⚪';

    // Get project path for deliverables
    const projectsPath = getProjectsPath();
    const projectDir = task.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const taskProjectDir = `${projectsPath}/${projectDir}`;
    const missionControlUrl = getMissionControlUrl();

    const repoPath = process.env.GIT_REPO_ROOT;
    let workspaceContext = '';
    let preparedWorktreePath: string | null = null;

    if (!repoPath) {
      console.warn('GIT_REPO_ROOT is not set; skipping worktree preparation.');
      run(
        `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          task.id,
          agent.id,
          'status_changed',
          'Worktree preparation skipped because GIT_REPO_ROOT is not set.',
          now,
        ],
      );
    } else {
      try {
        const { worktreePath, branchName } = await prepareWorktree(task.id, task.title, repoPath);
        preparedWorktreePath = worktreePath;
        workspaceContext = `**WORKTREE_PATH:** ${worktreePath}\n**BRANCH_NAME:** ${branchName}\n**BASE_BRANCH:** ${WORKTREE_BASE_BRANCH}\n**REPO_PATH:** ${repoPath}\n\n`;

        run(
          `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            randomUUID(),
            task.id,
            agent.id,
            'status_changed',
            `Prepared isolated worktree: ${worktreePath} (${branchName})`,
            now,
          ],
        );
      } catch (error) {
        console.warn('Worktree preparation failed, continuing dispatch:', error);

        run(
          `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            randomUUID(),
            task.id,
            agent.id,
            'status_changed',
            `Worktree preparation failed (continuing without isolation): ${error instanceof Error ? error.message : 'unknown error'}`,
            now,
          ],
        );
      }
    }

    const agentContext = await fetchAgentContext();

    const systemRole = `You are ${agent.name}, a Mission Control execution agent working in OpenClaw sessions. You can inspect/edit files, run shell commands, create branches/worktrees, run tests, and produce PR-ready deliverables. Execute with production quality and clear progress reporting.`;

    const businessContextParts = [
      `${priorityEmoji} New task assigned by Mission Control.`,
      `Title: ${task.title}`,
      task.description ? `Description: ${task.description}` : null,
      `Priority: ${task.priority.toUpperCase()}`,
      task.due_date ? `Due: ${task.due_date}` : null,
      `Task ID: ${task.id}`,
      `Output directory: ${taskProjectDir}`,
      workspaceContext.trim(),
      agentContext ? `Live GearSwitchr Context:\n${agentContext}` : 'Live GearSwitchr Context: unavailable (API unavailable or key missing).',
    ].filter(Boolean);

    const taskSpec = [
      'Required API calls before completion:',
      `1) POST ${missionControlUrl}/api/tasks/${task.id}/activities with {"activity_type":"completed","message":"Description of what was done"}`,
      `2) POST ${missionControlUrl}/api/tasks/${task.id}/deliverables with {"deliverable_type":"file","title":"File name","path":"${taskProjectDir}/filename.html"}`,
      `3) PATCH ${missionControlUrl}/api/tasks/${task.id} with {"status":"review"}`,
      '',
      `After PR merge, cleanup from ${repoPath ?? 'repository root (GIT_REPO_ROOT not set at dispatch time)'}: git worktree remove ${preparedWorktreePath ?? `/tmp/mc-task-${task.id}`} --force`,
      'If clarification is needed, ask the orchestrator with a concrete question.',
    ].join('\n');

    const constraints = [
      'Completion signal format (required):',
      'TASK_COMPLETE: <brief summary>',
      'PROGRESS_UPDATE: <what changed> | next: <next step> | eta: <time>',
      'BLOCKED: <reason> | need: <what you need to proceed> | meanwhile: <what the user can do while waiting>',
      '',
      'Worktree instructions:',
      '- Use the prepared worktree/branch when provided in business context.',
      '- Keep all changes and outputs inside the assigned repo/worktree.',
      '- Do not drift from task scope; do not start unrelated work.',
    ].join('\n');

    const promptBody = enforceDispatchTokenBudget(buildDispatchPrompt({
      systemRole,
      businessContext: businessContextParts.join('\n'),
      taskSpec,
      constraints,
    }));

    const promptVersion = 'v2';
    const promptChecksum = createHash('sha256').update(promptBody).digest('hex').slice(0, 12);
    const taskMessage = `<!-- dispatch-prompt:${promptVersion} checksum:${promptChecksum} -->\n${promptBody}`;
    const estimatedTokens = estimateTokens(promptBody);

    // Send message to agent's session using chat.send.
    // Start with a lightweight handshake so stale sessions get rehydrated before task dispatch.
    try {
      await client.call('chat.send', {
        sessionKey,
        message: '[Mission Control] Lightweight handshake',
        idempotencyKey: `dispatch-handshake-${task.id}-${Date.now()}`,
      });

      await client.call('chat.send', {
        sessionKey,
        message: taskMessage,
        idempotencyKey: `dispatch-${task.id}-${Date.now()}`
      });

      // Update task status to in_progress
      run(
        'UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?',
        ['in_progress', now, id]
      );

      // Broadcast task update
      const updatedTask = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [id]);
      if (updatedTask) {
        broadcast({
          type: 'task_updated',
          payload: updatedTask,
        });
      }

      // Update agent status to working
      run(
        'UPDATE agents SET status = ?, updated_at = ? WHERE id = ?',
        ['working', now, agent.id]
      );

      // Log dispatch event to events table
      const eventId = uuidv4();
      run(
        `INSERT INTO events (id, type, agent_id, task_id, message, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [eventId, 'task_dispatched', agent.id, task.id, `Task "${task.title}" dispatched to ${agent.name}`, now]
      );

      // Log dispatch activity to task_activities table (for Activity tab)
      const activityId = randomUUID();
      run(
        `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [activityId, task.id, agent.id, 'status_changed', `Task dispatched to ${agent.name} - Agent is now working on this task`, now]
      );

      const agentModel = agent.model || 'anthropic/claude-sonnet-4-6';
      const costUsd = estimateCostUsd(estimatedTokens, agentModel);
      const costId = randomUUID();

      run(
        `INSERT INTO task_costs (id, task_id, agent_id, model, estimated_tokens, estimated_cost_usd, dispatch_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [costId, task.id, agent.id, agentModel, estimatedTokens, costUsd, now, now]
      );

      run(
        'UPDATE tasks SET estimated_tokens = ?, model_used = ?, prompt_version = ?, updated_at = ? WHERE id = ?',
        [estimatedTokens, agentModel, promptVersion, now, task.id]
      );

      const tokenActivityId = randomUUID();
      run(
        `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          tokenActivityId,
          task.id,
          agent.id,
          'updated',
          `Dispatch prompt metadata: version=${promptVersion}, checksum=${promptChecksum}, estimated_tokens=${estimatedTokens}, model=${agentModel}, estimated_cost_usd=${costUsd}`,
          now,
        ]
      );

      const requiredSignalActivityId = randomUUID();
      run(
        `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          requiredSignalActivityId,
          task.id,
          agent.id,
          'updated',
          'Dispatch prompt sent with TASK_COMPLETE signal requirement (v2)',
          now,
        ]
      );

      const contextActivityId = randomUUID();
      run(
        `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          contextActivityId,
          task.id,
          agent.id,
          'updated',
          agentContext
            ? 'Live GearSwitchr context injected into dispatch prompt'
            : 'Live GearSwitchr context skipped (API unavailable or key missing)',
          now,
        ]
      );

      return NextResponse.json({
        success: true,
        task_id: task.id,
        agent_id: agent.id,
        session_id: session.openclaw_session_id,
        message: 'Task dispatched to agent'
      });
    } catch (err) {
      console.error('Failed to send message to agent:', err);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Failed to dispatch task:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
