import { v4 as uuidv4 } from 'uuid';
import type { OpenClawClient } from '@/lib/openclaw/client';
import { getDiscordTaskCommandConfig, getMissionControlUrl } from '@/lib/config';
import { queryAll, queryOne, run, transaction } from '@/lib/db';
import { broadcast } from '@/lib/events';
import type { Agent, Task, TaskPriority } from '@/lib/types';

const observedClients = new WeakSet<OpenClawClient>();
const dedupeCache = new Map<string, number>();
const senderRateLimit = new Map<string, number>();
const DEDUPE_TTL_MS = 5 * 60 * 1000;
const QUICK_ACTION_DEDUPE_TTL_MS = 10 * 1000;
const MAX_TITLE_LENGTH = 140;
const MIN_TITLE_LENGTH = 3;
const MAX_DESCRIPTION_LENGTH = 4000;
const MIN_DESCRIPTION_LENGTH = 5;
const TASK_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_DISCORD_THREAD_NAME_LENGTH = 100;
const DISCORD_DM_SESSION_KEY_RE = /^agent:main:discord:dm:[^:]+$/i;

function pruneCache(map: Map<string, number>, ttlMs: number, now: number): void {
  for (const [key, value] of Array.from(map.entries())) {
    if (now - value > ttlMs) map.delete(key);
  }
}

function normalizeSessionKey(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  return value.trim();
}

function recursiveFindByKeys(input: unknown, keys: Set<string>): string | null {
  if (!input || typeof input !== 'object') return null;
  const obj = input as Record<string, unknown>;
  for (const [key, value] of Object.entries(obj)) {
    if (keys.has(key) && typeof value === 'string' && value.trim()) return value.trim();
    if (value && typeof value === 'object') {
      const nested = recursiveFindByKeys(value, keys);
      if (nested) return nested;
    }
  }
  return null;
}

function recursiveCollectStrings(input: unknown, out: string[] = []): string[] {
  if (typeof input === 'string') {
    out.push(input);
    return out;
  }
  if (Array.isArray(input)) {
    for (const item of input) recursiveCollectStrings(item, out);
    return out;
  }
  if (input && typeof input === 'object') {
    for (const value of Object.values(input as Record<string, unknown>)) recursiveCollectStrings(value, out);
  }
  return out;
}

function extractSessionKey(notification: unknown): string | null {
  return recursiveFindByKeys(notification, new Set(['sessionKey', 'session_key', 'key']));
}

function extractSenderId(notification: unknown): string | null {
  return recursiveFindByKeys(notification, new Set(['senderId', 'sender_id', 'userId', 'user_id', 'authorId', 'author_id', 'fromId', 'from_id']));
}

function extractChannelId(notification: unknown): string | null {
  return recursiveFindByKeys(notification, new Set(['channelId', 'channel_id']));
}

function extractMessageId(notification: unknown): string | null {
  return recursiveFindByKeys(notification, new Set(['messageId', 'message_id']));
}

function isDmSessionKey(sessionKey: string): boolean {
  return DISCORD_DM_SESSION_KEY_RE.test(sessionKey);
}

function isObservedSessionKey(configSessionKey: string | null, dmEnabled: boolean, sessionKey: string): boolean {
  if (configSessionKey && sessionKey === configSessionKey) return true;
  if (dmEnabled && isDmSessionKey(sessionKey)) return true;
  return false;
}

function extractSenderRole(notification: unknown): string | null {
  const role = recursiveFindByKeys(notification, new Set(['senderRole', 'sender_role', 'authorRole', 'author_role', 'role']));
  return role ? role.toLowerCase() : null;
}

function extractCommandText(notification: unknown, prefixes: string[]): string | null {
  const candidate = recursiveFindByKeys(notification, new Set(['content', 'message', 'text', 'body']));
  if (candidate) {
    const trimmed = candidate.trim();
    if (prefixes.some((p) => trimmed.toLowerCase().startsWith(p.toLowerCase()))) return trimmed;
  }

  for (const value of recursiveCollectStrings(notification)) {
    const trimmed = value.trim();
    if (prefixes.some((p) => trimmed.toLowerCase().startsWith(p.toLowerCase()))) return trimmed;
  }

  return null;
}

