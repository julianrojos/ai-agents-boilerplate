import { lstat, readFile, readdir, readlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const errors = [];

const ALLOWED_AGENTS = new Set(['claude', 'codex', 'cursor', 'gemini']);
const ALLOWED_DOC_TYPES = new Set([
  'component',
  'frontend',
  'overview',
  'skills',
  'spec',
  'workflow',
]);
const ALLOWED_STAGES = new Set([
  'figma',
  'frontend',
  'markdown',
  'pipeline',
  'skills',
  'spec',
  'visual-proof',
]);
const SIMPLE_SLOT_TYPES = new Set([
  'boolean',
  'component_name',
  'path',
  'path[]',
  'report',
  'string',
]);

function addError(code, relativePath, message) {
  errors.push(`[${code}] ${relativePath}: ${message}`);
}

async function readText(relativePath) {
  try {
    return await readFile(join(root, relativePath), 'utf8');
  } catch {
    addError('CONFIG01', relativePath, 'missing or unreadable');
    return '';
  }
}

async function checkImport(relativePath) {
  const content = (await readText(relativePath)).trim();
  if (content !== '@AGENTS.md') {
    addError('CONFIG01', relativePath, 'must contain only @AGENTS.md');
  }
}

async function checkSymlink(relativePath, expectedTarget) {
  const absolutePath = join(root, relativePath);

  try {
    const stats = await lstat(absolutePath);
    if (!stats.isSymbolicLink()) {
      addError('CONFIG01', relativePath, 'must be a symbolic link');
      return;
    }

    const target = await readlink(absolutePath);
    if (target !== expectedTarget) {
      addError('CONFIG01', relativePath, `expected link target ${expectedTarget}, found ${target}`);
    }
  } catch {
    addError('CONFIG01', relativePath, 'missing symbolic link');
  }
}

function parseFrontmatter(content, relativePath) {
  const match = content.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!match) {
    addError('CONFIG01', relativePath, 'missing YAML frontmatter');
    return '';
  }
  return match[1];
}

