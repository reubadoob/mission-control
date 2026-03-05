'use client';

import { useEffect, useState } from 'react';
import { Clock, MessageSquare, Loader2 } from 'lucide-react';

interface OscarSession {
  id: string;
  channel: string;
  peer?: string;
  model?: string;
  status: string;
  lastMessage: {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp?: string;
  } | null;
}

function timeAgo(ts?: string): string {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

export function OscarLiveFeed() {
  const [sessions, setSessions] = useState<OscarSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  async function fetchSessions() {
    try {
      const res = await fetch('/api/oscar/sessions');
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions ?? []);
        setLastRefresh(new Date());
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium uppercase tracking-wider text-mc-text-secondary">
          Active Sessions
        </h3>
        <div className="flex items-center gap-2 text-xs text-mc-text-secondary">
          {loading && <Loader2 className="w-3 h-3 animate-spin" />}
          {lastRefresh && (
            <span>Updated {timeAgo(lastRefresh.toISOString())}</span>
          )}
        </div>
      </div>

      {!loading && sessions.length === 0 && (
        <div className="text-center py-12 text-mc-text-secondary text-sm">
          <MessageSquare className="w-8 h-8 mx-auto mb-3 opacity-30" />
          No active sessions
        </div>
      )}

      <div className="space-y-2">
        {sessions.map((session) => (
          <div
            key={session.id}
            className="rounded-lg border border-mc-border bg-mc-bg p-3 space-y-2"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    session.status === 'active'
                      ? 'bg-mc-accent-green animate-pulse'
                      : 'bg-mc-text-secondary'
                  }`}
                />
                <span className="font-mono text-xs text-mc-accent truncate">
                  {session.channel}
                </span>
                {session.peer && (
                  <>
                    <span className="text-mc-text-secondary">→</span>
                    <span className="text-xs text-mc-text-secondary truncate">
                      {session.peer}
                    </span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {session.model && (
                  <span className="text-xs px-1.5 py-0.5 bg-mc-bg-tertiary rounded text-mc-text-secondary">
                    {session.model}
                  </span>
                )}
                <span
                  className={`text-xs px-2 py-0.5 rounded uppercase font-medium ${
                    session.status === 'active'
                      ? 'bg-mc-accent-green/20 text-mc-accent-green'
                      : 'bg-mc-bg-tertiary text-mc-text-secondary'
                  }`}
                >
                  {session.status}
                </span>
              </div>
            </div>

            {session.lastMessage ? (
              <div className="bg-mc-bg-secondary rounded p-2">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`text-xs font-medium ${
                      session.lastMessage.role === 'assistant'
                        ? 'text-mc-accent'
                        : session.lastMessage.role === 'user'
                        ? 'text-mc-accent-yellow'
                        : 'text-mc-text-secondary'
                    }`}
                  >
                    {session.lastMessage.role}
                  </span>
                  {session.lastMessage.timestamp && (
                    <span className="text-xs text-mc-text-secondary flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {timeAgo(session.lastMessage.timestamp)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-mc-text font-mono leading-relaxed">
                  {truncate(session.lastMessage.content, 200)}
                </p>
              </div>
            ) : (
              <p className="text-xs text-mc-text-secondary italic">No messages yet</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