function parseTaskCommand(commandText: string, commandPrefix: string): { title: string; description: string; targetAgentName: string | null; priority: TaskPriority | null } | null {
  const escapedPrefix = commandPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escapedPrefix}\\s+([\\s\\S]+)$`, 'i');
  const match = commandText.match(pattern);
  if (!match) return null;

  const segments = match[1].split('|');
  const rawTitle = segments[0]?.trim() ?? '';
  const rawDescription = segments[1]?.trim() ?? '';
  const rawOptions = segments.slice(2).join('|').trim();
  if (!rawTitle) return null;

  const title = rawTitle.replace(/\s+/g, ' ').trim();
  const description = rawDescription.trim() || title; // fall back to title as description if omitted
  if (title.length < MIN_TITLE_LENGTH || title.length > MAX_TITLE_LENGTH) return null;
  if (description.length < MIN_DESCRIPTION_LENGTH || description.length > MAX_DESCRIPTION_LENGTH) return null;

  let targetAgentName: string | null = null;
  let priority: TaskPriority | null = null;

  for (const option of (rawOptions ? rawOptions.split('|') : []).map((part) => part.trim()).filter(Boolean)) {
    const opt = option.match(/^([a-zA-Z_-]+)\s*:\s*(.+)$/);
    if (!opt) return null;
    const key = opt[1].toLowerCase();
    const value = opt[2].trim();

    if (key === 'agent') targetAgentName = value;
    else if (key === 'priority') {
      const normalized = value.toLowerCase();
      if (!(['low', 'normal', 'high', 'urgent'] as const).includes(normalized as TaskPriority)) return null;
      priority = normalized as TaskPriority;
    } else return null;
  }

  return { title, description, targetAgentName, priority };
}

function parseTaskIdCommand(commandText: string, prefix: string): string | null {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = commandText.match(new RegExp(`^${escaped}\\s+(.+)$`, 'i'));
  if (!match) return null;
  return TASK_ID_PATTERN.test(match[1].trim()) ? match[1].trim() : null;
}

function logAudit(status: 'attempt' | 'rejected' | 'success' | 'failure', message: string, metadata: Record<string, unknown>): void {
  run(`INSERT INTO events (id, type, message, metadata, created_at) VALUES (?, ?, ?, ?, ?)`, [uuidv4(), 'system', `[openclaw:discord_task_command:${status}] ${message}`, JSON.stringify(metadata), new Date().toISOString()]);
}

async function sendAck(client: OpenClawClient, sessionKey: string, message: string, fingerprint: string): Promise<void> {
  await client.call('chat.send', { sessionKey, message, idempotencyKey: `discord-task-command-ack-${fingerprint}-${Date.now()}` });
}

function buildDiscordThreadName(taskId: string, title: string): string {
  const base = `[MC-${taskId}] ${title}`.trim();
  return base.length <= MAX_DISCORD_THREAD_NAME_LENGTH ? base : `${base.slice(0, MAX_DISCORD_THREAD_NAME_LENGTH - 1).trimEnd()}…`;
}

async function createDiscordThreadForTask(input: { client: OpenClawClient; sourceChannelId: string; sourceMessageId: string | null; taskId: string; taskTitle: string }): Promise<string | null> {
  const result = await input.client.call<unknown>('message', {
    action: 'thread-create',
    target: input.sourceChannelId,
    messageId: input.sourceMessageId || undefined,
    threadName: buildDiscordThreadName(input.taskId, input.taskTitle),
  });

  const threadId = recursiveFindByKeys(result, new Set(['threadId', 'thread_id']));
  return typeof threadId === 'string' && threadId.trim() !== '' ? threadId : null;
}

function setTaskDiscordThreadId(taskId: string, threadId: string): void {
  run(`UPDATE tasks SET discord_thread_id = ?, updated_at = ? WHERE id = ?`, [threadId, new Date().toISOString(), taskId]);
}

function createTaskFromDiscordCommand(input: { title: string; description: string; workspaceId: string; priority: TaskPriority; senderId: string | null; sessionKey: string; requestedAgentName?: string | null }): Task {
  const now = new Date().toISOString();
  const taskId = uuidv4();
  const creator = queryOne<Agent>(`SELECT id FROM agents WHERE workspace_id = ? ORDER BY is_master DESC, updated_at DESC LIMIT 1`, [input.workspaceId]);

  const requestedAssignee = input.requestedAgentName ? queryOne<Agent>(`SELECT * FROM agents WHERE workspace_id = ? AND status != 'offline' AND lower(name) = lower(?) ORDER BY is_master ASC, datetime(updated_at) DESC LIMIT 1`, [input.workspaceId, input.requestedAgentName]) : null;
  const assignee = requestedAssignee || queryOne<Agent>(`SELECT * FROM agents WHERE workspace_id = ? AND is_master = 0 AND status != 'offline' ORDER BY CASE status WHEN 'standby' THEN 0 WHEN 'working' THEN 1 ELSE 2 END, datetime(updated_at) DESC LIMIT 1`, [input.workspaceId]) || queryOne<Agent>(`SELECT * FROM agents WHERE workspace_id = ? AND is_master = 1 AND status != 'offline' ORDER BY datetime(updated_at) DESC LIMIT 1`, [input.workspaceId]) || null;

  const initialStatus = assignee ? 'assigned' : 'inbox';

  transaction(() => {
    run(`INSERT INTO tasks (id, title, description, status, priority, assigned_agent_id, created_by_agent_id, workspace_id, business_id, due_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [taskId, input.title, input.description, initialStatus, input.priority, assignee?.id || null, creator?.id || null, input.workspaceId, 'default', null, now, now]);
    run(`INSERT INTO events (id, type, task_id, agent_id, message, created_at) VALUES (?, ?, ?, ?, ?, ?)`, [uuidv4(), 'task_created', taskId, creator?.id || null, `Discord command created task: ${input.title}`, now]);

    if (assignee) {
      run(`INSERT INTO events (id, type, task_id, agent_id, message, created_at) VALUES (?, ?, ?, ?, ?, ?)`, [uuidv4(), 'task_assigned', taskId, assignee.id, `"${input.title}" assigned to ${assignee.name} (Discord command)`, now]);
      run(`INSERT INTO events (id, type, task_id, message, created_at) VALUES (?, ?, ?, ?, ?)`, [uuidv4(), 'task_status_changed', taskId, `Task "${input.title}" moved to assigned`, now]);
    }
  });

  const createdTask = queryOne<Task>(`SELECT t.*, aa.name as assigned_agent_name, aa.avatar_emoji as assigned_agent_emoji, ca.name as created_by_agent_name, ca.avatar_emoji as created_by_agent_emoji FROM tasks t LEFT JOIN agents aa ON t.assigned_agent_id = aa.id LEFT JOIN agents ca ON t.created_by_agent_id = ca.id WHERE t.id = ? AND t.workspace_id = ?`, [taskId, input.workspaceId]);
  if (!createdTask) throw new Error('Task was created but could not be read back');

  broadcast({ type: 'task_created', payload: createdTask });

  logAudit('success', 'Task created from Discord command', {
    task_id: createdTask.id,
    title: createdTask.title,
    assigned_agent_id: createdTask.assigned_agent_id,
    session_key: input.sessionKey,
    sender_id: input.senderId,
    workspace_id: input.workspaceId,
    priority: input.priority,
  });

  return createdTask;
}

