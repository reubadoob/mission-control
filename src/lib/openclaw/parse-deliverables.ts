export type DeliverableItem = {
  deliverable_type: 'url' | 'file' | 'artifact';
  title: string;
  path?: string;
};

export function parseDeliverables(summary: string): DeliverableItem[] {
  const match = summary.match(/deliverables?\s*:\s*([^|]+)/i);
  if (!match) return [];
  const raw = match[1].trim();
  if (!raw) return [];

  const parts = raw
    .split(/,\s*|\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const result: DeliverableItem[] = [];

  for (const part of parts) {
    const md = part.match(/\[([^\]]+)\]\(([^)]+)\)/);
    const normalized = md ? md[2].trim() : part;
    const label = md ? md[1].trim() : normalized;

    if (/^https?:\/\//i.test(normalized)) {
      result.push({ deliverable_type: 'url', title: label, path: normalized });
      continue;
    }
    if (
      normalized.startsWith('/') ||
      normalized.startsWith('~/') ||
      normalized.startsWith('./') ||
      normalized.includes('/')
    ) {
      result.push({ deliverable_type: 'file', title: label, path: normalized });
      continue;
    }
    result.push({ deliverable_type: 'artifact', title: label });
  }
  return result;
}
