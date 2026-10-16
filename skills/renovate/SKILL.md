---
name: renovate
description: Decide Renovate dependency-update policy and write it into configuration - which updates share a pull request, which may automerge, how long a release waits (minimumReleaseAge), how often Renovate runs, and what belongs in a shared preset versus a repository's renovate.json - then verify the effective result. Use when creating, changing, simplifying, migrating, or reviewing a Renovate configuration or preset on GitHub or GitLab, or when deciding how a dependency's updates should be grouped, delayed, or merged. Not for fixing the code a Renovate pull request breaks.
---

# Renovate policy

## Read the resolved configuration first

A repository's `renovate.json` is only the last layer. Renovate resolves `extends` in order, merges the repository's own keys last, and appends its `packageRules` after every preset's, so a later rule overrides an earlier one that matches the same update. Read every preset a repository extends before judging or changing it. Entwining repositories extend `github>Entwining/renovate-config`, whose [`default.json`](https://github.com/Entwining/renovate-config/blob/main/default.json) owns the routine group, breaking-update review, release ages, the default schedule, `platformAutomerge`, and groups for packages several repositories share; a repository adds only what is specific to it and does not restate the preset.

Use a built-in preset when one expresses the rule (`config:best-practices`, `group:monorepos`, `packages:linters`, `security:minimumReleaseAge*`); write a rule only for what none covers.

## Decide which pull request an update joins

Non-major updates share one routine group that automerges once checks pass. Majors open their own pull request, or their group's `major-<group>` one, and wait for review. Keep `separateMajorMinor` at its default: a group that also carries an incompatible major fails until someone fixes it, and every routine fix in it waits. Renovate proposes only the newest release in each update bucket, and minor and patch share one, so a 0.x crate's pending breaking minor hides its compatible patch; set `separateMinorPatch` for 0.x crates, matched by `matchCurrentVersion` because the bucket is chosen before an update type exists.

Give a dependency its own group, covering all its update types, when one of these holds, and put the reason in the rule's description:

- **Its updates change what the checks report**, so the pull request may need a fix commit: linters, formatters, type checkers, a toolchain built with warnings denied, a generator whose committed output CI compares.
- **It must move with other packages**: siblings released together from one source repository or SDK family, a host that pins its own packages exactly, plugins whose majors require a matching core or preset major. Establish the coupling from exact-version dependencies, peer ranges, same-day releases, or an upgrade of one package alone failing. `group:monorepos` covers only the source repositories listed in Renovate's `lib/data/monorepo.json`, and its rules come before a preset's routine group, so they keep only majors together; a family that must share a pull request for every update type needs its own rule after the routine group, extending `monorepo:<name>` or matching the package names.
- **A bad release needs its own revert or changes behavior no check observes**: the runtime CI tests with, parsers or libraries whose output is the product's semantics, storage formats.

When every update of a dependency needs review, isolate it with `groupName: null` and `automerge: false` instead. Do not group by category alone ("dev tools", "CI"): unrelated packages in one pull request block each other and revert together.

## Decide what may automerge

A major or other breaking update needs review by default; Renovate's versioning decides what is breaking: for npm any 0.x or prerelease update, for Cargo any prerelease, any 0.0.x update, and a 0.x minor; a versioning without its own rule counts only majors. GitHub Actions versioning misses 0.x minors, so check the `breaking=` column of the comparison below for actions. A repository may list a dependency's breaking updates for automerge only when a pull-request check exercises what changes, and its description names that check. Read the release notes first for effects no check sees, such as defaults that relax a linter or a changed output format; when unsure, leave it unlisted, which costs one manual merge per release. Dependencies that only release, publish, deploy, or tag-push workflows run never automerge their majors, because no pull request exercises them.

Pull requests automerge only when every update in them allows it, so one breaking update in a group holds the whole group for review. Keep `platformAutomerge: false` unless branch protection requires every check that should gate a merge, because the platform's native automerge waits only for required checks.

## Decide how long a release waits

Wait seven days by default; three is acceptable when the repository has a reason. Packages that release almost daily, such as coding agents, wait one day.

- **Floor:** Renovate's `minimumReleaseAge` for a package must be at least every other release-age window that resolves it, such as npm's `min-release-age`, Bun's `minimumReleaseAge`, uv's `exclude-newer`, or a CI flag; otherwise that installer rejects the pin (npm reports `ETARGET`). A shorter Renovate age needs the same package exempted in each of those windows, as npm's `min-release-age-exclude` does.
- **Missing timestamps:** under the default `minimumReleaseAgeBehaviour` (`timestamp-required`), a release without a timestamp never passes. Each datasource's documentation says whether it returns timestamps; GitHub runner labels, Git tags and refs, and Docker registries other than Docker Hub return none. For a datasource that never returns one, set `minimumReleaseAge: null` in a rule matching it; `timestamp-optional` also lets those releases through, but Renovate then reports them as a repository problem on every run. Keep `timestamp-optional` for a datasource whose timestamps depend on the registry, such as Docker, and set it in a rule matching that datasource rather than for everything, so a registry that does return timestamps keeps its wait.
- **What the age does not cover:** lock file maintenance, pins, replacements, and the other update types `security:minimumReleaseAge*` resets carry no release timestamp, so an age rule without that reset holds them forever; a repository rule that sets an age after the reset needs `matchUpdateTypes` that exclude them. With the reset, a lock file maintenance refresh picks up brand-new transitive versions unless the repository commits the package manager's own window, such as `min-release-age` in `.npmrc`; Renovate's npm and Poetry lockfile updates for ordinary updates already apply the age.
- **Security fixes:** pull requests opened for a vulnerability alert ignore `minimumReleaseAge` and `schedule` by default. On GitHub that needs Dependabot alerts enabled on the repository; elsewhere it needs `osvVulnerabilityAlerts: true`. Do not shorten the general age to get fixes sooner.

## Decide the schedule

Check weekly unless the upstream releases more than once a week and the repository adapts to its internals; then check daily and state both facts in the description.

## Decide commit types

Set `semanticCommits` per repository, from the convention it already follows or the release tool that reads commit types. With semantic commits on, `config:recommended` types runtime-dependency updates `fix` and everything else `chore`, so under semantic-release a runtime dependency update publishes a patch.

## Write descriptions

A rule's description says why its matchers and actions are needed, which the keys cannot show; it does not restate `groupName` or `automerge`. A top-level description sits apart from the setting it explains, so it names that setting.

## Verify

1. Run `npx --yes --package renovate renovate-config-validator --strict --no-global <file>` on every changed configuration file.
2. Compare the effective treatment before and after with [`scripts/compare-rules.mjs`](scripts/compare-rules.mjs); without this skill's directory, save it from `gh repo read-file skills/renovate/scripts/compare-rules.mjs -R Entwining/renovate-config`. Install Renovate into a temporary directory with `npm install --prefix <dir> renovate --ignore-scripts`, then run `node scripts/compare-rules.mjs --renovate <dir> --repo <checkout> --old <old.json> --new <new.json>`. Pass `--preset <owner/repo>=<dir>` to resolve a preset for the new side from a local directory, and `--old-preset` for the old side. Explain every update whose treatment changes; one you did not intend is a defect.
3. A preset change reaches every repository that extends it on that repository's next run, because presets are read from the default branch. Before pushing it, compare each such repository with its unchanged configuration as both `--old` and `--new`, the current preset as `--old-preset`, and the candidate as `--preset`.
