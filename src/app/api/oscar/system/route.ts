import { NextResponse } from 'next/server';
import os from 'os';
import { statfsSync } from 'fs';

function getCpuPercent(): Promise<number> {
  return new Promise((resolve) => {
    const sample1 = os.cpus().map((c) => ({ ...c.times }));

    setTimeout(() => {
      const sample2 = os.cpus();
      let totalDiff = 0;
      let idleDiff = 0;

      for (let i = 0; i < sample2.length; i++) {
        const t1 = sample1[i];
        const t2 = sample2[i].times;
        const total =
          (t2.user - t1.user) +
          (t2.nice - t1.nice) +
          (t2.sys - t1.sys) +
          (t2.idle - t1.idle) +
          (t2.irq - t1.irq);
        totalDiff += total;
        idleDiff += t2.idle - t1.idle;
      }

      const percent = totalDiff > 0 ? ((totalDiff - idleDiff) / totalDiff) * 100 : 0;
      resolve(Math.round(percent));
    }, 150);
  });
}

export async function GET() {
  const cpuPercent = await getCpuPercent();

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  let disk = { total: 0, free: 0, used: 0 };
  try {
    const stats = statfsSync('/');
    disk = {
      total: stats.bsize * stats.blocks,
      free: stats.bsize * stats.bfree,
      used: stats.bsize * (stats.blocks - stats.bfree),
    };
  } catch {
    // statfs not available
  }

  return NextResponse.json({
    cpu: { percent: cpuPercent, cores: os.cpus().length },
    memory: { total: totalMem, used: usedMem, free: freeMem },
    disk,
    uptime: os.uptime(),
    loadavg: os.loadavg(),
    hostname: os.hostname(),
  });
}
