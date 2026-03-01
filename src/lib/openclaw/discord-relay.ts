import type { SSEEvent } from '@/lib/types';
import { queryOne } from '@/lib/db';
import { getOpenClawClient } from '@/lib/openclaw/client';
import { getDiscordRelaySessionKey } from '@/lib/config';
import { logOpenClawDiagnostic } from '@/lib/openclaw/diagnostics';

const RELAYABLE_EVENT_TYPES = new Set([
  'task_created',
  'task_updated',
  'activity_logged',
  'deliverable_added',
  'task_deleted',
  'task_completed',
]);

function summarizeEvent(event: SSEEvent): string | null {
  if (!RELAYABLE_EVENT_TYPES.has(event.type)) return null;

  if (event.type === 'task_created') {
    const payload = event.payload as { title?: string; id?: string; priority?: string; status?: string };
    return `🆕 Task created: ${payload.title || '(untitled)'} (id: ${payload.id || 'unknown'}, priority: ${payload.priority || 'normal'}, status: ${payload.status || 'inbox'})`;
  }

  if (event.type === 'task_updated') {
    const payload = event.payload as { title?: string; id?: string; status?: string; priority?: string };
    return `🛠️ Task updated: ${payload.title || '(untitled)'} (id: ${payload.id || 'unknown'}, status: ${payload.status || 'unknown'}, priority: ${payload.priority || 'normal'})`;
  }

  if (event.type === 'activity_logged') {
    const payload = event.payload as { task_id?: string; activity_type?: string; message?: string };
    return `📝 Activity: task ${payload.task_id || 'unknown'} | ${payload.activity_type || 'updated'} | ${payload.message || ''}`.trim();
  }

  if (event.type === 'deliverable_added') {
    const payload = event.payload as { task_id?: string; title?: string; path?: string; deliverable_type?: string };
    return `📦 Deliverable: task ${payload.task_id || 'unknown'} | ${payload.deliverable_type || 'file'} | ${payload.title || '(untitled)'}${payload.path ? ` (${payload.path})` : ''}`;
  }

  if (event.type === 'task_deleted') {
    const payload = event.payload as { id?: string };
    return `🗑️ Task deleted: ${payload.id || 'unknown'}`;
  }

  if (event.type === 'task_completed') {
    const payload = event.payload as { title?: string; id?: string };
    return `✅ Task completed: ${payload.title || '(untitled)'} (id: ${payload.id || 'unknown'})`;
  }

  return null;
}

function extractTaskIdForRouting(event: SSEEvent): string | null {
  if (event.type === 'task_updated' || event.type === 'task_completed') {
    const payload = event.payload as { id?: string };
    return payload.id || null;
  }

  if (event.type === 'activity_logged' || event.type === 'deliverable_added') {
    const payload = event.payload as { task_id?: string };
    return payload.task_id || null;
  }

  return null;
}

function getDiscordThreadSessionKey(taskId: string): string | null {
  const row = queryOne<{ discord_thread_id: string | null }>(
    `SELECT discord_thread_id FROM tasks WHERE id = ?`,
    [taskId],
  );
  if (!row?.discord_thread_id) return null;
  return `agent:main:discord:thread:${row.discord_thread_id}`;
}

function resolveRelaySessionKey(event: SSEEvent, fallbackSessionKey: string): string {
  if (!['task_updated', 'activity_logged', 'task_completed', 'deliverable_added'].includes(event.type)) {
    return fallbackSessionKey;
  }

  const taskId = extractTaskIdForRouting(event);
  if (!taskId) return fallbackSessionKey;

  return getDiscordThreadSessionKey(taskId) || fallbackSessionKey;
}

export async function relayMissionControlEventToDiscord(event: SSEEvent): Promise<void> {
  const defaultSessionKey = getDiscordRelaySessionKey();
  if (!defaultSessionKey) {
    logOpenClawDiagnostic({
      kind: 'discord_relay',
      status: 'skipped',
      message: 'Relay disabled or channel not configured',
      metadata: { event_type: event.type },
    });
    return;
  }

  const summary = summarizeEvent(event);
  if (!summary) {
    logOpenClawDiagnostic({
      kind: 'discord_relay',
      status: 'skipped',
      message: 'Event type not relayable',
      metadata: { event_type: event.type },
    });
    return;
  }

  const sessionKey = resolveRelaySessionKey(event, defaultSessionKey);

  try {
    logOpenClawDiagnostic({
      kind: 'discord_relay',
      status: 'attempt',
      message: 'Sending Mission Control relay message',
      metadata: { event_type: event.type, session_key: sessionKey, summary },
    });

    const client = getOpenClawClient();
    if (!client.isConnected()) {
      await client.connect();
    }

    await client.call('chat.send', {
      sessionKey,
      message: `[Mission Control] ${summary}`,
      idempotencyKey: `mc-relay-${event.type}-${Date.now()}`,
    });

    logOpenClawDiagnostic({
      kind: 'discord_relay',
      status: 'success',
      message: 'Mission Control relay message sent',
      metadata: { event_type: event.type, session_key: sessionKey, summary },
    });
  } catch (error) {
    console.error('[MissionControl][DiscordRelay] Failed to relay event:', error);
    logOpenClawDiagnostic({
      kind: 'discord_relay',
      status: 'failure',
      message: 'Mission Control relay send failed',
      metadata: {
        event_type: event.type,
        session_key: sessionKey,
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}
