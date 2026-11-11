# Using the shared preset

## Repository overrides

Put repository-specific presets after `github>Entwining/renovate-config` in `extends`. For example, this configuration replaces the weekly schedule with a daily one:

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["github>Entwining/renovate-config", "schedule:daily"]
}
```

A repository adds its own groups and the breaking updates its checks let it merge automatically. The [shared preset](../default.json) owns the baseline rules and their reasons.

Renovate reads the preset from the default branch. A change here reaches every repository that extends it on its next Renovate run.

Because this repository is named `renovate-config`, Renovate's [organization-level onboarding](https://docs.renovatebot.com/config-presets/#grouporganization-level-presets) suggests it to new Entwining repositories as `local>Entwining/renovate-config`. That reference resolves to the same file as `github>Entwining/renovate-config`.

## Workflow tool pins

For a tool version outside a built-in manager's reach, put a `*_VERSION` variable under a `# renovate: datasource=<datasource> depName=<name>` comment in the workflow. The preset includes Renovate's [`customManagers:githubActionsVersions`](https://docs.renovatebot.com/presets-customManagers/#custommanagersgithubactionsversions) to update these pins. The [Check workflow](../.github/workflows/check.yml) uses this form for Renovate itself.

## Agent skill

The [Renovate skill](../skills/renovate/SKILL.md) is the policy behind the preset. It applies to Renovate configurations on GitHub or GitLab.

Entwining repositories tell agents to read it through `AGENTS.md` before changing their Renovate configuration. With the [GitHub CLI](https://cli.github.com/), read it without installing a copy:

```sh
gh repo read-file skills/renovate/SKILL.md -R Entwining/renovate-config
```

To make it available in every repository instead, install it:

```sh
gh skill install Entwining/renovate-config renovate
```
