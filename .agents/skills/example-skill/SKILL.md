---
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

## When to use this skill

Use this skill when the user explicitly asks for `example-skill` or wants to
verify that repository skill discovery works.

## Procedure

1. Read the required `topic` input.
2. Return one concise paragraph about the topic.
3. State that the response was produced by `example-skill`.
