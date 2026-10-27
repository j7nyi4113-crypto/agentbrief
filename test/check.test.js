import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { check } from '../src/check.js';
import { renderFile } from '../src/render.js';
import { scan } from '../src/scan.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => path.join(here, 'fixtures', name);

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function workspace(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbrief-'));
  copyDir(fixture(name), dir);
  return dir;
}

function writeAgents(root) {
  const facts = scan(root);
  fs.writeFileSync(path.join(root, 'AGENTS.md'), renderFile(facts, null));
}

test('a freshly generated AGENTS.md passes its own check', () => {
  const root = workspace('node-app');
  writeAgents(root);
  const result = check(root);
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  assert.deepEqual(result.issues, []);
});

test('check fails when a documented script disappears', () => {
  const root = workspace('node-app');
  writeAgents(root);

  const pkgPath = path.join(root, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  delete pkg.scripts.build;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

  const result = check(root);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => /scripts\.build/.test(i.detail)));
});

test('check fails when a documented directory disappears', () => {
  const root = workspace('node-app');
  writeAgents(root);
  fs.rmSync(path.join(root, 'src'), { recursive: true, force: true });

  const result = check(root);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => i.area === 'layout'));
});

test('check reports a missing file instead of throwing', () => {
  const root = workspace('empty');
  const result = check(root);
  assert.equal(result.ok, false);
  assert.match(result.issues[0].detail, /not found/);
});

test('update keeps the prose a human wrote', () => {
  const root = workspace('node-app');
  writeAgents(root);

  const agentsPath = path.join(root, 'AGENTS.md');
  const before = fs.readFileSync(agentsPath, 'utf8').replace(
    '## Traps',
    '## Traps\n\nNever edit `src/generated.ts` by hand.',
  );
  fs.writeFileSync(agentsPath, before);

  const pkgPath = path.join(root, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.scripts.test = 'vitest run';
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

  const after = renderFile(scan(root), before);
  assert.match(after, /Never edit `src\/generated\.ts` by hand\./);
  assert.equal((after.match(/agentbrief:begin/g) || []).length, 1);
});
