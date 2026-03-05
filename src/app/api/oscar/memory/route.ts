import { NextResponse } from 'next/server';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const OSCAR_WORKSPACE = '/home/reubadoob/.openclaw/workspace';

export interface MemoryFile {
  name: string;
  path: string;
  content: string;
}

export async function GET() {
  const files: MemoryFile[] = [];

  // Root-level key files
  for (const name of ['MEMORY.md', 'HEARTBEAT.md']) {
    try {
      const content = readFileSync(join(OSCAR_WORKSPACE, name), 'utf-8');
      files.push({ name, path: name, content });
    } catch {
      // file doesn't exist
    }
  }

  // memory/*.md — most recent 20, newest first
  try {
    const memDir = join(OSCAR_WORKSPACE, 'memory');
    const entries = readdirSync(memDir)
      .filter((e) => e.endsWith('.md'))
      .sort()
      .reverse()
      .slice(0, 20);

    for (const entry of entries) {
      try {
        const content = readFileSync(join(memDir, entry), 'utf-8');
        files.push({ name: entry, path: `memory/${entry}`, content });
      } catch {
        // skip unreadable files
      }
    }
  } catch {
    // memory/ dir doesn't exist
  }

  return NextResponse.json({ files });
}
