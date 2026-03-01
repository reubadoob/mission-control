'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { X, RefreshCw } from 'lucide-react';

interface SessionConsoleProps {
  sessionId: string;
  isActive: boolean;
  onClose: () => void;
}

interface SessionHistoryMessage {
  role: string;
  content: string;
  timestamp?: string;
}

const MAX_PREVIEW_CHARS = 500;

function getRoleBadge(role: string) {
  const normalized = role.toLowerCase();

  switch (normalized) {
    case 'assistant':
      return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
    case 'user':
      return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
    case 'system':
      return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
    default:
      return 'bg-mc-bg-tertiary text-mc-text-secondary border-mc-border';
  }
}

function formatTimestamp(timestamp?: string) {
  if (!timestamp) return 'Unknown time';

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'Unknown time';

  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function SessionConsole({ sessionId, isActive, onClose }: SessionConsoleProps) {
  const [messages, setMessages] = useState<SessionHistoryMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [shouldPoll, setShouldPoll] = useState(isActive);

  useEffect(() => {
    setShouldPoll(isActive);
  }, [isActive]);

  const fetchHistory = useCallback(async (isInitialLoad = false) => {
    if (isInitialLoad) {
      setLoading(true);
    }

    try {
      const res = await fetch(`/api/openclaw/sessions/${sessionId}/history?limit=100&offset=0`);

      if (!res.ok) {
        throw new Error('Failed to load session history');
      }

      const data = (await res.json()) as {
        history?: SessionHistoryMessage[];
        sessionStatus?: string;
      };

      const normalizedMessages = Array.isArray(data.history) ? data.history : [];
      setMessages(normalizedMessages);
      setError(null);

      const status = data.sessionStatus?.toLowerCase() ?? null;
      const isTerminalStatus = status !== null && status !== 'active' && status !== 'working';

      if (status === null || isTerminalStatus) {
        setShouldPoll(false);
      }
    } catch (err) {
      console.error('Failed to fetch session history:', err);
      setError('Could not load session output.');
    } finally {
      if (isInitialLoad) {
        setLoading(false);
      }
    }
  }, [sessionId]);

  useEffect(() => {
    void fetchHistory(true);
  }, [fetchHistory]);

  useEffect(() => {
    if (!shouldPoll) return;

    const interval = window.setInterval(() => {
      void fetchHistory(false);
    }, 5000);

    return () => window.clearInterval(interval);
  }, [fetchHistory, shouldPoll]);

  const hasMessages = useMemo(() => messages.length > 0, [messages]);

  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        type="button"
        aria-label="Close session output"
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />

      <div className="ml-auto relative h-full w-full max-w-3xl bg-mc-bg-secondary border-l border-mc-border flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-mc-border">
          <div>
            <h2 className="text-lg font-semibold text-mc-text">Session Output</h2>
            <p className="text-xs text-mc-text-secondary font-mono mt-1">{sessionId}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void fetchHistory(false)}
              className="p-2 rounded hover:bg-mc-bg-tertiary text-mc-text-secondary hover:text-mc-text"
              title="Refresh output"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded hover:bg-mc-bg-tertiary text-mc-text-secondary hover:text-mc-text"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="px-4 py-2 border-b border-mc-border text-xs text-mc-text-secondary">
          {shouldPoll ? 'Live mode: refreshing every 5s' : 'Session is no longer active. Auto-refresh paused.'}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-mc-bg">
          {loading && !hasMessages && (
            <div className="text-sm text-mc-text-secondary">Loading session output...</div>
          )}

          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded p-3">
              {error}
            </div>
          )}

          {!loading && !error && !hasMessages && (
            <div className="text-sm text-mc-text-secondary">No output yet for this session.</div>
          )}

          {messages.map((message, index) => {
            const key = `${message.timestamp ?? 'no-time'}-${index}`;
            const content = message.content ?? '';
            const isLong = content.length > MAX_PREVIEW_CHARS;
            const isExpanded = expanded[key] === true;

            return (
              <div key={key} className="rounded-lg border border-mc-border bg-mc-bg-secondary p-3">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <span
                    className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${getRoleBadge(message.role)}`}
                  >
                    {message.role || 'unknown'}
                  </span>
                  <span className="text-xs text-mc-text-secondary">{formatTimestamp(message.timestamp)}</span>
                </div>

                <div className="text-sm text-mc-text whitespace-pre-wrap break-words">
                  {isLong && !isExpanded ? `${content.slice(0, MAX_PREVIEW_CHARS)}...` : content}
                </div>

                {isLong && (
                  <button
                    onClick={() => setExpanded((prev) => ({ ...prev, [key]: !isExpanded }))}
                    className="mt-2 text-xs text-mc-accent hover:underline"
                  >
                    {isExpanded ? 'Show less' : 'Show more'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
