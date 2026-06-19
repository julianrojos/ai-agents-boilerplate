# AI Agents Boilerplate

Boilerplate para mantener skills, workflows y rules compatibles entre distintos
agentes de programación con una única fuente de verdad.

## Objetivo

El repositorio separa el contenido canónico de los adaptadores específicos:

- `AGENTS.md`: punto de entrada neutral para instrucciones del repositorio.
- `.agents/rules/`: restricciones persistentes y acotadas por archivos.
- `.agents/skills/`: capacidades bajo demanda basadas en `SKILL.md`.
- `.agents/workflows/`: procedimientos reutilizables invocados por comando o intención.
- `examples/`: configuraciones opinadas que no se activan por defecto.

Los adaptadores nunca deben contener copias manuales del contenido canónico.

## Compatibilidad

| Agente | Instrucciones | Skills | Rules | Adaptador |
| --- | --- | --- | --- | --- |
| Codex | `AGENTS.md` nativo | `.agents/skills` | Mediante `AGENTS.md` | Ninguno |
| Cursor | `AGENTS.md` nativo | `.cursor/skills` | `.cursor/rules` | Symlinks |
| Claude Code | `CLAUDE.md` importa `AGENTS.md` | `.claude/skills` | Mediante `AGENTS.md` | Import + symlink |
| Gemini CLI | `GEMINI.md` importa `AGENTS.md` | `.agents/skills` | Mediante `AGENTS.md` | Import |
| Windsurf / Devin | `AGENTS.md` nativo | Según soporte del cliente | `AGENTS.md` nativo | Ninguno |
| GitHub Copilot | `AGENTS.md` nativo | Según soporte del cliente | `AGENTS.md` nativo | Ninguno |

Un agente puede leer las instrucciones comunes aunque no implemente todos los
mecanismos de activación de skills o rules. La compatibilidad declarada por cada
skill indica dónde se ha diseñado para funcionar, no garantiza que todos los
clientes tengan el mismo sistema de descubrimiento.

## Estructura

```text
.
├── AGENTS.md
├── CLAUDE.md
├── GEMINI.md
├── .agents/
│   ├── README.md
│   ├── rules/
│   │   └── _manifest.yml
│   ├── skills/
│   │   └── example-skill/
│   │       └── SKILL.md
│   └── workflows/
├── .claude/
│   └── skills -> ../.agents/skills
├── .cursor/
│   ├── rules -> ../.agents/rules
│   └── skills -> ../.agents/skills
├── examples/
└── scripts/
    └── validate-agent-config.mjs
```

## Uso

1. Copia el boilerplate en un repositorio.
2. Personaliza `AGENTS.md` con las restricciones globales del proyecto.
3. Añade rules específicas con globs estrechos.
4. Añade skills autocontenidas bajo `.agents/skills/<name>/`.
5. Añade workflows para procedimientos repetibles.
6. Ejecuta la validación.

```bash
npm run agents:check
```

## Principios

- Una única fuente de verdad editable.
- Adaptadores mínimos y verificables.
- Contenido global breve; contexto especializado bajo demanda.
- Rules específicas en lugar de instrucciones universales innecesarias.
- Skills portables aunque un cliente ignore metadatos opcionales.
- Workflows sin dependencias obligatorias de una herramienta concreta.
- Sin ramas, stage ni commits automáticos.

## Ejemplos

- `examples/skills/ux-heuristics`: skill completa con referencias.
- `examples/react-tailwind/rules`: rules opinadas para una arquitectura React y Tailwind.

Los ejemplos no se cargan ni validan como configuración activa.

## Scripts

- `npm run agents:check`: valida estructura, adaptadores, rules, skills,
  workflows y referencias del manifiesto.
- `npm test`: ejecuta los tests unitarios del validador y después `agents:check`.

## Limitaciones

- No existe un estándar universal para workflows.
- Los campos de frontmatter no son interpretados igual por todos los clientes.
- Los symlinks pueden requerir Developer Mode o privilegios equivalentes en
  Windows. Este boilerplate asume soporte real de symlinks para mantener la
  validación contra la fuente canónica.