function taskStatusReply(taskId: string, workspaceId: string): string {
  const task = queryOne<{ id: string; title: string; status: string; priority: string; assigned_agent_name: string | null }>(`SELECT t.id, t.title, t.status, t.priority, a.name as assigned_agent_name FROM tasks t LEFT JOIN agents a ON t.assigned_agent_id = a.id WHERE t.id = ? AND t.workspace_id = ?`, [taskId, workspaceId]);
  if (!task) return `❌ Task not found: ${taskId}`;
  const activity = queryOne<{ activity_type: string; message: string; created_at: string }>(`SELECT activity_type, message, created_at FROM task_activities WHERE task_id = ? AND workspace_id = ? ORDER BY datetime(created_at) DESC LIMIT 1`, [taskId, workspaceId]);
  return `📌 ${task.id}\nTitle: ${task.title}\nStatus: ${task.status}, priority: ${task.priority}${task.assigned_agent_name ? `, assigned: ${task.assigned_agent_name}` : ''}${activity ? `\nLast activity (${activity.activity_type} @ ${activity.created_at}): ${activity.message}` : '\nLast activity: none'}`;
}

function taskListReply(workspaceId: string): string {
  const tasks = queryAll<{ id: string; title: string; assigned_agent_name: string | null }>(`SELECT t.id, t.title, a.name as assigned_agent_name FROM tasks t LEFT JOIN agents a ON t.assigned_agent_id = a.id WHERE t.workspace_id = ? AND t.status = 'in_progress' ORDER BY datetime(t.updated_at) DESC LIMIT 25`, [workspaceId]);
  return tasks.length === 0 ? '✅ No tasks currently in progress.' : `🚧 In-progress tasks (${tasks.length}):\n${tasks.map((t) => `- ${t.id} | ${t.title} | ${t.assigned_agent_name || 'unassigned'}`).join('\n')}`;
}

