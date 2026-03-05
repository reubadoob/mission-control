'use client';

import { useEffect, useState } from 'react';

interface ProviderUsage {
  provider: string;
  raw: string | null;
  error: string | null;
}

interface ModelCost {
  model: string;
  tasks: number;
  tokens: number;
  cost_usd: number;
}

interface CostData {
  by_model: ModelCost[];
  total_tokens: number;
  total_cost_usd: number;
  days: number;
}

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Claude (Anthropic)',
  google: 'Gemini (Google)',
  openai: 'Codex (OpenAI)',
};

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: 'text-orange-400',
  google: 'text-blue-400',
  openai: 'text-green-400',
};

export function OscarRateLimits() {
  const [usage, setUsage] = useState<ProviderUsage[]>([]);
  const [costs, setCosts] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'live' | 'historical'>('historical');

  useEffect(() => {
    let mounted = true;

    async function fetchAll() {
      try {
        const [usageRes, costRes] = await Promise.allSettled([
          fetch('/api/oscar/usage'),
          fetch('/api/costs?days=30'),
        ]);

        if (mounted) {
          if (usageRes.status === 'fulfilled' && usageRes.value.ok) {
            const d = await usageRes.value.json();
            setUsage(d.providers ?? []);
          }
          if (costRes.status === 'fulfilled' && costRes.value.ok) {
            const d = await costRes.value.json();
            setCosts(d);
          }
        }
      } catch {
        // ignore
      } finally {
        if (mounted) setLoading(false);
      }
    }

    fetchAll();
    const interval = setInterval(fetchAll, 60000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  if (loading) return <p className="text-xs text-mc-text-secondary">Loading usage data…</p>;

  const modelsByProvider: Record<string, ModelCost[]> = {};
  for (const m of costs?.by_model ?? []) {
    const provider = m.model.includes('/') ? m.model.split('/')[0] : 'other';
    if (!modelsByProvider[provider]) modelsByProvider[provider] = [];
    modelsByProvider[provider].push(m);
  }

  return (
    <div className="space-y-4">
      {/* Tab toggle */}
      <div className="flex gap-2">
        {(['historical', 'live'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`text-xs px-3 py-1 rounded border transition-colors ${
              activeTab === tab
                ? 'border-mc-accent bg-mc-accent/10 text-mc-accent'
                : 'border-mc-border text-mc-text-secondary hover:text-mc-text'
            }`}
          >
            {tab === 'historical' ? '30-Day Spend' : 'Live CLI Usage'}
          </button>
        ))}
      </div>

      {activeTab === 'historical' && (
        <div className="space-y-4">
          {/* Summary */}
          {costs && (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded border border-mc-border bg-mc-bg p-3">
                <p className="text-xs text-mc-text-secondary mb-1">30-Day Cost</p>
                <p className="text-lg font-mono text-mc-accent">
                  ${costs.total_cost_usd.toFixed(4)}
                </p>
              </div>
              <div className="rounded border border-mc-border bg-mc-bg p-3">
                <p className="text-xs text-mc-text-secondary mb-1">Total Tokens</p>
                <p className="text-lg font-mono text-mc-text">
                  {costs.total_tokens.toLocaleString()}
                </p>
              </div>
            </div>
          )}

          {/* By provider + model */}
          {Object.entries(modelsByProvider).map(([provider, models]) => (
            <div key={provider}>
              <h4 className={`text-xs uppercase mb-2 ${PROVIDER_COLORS[provider] ?? 'text-mc-text-secondary'}`}>
                {PROVIDER_LABELS[provider] ?? provider}
              </h4>
              <div className="space-y-2">
                {models.map((m) => {
                  const modelLabel = m.model.includes('/') ? m.model.split('/').slice(1).join('/') : m.model;
                  return (
                    <div key={m.model} className="rounded border border-mc-border bg-mc-bg p-3">
                      <div className="flex justify-between items-start mb-1">
                        <p className="text-xs font-mono text-mc-text truncate max-w-[60%]">{modelLabel}</p>
                        <p className="text-xs font-mono text-mc-accent">${m.cost_usd.toFixed(4)}</p>
                      </div>
                      <div className="flex gap-4 text-xs text-mc-text-secondary">
                        <span>{m.tokens.toLocaleString()} tokens</span>
                        <span>{m.tasks} task{m.tasks !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {(costs?.by_model?.length ?? 0) === 0 && (
            <p className="text-xs text-mc-text-secondary">No cost data recorded yet.</p>
          )}
        </div>
      )}

      {activeTab === 'live' && (
        <div className="space-y-4">
          {usage.map((p) => (
            <div key={p.provider} className="rounded border border-mc-border bg-mc-bg p-3">
              <p className={`text-xs uppercase font-semibold mb-2 ${PROVIDER_COLORS[p.provider] ?? 'text-mc-text-secondary'}`}>
                {PROVIDER_LABELS[p.provider] ?? p.provider}
              </p>
              {p.raw && p.raw.length > 0 ? (
                <pre className="text-xs text-mc-text-secondary font-mono whitespace-pre-wrap break-all leading-relaxed">
                  {p.raw}
                </pre>
              ) : (
                <p className="text-xs text-mc-text-secondary italic">
                  {p.error ? `CLI unavailable: ${p.error.slice(0, 80)}` : 'No output — CLI may not be in PATH or not authenticated.'}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
