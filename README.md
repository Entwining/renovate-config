# renovate-config

Shared [Renovate](https://docs.renovatebot.com/) configuration for Entwining repositories, and the agent skill that explains how to extend it.

## Use the preset

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["github>Entwining/renovate-config"]
}
```

The [preset](default.json) gives every repository the same baseline; each rule's description says why it exists. Non-major updates share one pull request that merges once checks pass, except for linters, TypeScript, Bun, and Pi, which each get their own; majors and other breaking updates wait for review. It also waits a week before proposing a release, a day for coding agents, and runs weekly. A tool version that a workflow pins outside a built-in manager's reach goes in a `*_VERSION` variable under a `# renovate: datasource=<datasource> depName=<name>` comment, which Renovate's [`customManagers:githubActionsVersions`](https://docs.renovatebot.com/presets-customManagers/#custommanagersgithubactionsversions) preset updates. A repository adds only what is specific to it: a daily schedule (`"schedule:daily"` after the preset in `extends`), its own groups, and the breaking updates its checks let it merge automatically. Because of this repository's name, Renovate's [onboarding](https://docs.renovatebot.com/config-presets/#grouporganization-level-presets) suggests the preset to new repositories in the organization, as `local>Entwining/renovate-config`, which resolves to the same file.

Presets are read from the default branch, so a change here reaches every repository that extends it on its next Renovate run.

## Agent skill

[`skills/renovate`](skills/renovate/SKILL.md) is the policy behind the preset, written so an agent can apply it to any Renovate configuration, on GitHub or GitLab. It covers grouping, automerge, release ages, schedules, and how to verify a change with Renovate's own rule engine. Install it with the [GitHub CLI](https://cli.github.com/manual/gh_skill_install):

```sh
gh skill install Entwining/renovate-config renovate
```
