'use client';

import { useEffect, useState } from 'react';
import { Cpu, MemoryStick, HardDrive, Server, Loader2, Activity } from 'lucide-react';

interface SystemData {
  cpu: { percent: number; cores: number };
  memory: { total: number; used: number; free: number };
  disk: { total: number; free: number; used: number };
  uptime: number;
  loadavg: [number, number, number];
  hostname: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function UsageBar({ percent, color }: { percent: number; color: string }) {
  return (
    <div className="h-2 bg-mc-bg-tertiary rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${Math.min(100, percent)}%` }}
      />
    </div>
  );
}

function barColor(percent: number): string {
  if (percent >= 90) return 'bg-mc-accent-red';
  if (percent >= 70) return 'bg-mc-accent-yellow';
  return 'bg-mc-accent-green';
}

export function OscarSystemHealth() {
  const [data, setData] = useState<SystemData | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchSystem() {
    try {
      const res = await fetch('/api/oscar/system');
      if (res.ok) {
        setData(await res.json());
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchSystem();
    const interval = setInterval(fetchSystem, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-mc-text-secondary">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Reading system metrics…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12 text-mc-text-secondary text-sm">
        Failed to load system data
      </div>
    );
  }

  const memPercent = Math.round((data.memory.used / data.memory.total) * 100);
  const diskPercent =
    data.disk.total > 0
      ? Math.round((data.disk.used / data.disk.total) * 100)
      : 0;

  return (
    <div className="space-y-4">
      {/* Host info */}
      <div className="flex items-center gap-3 p-3 rounded-lg border border-mc-border bg-mc-bg">
        <Server className="w-5 h-5 text-mc-accent flex-shrink-0" />
        <div>
          <p className="font-medium text-sm">{data.hostname}</p>
          <p className="text-xs text-mc-text-secondary">
            Uptime: {formatUptime(data.uptime)} &nbsp;•&nbsp; Load:{' '}
            {data.loadavg.map((v) => v.toFixed(2)).join(' / ')}
          </p>
        </div>
      </div>

      {/* CPU */}
      <div className="p-4 rounded-lg border border-mc-border bg-mc-bg space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-mc-accent-cyan" />
            <span className="text-sm font-medium">CPU</span>
            <span className="text-xs text-mc-text-secondary">({data.cpu.cores} cores)</span>
          </div>
          <span
            className={`text-sm font-bold ${barColor(data.cpu.percent).replace('bg-', 'text-')}`}
          >
            {data.cpu.percent}%
          </span>
        </div>
        <UsageBar percent={data.cpu.percent} color={barColor(data.cpu.percent)} />
      </div>

      {/* Memory */}
      <div className="p-4 rounded-lg border border-mc-border bg-mc-bg space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MemoryStick className="w-4 h-4 text-mc-accent-purple" />
            <span className="text-sm font-medium">RAM</span>
          </div>
          <span
            className={`text-sm font-bold ${barColor(memPercent).replace('bg-', 'text-')}`}
          >
            {memPercent}%
          </span>
        </div>
        <UsageBar percent={memPercent} color={barColor(memPercent)} />
        <p className="text-xs text-mc-text-secondary">
          {formatBytes(data.memory.used)} used / {formatBytes(data.memory.total)} total
          &nbsp;·&nbsp; {formatBytes(data.memory.free)} free
        </p>
      </div>

      {/* Disk */}
      {data.disk.total > 0 && (
        <div className="p-4 rounded-lg border border-mc-border bg-mc-bg space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-mc-accent-yellow" />
              <span className="text-sm font-medium">Disk</span>
              <span className="text-xs text-mc-text-secondary">(/)</span>
            </div>
            <span
              className={`text-sm font-bold ${barColor(diskPercent).replace('bg-', 'text-')}`}
            >
              {diskPercent}%
            </span>
          </div>
          <UsageBar percent={diskPercent} color={barColor(diskPercent)} />
          <p className="text-xs text-mc-text-secondary">
            {formatBytes(data.disk.used)} used / {formatBytes(data.disk.total)} total
            &nbsp;·&nbsp; {formatBytes(data.disk.free)} free
          </p>
        </div>
      )}

      {/* Activity indicator */}
      <div className="flex items-center gap-2 text-xs text-mc-text-secondary">
        <Activity className="w-3 h-3" />
        <span>Auto-refreshes every 5s</span>
      </div>
    </div>
  );
}
