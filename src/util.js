import fs from 'node:fs';
import path from 'node:path';

export const IGNORE = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'target', 'coverage',
  '.next', '.nuxt', '.venv', 'venv', '__pycache__', '.pytest_cache', '.mypy_cache',
  '.ruff_cache', '.turbo', '.cache', '.idea', '.vscode', 'vendor', 'Pods',
  '.DS_Store', 'tmp', '.output', '.parcel-cache',
]);

const useColor = process.stdout.isTTY && !process.env.NO_COLOR && process.env.TERM !== 'dumb';

const wrap = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));

export const c = {
  bold: wrap('1'),
  dim: wrap('2'),
  red: wrap('31'),
  green: wrap('32'),
  yellow: wrap('33'),
  blue: wrap('34'),
  magenta: wrap('35'),
  cyan: wrap('36'),
  gray: wrap('90'),
};

export function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

export function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export function readText(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

export function readJson(p) {
  const raw = readText(p);
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function rel(root, p) {
  return path.relative(root, p).split(path.sep).join('/');
}

/** List entries of a directory, sorted, with ignore rules applied. */
export function listDir(dir) {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => !IGNORE.has(e.name) && !e.name.startsWith('.DS_Store'))
      .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

/** Count files under a directory, with a hard cap so huge trees stay fast. */
export function countFiles(dir, cap = 5000) {
  let n = 0;
  const stack = [dir];
  while (stack.length && n < cap) {
    const cur = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (IGNORE.has(e.name)) continue;
      if (e.isDirectory()) stack.push(path.join(cur, e.name));
      else if (e.isFile()) n++;
    }
  }
  return n;
}

export function toPosix(p) {
  return p.split(path.sep).join('/');
}

/** Pad a string to a width, ignoring ANSI escapes. */
export function pad(s, width) {
  const visible = String(s).replace(/\x1b\[[0-9;]*m/g, '');
  const diff = width - [...visible].length;
  return diff > 0 ? s + ' '.repeat(diff) : s;
}

export function table(rows, gap = 2) {
  if (!rows.length) return '';
  const widths = [];
  for (const row of rows) {
    row.forEach((cell, i) => {
      const len = [...String(cell).replace(/\x1b\[[0-9;]*m/g, '')].length;
      widths[i] = Math.max(widths[i] || 0, len);
    });
  }
  return rows
    .map((row) => row.map((cell, i) => (i === row.length - 1 ? cell : pad(cell, widths[i] + gap))).join(''))
    .join('\n');
}

export function plural(n, word, pluralWord = `${word}s`) {
  return `${n} ${n === 1 ? word : pluralWord}`;
}
