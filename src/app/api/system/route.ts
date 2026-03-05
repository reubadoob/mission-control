import { NextResponse } from 'next/server';
import os from 'os';
import { execSync } from 'child_process';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function getCpuUsage(): number {
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;

  for (const cpu of cpus) {
    for (const type of Object.keys(cpu.times) as (keyof typeof cpu.times)[]) {
      totalTick += cpu.times[type];
    }
    totalIdle += cpu.times.idle;
  }

  const idle = totalIdle / cpus.length;
  const total = totalTick / cpus.length;
  return Math.round(((total - idle) / total) * 100);
}

function getDiskUsage(): { used: number; total: number; usedPercent: number } | null {
  try {
    const output = execSync("df -k / 2>/dev/null | tail -1", { encoding: 'utf8', timeout: 3000 });
    const parts = output.trim().split(/\s+/);
    if (parts.length >= 5) {
      const total = parseInt(parts[1], 10) * 1024;
      const used = parseInt(parts[2], 10) * 1024;
      const usedPercent = Math.round((used / total) * 100);
      return { used, total, usedPercent };
    }
  } catch {
    // Ignore errors
  }
  return null;
}

function formatBytes(bytes: number): string {
  const gb = bytes / (1024 ** 3);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 ** 2);
  return `${mb.toFixed(0)} MB`;
}

export async function GET() {
  try {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memPercent = Math.round((usedMem / totalMem) * 100);

    const cpuPercent = getCpuUsage();
    const disk = getDiskUsage();

    const loadAvg = os.loadavg();
    const cpuCount = os.cpus().length;

    return NextResponse.json({
      cpu: {
        percent: cpuPercent,
        load1: loadAvg[0].toFixed(2),
        load5: loadAvg[1].toFixed(2),
        load15: loadAvg[2].toFixed(2),
        cores: cpuCount,
      },
      memory: {
        used: usedMem,
        total: totalMem,
        free: freeMem,
        percent: memPercent,
        usedFormatted: formatBytes(usedMem),
        totalFormatted: formatBytes(totalMem),
      },
      disk: disk
        ? {
            used: disk.used,
            total: disk.total,
            percent: disk.usedPercent,
            usedFormatted: formatBytes(disk.used),
            totalFormatted: formatBytes(disk.total),
          }
        : null,
      uptime: os.uptime(),
      platform: os.platform(),
      hostname: os.hostname(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to get system health:', error);
    return NextResponse.json({ error: 'Failed to get system health' }, { status: 500 });
  }
}
