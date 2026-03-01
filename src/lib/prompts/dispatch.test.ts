import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDispatchPrompt,
  DISPATCH_PROMPT_LIMITS,
  estimateTokens,
  REQUIRED_FINAL_OUTPUT_SECTION,
  truncateSection,
} from './dispatch';

test('truncateSection enforces max chars with ellipsis', () => {
  const longText = 'a'.repeat(DISPATCH_PROMPT_LIMITS.systemRole + 50);
  const truncated = truncateSection(longText, DISPATCH_PROMPT_LIMITS.systemRole);

  assert.equal(truncated.length, DISPATCH_PROMPT_LIMITS.systemRole);
  assert.equal(truncated.endsWith('…'), true);
});

test('buildDispatchPrompt truncates each section by configured limits', () => {
  const prompt = buildDispatchPrompt({
    systemRole: 's'.repeat(DISPATCH_PROMPT_LIMITS.systemRole + 10),
    businessContext: 'b'.repeat(DISPATCH_PROMPT_LIMITS.businessContext + 10),
    taskSpec: 't'.repeat(DISPATCH_PROMPT_LIMITS.taskSpec + 10),
    constraints: 'c'.repeat(DISPATCH_PROMPT_LIMITS.constraints + 10),
  });

  const extractSection = (regex: RegExp): string => {
    const match = prompt.match(regex);
    assert.ok(match, 'expected section not found');
    return match[1] ?? '';
  };

  const systemRole = extractSection(/## SYSTEM ROLE\n([\s\S]*?)\n\n## BUSINESS CONTEXT/);
  const businessContext = extractSection(/## BUSINESS CONTEXT\n([\s\S]*?)\n\n## TASK SPEC/);
  const taskSpec = extractSection(/## TASK SPEC\n([\s\S]*?)\n\n## CONSTRAINTS/);
  const constraints = extractSection(/## CONSTRAINTS\n([\s\S]*?)\n\n## ⚠️ REQUIRED FINAL OUTPUT/);

  assert.ok(systemRole.length <= DISPATCH_PROMPT_LIMITS.systemRole);
  assert.ok(businessContext.length <= DISPATCH_PROMPT_LIMITS.businessContext);
  assert.ok(taskSpec.length <= DISPATCH_PROMPT_LIMITS.taskSpec);
  assert.ok(constraints.length <= DISPATCH_PROMPT_LIMITS.constraints);
});

test('buildDispatchPrompt composes ordered section headers', () => {
  const prompt = buildDispatchPrompt({
    systemRole: 'System',
    businessContext: 'Business',
    taskSpec: 'Task',
    constraints: 'Constraints',
  });

  assert.match(
    prompt,
    /## SYSTEM ROLE\nSystem\n\n## BUSINESS CONTEXT\nBusiness\n\n## TASK SPEC\nTask\n\n## CONSTRAINTS\nConstraints/
  );
});

test('buildDispatchPrompt always ends with required final output section', () => {
  const prompt = buildDispatchPrompt({
    systemRole: 'System role with extra spacing   ',
    businessContext: `Business context ${'b'.repeat(5000)}`,
    taskSpec: `Task spec ${'t'.repeat(5000)}`,
    constraints: `Constraints ${'c'.repeat(5000)}`,
  });

  assert.equal(prompt.endsWith(REQUIRED_FINAL_OUTPUT_SECTION), true);
});

test('estimateTokens uses chars divided by four rounded up', () => {
  assert.equal(estimateTokens(''), 0);
  assert.equal(estimateTokens('abcd'), 1);
  assert.equal(estimateTokens('abcde'), 2);
  assert.equal(estimateTokens('a'.repeat(40)), 10);
});
