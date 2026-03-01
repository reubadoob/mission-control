export interface DispatchPromptSections {
  systemRole: string;
  businessContext: string;
  taskSpec: string;
  constraints: string;
}

export const REQUIRED_FINAL_OUTPUT_SECTION = `## ⚠️ REQUIRED FINAL OUTPUT — DO NOT SKIP

Your absolute last output MUST be this exact format (one line):

TASK_COMPLETE: <one sentence summary of what was accomplished> | deliverables: <comma-separated list of PR URLs or file paths (leave blank if none)>

Rules:
- This line is REQUIRED. Mission Control will not close your task without it.
- It must be the FINAL line of your entire response.
- Do not add anything after it.
- If you were blocked and could not complete: emit BLOCKED: <reason> | need: <what you need to proceed> | meanwhile: <what the user can do while waiting>.

Example:
TASK_COMPLETE: Implemented GitHub webhook endpoint with HMAC verification and SSE broadcast | deliverables: https://github.com/<org>/<repo>/pull/<id>`;

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
    '',
    REQUIRED_FINAL_OUTPUT_SECTION,
  ].join('\n');
}
