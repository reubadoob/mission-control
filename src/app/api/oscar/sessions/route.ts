import { NextResponse } from 'next/server';
import { getOpenClawClient } from '@/lib/openclaw/client';
import type { OpenClawSessionInfo, OpenClawHistoryMessage } from '@/lib/types';

export const dynamic = 'force-dynamic';

export interface OscarSession extends OpenClawSessionInfo {
  lastMessage: OpenClawHistoryMessage | null;
}

export async function GET() {
  try {
    const client = getOpenClawClient();

    if (!client.isConnected()) {
      try {
        await client.connect();
      } catch {
        return NextResponse.json({ sessions: [] });
      }
    }

    const result = await client.listSessions();
    // Gateway may return an array or an object with a sessions property
    const sessions: OpenClawSessionInfo[] = Array.isArray(result)
      ? result
      : ((result as unknown as { sessions?: OpenClawSessionInfo[] }).sessions ?? []);

    const sessionsWithMessages: OscarSession[] = await Promise.all(
      sessions.map(async (session) => {
        try {
          const history = await client.getSessionHistory(session.id, 1);
          return {
            ...session,
            lastMessage: (history[0] as OpenClawHistoryMessage) ?? null,
          };
        } catch {
          return { ...session, lastMessage: null };
        }
      })
    );

    return NextResponse.json({ sessions: sessionsWithMessages });
  } catch (error) {
    console.error('[Oscar] Sessions error:', error);
    return NextResponse.json({ sessions: [] });
  }
}
