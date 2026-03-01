import { NextRequest, NextResponse } from 'next/server';
import { queryAll, queryOne } from '@/lib/db';

interface TotalsRow {
  total_tokens: number | null;
  total_cost_usd: number | null;
}

interface ByAgentRow {
  agent_id: string | null;
  agent_name: string | null;
  tasks: number;
  tokens: number;
  cost_usd: number;
}

interface ByModelRow {
  model: string;
  tasks: number;
  tokens: number;
  cost_usd: number;
}

interface ByDayRow {
  day: string;
  tasks: number;
  tokens: number;
  cost_usd: number;
}

// GET /api/costs?days=7
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const parsedDays = Number.parseInt(searchParams.get('days') ?? '7', 10);
    const days = Number.isFinite(parsedDays) && parsedDays > 0 ? Math.min(parsedDays, 365) : 7;

    const windowStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const totals = queryOne<TotalsRow>(
      `SELECT
        COALESCE(SUM(estimated_tokens), 0) AS total_tokens,
        COALESCE(SUM(estimated_cost_usd), 0) AS total_cost_usd
       FROM task_costs
       WHERE dispatch_at >= ?`,
      [windowStart]
    );

    const byAgent = queryAll<ByAgentRow>(
      `SELECT
        tc.agent_id,
        COALESCE(a.name, 'Unknown Agent') AS agent_name,
        COUNT(*) AS tasks,
        COALESCE(SUM(tc.estimated_tokens), 0) AS tokens,
        COALESCE(SUM(tc.estimated_cost_usd), 0) AS cost_usd
       FROM task_costs tc
       LEFT JOIN agents a ON tc.agent_id = a.id
       WHERE tc.dispatch_at >= ?
       GROUP BY tc.agent_id, a.name
       ORDER BY cost_usd DESC`,
      [windowStart]
    );

    const byModel = queryAll<ByModelRow>(
      `SELECT
        model,
        COUNT(*) AS tasks,
        COALESCE(SUM(estimated_tokens), 0) AS tokens,
        COALESCE(SUM(estimated_cost_usd), 0) AS cost_usd
       FROM task_costs
       WHERE dispatch_at >= ?
       GROUP BY model
       ORDER BY cost_usd DESC`,
      [windowStart]
    );

    const byDay = queryAll<ByDayRow>(
      `SELECT
        date(dispatch_at) AS day,
        COUNT(*) AS tasks,
        COALESCE(SUM(estimated_tokens), 0) AS tokens,
        COALESCE(SUM(estimated_cost_usd), 0) AS cost_usd
       FROM task_costs
       WHERE dispatch_at >= ?
       GROUP BY date(dispatch_at)
       ORDER BY day ASC`,
      [windowStart]
    );

    return NextResponse.json({
      days,
      window_start: windowStart,
      total_tokens: totals?.total_tokens ?? 0,
      total_cost_usd: totals?.total_cost_usd ?? 0,
      by_agent: byAgent,
      by_model: byModel,
      by_day: byDay,
    });
  } catch (error) {
    console.error('Failed to fetch costs:', error);
    return NextResponse.json({ error: 'Failed to fetch costs' }, { status: 500 });
  }
}
