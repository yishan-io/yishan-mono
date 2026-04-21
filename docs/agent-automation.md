# Agent Automation

This repository keeps automation logic agent-agnostic.

## Canonical Skill Source

- Canonical skill instructions live in `.agents/skills/*.md`.
- Generated runtime wrappers live in:
  - `.codex/skills/*/SKILL.md`
  - `.claude/skills/*/SKILL.md`
- Regenerate wrappers after editing canonical files:

```bash
bun run skills:sync
```

## Shared Scripts (Source of Truth)

- `scripts/automation/create-work-item-issue.sh`
- `scripts/automation/collect-review-context.sh`
- `scripts/automation/create-pr-from-template.sh`

These scripts are the canonical implementation. Agent-specific wrappers should call these scripts instead of duplicating logic.

## Agent Entry Points

- Canonical skill docs:
  - `.agents/skills/create-github-issue.md`
  - `.agents/skills/code-review.md`
  - `.agents/skills/pr-skill.md`
- Agents commands:
  - `.agents/commands/create-github-issue.md`
  - `.agents/commands/review-code.md`
  - `.agents/commands/create-pr.md`
- Generated wrappers:
  - `.codex/skills/*/SKILL.md`
  - `.claude/skills/*/SKILL.md`

## Rule

When behavior changes, update shared scripts first. When skill behavior changes, update `.agents/skills` and run `bun run skills:sync`.
