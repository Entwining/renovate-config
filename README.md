# renovate-config

Shared [Renovate](https://docs.renovatebot.com/) configuration for Entwining repositories. An agent skill explains how to extend the preset on GitHub or GitLab.

## Group dependency updates

The [preset](default.json) groups routine updates into pull requests that merge after all checks pass. Linters, TypeScript, Bun, and Pi have their own groups. Major and other breaking updates wait for review.

Compatible 0.x crate patches use a separate update bucket. A pending breaking minor does not hide them. GitHub Actions updates are not yet classified as breaking by Renovate.

## Wait before updating

Renovate proposes updates weekly by default. New releases normally wait seven days. Claude Code and Pi releases wait one day.

The [release-age rules](default.json) handle sources and update types without release timestamps. Repositories can override the schedule and add their own groups.

## Use the preset

Add the preset to your repository's Renovate configuration:

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["github>Entwining/renovate-config"]
}
```

Changes to this preset reach consumers on their next Renovate run. The [configuration guide](docs/usage.md) covers repository overrides and workflow tool pins.

## Agent skill

The [Renovate skill](skills/renovate/SKILL.md) explains the grouping and automerge policy. It also covers release ages, schedules, and verification with Renovate's rule engine.

Entwining repositories point agents to the skill from `AGENTS.md`. Nothing needs installing. The [skill access instructions](docs/usage.md#agent-skill) also support repositories outside Entwining.
