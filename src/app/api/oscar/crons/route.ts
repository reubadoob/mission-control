import { NextResponse } from 'next/server';
import { getOpenClawClient } from '@/lib/openclaw/client';

export async function GET() {
  try {
    const client = getOpenClawClient();

    if (!client.isConnected()) {
      try {
        await client.connect();
      } catch {
        return NextResponse.json({ crons: [] });
      }
    }

    try {
      const crons = await client.call('crons.list');
      return NextResponse.json({ crons });
    } catch {
      // crons.list not available — return empty
      return NextResponse.json({ crons: [] });
    }
  } catch (error) {
    console.error('[Oscar] Crons error:', error);
    return NextResponse.json({ crons: [] });
  }
}
