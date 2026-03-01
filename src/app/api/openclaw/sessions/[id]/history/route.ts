import { NextResponse } from 'next/server';
import { getOpenClawClient } from '@/lib/openclaw/client';

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface HistoryMessage {
  role: string;
  content: string;
  timestamp?: string;
}

interface UnknownHistoryRecord {
  role?: unknown;
  content?: unknown;
  timestamp?: unknown;
  created_at?: unknown;
  ts?: unknown;
  text?: unknown;
  message?: unknown;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const SESSIONS_CACHE_TTL_MS = 10_000;

interface SessionsCacheEntry {
  expiresAt: number;
  sessions: Array<{ id: string; status?: string | null }>;
}

let sessionsCache: SessionsCacheEntry | null = null;

function parseNumber(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return parsed;
}

function normalizeContent(content: unknown): string {
  if (typeof content === 'string') return content;

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'text' in item) {
          const text = (item as { text?: unknown }).text;
          return typeof text === 'string' ? text : '';
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }

  if (content && typeof content === 'object' && 'text' in content) {
    const text = (content as { text?: unknown }).text;
    if (typeof text === 'string') return text;
  }

  return '';
}

function normalizeHistory(history: unknown[]): HistoryMessage[] {
  const normalized: Array<HistoryMessage | null> = history.map((entry) => {
    if (!entry || typeof entry !== 'object') return null;

    const record = entry as UnknownHistoryRecord;
    const role = typeof record.role === 'string' ? record.role : 'unknown';

    const content = normalizeContent(record.content)
      || (typeof record.text === 'string' ? record.text : '')
      || (typeof record.message === 'string' ? record.message : '');

    const timestamp = typeof record.timestamp === 'string'
      ? record.timestamp
      : typeof record.created_at === 'string'
        ? record.created_at
        : typeof record.ts === 'string'
          ? record.ts
          : undefined;

    if (!content.trim()) return null;

    return timestamp ? { role, content, timestamp } : { role, content };
  });

  return normalized.filter((item): item is HistoryMessage => item !== null);
}

async function getCachedSessions(client: ReturnType<typeof getOpenClawClient>) {
  const now = Date.now();

  if (sessionsCache && sessionsCache.expiresAt > now) {
    return sessionsCache.sessions;
  }

  const sessions = await client.listSessions();
  sessionsCache = {
    sessions: sessions.map((session) => ({ id: session.id, status: session.status })),
    expiresAt: now + SESSIONS_CACHE_TTL_MS,
  };

  return sessionsCache.sessions;
}

// GET /api/openclaw/sessions/[id]/history - Get conversation history
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);

    const limit = Math.min(MAX_LIMIT, Math.max(1, parseNumber(searchParams.get('limit'), DEFAULT_LIMIT)));
    const offset = Math.max(0, parseNumber(searchParams.get('offset'), 0));

    const client = getOpenClawClient();

    if (!client.isConnected()) {
      try {
        await client.connect();
      } catch {
        return NextResponse.json(
          { error: 'Failed to connect to OpenClaw Gateway' },
          { status: 503 }
        );
      }
    }

    const [history, sessions] = await Promise.all([
      client.getSessionHistory(id, limit, offset),
      getCachedSessions(client),
    ]);

    const session = sessions.find((item) => item.id === id) ?? null;

    return NextResponse.json({
      history: normalizeHistory(history),
      pagination: {
        limit,
        offset,
      },
      sessionStatus: session?.status ?? null,
    });
  } catch (error) {
    console.error('Failed to get OpenClaw session history:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
