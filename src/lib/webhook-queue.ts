import { queryAll, run } from '@/lib/db';

export type WebhookQueueStatus = 'pending' | 'succeeded' | 'failed' | 'dead';

export interface WebhookQueueJob {
  id: string;
  url: string;
  method: string;
  headers: string | null;
  body: string;
  status: WebhookQueueStatus;
  attempts: number;
  max_attempts: number;
  next_attempt_at: string;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export function enqueueWebhook(params: {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body: unknown;
  maxAttempts?: number;
}): string {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  run(
    `INSERT INTO webhook_queue (id, url, method, headers, body, status, attempts, max_attempts, next_attempt_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?, ?)`,
    [
      id,
      params.url,
      params.method ?? 'POST',
      params.headers ? JSON.stringify(params.headers) : null,
      JSON.stringify(params.body),
      params.maxAttempts ?? 3,
      now,
      now,
      now,
    ],
  );

  return id;
}

// Exponential backoff: 30s, 2min, 10min
function nextAttemptDelay(attempt: number): number {
  const delays = [30_000, 120_000, 600_000];
  return delays[attempt] ?? 600_000;
}

export async function processWebhookQueue(): Promise<void> {
  const now = new Date().toISOString();

  const due = queryAll<WebhookQueueJob>(
    `SELECT * FROM webhook_queue
     WHERE status = 'pending' AND next_attempt_at <= ?
     ORDER BY next_attempt_at ASC
     LIMIT 20`,
    [now],
  );

  for (const job of due) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(job.headers ? JSON.parse(job.headers) : {}),
    };

    try {
      const response = await fetch(job.url, {
        method: job.method,
        headers,
        body: job.body,
        signal: AbortSignal.timeout(10_000),
      });

      if (response.ok) {
        run(
          `UPDATE webhook_queue
           SET status = 'succeeded', attempts = ?, updated_at = ?
           WHERE id = ?`,
          [job.attempts + 1, new Date().toISOString(), job.id],
        );
      } else {
        const errorMessage = `HTTP ${response.status}`;
        const newAttempts = job.attempts + 1;
        const isDead = newAttempts >= job.max_attempts;
        const nextAt = new Date(Date.now() + nextAttemptDelay(newAttempts)).toISOString();

        run(
          `UPDATE webhook_queue
           SET status = ?, attempts = ?, last_error = ?, next_attempt_at = ?, updated_at = ?
           WHERE id = ?`,
          [isDead ? 'dead' : 'pending', newAttempts, errorMessage, nextAt, new Date().toISOString(), job.id],
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const newAttempts = job.attempts + 1;
      const isDead = newAttempts >= job.max_attempts;
      const nextAt = new Date(Date.now() + nextAttemptDelay(newAttempts)).toISOString();

      run(
        `UPDATE webhook_queue
         SET status = ?, attempts = ?, last_error = ?, next_attempt_at = ?, updated_at = ?
         WHERE id = ?`,
        [isDead ? 'dead' : 'pending', newAttempts, errorMessage, nextAt, new Date().toISOString(), job.id],
      );
    }
  }
}

export function getWebhookQueueEntries(status?: WebhookQueueStatus, limit = 100): WebhookQueueJob[] {
  const safeLimit = Math.min(Math.max(limit, 1), 500);

  if (status) {
    return queryAll<WebhookQueueJob>(
      `SELECT * FROM webhook_queue
       WHERE status = ?
       ORDER BY datetime(created_at) DESC
       LIMIT ?`,
      [status, safeLimit],
    );
  }

  return queryAll<WebhookQueueJob>(
    `SELECT * FROM webhook_queue
     ORDER BY datetime(created_at) DESC
     LIMIT ?`,
    [safeLimit],
  );
}
