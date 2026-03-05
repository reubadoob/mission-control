'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Zap, Settings, ChevronLeft, LayoutGrid, Menu, Radio } from 'lucide-react';
import { useMissionControl } from '@/lib/store';
import { format } from 'date-fns';
import type { Workspace } from '@/lib/types';

interface HeaderProps {
  workspace?: Workspace;
  onToggleAgents?: () => void;
  onToggleFeed?: () => void;
}

export function Header({ workspace, onToggleAgents, onToggleFeed }: HeaderProps) {
  const router = useRouter();
  const { agents, tasks, isOnline } = useMissionControl();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [activeSubAgents, setActiveSubAgents] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Load active sub-agent count
  useEffect(() => {
    const loadSubAgentCount = async () => {
      try {
        const res = await fetch('/api/openclaw/sessions?session_type=subagent&status=active');
        if (res.ok) {
          const sessions = await res.json();
          setActiveSubAgents(sessions.length);
        }
      } catch (error) {
        console.error('Failed to load sub-agent count:', error);
      }
    };

    loadSubAgentCount();

    // Poll every 30 seconds (reduced from 10s to reduce load)
    const interval = setInterval(loadSubAgentCount, 30000);
    return () => clearInterval(interval);
  }, []);

  const workingAgents = agents.filter((a) => a.status === 'working').length;
  const activeAgents = workingAgents + activeSubAgents;
  const tasksInQueue = tasks.filter((t) => t.status !== 'done' && t.status !== 'review').length;

  return (
    <header className="h-14 bg-mc-bg-secondary border-b border-mc-border flex items-center justify-between px-2 md:px-4">
      {/* Left: Hamburger (mobile) + Logo & Title */}
      <div className="flex items-center gap-2 md:gap-4 min-w-0">
        {/* Mobile hamburger for agents sidebar */}
        {workspace && onToggleAgents && (
          <button
            onClick={onToggleAgents}
            className="md:hidden p-2 hover:bg-mc-bg-tertiary rounded text-mc-text-secondary"
            aria-label="Toggle agents sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        <div className="flex items-center gap-2 flex-shrink-0">
          <Zap className="w-5 h-5 text-mc-accent-cyan" />
          <span className="hidden sm:inline font-semibold text-mc-text uppercase tracking-wider text-sm">
            Mission Control
          </span>
          <span className="sm:hidden font-semibold text-mc-text uppercase tracking-wider text-sm">
            MC
          </span>
        </div>

        {/* Workspace indicator or back to dashboard */}
        {workspace ? (
          <div className="flex items-center gap-2 min-w-0">
            <Link
              href="/"
              className="flex items-center gap-1 text-mc-text-secondary hover:text-mc-accent transition-colors flex-shrink-0"
            >
              <ChevronLeft className="w-4 h-4" />
              <LayoutGrid className="w-4 h-4 hidden sm:block" />
            </Link>
            <span className="text-mc-text-secondary hidden sm:inline">/</span>
            <div className="flex items-center gap-2 px-2 md:px-3 py-1 bg-mc-bg-tertiary rounded min-w-0">
              <span className="text-lg flex-shrink-0">{workspace.icon}</span>
              <span className="font-medium truncate">{workspace.name}</span>
            </div>
            <Link
              href={`/workspace/${workspace.slug}/oscar`}
              className="flex items-center gap-2 px-2 md:px-3 py-1 bg-mc-bg-tertiary rounded hover:bg-mc-bg transition-colors min-w-0"
            >
              <span className="text-lg flex-shrink-0">🦞</span>
              <span className="font-medium truncate">Oscar</span>
            </Link>
          </div>
        ) : (
          <Link
            href="/"
            className="flex items-center gap-2 px-3 py-1 bg-mc-bg-tertiary rounded hover:bg-mc-bg transition-colors"
          >
            <LayoutGrid className="w-4 h-4" />
            <span className="text-sm">All Workspaces</span>
          </Link>
        )}
      </div>

      {/* Center: Stats - hidden on mobile */}
      {workspace && (
        <div className="hidden md:flex items-center gap-8">
          <div className="text-center">
            <div className="text-2xl font-bold text-mc-accent-cyan">{activeAgents}</div>
            <div className="text-xs text-mc-text-secondary uppercase">Agents Active</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-mc-accent-purple">{tasksInQueue}</div>
            <div className="text-xs text-mc-text-secondary uppercase">Tasks in Queue</div>
          </div>
        </div>
      )}

      {/* Right: Time & Status */}
      <div className="flex items-center gap-2 md:gap-4 flex-shrink-0">
        <span className="hidden md:inline text-mc-text-secondary text-sm font-mono">
          {format(currentTime, 'HH:mm:ss')}
        </span>
        {/* Full status badge on desktop, dot-only on mobile */}
        <div
          className={`hidden md:flex items-center gap-2 px-3 py-1 rounded border text-sm font-medium ${
            isOnline
              ? 'bg-mc-accent-green/20 border-mc-accent-green text-mc-accent-green'
              : 'bg-mc-accent-red/20 border-mc-accent-red text-mc-accent-red'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              isOnline ? 'bg-mc-accent-green animate-pulse' : 'bg-mc-accent-red'
            }`}
          />
          {isOnline ? 'ONLINE' : 'OFFLINE'}
        </div>
        {/* Mobile: just status dot */}
        <span
          className={`md:hidden w-2.5 h-2.5 rounded-full ${
            isOnline ? 'bg-mc-accent-green animate-pulse' : 'bg-mc-accent-red'
          }`}
        />
        <button
          onClick={() => router.push('/settings')}
          className="p-2 hover:bg-mc-bg-tertiary rounded text-mc-text-secondary"
          title="Settings"
        >
          <Settings className="w-5 h-5" />
        </button>
        {/* Mobile feed toggle */}
        {workspace && onToggleFeed && (
          <button
            onClick={onToggleFeed}
            className="md:hidden p-2 hover:bg-mc-bg-tertiary rounded text-mc-text-secondary"
            aria-label="Toggle live feed"
          >
            <Radio className="w-5 h-5" />
          </button>
        )}
      </div>
    </header>
  );
}
