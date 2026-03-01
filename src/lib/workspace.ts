import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
export const WORKTREE_BASE_BRANCH = process.env.WORKTREE_BASE_BRANCH || 'main';

export interface PreparedWorktree {
  worktreePath: string;
  branchName: string;
}

const toSlug = (input: string): string => {
  const normalized = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return (normalized || 'task').slice(0, 20);
};

const parseBranchFromWorktreeList = (output: string, worktreePath: string): string | null => {
  const line = output
    .split('\n')
    .find((entry) => entry.trim().startsWith(worktreePath));

  if (!line) return null;

  const match = line.match(/\[(.+?)\]/);
  return match?.[1] ?? null;
};

export const getWorktreePath = (taskId: string): string => path.join(os.tmpdir(), `mc-task-${taskId}`);

const branchExists = async (repoPath: string, branchName: string): Promise<boolean> => {
  try {
    await execAsync(`git show-ref --verify --quiet ${JSON.stringify(`refs/heads/${branchName}`)}`, {
      cwd: repoPath,
    });
    return true;
  } catch {
    return false;
  }
};

export const prepareWorktree = async (
  taskId: string,
  title: string,
  repoPath: string,
): Promise<PreparedWorktree> => {
  const worktreePath = getWorktreePath(taskId);
  const branchName = `feat/task-${taskId}-${toSlug(title)}`;

  const { stdout } = await execAsync('git worktree list', { cwd: repoPath });
  const alreadyRegistered = stdout
    .split('\n')
    .some((entry) => entry.trim().startsWith(worktreePath));

  if (alreadyRegistered) {
    return {
      worktreePath,
      branchName: parseBranchFromWorktreeList(stdout, worktreePath) ?? branchName,
    };
  }

  if (existsSync(worktreePath)) {
    throw new Error(
      `Worktree path already exists but is not registered with git worktree: ${worktreePath}. `
      + 'Remove or repair the stale directory before retrying.',
    );
  }

  const hasBranch = await branchExists(repoPath, branchName);
  const addArgs = hasBranch
    ? `${JSON.stringify(worktreePath)} ${JSON.stringify(branchName)}`
    : `${JSON.stringify(worktreePath)} -b ${JSON.stringify(branchName)} ${JSON.stringify(WORKTREE_BASE_BRANCH)}`;

  await execAsync(`git -C ${JSON.stringify(repoPath)} worktree add ${addArgs}`);

  return { worktreePath, branchName };
};

export const cleanupWorktree = async (repoPath: string, worktreePath: string): Promise<void> => {
  await execAsync(
    `git -C ${JSON.stringify(repoPath)} worktree remove ${JSON.stringify(worktreePath)} --force`,
  );
};
