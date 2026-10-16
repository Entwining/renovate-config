#!/usr/bin/env node
// Compare how two Renovate configurations treat a checkout's dependencies, using Renovate's own
// extraction, preset resolution, and update flattening (packageRules, update-type sub-configs, and
// branch names). Each extracted dependency gets a synthetic patch, minor, and major update, so the
// output shows the branch, automerge, minimumReleaseAge and its behaviour, rangeStrategy, and
// schedule each configuration would give it; real release lookups are not performed.
//
// Usage:
//   node compare-rules.mjs --renovate <dir> --repo <checkout> --old <config.json> --new <config.json>
//     [--old-preset <owner/repo>=<dir>]... [--preset <owner/repo>=<dir>]... [--all]
//
// --renovate    directory whose node_modules contains the renovate package
// --preset      resolve github>/gitlab>/local> presets of <owner/repo> for the new configuration from <dir>
// --old-preset  the same for the old configuration; without it the old side fetches the preset
// --all         print every update, not only the ones whose treatment differs
//
// Limits: rules that match on data only a lookup provides (matchSourceUrls, which drives most of
// group:monorepos, and matchCurrentAge) never match here, release timestamps are not checked, and
// pin and digest updates are not synthesized. A dependency without a numeric version gets only a
// major update, and its versioning comes from extraction, so packageRules that change versioning
// are not reflected. automerge is per update; a branch merges only when all of its updates allow it.
// An update that one side does not propose, because it is disabled or not extracted, shows as none.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

const { values: args } = parseArgs({
  options: {
    renovate: { type: 'string' },
    repo: { type: 'string' },
    old: { type: 'string' },
    new: { type: 'string' },
    'old-preset': { type: 'string', multiple: true, default: [] },
    preset: { type: 'string', multiple: true, default: [] },
    all: { type: 'boolean', default: false },
  },
});
for (const name of ['renovate', 'repo', 'old', 'new']) {
  if (!args[name]) throw new Error(`--${name} is required`);
}

const packageDir = resolve(args.renovate, 'node_modules/renovate');
const dist = pathToFileURL(join(packageDir, 'dist/'));
const load = (path) => import(new URL(path, dist).href);
const { presetSources, resolveConfigPresets } = await load('config/presets/index.js');
const { flattenUpdates } = await load('workers/repository/updates/flatten.js');
const { getConfig } = await load('config/defaults.js');
const { mergeChildConfig } = await load('config/utils.js');
const versionings = await load('modules/versioning/index.js');
const { getDefaultVersioning } = await load('modules/datasource/common.js');
const { PRESET_DEP_NOT_FOUND, fetchPreset, parsePreset } = await load('config/presets/util.js');

function presetMap(entries) {
  return new Map(
    entries.map((entry) => {
      const [repo, dir] = entry.split('=');
      if (!dir) throw new Error(`expected <owner/repo>=<dir>, got ${entry}`);
      return [repo, dir];
    }),
  );
}

let localPresets;
for (const source of ['github', 'gitlab', 'local']) {
  const realLoad = presetSources[source].load;
  presetSources[source].load = async () => {
    const real = await realLoad();
    return {
      ...real,
      getPreset: async (options) => {
        const dir = localPresets.get(options.repo);
        if (!dir) return real.getPreset(options);
        return fetchPreset({
          repo: options.repo,
          filePreset: options.presetName ?? 'default',
          presetPath: options.presetPath,
          endpoint: '',
          fetch: async (_repo, file) => {
            const path = join(dir, file);
            if (!existsSync(path)) throw new Error(PRESET_DEP_NOT_FOUND);
            return parsePreset(readFileSync(path, 'utf8'), file);
          },
        });
      },
    };
  };
}

async function resolveSide(configPath, presets) {
  localPresets = presets;
  const { $schema, ...repoConfig } = JSON.parse(readFileSync(configPath, 'utf8'));
  return (await resolveConfigPresets(repoConfig)).config;
}