function taskBlockersReply(workspaceId: string): string {
  const tasks = queryAll<{ id: string; title: string; assigned_agent_name: string | null; blocked_at: string; blocked_message: string }>(`SELECT t.id, t.title, a.name as assigned_agent_name, latest.created_at as blocked_at, latest.message as blocked_message FROM tasks t LEFT JOIN agents a ON t.assigned_agent_id = a.id INNER JOIN (SELECT ta.task_id, ta.workspace_id, ta.created_at, ta.message FROM task_activities ta INNER JOIN (SELECT task_id, workspace_id, MAX(datetime(created_at)) AS max_created_at FROM task_activities GROUP BY task_id, workspace_id) last ON last.task_id = ta.task_id AND last.workspace_id = ta.workspace_id AND datetime(ta.created_at) = last.max_created_at) latest ON latest.task_id = t.id AND latest.workspace_id = t.workspace_id WHERE t.workspace_id = ? AND t.status = 'in_progress' AND lower(latest.message) LIKE 'blocked:%' ORDER BY datetime(latest.created_at) DESC LIMIT 25`, [workspaceId]);
  return tasks.length === 0 ? '✅ No active blockers found.' : `🧱 Blocked in-progress tasks (${tasks.length}):\n${tasks.map((t) => `- ${t.id} | ${t.title} | ${t.assigned_agent_name || 'unassigned'} | ${t.blocked_at}\n  ${t.blocked_message}`).join('\n')}`;
}

function taskReviewReply(taskId: string, workspaceId: string): string {
  const task = queryOne<{ id: string; title: string; status: string }>(`SELECT id, title, status FROM tasks WHERE id = ? AND workspace_id = ?`, [taskId, workspaceId]);
  if (!task) return `❌ Task not found: ${taskId}`;
  if (task.status === 'review') return `ℹ️ Task ${task.id} is already in review.`;

  const now = new Date().toISOString();
  transaction(() => {
    run(`UPDATE tasks SET status = 'review', updated_at = ? WHERE id = ? AND workspace_id = ?`, [now, task.id, workspaceId]);
    run(`INSERT INTO events (id, type, task_id, message, created_at) VALUES (?, ?, ?, ?, ?)`, [uuidv4(), 'task_status_changed', task.id, `Task "${task.title}" moved to review (Discord command)`, now]);
    run(`INSERT INTO task_activities (id, task_id, workspace_id, activity_type, message, created_at) VALUES (?, ?, ?, ?, ?, ?)`, [uuidv4(), task.id, workspaceId, 'status_changed', 'Status changed to review from Discord command', now]);
  });

  const updated = queryOne<Task>(`SELECT t.*, aa.name as assigned_agent_name, aa.avatar_emoji as assigned_agent_emoji, ca.name as created_by_agent_name, ca.avatar_emoji as created_by_agent_emoji FROM tasks t LEFT JOIN agents aa ON t.assigned_agent_id = aa.id LEFT JOIN agents ca ON t.created_by_agent_id = ca.id WHERE t.id = ? AND t.workspace_id = ?`, [task.id, workspaceId]);
  if (updated) broadcast({ type: 'task_updated', payload: updated });
  return `✅ Task ${task.id} moved to review.`;
}

