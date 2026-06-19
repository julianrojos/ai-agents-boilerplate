import { lstat, readFile, readdir, readlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const defaultRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));

const ALLOWED_AGENTS = new Set([
  'claude',
  'codex',
  'copilot',
  'cursor',
  'gemini',
  'windsurf',
]);
const ALLOWED_DOC_TYPES = new Set(['skill', 'source', 'workflow']);
const ALLOWED_STAGES = new Set(['implementation', 'review', 'skills']);
const SIMPLE_SLOT_TYPES = new Set([
  'boolean',
  'component_name',
  'path',
  'path[]',
  'report',
  'string',
]);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeContent(content) {
  return content.replaceAll('\r\n', '\n');
}

function forEachNonFencedLine(content, callback) {
  const lines = normalizeContent(content).split('\n');
  let fenceMarker = null;

  for (const line of lines) {
    const fenceMatch = line.match(/^(\s*)(```|~~~)/);
    if (fenceMatch) {
      const marker = fenceMatch[2];
      if (fenceMarker === null) {
        fenceMarker = marker;
      } else if (fenceMarker === marker) {
        fenceMarker = null;
      }
      continue;
    }

    if (fenceMarker !== null) continue;
    callback(line);
  }
}

function hasNonFencedLine(content, pattern) {
  let matched = false;
  forEachNonFencedLine(content, (line) => {
    if (!matched && pattern.test(line)) matched = true;
  });
  return matched;
}

function parseFrontmatter(content, relativePath, addError) {
  const match = normalizeContent(content).match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
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
  const match = frontmatter.match(new RegExp(`^${escapeRegExp(key)}:\\s*(.+?)\\s*$`, 'm'));
  return match ? unquote(match[1]) : undefined;
}

function getSectionLines(frontmatter, key) {
  const lines = normalizeContent(frontmatter).split('\n');
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

function getSlots(frontmatter, key, relativePath, addError) {
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
  return Boolean(enumMatch?.[1].split(',').every((value) => value.trim()));
}

function validateSlotNames(slots, kind, relativePath, addError) {
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

function validateInputs(inputs, relativePath, addError) {
  const inputNames = validateSlotNames(inputs, 'input', relativePath, addError);

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

function validateOutputs(outputs, inputNames, relativePath, addError) {
  validateSlotNames(outputs, 'output', relativePath, addError);

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
      const baseName = name.endsWith('_snake_case') ? name.slice(0, -11) : name;
      if (!inputNames.has(baseName)) {
        addError('SLOT01', relativePath, `output "${output.name}" references unknown input "${name}"`);
      }
    }
  }
}

export async function validateAgentConfig({ root = defaultRoot } = {}) {
  const errors = [];

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

  async function checkCanonicalInstructions() {
    const content = await readText('AGENTS.md');
    const requiredHeadings = [
      '## Canonical Source',
      '## Instruction Handling',
      '## Rule Loading',
      '## Skills',
      '## Workflows',
      '## Repository Safety',
    ];

    for (const heading of requiredHeadings) {
      if (!hasNonFencedLine(content, new RegExp(`^${escapeRegExp(heading)}\\s*$`))) {
        addError('CONFIG01', 'AGENTS.md', `missing required heading "${heading}"`);
      }
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

  function validateSkillContract(frontmatter, relativePath) {
    const version = getScalar(frontmatter, 'version');
    if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
      addError('SKILL01', relativePath, 'version must be valid SemVer');
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

    const inputs = getSlots(frontmatter, 'inputs', relativePath, addError);
    const outputs = getSlots(frontmatter, 'outputs', relativePath, addError);
    if (inputs.length === 0) addError('SLOT01', relativePath, 'inputs must not be empty');
    if (outputs.length === 0) addError('SLOT01', relativePath, 'outputs must not be empty');

    const inputNames = validateInputs(inputs, relativePath, addError);
    validateOutputs(outputs, inputNames, relativePath, addError);
  }

  async function checkSkills() {
    const entries = await readdir(join(root, '.agents/skills'), { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillName = entry.name;
      const relativePath = `.agents/skills/${skillName}/SKILL.md`;
      const content = await readText(relativePath);
      const frontmatter = parseFrontmatter(content, relativePath, addError);

      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skillName)) {
        addError('SKILL01', relativePath, 'directory name must be portable kebab-case');
      }
      if (getScalar(frontmatter, 'name') !== skillName) {
        addError('SKILL01', relativePath, `frontmatter name must match directory (${skillName})`);
      }
      if (!getScalar(frontmatter, 'description')) {
        addError('SKILL01', relativePath, 'missing description');
      }

      validateSkillContract(frontmatter, relativePath);
    }
  }

  async function checkWorkflows() {
    const entries = await readdir(join(root, '.agents/workflows'), { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;

      const relativePath = `.agents/workflows/${entry.name}`;
      const command = entry.name.slice(0, -3);
      const content = await readText(relativePath);
      const frontmatter = parseFrontmatter(content, relativePath, addError);

      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(command)) {
        addError('WORKFLOW01', relativePath, 'filename must be kebab-case');
      }
      if (!getScalar(frontmatter, 'description')) {
        addError('WORKFLOW01', relativePath, 'missing description');
      }
      if (!hasNonFencedLine(content, new RegExp(`^# /${escapeRegExp(command)}(?:\\s|$)`))) {
        addError('WORKFLOW01', relativePath, `heading must start with "# /${command} "`);
      }
    }
  }

  async function checkRulesAndManifest() {
    const rulesRoot = join(root, '.agents/rules');
    const entries = await readdir(rulesRoot, { withFileTypes: true });
    const ruleFiles = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.mdc'))
      .map((entry) => entry.name)
      .sort();

    for (const file of ruleFiles) {
      const relativePath = `.agents/rules/${file}`;
      const content = await readText(relativePath);
      const frontmatter = parseFrontmatter(content, relativePath, addError);

      if (!getScalar(frontmatter, 'description') && !getScalar(frontmatter, 'trigger')) {
        addError('RULE01', relativePath, 'missing description or trigger');
      }
      if (!/^(globs|alwaysApply):/m.test(frontmatter)) {
        addError('RULE01', relativePath, 'missing globs or alwaysApply scope');
      }
    }

    const manifestPath = '.agents/rules/_manifest.yml';
    const manifest = await readText(manifestPath);
    const manifestFiles = [...normalizeContent(manifest).matchAll(/^\s+file:\s*(.+\.mdc)\s*$/gm)]
      .map((match) => unquote(match[1]))
      .sort();

    for (const file of ruleFiles) {
      if (!manifestFiles.includes(file)) {
        addError('MANIFEST01', manifestPath, `active rule "${file}" is not registered`);
      }
    }
    for (const file of manifestFiles) {
      if (!ruleFiles.includes(file)) {
        addError('MANIFEST01', manifestPath, `references missing rule "${file}"`);
      }
    }

    const requiredChecks = [
      ['SLOT01', 'skill-input-output-contract'],
      ['SKILL01', 'skill-versioning'],
    ];
    for (const [checkId, ruleId] of requiredChecks) {
      const pattern = new RegExp(
        `^\\s{4}${checkId}:\\n\\s{6}rule_ids:\\s*\\[[^\\]]*${ruleId}[^\\]]*\\]\\n\\s{6}blocking:\\s*true`,
        'm',
      );
      if (!pattern.test(manifest)) {
        addError('MANIFEST01', manifestPath, `${checkId} must block on ${ruleId}`);
      }
    }
  }

  await Promise.all([
    checkCanonicalInstructions(),
    checkImport('CLAUDE.md'),
    checkImport('GEMINI.md'),
    checkSymlink('.claude/skills', '../.agents/skills'),
    checkSymlink('.cursor/rules', '../.agents/rules'),
    checkSymlink('.cursor/skills', '../.agents/skills'),
    checkSkills(),
    checkWorkflows(),
    checkRulesAndManifest(),
  ]);

  return {
    ok: errors.length === 0,
    errors: [...errors].sort(),
  };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const result = await validateAgentConfig();

  if (!result.ok) {
    console.error('Agent configuration is invalid:\n');
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    console.log('Agent configuration is valid.');
    console.log('Native: Codex, Windsurf/Devin, Copilot. Adapters: Claude, Gemini, Cursor.');
  }
}
