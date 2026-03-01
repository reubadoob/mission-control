import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, run, transaction } from '@/lib/db';
import { broadcast } from '@/lib/events';
import { getGitHubWebhookSecret } from '@/lib/config';
import type { Task, TaskStatus } from '@/lib/types';

type PullRequestAction = 'opened' | 'edited' | 'reopened' | 'synchronize' | 'closed';

interface GithubPullRequestPayload {
  action?: PullRequestAction | string;
  number?: number;
  pull_request?: {
    title?: string;
    body?: string | null;
    merged?: boolean;
  };
}

const TASK_ID_REGEX = /mc-task[:\s]+([a-f0-9-]{36})/i;

function getTaskIdFromPullRequest(payload: GithubPullRequestPayload): string | null {
  const bodyMatch = payload.pull_request?.body?.match(TASK_ID_REGEX);
  if (bodyMatch?.[1]) return bodyMatch[1];

  const titleMatch = payload.pull_request?.title?.match(TASK_ID_REGEX);
  if (titleMatch?.[1]) return titleMatch[1];

  return null;
}

function verifyGithubSignature(signatureHeader: string | null, rawBody: string): boolean {
  const secret = getGitHubWebhookSecret();
  if (!secret) {
    console.warn('[GITHUB WEBHOOK] GITHUB_WEBHOOK_SECRET is not configured');
    return false;
  }

  if (!signatureHeader?.startsWith('sha256=')) {
    return false;
  }

  const providedSignature = signatureHeader.slice('sha256='.length);
  const expectedSignature = createHmac('sha256', secret).update(rawBody).digest('hex');

  try {
    const providedBuffer = Buffer.from(providedSignature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (providedBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(providedBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

function getTransition(action: string | undefined, merged: boolean | undefined): {
  status: TaskStatus;
  message: string;
} | null {
  if (action === 'opened' || action === 'edited' || action === 'reopened' || action === 'synchronize') {
    return {
      status: 'review',
      message: 'PR #{prNumber} opened/updated — task automatically moved to review',
    };
  }

  if (action === 'closed' && merged === true) {
    return {
      status: 'done',
      message: 'PR #{prNumber} merged — task automatically moved to done',
    };
  }

  if (action === 'closed' && merged === false) {
    return {
      status: 'inbox',
      message: 'PR #{prNumber} closed without merge — task automatically moved to inbox',
    };
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const eventType = request.headers.get('x-github-event');
    const signature = request.headers.get('x-hub-signature-256');
    const rawBody = await request.text();

    if (!verifyGithubSignature(signature, rawBody)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    if (eventType !== 'pull_request') {
      return NextResponse.json({ ok: true, ignored: true, reason: 'unsupported_event' });
    }

    const payload = JSON.parse(rawBody) as GithubPullRequestPayload;
    const taskId = getTaskIdFromPullRequest(payload);

    if (!taskId) {
      return NextResponse.json({ ok: true, ignored: true, reason: 'no_linked_task' });
    }

    const transition = getTransition(payload.action, payload.pull_request?.merged);
    if (!transition) {
      return NextResponse.json({ ok: true, ignored: true, reason: 'unsupported_action' });
    }

    const task = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [taskId]);
    if (!task) {
      return NextResponse.json({ ok: true, ignored: true, reason: 'task_not_found' });
    }

    if (task.status === transition.status) {
      return NextResponse.json({ ok: true, ignored: true, reason: 'status_unchanged' });
    }

    const now = new Date().toISOString();
    const prNumber = payload.number ?? 0;
    const activityMessage = transition.message.replace('{prNumber}', String(prNumber));

    transaction(() => {
      run('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?', [transition.status, now, task.id]);

      run(
        `INSERT INTO events (id, type, task_id, message, metadata, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          'task_status_changed',
          task.id,
          activityMessage,
          JSON.stringify({ taskId: task.id, status: transition.status, source: 'github_webhook' }),
          now,
        ],
      );

      run(
        `INSERT INTO task_activities (id, task_id, activity_type, message, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [uuidv4(), task.id, 'status_changed', activityMessage, now],
      );
    });

    const updatedTask = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [task.id]);
    if (updatedTask) {
      broadcast({
        type: 'task_updated',
        payload: updatedTask,
      });
    }

    return NextResponse.json({
      ok: true,
      task_id: task.id,
      status: transition.status,
      message: activityMessage,
    });
  } catch (error) {
    console.error('[GITHUB WEBHOOK] Failed to process webhook:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
