#!/usr/bin/env node
/**
 * Release helper: the git tag is the single source of truth for versions.
 *
 * This script keeps the two version-bearing files in sync, then commits,
 * tags and pushes — one command per release:
 *
 *   npm run release -- patch          # 1.2.0 -> 1.2.1
 *   npm run release -- minor          # 1.2.0 -> 1.3.0
 *   npm run release -- major          # 1.2.0 -> 2.0.0
 *   npm run release -- 1.3.0          # explicit version
 *
 * Flags:
 *   --dry-run   print what would happen, change nothing
 *   --no-push   edit, commit and tag, but do not push (local testing)
 *
 * After pushing the tag, .github/workflows/release.yml builds the per-ABI
 * release APKs and publishes the GitHub release automatically.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PKG = path.join(root, 'package.json');
const GRADLE = path.join(root, 'android/app/build.gradle.kts');

function git(...args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function fail(msg) {
  console.error(`✖ ${msg}`);
  process.exit(1);
}

// --- parse args -----------------------------------------------------------

const args = process.argv.slice(2).filter(Boolean);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const positional = args.filter((a) => !a.startsWith('--'));
if (flags.has('help') || flags.has('--help')) {
  console.log('Usage: npm run release -- patch|minor|major|x.y.z [--dry-run] [--no-push]');
  process.exit(0);
}
const dryRun = flags.has('--dry-run');
const noPush = flags.has('--no-push');

const [bumpOrVersion] = positional;
if (!bumpOrVersion || positional.length > 1) {
  fail('usage: npm run release -- patch|minor|major|x.y.z [--dry-run] [--no-push]');
}

// --- compute new version --------------------------------------------------

const pkg = JSON.parse(readFileSync(PKG, 'utf8'));
const current = String(pkg.version);
if (!/^\d+\.\d+\.\d+$/.test(current)) fail(`package.json version "${current}" is not semver`);

const parts = current.split('.').map(Number);
let next;
if (bumpOrVersion === 'patch') next = `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
else if (bumpOrVersion === 'minor') next = `${parts[0]}.${parts[1] + 1}.0`;
else if (bumpOrVersion === 'major') next = `${parts[0] + 1}.0.0`;
else {
  if (!/^\d+\.\d+\.\d+$/.test(bumpOrVersion)) fail(`version must be x.y.z, got "${bumpOrVersion}"`);
  next = bumpOrVersion;
}
const tag = `v${next}`;

if (dryRun) {
  const gradle = readFileSync(GRADLE, 'utf8');
  const codeMatch = gradle.match(/versionCode\s*=\s*(\d+)/);
  console.log(`current:  ${current}  (versionCode ${codeMatch?.[1] ?? '?'})`);
  console.log(`next:     ${next}  (versionCode ${codeMatch ? Number(codeMatch[1]) + 1 : '?'})`);
  console.log(`would:    commit + tag ${tag}${noPush ? '' : ' + push branch and tag'}`);
  process.exit(0);
}

// --- preflight -----------------------------------------------------------

const dirty = git('status', '--porcelain');
if (dirty) fail(`working tree is not clean — commit or stash first:\n${dirty}`);

const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
const tagExists = git('tag', '-l', tag);
if (tagExists) fail(`tag ${tag} already exists — use a new version`);

// --- write files ----------------------------------------------------------

pkg.version = next;
writeFileSync(PKG, JSON.stringify(pkg, null, 2) + '\n');

let gradle = readFileSync(GRADLE, 'utf8');
const codeMatch = gradle.match(/versionCode\s*=\s*(\d+)/);
if (!codeMatch) fail('could not find "versionCode =" in android/app/build.gradle.kts');
const newCode = Number(codeMatch[1]) + 1;
gradle = gradle.replace(/versionCode\s*=\s*\d+/, `versionCode = ${newCode}`);
if (!/versionName\s*=\s*"[^"]+"/.test(gradle)) fail('could not find versionName in android/app/build.gradle.kts');
gradle = gradle.replace(/versionName\s*=\s*"[^"]+"/, `versionName = "${next}"`);
writeFileSync(GRADLE, gradle);

console.log(`package.json        ${current} -> ${next}`);
console.log(`build.gradle.kts    versionName="${next}", versionCode=${newCode}`);

// --- commit, tag, push ----------------------------------------------------

git('add', 'package.json', 'android/app/build.gradle.kts');
git('commit', '-m', `Release ${tag}`);
git('tag', tag);
console.log(`committed and tagged ${tag}`);

if (noPush) {
  console.log('skipped push (--no-push)');
} else {
  git('push', 'origin', branch);
  git('push', 'origin', tag);
  console.log(`pushed ${branch} and ${tag}`);
  console.log('the release workflow will now build the APKs and publish the GitHub release');
}
