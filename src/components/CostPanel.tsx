'use client';

import { useEffect, useState } from 'react';

type CostByAgent = {
  agent_id: string | null;
  agent_name: string | null;
  tasks: number;
  tokens: number;
  cost_usd: number;
};

type CostByModel = {
  model: string;
  tasks: number;
  tokens: number;
  cost_usd: number;
};

type CostByDay = {
  day: string;
  tasks: number;
  tokens: number;
  cost_usd: number;
};

type CostResponse = {
  total_tokens: number;
  total_cost_usd: number;
  by_agent: CostByAgent[];
  by_model: CostByModel[];
  by_day: CostByDay[];
};

const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

const numberFormatter = new Intl.NumberFormat('en-US');

export function CostPanel() {
  const [data, setData] = useState<CostResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadCosts() {
      try {
        const res = await fetch('/api/costs?days=7');
        if (res.ok) {
          setData(await res.json());
        }
      } catch (error) {
        console.error('Failed to load costs:', error);
      } finally {
        setLoading(false);
      }
    }

    loadCosts();
  }, []);

  return (
    <section className="w-96 border-l border-mc-border bg-mc-bg-secondary overflow-y-auto">
      <div className="p-4 border-b border-mc-border">
        <h3 className="text-sm font-medium uppercase tracking-wider">Cost Panel (7d)</h3>
        <p className="text-xs text-mc-text-secondary mt-1">Estimated token spend by dispatch</p>
      </div>

      <div className="p-4 space-y-5 text-sm">
        <div className="rounded-lg border border-mc-border bg-mc-bg p-3">
          <p className="text-xs uppercase text-mc-text-secondary">Total estimated spend</p>
          <p className="text-xl font-semibold text-mc-accent mt-1">
            {loading ? '—' : usdFormatter.format(data?.total_cost_usd ?? 0)}
          </p>
          <p className="text-xs text-mc-text-secondary mt-1">
            {loading ? 'Loading…' : `${numberFormatter.format(data?.total_tokens ?? 0)} tokens`}
          </p>
        </div>

        <div>
          <h4 className="text-xs uppercase text-mc-text-secondary mb-2">By agent</h4>
          <div className="space-y-2">
            {(data?.by_agent ?? []).map((row) => (
              <div key={`${row.agent_id ?? 'unknown'}-${row.agent_name ?? 'unknown'}`} className="rounded border border-mc-border p-2 bg-mc-bg">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate">{row.agent_name ?? 'Unknown Agent'}</span>
                  <span className="text-mc-accent">{usdFormatter.format(row.cost_usd)}</span>
                </div>
                <div className="text-xs text-mc-text-secondary mt-1">
                  {row.tasks} tasks • {numberFormatter.format(row.tokens)} tokens
                </div>
              </div>
            ))}
            {!loading && (data?.by_agent?.length ?? 0) === 0 && (
              <p className="text-xs text-mc-text-secondary">No dispatch cost data yet.</p>
            )}
          </div>
        </div>

        <div>
          <h4 className="text-xs uppercase text-mc-text-secondary mb-2">By model</h4>
          <div className="space-y-2">
            {(data?.by_model ?? []).map((row) => (
              <div key={row.model} className="rounded border border-mc-border p-2 bg-mc-bg">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate">{row.model}</span>
                  <span className="text-mc-accent">{usdFormatter.format(row.cost_usd)}</span>
                </div>
                <div className="text-xs text-mc-text-secondary mt-1">
                  {row.tasks} tasks • {numberFormatter.format(row.tokens)} tokens
                </div>
              </div>
            ))}
            {!loading && (data?.by_model?.length ?? 0) === 0 && (
              <p className="text-xs text-mc-text-secondary">No model data yet.</p>
            )}
          </div>
        </div>

        <div>
          <h4 className="text-xs uppercase text-mc-text-secondary mb-2">Daily sparkline (list)</h4>
          <ul className="space-y-1 text-xs">
            {(data?.by_day ?? []).map((row) => (
              <li key={row.day} className="flex items-center justify-between rounded border border-mc-border px-2 py-1 bg-mc-bg">
                <span className="text-mc-text-secondary">{row.day}</span>
                <span>{usdFormatter.format(row.cost_usd)} • {numberFormatter.format(row.tokens)} tok</span>
              </li>
            ))}
          </ul>
          {!loading && (data?.by_day?.length ?? 0) === 0 && (
            <p className="text-xs text-mc-text-secondary">No daily usage yet.</p>
          )}
        </div>
      </div>
    </section>
  );
}