export function attachDiscordTaskCommandObserver(client: OpenClawClient): void {
  if (observedClients.has(client)) return;
  observedClients.add(client);

  client.on('notification', async (notification: unknown) => {
    try {
      const config = getDiscordTaskCommandConfig();
      if (!config.enabled) return;

      const sessionKey = normalizeSessionKey(extractSessionKey(notification));
      if (!sessionKey || !isObservedSessionKey(config.sessionKey, config.dmEnabled, sessionKey)) return;

      const commandText = extractCommandText(notification, [config.commandPrefix, '!task-status', '!task-blockers', '!task-list', '!task-review']);
      if (!commandText) return;

      const senderRole = extractSenderRole(notification);
      const senderId = extractSenderId(notification);
      const sourceChannelId = extractChannelId(notification);
      const sourceMessageId = extractMessageId(notification);
      if (senderRole === 'assistant' || senderRole === 'system' || senderRole === 'tool') return;
      if (!senderId) {
        logAudit('rejected', 'Missing sender identity', { session_key: sessionKey, command: commandText });
        return;
      }

      const now = Date.now();
      const isQuickAction = /^!task-(status|list|blockers|review)\b/i.test(commandText);
      pruneCache(dedupeCache, isQuickAction ? QUICK_ACTION_DEDUPE_TTL_MS : DEDUPE_TTL_MS, now);
      pruneCache(senderRateLimit, Math.max(config.minIntervalMs, 1000), now);

      const fingerprint = `${sessionKey}:${senderId}:${commandText.toLowerCase()}`;
      if (dedupeCache.has(fingerprint)) {
        logAudit('rejected', 'Duplicate command suppressed', { session_key: sessionKey, sender_id: senderId, command: commandText });
        return;
      }
      dedupeCache.set(fingerprint, now);

      if (config.allowedUserIds.size > 0 && !config.allowedUserIds.has(senderId)) {
        logAudit('rejected', 'Sender not allowlisted', { session_key: sessionKey, sender_id: senderId, command: commandText });
        void sendAck(client, sessionKey, '⛔ Not authorized to create Mission Control tasks from Discord.', fingerprint);
        return;
      }

      const senderKey = `${sessionKey}:${senderId}`;
      const lastCommandAt = senderRateLimit.get(senderKey) || 0;
      if (!config.ownerUserIds.has(senderId) && now - lastCommandAt < config.minIntervalMs) {
        logAudit('rejected', 'Rate limit hit', { session_key: sessionKey, sender_id: senderId, command: commandText, min_interval_ms: config.minIntervalMs });
        void sendAck(client, sessionKey, `⏳ Rate limit: wait ${Math.ceil((config.minIntervalMs - (now - lastCommandAt)) / 1000)}s and retry.`, fingerprint);
        return;
      }
      senderRateLimit.set(senderKey, now);

      if (/^!task-status\b/i.test(commandText)) {
        const taskId = parseTaskIdCommand(commandText, '!task-status');
        return void sendAck(client, sessionKey, taskId ? taskStatusReply(taskId, config.workspaceId) : '⚠️ Invalid format. Use: !task-status <task-id>', fingerprint);
      }
      if (/^!task-blockers\b/i.test(commandText)) return void sendAck(client, sessionKey, taskBlockersReply(config.workspaceId), fingerprint);
      if (/^!task-list\b/i.test(commandText)) return void sendAck(client, sessionKey, taskListReply(config.workspaceId), fingerprint);
      if (/^!task-review\b/i.test(commandText)) {
        const taskId = parseTaskIdCommand(commandText, '!task-review');
        return void sendAck(client, sessionKey, taskId ? taskReviewReply(taskId, config.workspaceId) : '⚠️ Invalid format. Use: !task-review <task-id>', fingerprint);
      }

      const parsed = parseTaskCommand(commandText, config.commandPrefix);
      if (!parsed) {
        logAudit('rejected', 'Invalid command format', { session_key: sessionKey, sender_id: senderId, command: commandText });
        return void sendAck(client, sessionKey, [
          `⚠️ Couldn't parse that task. Try:`,
          `\`${config.commandPrefix} <title>\` — quick task, no frills`,
          `\`${config.commandPrefix} <title> | <description>\` — with detail`,
          `\`${config.commandPrefix} <title> | <desc> | agent:Developer | priority:high\` — full syntax`,
          `Priority options: low, normal, high, urgent`,
        ].join('\n'), fingerprint);
      }

      if (parsed.targetAgentName) {
        const targetAgent = queryOne<Pick<Agent, 'id'>>(`SELECT id FROM agents WHERE workspace_id = ? AND status != 'offline' AND lower(name) = lower(?) LIMIT 1`, [config.workspaceId, parsed.targetAgentName]);
        if (!targetAgent) return void sendAck(client, sessionKey, `❌ Agent not found: ${parsed.targetAgentName}`, fingerprint);
      }

      const openTaskCount = queryOne<{ count: number }>(`SELECT COUNT(*) as count FROM tasks WHERE workspace_id = ? AND status != 'done'`, [config.workspaceId])?.count || 0;
      if (openTaskCount >= config.maxOpenTasks) {
        logAudit('rejected', 'Open task threshold reached', { workspace_id: config.workspaceId, open_task_count: openTaskCount, max_open_tasks: config.maxOpenTasks, sender_id: senderId, session_key: sessionKey });
        return void sendAck(client, sessionKey, `⛔ Task not created: workspace has ${openTaskCount} open tasks (limit ${config.maxOpenTasks}).`, fingerprint);
      }

      logAudit('attempt', 'Processing Discord task command', { command: commandText, sender_id: senderId, session_key: sessionKey, workspace_id: config.workspaceId });

      const created = createTaskFromDiscordCommand({
        title: parsed.title,
        description: parsed.description,
        workspaceId: config.workspaceId,
        priority: parsed.priority || config.defaultPriority,
        requestedAgentName: parsed.targetAgentName,
        senderId,
        sessionKey,
      });

      let threadId: string | null = null;
      if (sourceChannelId) {
        try {
          threadId = await createDiscordThreadForTask({ client, sourceChannelId, sourceMessageId, taskId: created.id, taskTitle: created.title });
          if (threadId) {
            setTaskDiscordThreadId(created.id, threadId);
            created.discord_thread_id = threadId;
          }
        } catch (error) {
          logAudit('failure', 'Failed to create Discord thread for task', {
            task_id: created.id,
            channel_id: sourceChannelId,
            message_id: sourceMessageId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (created.assigned_agent_id) {
        const dispatchUrl = `${getMissionControlUrl()}/api/tasks/${created.id}/dispatch`;
        fetch(dispatchUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' } })
          .then(async (response) => {
            if (!response.ok) {
              const details = await response.text();
              console.error('[OpenClaw][DiscordTaskCommand] Auto-dispatch failed:', { task_id: created.id, status_code: response.status, response_body: details.slice(0, 600) });
              logAudit('failure', 'Auto-dispatch for Discord-created task failed', { task_id: created.id, status_code: response.status, response_body: details.slice(0, 600) });
            }
          })
          .catch((error) => {
            console.error('[OpenClaw][DiscordTaskCommand] Auto-dispatch failed:', { task_id: created.id, error: error instanceof Error ? error.message : String(error) });
            logAudit('failure', 'Auto-dispatch request failed', { task_id: created.id, error: error instanceof Error ? error.message : String(error) });
          });
      }

      if (isDmSessionKey(sessionKey) && config.dmAuditSessionKey) {
        void sendAck(client, config.dmAuditSessionKey, `📥 DM task intake: "${created.title}" created by <@${senderId}> (id: ${created.id}, status: ${created.status})${threadId ? ` | thread: ${threadId}` : ''}`, `${fingerprint}-audit`);
      }

      void sendAck(client, sessionKey, `✅ Mission Control task created: "${created.title}" (id: ${created.id}, status: ${created.status}, priority: ${created.priority})${threadId ? ` | thread: ${threadId}` : ''}${created.assigned_agent_id ? ' and auto-dispatched.' : '.'}`, fingerprint);
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : String(error);
      console.error('[OpenClaw][DiscordTaskCommand] Failed to process command:', errMessage);
      try {
        logAudit('failure', 'Command processing failed', { error: errMessage });
      } catch {
        // no-op
      }
    }
  });
}
