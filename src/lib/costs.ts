// Approximate token costs per model (per 1M tokens, blended input+output estimate)
const MODEL_COSTS_PER_1M: Record<string, number> = {
  'anthropic/claude-sonnet-4-6': 4.50,
  'anthropic/claude-opus-4-6': 22.50,
  'openai-codex/gpt-5.3-codex': 3.00,
  'openai/gpt-5-mini': 0.30,
  'google/gemini-3-pro-preview': 2.00,
  default: 4.50,
};

export function estimateCostUsd(tokens: number, model: string): number {
  const rate = MODEL_COSTS_PER_1M[model] ?? MODEL_COSTS_PER_1M.default;
  return parseFloat(((tokens / 1_000_000) * rate).toFixed(6));
}

export function estimateTokenCount(text: string): number {
  // ~4 chars per token approximation
  return Math.ceil(text.length / 4);
}
