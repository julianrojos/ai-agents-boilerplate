# Agent Configuration

This directory is the canonical, tool-neutral source for repository agent
configuration.

## Layout

- `rules/`: persistent constraints scoped with frontmatter.
- `skills/<name>/SKILL.md`: on-demand, portable capabilities.
- `workflows/`: repository procedures triggered by command or intent.

## Active Configuration

Only files under `.agents/` are active. Opinionated or technology-specific
material belongs under `examples/` until explicitly copied into the active
configuration.

## Adapter Strategy

- Codex, Windsurf/Devin, and GitHub Copilot read `AGENTS.md` directly.
- Claude Code reads `CLAUDE.md`, which imports `AGENTS.md`.
- Gemini CLI reads `GEMINI.md`, which imports `AGENTS.md`.
- Cursor reads `AGENTS.md`.
- `.claude/skills`, `.cursor/skills`, and `.cursor/rules` are symlinks to the
  canonical directories.

Do not create adapters when a client already supports `AGENTS.md`. Do not copy
canonical content manually into adapters.

Run `npm run agents:check` after changing this structure.
