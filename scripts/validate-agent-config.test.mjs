import assert from 'node:assert/strict';
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { validateAgentConfig } from './validate-agent-config.mjs';

const ruleContents = {
  'general-programming-principles.mdc': `---
description: "Tool-neutral programming and delivery principles."
globs:
  - "**/*.{ts,tsx}"
---
# General Programming Principles
`,
  'git-constraints.mdc': `---
description: "No git history changes without explicit authorization."
globs:
  - "**/*"
alwaysApply: true
---
# Git Constraints
`,
  'review-judge-workflow-format.mdc': `---
description: "Workflow format contract."
globs:
  - "**/*"
alwaysApply: true
---
# Review and Judge Format
`,
  'skill-input-output-contract.mdc': `---
description: "Typed input/output slot contract for SKILL.md files."
globs:
  - ".agents/skills/**/SKILL.md"
---
# Skill Input/Output Slot Contract
`,
  'skill-versioning.mdc': `---
description: "Version and compatibility contract for active repository skills."
globs:
  - ".agents/skills/**/SKILL.md"
---
# Skill Versioning
`,
};

const validAgentsMd = `# AGENTS.md

## Canonical Source

## Instruction Handling

## Rule Loading

## Skills

## Workflows

## Repository Safety
`;

const fencedAgentsMd = `# AGENTS.md

\`\`\`md
## Canonical Source
## Instruction Handling
## Rule Loading
## Skills
## Workflows
## Repository Safety
\`\`\`
`;

const validWorkflowMd = `---
description: "Review workflow."
---
# /review — Pre-commit code review
`;

const fencedWorkflowMd = `---
description: "Review workflow."
---
\`\`\`md
# /review — Pre-commit code review
\`\`\`
`;

const skillMd = `---
name: example-skill
description: "Demonstrate the minimum portable structure of a repository skill."
version: "1.0.0"
context:
  doc_type: skill
  stage: skills
compatible_agents:
  - codex
  - claude
  - cursor
  - gemini
  - windsurf
  - copilot
inputs:
  - name: topic
    type: string
    required: true
    description: "Topic the example response should address."
outputs:
  - name: result
    type: report
    description: "A concise response showing that the skill was applied."
---
# Example Skill
`;

function buildManifest(fileIndent = '    ') {
  return `version: 1

rules:
 - id: general-programming-principles
${fileIndent}file: general-programming-principles.mdc
 - id: git-constraints
${fileIndent}file: git-constraints.mdc
 - id: review-judge-workflow-format
${fileIndent}file: review-judge-workflow-format.mdc
 - id: skill-input-output-contract
${fileIndent}file: skill-input-output-contract.mdc
 - id: skill-versioning
${fileIndent}file: skill-versioning.mdc

validation:
  checks:
    GIT01:
      rule_ids: [git-constraints]
      blocking: true
    SLOT01:
      rule_ids: [skill-input-output-contract]
      blocking: true
    SKILL01:
      rule_ids: [skill-versioning]
      blocking: true
    WORKFLOW01:
      rule_ids: [review-judge-workflow-format]
      blocking: true

matrix:
  by_doc_type:
    source: [general-programming-principles, git-constraints]
    skill: [skill-input-output-contract, skill-versioning, general-programming-principles, git-constraints]
    workflow: [review-judge-workflow-format, git-constraints]
  by_stage:
    implementation: [general-programming-principles, git-constraints]
    review: [review-judge-workflow-format, git-constraints]
    skills: [skill-input-output-contract, skill-versioning, general-programming-principles, git-constraints]
`;
}

async function writeFileTree(root, relativePath, contents) {
  const filePath = join(root, relativePath);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, 'utf8');
}

async function createFixture({
  agentsMd = validAgentsMd,
  workflowMd = validWorkflowMd,
  manifestIndent = '    ',
} = {}) {
  const root = await mkdtemp(join(tmpdir(), 'agent-config-'));

  await mkdir(join(root, '.agents/rules'), { recursive: true });
  await mkdir(join(root, '.agents/skills/example-skill'), { recursive: true });
  await mkdir(join(root, '.agents/workflows'), { recursive: true });
  await mkdir(join(root, '.claude'), { recursive: true });
  await mkdir(join(root, '.cursor'), { recursive: true });

  await writeFileTree(root, 'AGENTS.md', agentsMd);
  await writeFileTree(root, 'CLAUDE.md', '@AGENTS.md\n');
  await writeFileTree(root, 'GEMINI.md', '@AGENTS.md\n');

  for (const [file, contents] of Object.entries(ruleContents)) {
    await writeFileTree(root, join('.agents/rules', file), contents);
  }

  await writeFileTree(root, '.agents/skills/example-skill/SKILL.md', skillMd);
  await writeFileTree(root, '.agents/workflows/review.md', workflowMd);
  await writeFileTree(root, '.agents/rules/_manifest.yml', buildManifest(manifestIndent));

  await symlink('../.agents/skills', join(root, '.claude/skills'));
  await symlink('../.agents/rules', join(root, '.cursor/rules'));
  await symlink('../.agents/skills', join(root, '.cursor/skills'));

  return root;
}

test('accepts a valid fixture with nonstandard manifest indentation', async () => {
  const root = await createFixture({ manifestIndent: '   ' });
  const result = await validateAgentConfig({ root });

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test('rejects headings that only exist inside fenced blocks in AGENTS.md', async () => {
  const root = await createFixture({ agentsMd: fencedAgentsMd });
  const result = await validateAgentConfig({ root });

  assert.equal(result.ok, false);
  assert.match(
    result.errors.join('\n'),
    /AGENTS\.md: missing required heading "## Canonical Source"/,
  );
});

test('rejects workflow headings that only exist inside fenced blocks', async () => {
  const root = await createFixture({ workflowMd: fencedWorkflowMd });
  const result = await validateAgentConfig({ root });

  assert.equal(result.ok, false);
  assert.match(
    result.errors.join('\n'),
    /\.agents\/workflows\/review\.md: heading must start with "# \/review "/,
  );
});
