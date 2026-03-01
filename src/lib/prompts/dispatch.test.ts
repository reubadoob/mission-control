import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDispatchPrompt,
  DISPATCH_PROMPT_LIMITS,
  estimateTokens,
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

  const sectionTexts = prompt
    .split(/## [A-Z ]+\n/)
    .filter(Boolean)
    .map(section => section.trim());

  assert.equal(sectionTexts.length, 4);
  assert.ok(sectionTexts[0].length <= DISPATCH_PROMPT_LIMITS.systemRole);
  assert.ok(sectionTexts[1].length <= DISPATCH_PROMPT_LIMITS.businessContext);
  assert.ok(sectionTexts[2].length <= DISPATCH_PROMPT_LIMITS.taskSpec);
  assert.ok(sectionTexts[3].length <= DISPATCH_PROMPT_LIMITS.constraints);
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

test('estimateTokens uses chars divided by four rounded up', () => {
  assert.equal(estimateTokens(''), 0);
  assert.equal(estimateTokens('abcd'), 1);
  assert.equal(estimateTokens('abcde'), 2);
  assert.equal(estimateTokens('a'.repeat(40)), 10);
});