// Each side extracts from a copy of the checkout with that side's resolved configuration as the
// root renovate.json, which Renovate reads before any other config file. The sides keep their own
// managers and customManagers, and presets they extend need not be published yet.
function extract(checkout, repoConfig) {
  const dir = mkdtempSync(join(tmpdir(), 'compare-rules-'));
  try {
    cpSync(checkout, dir, {
      recursive: true,
      filter: (path) => basename(path) !== '.git',
    });
    writeFileSync(join(dir, 'renovate.json'), JSON.stringify(repoConfig));
    const output = execFileSync(
      join(packageDir, '../.bin/renovate'),
      ['--platform=local', '--dry-run=extract', '--repository-cache=disabled'],
      { cwd: dir, env: { ...process.env, LOG_LEVEL: 'info', LOG_FORMAT: 'json' }, encoding: 'utf8', maxBuffer: 1 << 28 },
    );
    for (const line of output.split('\n')) {
      if (!line.includes('"packageFiles"')) continue;
      return JSON.parse(line).packageFiles;
    }
    throw new Error('Renovate printed no packageFiles; run it in the checkout to see why');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function syntheticUpdates(dep) {
  const versioning = versionings.get(dep.versioning ?? getDefaultVersioning(dep.datasource));
  const current = String(dep.currentVersion ?? dep.currentValue ?? '');
  const match = current.match(/\d+(?:\.\d+)*/);
  if (!match) return [{ updateType: 'major', isBreaking: true }];
  const parts = match[0].split('.').map(Number);
  while (parts.length < 3) parts.push(0);
  // isBreaking needs the full current version: a prerelease makes any update breaking.
  const from = versioning.isVersion(current) ? current : parts.join('.');
  return [
    ['patch', 2],
    ['minor', 1],
    ['major', 0],
  ].map(([updateType, index]) => {
    const next = parts.map((value, i) => (i < index ? value : i === index ? value + 1 : 0));
    const newVersion = next.join('.');
    return {
      updateType,
      newVersion,
      newValue: newVersion,
      newMajor: next[0],
      newMinor: next[1],
      newPatch: next[2],
      // Renovate's lookup falls back to the update type when the versioning has no isBreaking.
      isBreaking: versioning.isBreaking ? versioning.isBreaking(from, newVersion) : updateType === 'major',
    };
  });
}

async function treatments(repoConfig) {
  const packageFiles = extract(resolve(args.repo), repoConfig);
  // flattenUpdates drops an update whose dependency has a skipReason; without a token Renovate
  // skips GitHub-hosted lookups, which this comparison does not need.
  for (const files of Object.values(packageFiles)) {
    for (const file of files) {
      for (const dep of file.deps ?? []) {
        if (dep.skipReason === 'github-token-required') delete dep.skipReason;
        dep.updates = dep.depName ? syntheticUpdates(dep) : [];
      }
    }
  }
  const config = mergeChildConfig(getConfig(), repoConfig);
  // Detecting semantic commits reads git history; commit messages are not compared.
  if (config.semanticCommits === 'auto') config.semanticCommits = 'disabled';
  const result = new Map();
  for (const update of await flattenUpdates(config, packageFiles)) {
    const dep = update.depName ? `${update.depName}#${update.depIndex}` : '(lock file maintenance)';
    result.set(`${update.manager}\t${update.packageFile}\t${dep}\t${update.updateType}`, {
      breaking: update.isBreaking,
      branch: update.branchName,
      automerge: Boolean(update.automerge),
      age: update.minimumReleaseAge ?? null,
      ageBehaviour: update.minimumReleaseAgeBehaviour,
      rangeStrategy: update.rangeStrategy,
      schedule: JSON.stringify(update.schedule ?? []),
      updateNotScheduled: update.updateNotScheduled,
    });
  }
  return result;
}

const before = await treatments(await resolveSide(args.old, presetMap(args['old-preset'])));
const after = await treatments(await resolveSide(args.new, presetMap(args.preset)));
const fields = ['branch', 'automerge', 'age', 'ageBehaviour', 'rangeStrategy', 'schedule', 'updateNotScheduled'];
const none = Object.fromEntries(fields.map((field) => [field, 'none']));
let changed = 0;
for (const key of new Set([...before.keys(), ...after.keys()])) {
  const a = before.get(key) ?? none;
  const b = after.get(key) ?? none;
  const differs = fields.filter((field) => a[field] !== b[field]);
  if (differs.length) changed++;
  if (!differs.length && !args.all) continue;
  const detail = fields.map((field) => (a[field] === b[field] ? `${field}=${a[field]}` : `${field}: ${a[field]} -> ${b[field]}`));
  console.log(`${key}\tbreaking=${a.breaking ?? b.breaking}\t${detail.join('\t')}`);
}
console.error(`${new Set([...before.keys(), ...after.keys()]).size} synthetic updates, ${changed} treated differently`);
