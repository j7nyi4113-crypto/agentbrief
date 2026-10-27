import path from 'node:path';
import { detect } from './ecosystems.js';
import { countFiles, exists, isDir, listDir, readText, rel } from './util.js';

const HINTS = [
  [/^(src|lib|source)$/i, 'source'],
  [/^(app|pages|routes)$/i, 'routes / pages'],
  [/^components$/i, 'UI components'],
  [/^(packages|apps|services)$/i, 'workspace packages'],
  [/^(test|tests|__tests__|spec|specs)$/i, 'tests'],
  [/^(docs?|documentation)$/i, 'documentation'],
  [/^scripts?$/i, 'tooling scripts'],
  [/^(examples?|samples?)$/i, 'examples'],
  [/^(bench|benches|benchmarks?)$/i, 'benchmarks'],
  [/^(migrations?|db|database)$/i, 'database'],
  [/^(public|static|assets)$/i, 'static assets'],
  [/^(infra|infrastructure|deploy|terraform|k8s|helm)$/i, 'infrastructure'],
  [/^(cmd|internal|pkg)$/i, 'packages'],
  [/^api$/i, 'API'],
];

const KEY_FILES = [
  'package.json',
  'pyproject.toml',
  'Cargo.toml',
  'go.mod',
  'Makefile',
  'Dockerfile',
  'docker-compose.yml',
  'compose.yml',
  'tsconfig.json',
  'vite.config.ts',
  'vite.config.js',
  'next.config.js',
  'next.config.ts',
  'justfile',
  'Taskfile.yml',
];

function hintFor(name) {
  for (const [re, hint] of HINTS) if (re.test(name)) return hint;
  return '';
}

export function layout(root) {
  const dirs = [];
  for (const entry of listDir(root)) {
    if (!entry.isDirectory()) continue;
    const full = path.join(root, entry.name);
    const files = countFiles(full);
    dirs.push({ path: entry.name, kind: 'dir', files, hint: hintFor(entry.name) });
    if (dirs.length >= 12) break;
  }

  const files = KEY_FILES.filter((f) => exists(path.join(root, f))).map((f) => ({
    path: f,
    kind: 'file',
    files: 1,
    hint: '',
  }));

  return [...dirs, ...files];
}

export function ci(root) {
  const dir = path.join(root, '.github', 'workflows');
  if (!isDir(dir)) return [];
  const out = [];
  for (const entry of listDir(dir)) {
    if (!entry.isFile() || !/\.ya?ml$/.test(entry.name)) continue;
    const text = readText(path.join(dir, entry.name));
    if (!text) continue;

    const name = text.match(/^name:\s*["']?(.+?)["']?\s*$/m)?.[1] || entry.name;
    const triggers = [];
    const onBlock = text.match(/^on:\s*\n((?:[ \t]+.*\n|\s*\n)+)/m);
    if (onBlock) {
      for (const m of onBlock[1].matchAll(/^\s{2}([A-Za-z_]+):/gm)) triggers.push(m[1]);
    } else {
      const inline = text.match(/^on:\s*\[(.+)\]/m);
      if (inline) triggers.push(...inline[1].split(',').map((s) => s.trim().replace(/["']/g, '')));
    }

    const runs = [];
    for (const m of text.matchAll(/^\s*(?:-\s*)?run:\s*(.+)$/gm)) {
      const cmd = m[1].trim().replace(/^["']|["']$/g, '');
      if (!cmd || cmd === '|' || cmd === '>') continue;
      if (!runs.includes(cmd)) runs.push(cmd);
      if (runs.length >= 3) break;
    }

    out.push({ file: rel(root, path.join(dir, entry.name)), name, triggers, runs });
  }
  return out;
}

export function scan(root) {
  const facts = detect(root);
  return {
    root,
    ...facts,
    layout: layout(root),
    ci: ci(root),
    totalFiles: countFiles(root),
  };
}

export function readAgentsMd(root) {
  const p = path.join(root, 'AGENTS.md');
  return { path: p, text: readText(p), exists: exists(p) };
}
