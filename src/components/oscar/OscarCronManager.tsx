'use client';

import { useEffect, useState } from 'react';
import { Clock, Loader2, CheckCircle, XCircle } from 'lucide-react';

interface CronJob {
  id?: string;
  name?: string;
  label?: string;
  schedule?: string;
  every?: string;
  enabled?: boolean;
  last_run?: string;
  next_run?: string;
  status?: string;
}

function timeAgo(ts?: string): string {
  if (!ts) return '—';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function timeUntil(ts?: string): string {
  if (!ts) return '—';
  const diff = new Date(ts).getTime() - Date.now();
  if (diff < 0) return 'overdue';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'soon';
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `in ${hrs}h`;
  return `in ${Math.floor(hrs / 24)}d`;
}

export function OscarCronManager() {
  const [crons, setCrons] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/oscar/crons');
        if (res.ok) {
          const data = await res.json();
          setCrons(data.crons ?? []);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-mc-text-secondary">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading cron jobs…
      </div>
    );
  }

  if (crons.length === 0) {
    return (
      <div className="text-center py-12 text-mc-text-secondary text-sm">
        <Clock className="w-8 h-8 mx-auto mb-3 opacity-30" />
        <p>No cron jobs returned from OpenClaw.</p>
        <p className="mt-2 text-xs">See HEARTBEAT.md for manually-configured schedules.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {crons.map((cron, i) => {
        const label = cron.name ?? cron.label ?? cron.id ?? `Cron #${i + 1}`;
        const isEnabled = cron.enabled !== false;
        return (
          <div
            key={cron.id ?? i}
            className={`rounded-lg border p-3 transition-colors ${
              isEnabled
                ? 'border-mc-border bg-mc-bg'
                : 'border-mc-border/50 bg-mc-bg opacity-60'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {isEnabled ? (
                  <CheckCircle className="w-4 h-4 text-mc-accent-green flex-shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-mc-text-secondary flex-shrink-0" />
                )}
                <span className="font-medium text-sm truncate">{label}</span>
              </div>
              <span
                className={`text-xs px-2 py-0.5 rounded uppercase font-medium flex-shrink-0 ${
                  isEnabled
                    ? 'bg-mc-accent-green/20 text-mc-accent-green'
                    : 'bg-mc-bg-tertiary text-mc-text-secondary'
                }`}
              >
                {isEnabled ? 'enabled' : 'disabled'}
              </span>
            </div>

            <div className="mt-2 grid grid-cols-3 gap-3 text-xs text-mc-text-secondary">
              {(cron.schedule ?? cron.every) && (
                <div>
                  <p className="uppercase tracking-wider mb-0.5">Schedule</p>
                  <p className="text-mc-text font-mono">{cron.schedule ?? cron.every}</p>
                </div>
              )}
              <div>
                <p className="uppercase tracking-wider mb-0.5">Last run</p>
                <p className="text-mc-text">{timeAgo(cron.last_run)}</p>
              </div>
              <div>
                <p className="uppercase tracking-wider mb-0.5">Next run</p>
                <p className="text-mc-text">{timeUntil(cron.next_run)}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
