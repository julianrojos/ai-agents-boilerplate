# Agent Configuration

This directory is the canonical, tool-neutral source for repository agent configuration.

## Layout

- `rules/`: persistent constraints scoped with `globs`.
- `skills/<name>/SKILL.md`: on-demand capabilities following Agent Skills.
- `workflows/`: repository slash-command procedures loaded through `AGENTS.md`.

## Tool adapters

- Codex reads `AGENTS.md` and `.agents/skills` directly.
- Gemini reads `GEMINI.md`, which imports `AGENTS.md`, and discovers
  `.agents/skills` directly.
- Claude reads `CLAUDE.md`, which imports `AGENTS.md`; `.claude/skills` points
  to the canonical skills directory.
- Cursor reads `AGENTS.md`; `.cursor/rules` and `.cursor/skills` point to the
  canonical directories.

Adapters must contain no copied rules or skills. Run `npm run agents:check`
after changing this structure.
