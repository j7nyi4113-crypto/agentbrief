import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detect } from '../src/ecosystems.js';
import { scan } from '../src/scan.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => path.join(here, 'fixtures', name);

test('detects a Node project and its commands', () => {
  const facts = detect(fixture('node-app'));
  const byKey = Object.fromEntries(facts.commands.map((c) => [c.key, c]));

  assert.equal(byKey.install.cmd, 'npm install');
  assert.equal(byKey.build.cmd, 'npm run build');
  assert.equal(byKey.build.src, 'package.json#scripts.build');
  assert.equal(byKey.test.cmd, 'npm run test');
  assert.equal(byKey.lint.cmd, 'npm run lint');
  assert.ok(facts.stack.includes('TypeScript'));
  assert.ok(facts.stack.includes('npm'));
});

test('detects a Python project and its tooling', () => {
  const facts = detect(fixture('python-app'));
  const byKey = Object.fromEntries(facts.commands.map((c) => [c.key, c]));

  assert.equal(byKey.install.cmd, 'pip install -e .');
  assert.equal(byKey.test.cmd, 'pytest');
  assert.equal(byKey.lint.cmd, 'ruff check .');
  assert.equal(byKey.typecheck.cmd, 'mypy .');
  assert.ok(facts.stack.includes('Python 3.11'));
  assert.ok(facts.stack.includes('FastAPI'));
});

test('survives a repository with nothing to detect', () => {
  const facts = detect(fixture('empty'));
  assert.deepEqual(facts.commands, []);
  assert.equal(facts.name, 'empty');
});

test('scan reports layout and file count', () => {
  const facts = scan(fixture('node-app'));
  const paths = facts.layout.map((l) => l.path);
  assert.ok(paths.includes('src'));
  assert.ok(paths.includes('test'));
  assert.ok(facts.totalFiles >= 5);
});
