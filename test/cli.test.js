import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const bin = path.join(here, '..', 'bin', 'agentbrief.js');

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function run(args, cwd) {
  return spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8' });
}

test('cli: init writes AGENTS.md and check exits 0', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbrief-cli-'));
  copyDir(path.join(here, 'fixtures', 'node-app'), dir);

  const init = run(['init'], dir);
  assert.equal(init.status, 0, init.stderr);
  assert.ok(fs.existsSync(path.join(dir, 'AGENTS.md')));

  const check = run(['check'], dir);
  assert.equal(check.status, 0, check.stdout);
});

test('cli: check exits 1 after the repo drifts', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbrief-cli-'));
  copyDir(path.join(here, 'fixtures', 'node-app'), dir);
  run(['init'], dir);

  const pkgPath = path.join(dir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  delete pkg.scripts.lint;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

  const check = run(['check'], dir);
  assert.equal(check.status, 1);
  assert.match(check.stdout, /scripts\.lint/);
});

test('cli: --json check is machine readable', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbrief-cli-'));
  copyDir(path.join(here, 'fixtures', 'node-app'), dir);
  run(['init'], dir);

  const check = run(['check', '--json'], dir);
  const parsed = JSON.parse(check.stdout);
  assert.equal(parsed.ok, true);
  assert.ok(Array.isArray(parsed.issues));
});
