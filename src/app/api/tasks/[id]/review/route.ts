import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, run, transaction } from '@/lib/db';
import { broadcast } from '@/lib/events';
import type { Task } from '@/lib/types';

type ReviewAction = 'approve' | 'reject';

interface ReviewRequestBody {
  action?: ReviewAction;
  reason?: string;
}

// POST /api/tasks/:id/review
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as ReviewRequestBody;

    if (body.action !== 'approve' && body.action !== 'reject') {
      return NextResponse.json(
        { error: "Validation failed: action must be 'approve' or 'reject'" },
        { status: 400 }
      );
    }

    const task = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [id]);
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    if (task.status !== 'review') {
      return NextResponse.json(
        { error: 'Only tasks in review can be approved or rejected' },
        { status: 422 }
      );
    }

    const now = new Date().toISOString();
    const reason = body.reason?.trim() || null;

    const nextStatus = body.action === 'approve' ? 'done' : 'in_progress';
    const activityMessage =
      body.action === 'approve'
        ? 'Task approved by operator — moved to done'
        : `Task rejected — moved back to in_progress${reason ? `: ${reason}` : ''}`;

    const eventType = body.action === 'approve' ? 'task_completed' : 'task_status_changed';

    transaction(() => {
      if (body.action === 'approve') {
        run(
          `UPDATE tasks
           SET status = ?,
               review_approved_by = ?,
               review_approved_at = ?,
               review_rejected_reason = NULL,
               updated_at = ?
           WHERE id = ?`,
          [nextStatus, 'operator', now, now, id]
        );
      } else {
        run(
          `UPDATE tasks
           SET status = ?,
               review_approved_by = NULL,
               review_approved_at = NULL,
               review_rejected_reason = ?,
               updated_at = ?
           WHERE id = ?`,
          [nextStatus, reason, now, id]
        );
      }

      run(
        `INSERT INTO task_activities (id, task_id, activity_type, message, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [uuidv4(), id, 'status_changed', activityMessage, now]
      );

      run(
        `INSERT INTO events (id, type, task_id, message, metadata, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          eventType,
          id,
          activityMessage,
          JSON.stringify({ taskId: id, action: body.action, reason, source: 'review_gate' }),
          now,
        ]
      );
    });

    const updatedTask = queryOne<Task>(
      `SELECT t.*,
        aa.name as assigned_agent_name,
        aa.avatar_emoji as assigned_agent_emoji,
        ca.name as created_by_agent_name,
        ca.avatar_emoji as created_by_agent_emoji
       FROM tasks t
       LEFT JOIN agents aa ON t.assigned_agent_id = aa.id
       LEFT JOIN agents ca ON t.created_by_agent_id = ca.id
       WHERE t.id = ?`,
      [id]
    );

    if (updatedTask) {
      broadcast({
        type: 'task_updated',
        payload: updatedTask,
      });
    }

    return NextResponse.json(updatedTask);
  } catch (error) {
    console.error('Failed to process review action:', error);
    return NextResponse.json({ error: 'Failed to process review action' }, { status: 500 });
  }
}
