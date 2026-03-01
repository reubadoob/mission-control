import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { queryOne, run } from '@/lib/db';
import type { Task } from '@/lib/types';
import { prepareWorktree } from '@/lib/workspace';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const task = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [id]);

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const repoPath = process.env.GIT_REPO_ROOT;

    if (!repoPath) {
      console.warn('GIT_REPO_ROOT is not set; skipping worktree preparation.');

      run(
        `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          task.id,
          task.assigned_agent_id ?? null,
          'status_changed',
          'Worktree preparation skipped because GIT_REPO_ROOT is not set.',
          new Date().toISOString(),
        ],
      );

      return NextResponse.json({ skipped: true, reason: 'GIT_REPO_ROOT is not set' });
    }

    const { worktreePath, branchName } = await prepareWorktree(task.id, task.title, repoPath);

    run(
      `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        task.id,
        task.assigned_agent_id ?? null,
        'status_changed',
        `Prepared isolated worktree: ${worktreePath} (${branchName})`,
        new Date().toISOString(),
      ],
    );

    return NextResponse.json({ worktreePath, branchName });
  } catch (error) {
    console.error('Failed to prepare workspace:', error);
    return NextResponse.json(
      {
        error: 'Failed to prepare workspace',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
