import { NextResponse } from 'next/server';
import { execSync } from 'child_process';

export const dynamic = 'force-dynamic';

interface ProviderUsage {
  provider: string;
  raw: string | null;
  error: string | null;
}

function runSafe(cmd: string, timeoutMs = 8000): { output: string | null; error: string | null } {
  try {
    const output = execSync(cmd, {
      timeout: timeoutMs,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { output: output.trim(), error: null };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { output: null, error };
  }
}

export async function GET() {
  const results: ProviderUsage[] = [];

  // Claude Code: `claude /usage`
  const claude = runSafe('claude /usage --no-color 2>/dev/null || echo ""');
  results.push({
    provider: 'anthropic',
    raw: claude.output,
    error: claude.error,
  });

  // Gemini CLI: `gemini /stats`
  const gemini = runSafe('gemini /stats --no-color 2>/dev/null || echo ""');
  results.push({
    provider: 'google',
    raw: gemini.output,
    error: gemini.error,
  });

  // Codex: try `codex /usage` or `codex stats`
  const codex = runSafe('codex /usage --no-color 2>/dev/null || codex stats 2>/dev/null || echo ""');
  results.push({
    provider: 'openai',
    raw: codex.output,
    error: codex.error,
  });

  return NextResponse.json({ providers: results });
}
