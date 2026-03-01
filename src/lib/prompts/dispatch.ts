export interface DispatchPromptSections {
  systemRole: string;
  businessContext: string;
  taskSpec: string;
  constraints: string;
}

export const DISPATCH_PROMPT_LIMITS = {
  systemRole: 500,
  businessContext: 2000,
  taskSpec: 3000,
  constraints: 800,
} as const;

export function truncateSection(text: string, maxChars: number): string {
  const normalized = text.trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }

  if (maxChars <= 1) {
    return '…'.slice(0, maxChars);
  }

  return `${normalized.slice(0, maxChars - 1).trimEnd()}…`;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function buildDispatchPrompt(sections: DispatchPromptSections): string {
  const systemRole = truncateSection(sections.systemRole, DISPATCH_PROMPT_LIMITS.systemRole);
  const businessContext = truncateSection(sections.businessContext, DISPATCH_PROMPT_LIMITS.businessContext);
  const taskSpec = truncateSection(sections.taskSpec, DISPATCH_PROMPT_LIMITS.taskSpec);
  const constraints = truncateSection(sections.constraints, DISPATCH_PROMPT_LIMITS.constraints);

  return [
    '## SYSTEM ROLE',
    systemRole,
    '',
    '## BUSINESS CONTEXT',
    businessContext,
    '',
    '## TASK SPEC',
    taskSpec,
    '',
    '## CONSTRAINTS',
    constraints,
  ].join('\n');
}
