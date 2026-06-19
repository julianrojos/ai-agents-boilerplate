# AGENTS.md

Operational instructions for AI agents in this repository.

## Canonical Source

- `AGENTS.md` and `.agents/` are the tool-neutral source of truth.
- Tool-specific files are adapters only. Do not duplicate canonical content there.
- Run `npm run agents:check` after changing agent configuration.

## Instruction Handling

- Platform and client instructions retain their own precedence.
- Explicit task instructions from the user override repository defaults unless
  they conflict with platform, safety, or security constraints.
- Apply only the repository rules relevant to the files and task in scope.
- When instructions conflict at the same level, prefer the more specific one and
  report unresolved ambiguity.

## Rule Loading

- Rules live in `.agents/rules/*.mdc`.
- Each rule declares its scope with `globs` or `alwaysApply` frontmatter.
- Use `.agents/rules/_manifest.yml` for discovery by document type or stage.
- Load only matching rules. Do not treat examples as active configuration.

## Skills

- Skills live in `.agents/skills/<name>/SKILL.md`.
- Skill directories use lowercase kebab-case and match the frontmatter `name`.
- Trigger a skill when the user names it or the task clearly matches its description.
- Resolve relative references from the skill directory.
- Prefer the smallest set of skills that fully covers the task.

## Workflows

- Workflows live in `.agents/workflows/<command>.md`.
- Trigger a workflow when the user invokes `/<command>` or the task clearly
  matches its frontmatter description.
- Follow a triggered workflow as the authoritative procedure for that command.
- `// turbo` marks read-only steps that may run in parallel.
- Applicable rules still govern files produced by a workflow.

## Repository Safety

- Work on the currently active branch.
- Do not create branches or worktrees unless the user explicitly requests one.
- Do not stage, commit, push, rebase, or rewrite history without explicit user
  authorization.
- Never discard user changes that are outside the requested scope.
