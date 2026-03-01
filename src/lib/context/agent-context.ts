const INTERNAL_CONTEXT_API_URL = 'https://api.gearswitchr.com/ai/context';
const MAX_CONTEXT_CHARS = 2000;

interface AgentContextResponse {
  daysToLaunch?: number | string;
  users?: number | string;
  listings?: number | string;
  trades?: number | string;
  ffls?: number | string;
  schemaDocPath?: string;
  apiContractsPath?: string;
  [key: string]: unknown;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function compact(text: string): string {
  return text.length > MAX_CONTEXT_CHARS ? `${text.slice(0, MAX_CONTEXT_CHARS - 3)}...` : text;
}

function formatAgentContext(data: AgentContextResponse): string {
  const lines: string[] = ['[LIVE BUSINESS CONTEXT - GearSwitchr]'];

  const daysToLaunch =
    asNumber(data.daysToLaunch) ??
    asNumber((data as Record<string, unknown>).days_to_launch);

  const users = asNumber(data.users);
  const listings = asNumber(data.listings);
  const trades = asNumber(data.trades);
  const ffls = asNumber(data.ffls);

  if (daysToLaunch !== null) lines.push(`Days to launch: ${daysToLaunch}`);

  const kpiParts = [
    users !== null ? `users=${users}` : null,
    listings !== null ? `listings=${listings}` : null,
    trades !== null ? `trades=${trades}` : null,
    ffls !== null ? `ffls=${ffls}` : null,
  ].filter(Boolean);

  if (kpiParts.length > 0) {
    lines.push(`KPIs: ${kpiParts.join(' | ')}`);
  }

  const schemaDocPath =
    asString(data.schemaDocPath) ??
    asString((data as Record<string, unknown>).schema_doc_path);

  const apiContractsPath =
    asString(data.apiContractsPath) ??
    asString((data as Record<string, unknown>).api_contracts_path);

  if (schemaDocPath) lines.push(`Schema docs: ${schemaDocPath}`);
  if (apiContractsPath) lines.push(`API contracts: ${apiContractsPath}`);

  const text = compact(lines.join('\n'));
  return text === '[LIVE BUSINESS CONTEXT - GearSwitchr]' ? '' : text;
}

/**
 * Fetches live GearSwitchr business context for task dispatch prompts.
 * Returns a compact context string (max 2000 chars), or empty string if unavailable.
 */
export async function fetchAgentContext(): Promise<string> {
  const apiKey = process.env.INTERNAL_CONTEXT_API_KEY;
  if (!apiKey) {
    return '';
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetch(INTERNAL_CONTEXT_API_URL, {
      method: 'GET',
      headers: {
        'X-Internal-Key': apiKey,
      },
      cache: 'no-store',
      signal: controller.signal,
    });

    if (!response.ok) {
      console.warn(`Internal context API returned non-2xx status: ${response.status}`);
      return '';
    }

    const payload = (await response.json()) as AgentContextResponse;
    return formatAgentContext(payload);
  } catch (error) {
    console.warn('Failed to fetch internal agent context:', error);
    return '';
  } finally {
    clearTimeout(timeoutId);
  }
}
