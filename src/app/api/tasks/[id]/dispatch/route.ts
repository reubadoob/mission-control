import { createHash, randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryAll, run } from '@/lib/db';
import { getOpenClawClient } from '@/lib/openclaw/client';
import { broadcast } from '@/lib/events';
import { getProjectsPath, getMissionControlUrl } from '@/lib/config';
import { fetchAgentContext } from '@/lib/context/agent-context';
import { buildDispatchPrompt, estimateTokens } from '@/lib/prompts/dispatch';
import { prepareWorktree, WORKTREE_BASE_BRANCH } from '@/lib/workspace';
import type { Task, Agent, OpenClawSession } from '@/lib/types';

interface RouteParams {
  params: Promise<{ id: string }>;
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
    const task = queryOne<Task & { assigned_agent_name?: string; workspace_id: string }>(
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
      'BLOCKED: <what is blocked> | need: <specific input> | meanwhile: <fallback work>',
      '',
      'Worktree instructions:',
      '- Use the prepared worktree/branch when provided in business context.',
      '- Keep all changes and outputs inside the assigned repo/worktree.',
      '- Do not drift from task scope; do not start unrelated work.',
    ].join('\n');

    const promptBody = buildDispatchPrompt({
      systemRole,
      businessContext: businessContextParts.join('\n'),
      taskSpec,
      constraints,
    });

    const promptVersion = 'v1';
    const promptChecksum = createHash('sha256').update(promptBody).digest('hex').slice(0, 12);
    const taskMessage = `<!-- dispatch-prompt:${promptVersion} checksum:${promptChecksum} -->\n${promptBody}`;
    const estimatedTokens = estimateTokens(taskMessage);

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

      const tokenActivityId = randomUUID();
      run(
        `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          tokenActivityId,
          task.id,
          agent.id,
          'updated',
          `Dispatch prompt metadata: version=${promptVersion}, checksum=${promptChecksum}, estimated_tokens=${estimatedTokens}`,
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
