'use client';

import { useEffect, useState } from 'react';

interface ModelInfo {
  model: string;
  requests_used?: number;
  requests_limit?: number;
  tokens_used?: number;
  tokens_limit?: number;
  reset_at?: string;
}

interface UsageData {
  models?: ModelInfo[];
  available_models?: string[];
  default_model?: string;
}

function UsageBar({ used, limit, label }: { used: number; limit: number; label: string }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const color = pct >= 90 ? 'bg-mc-accent-red' : pct >= 70 ? 'bg-mc-accent-yellow' : 'bg-mc-accent';

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-mc-text-secondary">{label}</span>
        <span>{used.toLocaleString()} / {limit.toLocaleString()} ({pct}%)</span>
      </div>
      <div className="h-1.5 bg-mc-bg rounded overflow-hidden border border-mc-border">
        <div className={`h-full rounded ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function OscarRateLimits() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function poll() {
      try {
        const res = await fetch('/api/openclaw/models');
        if (res.ok) {
          const d = await res.json();
          if (mounted) {
            setData({
              available_models: d.availableModels ?? [],
              default_model: d.defaultModel,
              models: [],
            });
          }
        }
      } catch {
        // Ignore
      } finally {
        if (mounted) setLoading(false);
      }
    }

    poll();
    const interval = setInterval(poll, 30000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  if (loading) return <p className="text-xs text-mc-text-secondary">Loading model info…</p>;

  const modelsWithUsage = data?.models?.filter((m) => m.requests_limit || m.tokens_limit) ?? [];

  return (
    <div className="space-y-4">
      {/* Live usage bars if available */}
      {modelsWithUsage.length > 0 && (
        <div className="space-y-4">
          {modelsWithUsage.map((m) => (
            <div key={m.model} className="rounded border border-mc-border bg-mc-bg p-3 space-y-2">
              <p className="text-xs font-mono text-mc-accent">{m.model}</p>
              {m.requests_limit != null && m.requests_used != null && (
                <UsageBar used={m.requests_used} limit={m.requests_limit} label="Requests" />
              )}
              {m.tokens_limit != null && m.tokens_used != null && (
                <UsageBar used={m.tokens_used} limit={m.tokens_limit} label="Tokens" />
              )}
              {m.reset_at && (
                <p className="text-xs text-mc-text-secondary">
                  Resets {new Date(m.reset_at).toLocaleString()}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Configured models */}
      <div>
        <h4 className="text-xs uppercase text-mc-text-secondary mb-2">Configured models</h4>
        {data?.default_model && (
          <div className="mb-2 rounded border border-mc-accent/30 bg-mc-accent/10 px-3 py-1.5 text-xs">
            <span className="text-mc-text-secondary">Default: </span>
            <span className="font-mono text-mc-accent">{data.default_model}</span>
          </div>
        )}
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {(data?.available_models ?? []).map((m) => (
            <div key={m} className="text-xs font-mono text-mc-text-secondary px-2 py-1 rounded hover:bg-mc-bg-tertiary">
              {m}
            </div>
          ))}
          {(data?.available_models?.length ?? 0) === 0 && (
            <p className="text-xs text-mc-text-secondary">No models configured.</p>
          )}
        </div>
      </div>

      {modelsWithUsage.length === 0 && (
        <p className="text-xs text-mc-text-secondary">
          Live rate-limit data not available from this gateway version.
        </p>
      )}
    </div>
  );
}