function unquote(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function getScalar(frontmatter, key) {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(.+?)\\s*$`, 'm'));
  return match ? unquote(match[1]) : undefined;
}

function getSectionLines(frontmatter, key) {
  const lines = frontmatter.split('\n');
  const start = lines.findIndex((line) => line === `${key}:`);
  if (start === -1) return [];

  const section = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^[^\s]/.test(line)) break;
    section.push(line);
  }
  return section;
}

function getObject(frontmatter, key) {
  const result = {};
  for (const line of getSectionLines(frontmatter, key)) {
    const match = line.match(/^\s{2}([a-z_]+):\s*(.+?)\s*$/);
    if (match) result[match[1]] = unquote(match[2]);
  }
  return result;
}

function getList(frontmatter, key) {
  return getSectionLines(frontmatter, key)
    .map((line) => line.match(/^\s{2}-\s*(.+?)\s*$/)?.[1])
    .filter(Boolean)
    .map(unquote);
}

function getSlots(frontmatter, key, relativePath) {
  const slots = [];
  let current;

  for (const line of getSectionLines(frontmatter, key)) {
    const itemMatch = line.match(/^\s{2}-\s+name:\s*(.+?)\s*$/);
    if (itemMatch) {
      current = { name: unquote(itemMatch[1]) };
      slots.push(current);
      continue;
    }

    const propertyMatch = line.match(/^\s{4}([a-z_]+):\s*(.*?)\s*$/);
    if (propertyMatch && current) {
      current[propertyMatch[1]] = unquote(propertyMatch[2]);
      continue;
    }

    if (line.trim() && !current) {
      addError('SLOT01', relativePath, `${key} must start each slot with "- name:"`);
    }
  }

  return slots;
}

function isValidSlotType(type) {
  if (SIMPLE_SLOT_TYPES.has(type)) return true;
  const enumMatch = type.match(/^enum\(([^)]+)\)$/);
  if (!enumMatch) return false;
  return enumMatch[1].split(',').every((value) => value.trim().length > 0);
}

function validateSlotNames(slots, kind, relativePath) {
  const names = new Set();

  for (const slot of slots) {
    if (!/^[a-z][a-z0-9_]*$/.test(slot.name ?? '')) {
      addError('SLOT01', relativePath, `${kind} slot name must be snake_case`);
    }
    if (names.has(slot.name)) {
      addError('SLOT01', relativePath, `duplicate ${kind} slot "${slot.name}"`);
    }
    names.add(slot.name);
  }

  return names;
}

function validateInputs(inputs, relativePath) {
  const inputNames = validateSlotNames(inputs, 'input', relativePath);

  for (const input of inputs) {
    if (!isValidSlotType(input.type ?? '')) {
      addError('SLOT01', relativePath, `input "${input.name}" has invalid type`);
    }
    if (!['true', 'false'].includes(input.required)) {
      addError('SLOT01', relativePath, `input "${input.name}" must declare required: true|false`);
    }
    if (!input.description) {
      addError('SLOT01', relativePath, `input "${input.name}" needs a description`);
    }
    if (input.required === 'true' && input.default !== undefined) {
      addError('SLOT01', relativePath, `required input "${input.name}" must not declare a default`);
    }
  }

  return inputNames;
}

function validateOutputs(outputs, inputNames, relativePath) {
  validateSlotNames(outputs, 'output', relativePath);

  for (const output of outputs) {
    if (!isValidSlotType(output.type ?? '')) {
      addError('SLOT01', relativePath, `output "${output.name}" has invalid type`);
    }
    if (!output.description) {
      addError('SLOT01', relativePath, `output "${output.name}" needs a description`);
    }
    if (output.type === 'report' && output.value !== undefined) {
      addError('SLOT01', relativePath, `report output "${output.name}" must not have value`);
    }
    if (output.type !== 'report' && output.value === undefined) {
      addError('SLOT01', relativePath, `output "${output.name}" must declare value`);
    }
    if (output.conditional !== undefined && !['true', 'false'].includes(output.conditional)) {
      addError('SLOT01', relativePath, `output "${output.name}" conditional must be true|false`);
    }
    if (output.conditional === 'true' && !output.condition) {
      addError('SLOT01', relativePath, `conditional output "${output.name}" needs condition`);
    }

    for (const variable of output.value?.matchAll(/\$\{([a-z][a-z0-9_]*)\}/g) ?? []) {
      const name = variable[1];
      const baseName = name.endsWith('_snake_case') ? name.slice(0, -'_snake_case'.length) : name;
      if (!inputNames.has(baseName)) {
        addError(
          'SLOT01',
          relativePath,
          `output "${output.name}" references unknown input "${name}"`,
        );
      }
    }
  }
}

function validateSkillContract(frontmatter, relativePath) {
  const version = getScalar(frontmatter, 'version');
  if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    addError('SKILL01', relativePath, 'version must be a valid SemVer string');
  }

  const context = getObject(frontmatter, 'context');
  if (!ALLOWED_DOC_TYPES.has(context.doc_type)) {
    addError('SKILL01', relativePath, 'context.doc_type is missing or invalid');
  }
  if (!ALLOWED_STAGES.has(context.stage)) {
    addError('SKILL01', relativePath, 'context.stage is missing or invalid');
  }

  const compatibleAgents = getList(frontmatter, 'compatible_agents');
  if (compatibleAgents.length === 0) {
    addError('SKILL01', relativePath, 'compatible_agents must not be empty');
  }
  for (const agent of compatibleAgents) {
    if (!ALLOWED_AGENTS.has(agent)) {
      addError('SKILL01', relativePath, `unsupported compatible agent "${agent}"`);
    }
  }

  const inputs = getSlots(frontmatter, 'inputs', relativePath);
  const outputs = getSlots(frontmatter, 'outputs', relativePath);
  if (inputs.length === 0) {
    addError('SLOT01', relativePath, 'inputs must declare at least one slot');
  }
  if (outputs.length === 0) {
    addError('SLOT01', relativePath, 'outputs must declare at least one slot');
  }

  const inputNames = validateInputs(inputs, relativePath);
  validateOutputs(outputs, inputNames, relativePath);
}

async function checkSkills() {
  const skillsRoot = join(root, '.agents/skills');
  const entries = await readdir(skillsRoot, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const skillName = entry.name;
    const relativePath = `.agents/skills/${skillName}/SKILL.md`;
    const content = await readText(relativePath);
    const frontmatter = parseFrontmatter(content, relativePath);

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skillName)) {
      addError('SKILL01', relativePath, 'directory name is not portable kebab-case');
    }

    const declaredName = getScalar(frontmatter, 'name');
    if (declaredName !== skillName) {
      addError('SKILL01', relativePath, `frontmatter name must match directory (${skillName})`);
    }
    if (!getScalar(frontmatter, 'description')) {
      addError('SKILL01', relativePath, 'missing non-empty description');
    }

    validateSkillContract(frontmatter, relativePath);
  }
}

async function checkWorkflows() {
  const workflowsRoot = join(root, '.agents/workflows');
  const entries = await readdir(workflowsRoot, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;

    const relativePath = `.agents/workflows/${entry.name}`;
    const content = await readText(relativePath);
    const frontmatter = parseFrontmatter(content, relativePath);

    if (!getScalar(frontmatter, 'description')) {
      addError('CONFIG01', relativePath, 'missing non-empty description');
    }
    if (!/^# \/[A-Za-z][A-Za-z0-9-]*/m.test(content)) {
      addError('CONFIG01', relativePath, 'missing # /command heading');
    }
  }
}

async function checkRules() {
  const rulesRoot = join(root, '.agents/rules');
  const entries = await readdir(rulesRoot, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.mdc')) continue;

    const relativePath = `.agents/rules/${entry.name}`;
    const content = await readText(relativePath);
    const frontmatter = parseFrontmatter(content, relativePath);

    if (!getScalar(frontmatter, 'description') && !getScalar(frontmatter, 'trigger')) {
      addError('CONFIG01', relativePath, 'missing description or trigger');
    }
    if (!/^(globs|alwaysApply):/m.test(frontmatter)) {
      addError('CONFIG01', relativePath, 'missing globs or alwaysApply scope');
    }
  }
}

async function checkManifest() {
  const relativePath = '.agents/rules/_manifest.yml';
  const content = await readText(relativePath);

  const requiredChecks = [
    ['SLOT01', 'skill-input-output-contract'],
    ['SKILL01', 'skill-versioning'],
  ];
  for (const [checkId, ruleId] of requiredChecks) {
    const pattern = new RegExp(
      `^\\s{4}${checkId}:\\n\\s{6}rule_ids:\\s*\\[[^\\]]*${ruleId}[^\\]]*\\]\\n\\s{6}blocking:\\s*true`,
      'm',
    );
    if (!pattern.test(content)) {
      addError('CONFIG01', relativePath, `${checkId} must be registered as blocking for ${ruleId}`);
    }
  }
}

await Promise.all([
  checkImport('CLAUDE.md'),
  checkImport('GEMINI.md'),
  checkSymlink('.claude/skills', '../.agents/skills'),
  checkSymlink('.cursor/rules', '../.agents/rules'),
  checkSymlink('.cursor/skills', '../.agents/skills'),
  checkSkills(),
  checkWorkflows(),
  checkRules(),
  checkManifest(),
]);

if (errors.length > 0) {
  console.error('Agent configuration is invalid:\n');
  for (const error of errors.sort()) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('Agent configuration is valid.');
  console.log('Canonical skills: .agents/skills; adapters: Claude, Gemini, Cursor, Codex.');
}
