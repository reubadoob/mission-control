'use client';

import { useEffect, useState } from 'react';

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
  by_model: CostByModel[];
  by_day: CostByDay[];
};

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

const num = new Intl.NumberFormat('en-US');

export function OscarCostTracking() {
  const [data, setData] = useState<CostResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetch(`/api/costs?days=${days}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (mounted) { setData(d); setLoading(false); } })
      .catch(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [days]);

  const maxDayCost = data?.by_day?.length
    ? Math.max(...data.by_day.map((d) => d.cost_usd), 0.0001)
    : 0.0001;

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex items-center gap-2">
        {[7, 14, 30].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`px-3 py-1 text-xs rounded uppercase ${
              days === d
                ? 'bg-mc-accent text-mc-bg font-medium'
                : 'text-mc-text-secondary hover:bg-mc-bg-tertiary'
            }`}
          >
            {d}d
          </button>
        ))}
      </div>

      {/* Totals */}
      <div className="rounded-lg border border-mc-border bg-mc-bg p-3">
        <p className="text-xs uppercase text-mc-text-secondary">Total spend ({days}d)</p>
        <p className="text-xl font-semibold text-mc-accent mt-1">
          {loading ? '—' : usd.format(data?.total_cost_usd ?? 0)}
        </p>
        <p className="text-xs text-mc-text-secondary mt-1">
          {loading ? 'Loading…' : `${num.format(data?.total_tokens ?? 0)} tokens`}
        </p>
      </div>

      {/* By model */}
      <div>
        <h4 className="text-xs uppercase text-mc-text-secondary mb-2">By model</h4>
        <div className="space-y-2">
          {(data?.by_model ?? []).map((row) => (
            <div key={row.model} className="rounded border border-mc-border p-2 bg-mc-bg">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-xs truncate">{row.model}</span>
                <span className="text-mc-accent text-xs">{usd.format(row.cost_usd)}</span>
              </div>
              <p className="text-xs text-mc-text-secondary mt-1">
                {row.tasks} tasks · {num.format(row.tokens)} tok
              </p>
            </div>
          ))}
          {!loading && (data?.by_model?.length ?? 0) === 0 && (
            <p className="text-xs text-mc-text-secondary">No model data yet.</p>
          )}
        </div>
      </div>

      {/* Daily sparkline */}
      <div>
        <h4 className="text-xs uppercase text-mc-text-secondary mb-2">Daily breakdown</h4>
        <div className="space-y-1">
          {(data?.by_day ?? []).map((row) => (
            <div key={row.day} className="flex items-center gap-2">
              <span className="text-xs text-mc-text-secondary w-24 shrink-0">{row.day}</span>
              <div className="flex-1 h-4 bg-mc-bg rounded overflow-hidden border border-mc-border">
                <div
                  className="h-full bg-mc-accent/60 rounded"
                  style={{ width: `${Math.max(2, (row.cost_usd / maxDayCost) * 100)}%` }}
                />
              </div>
              <span className="text-xs text-mc-text w-16 text-right shrink-0">
                {usd.format(row.cost_usd)}
              </span>
            </div>
          ))}
          {!loading && (data?.by_day?.length ?? 0) === 0 && (
            <p className="text-xs text-mc-text-secondary">No daily usage yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
