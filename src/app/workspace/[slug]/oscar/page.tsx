'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Activity, DollarSign, Zap, Cpu, Brain, Clock } from 'lucide-react';
import { OscarLiveFeed } from '@/components/oscar/OscarLiveFeed';
import { OscarCostTracking } from '@/components/oscar/OscarCostTracking';
import { OscarRateLimits } from '@/components/oscar/OscarRateLimits';
import { OscarSystemHealth } from '@/components/oscar/OscarSystemHealth';
import { OscarMemoryBrowser } from '@/components/oscar/OscarMemoryBrowser';
import { OscarCronManager } from '@/components/oscar/OscarCronManager';
import type { Workspace } from '@/lib/types';

type Tab = 'feed' | 'costs' | 'limits' | 'health' | 'memory' | 'crons';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'feed', label: 'Live Feed', icon: <Activity className="w-4 h-4" /> },
  { id: 'costs', label: 'Cost Tracking', icon: <DollarSign className="w-4 h-4" /> },
  { id: 'limits', label: 'Rate Limits', icon: <Zap className="w-4 h-4" /> },
  { id: 'health', label: 'System Health', icon: <Cpu className="w-4 h-4" /> },
  { id: 'memory', label: 'Memory Browser', icon: <Brain className="w-4 h-4" /> },
  { id: 'crons', label: 'Cron Manager', icon: <Clock className="w-4 h-4" /> },
];

export default function OscarPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [tab, setTab] = useState<Tab>('feed');
  const [workspace, setWorkspace] = useState<Workspace | null>(null);

  useEffect(() => {
    fetch(`/api/workspaces/${slug}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setWorkspace(data))
      .catch(() => {});
  }, [slug]);

  return (
    <div className="min-h-screen bg-mc-bg flex flex-col">
      {/* Header */}
      <div className="h-14 bg-mc-bg-secondary border-b border-mc-border flex items-center px-4 gap-3">
        <Link
          href={`/workspace/${slug}`}
          className="flex items-center gap-1 text-mc-text-secondary hover:text-mc-accent transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          <span className="text-sm">
            {workspace ? workspace.name : slug}
          </span>
        </Link>
        <span className="text-mc-border">/</span>
        <div className="flex items-center gap-2">
          <span className="text-lg">🦞</span>
          <span className="font-semibold text-mc-text uppercase tracking-wider text-sm">
            Oscar
          </span>
          <span className="text-xs px-2 py-0.5 bg-mc-accent/20 text-mc-accent rounded uppercase">
            Agent Ops
          </span>
        </div>
      </div>

      {/* Tab nav */}
      <div className="border-b border-mc-border bg-mc-bg-secondary px-4">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm border-b-2 whitespace-nowrap transition-colors ${
                tab === t.id
                  ? 'border-mc-accent text-mc-accent'
                  : 'border-transparent text-mc-text-secondary hover:text-mc-text hover:border-mc-border'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className={`flex-1 p-6 max-w-5xl w-full mx-auto ${tab === 'memory' ? 'flex flex-col' : ''}`}>
        {tab === 'feed' && <OscarLiveFeed />}
        {tab === 'costs' && <OscarCostTracking />}
        {tab === 'limits' && <OscarRateLimits />}
        {tab === 'health' && <OscarSystemHealth />}
        {tab === 'memory' && <OscarMemoryBrowser />}
        {tab === 'crons' && <OscarCronManager />}
      </div>
    </div>
  );
}
