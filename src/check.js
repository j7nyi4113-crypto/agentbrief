import path from 'node:path';
import { scan } from './scan.js';
import { BEGIN, END } from './render.js';
import { exists, readJson, readText } from './util.js';

export function extractMeta(text) {
  if (!text) return null;
  const m = text.match(/<!--\s*agentbrief:meta\s+(\{[\s\S]*?\})\s*-->/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

function jsonPath(obj, frag) {
  return frag.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

function sourceExists(root, src) {
  if (!src) return { ok: true };
  if (src.startsWith('path:')) {
    const p = src.slice(5);
    return { ok: exists(path.join(root, p)), what: `\`${p}\`` };
  }
  if (src.includes('#')) {
    const [file, frag] = src.split('#');
    const full = path.join(root, file);
    if (!exists(full)) return { ok: false, what: `\`${file}\``, why: 'file is gone' };

    if (file === 'package.json') {
      const pkg = readJson(full);
      const value = jsonPath(pkg, frag);
      return value == null
        ? { ok: false, what: `\`${file}\``, why: `\`${frag}\` no longer exists` }
        : { ok: true };
    }
    if (/^Makefile$/i.test(file)) {
      const text = readText(full) || '';
      const re = new RegExp(`^${frag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`, 'm');
      return re.test(text)
        ? { ok: true }
        : { ok: false, what: `\`${file}\``, why: `target \`${frag}\` no longer exists` };
    }
    if (file.endsWith('.toml')) {
      const text = readText(full) || '';
      const section = new RegExp(`^\\s*\\[${frag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]`, 'm');
      return section.test(text)
        ? { ok: true }
        : { ok: false, what: `\`${file}\``, why: `section \`[${frag}]\` no longer exists` };
    }
    return { ok: true };
  }
  return exists(path.join(root, src))
    ? { ok: true }
    : { ok: false, what: `\`${src}\``, why: 'file is gone' };
}

export function check(root) {
  const agentsPath = path.join(root, 'AGENTS.md');
  const text = readText(agentsPath);
  const issues = [];

  if (!text) {
    return {
      ok: false,
      issues: [
        {
          level: 'error',
          area: 'file',
          label: 'AGENTS.md',
          detail: 'not found',
          hint: 'run `agentbrief init`',
        },
      ],
    };
  }

  if (!text.includes(BEGIN)) {
    return {
      ok: false,
      issues: [
        {
          level: 'warn',
          area: 'file',
          label: 'AGENTS.md',
          detail: 'has no managed block, so nothing can be verified',
          hint: 'run `agentbrief update` to add one',
        },
      ],
    };
  }

  if (!text.includes(END)) {
    issues.push({
      level: 'error',
      area: 'file',
      label: 'AGENTS.md',
      detail: 'managed block is not closed',
      hint: 'run `agentbrief update` to repair it',
    });
  }

  const meta = extractMeta(text);
  if (!meta) {
    issues.push({
      level: 'error',
      area: 'file',
      label: 'AGENTS.md',
      detail: 'managed block has no readable metadata',
      hint: 'run `agentbrief update`',
    });
    return { ok: false, issues };
  }

  const facts = scan(root);
  const current = new Map(facts.commands.map((c) => [c.key, c]));

  for (const entry of meta.commands || []) {
    const label = entry.cmd;

    if (entry.src) {
      const res = sourceExists(root, entry.src);
      if (!res.ok) {
        issues.push({
          level: 'error',
          area: 'command',
          label,
          detail: `${res.what}: ${res.why}`,
          hint: 'run `agentbrief update` to refresh the facts',
        });
        continue;
      }
    }

    const now = current.get(entry.key);
    if (!now) {
      issues.push({
        level: 'error',
        area: 'command',
        label,
        detail: 'no longer detected in this repository',
        hint: 'run `agentbrief update`',
      });
    } else if (now.cmd !== entry.cmd) {
      issues.push({
        level: 'warn',
        area: 'command',
        label,
        detail: `changed to \`${now.cmd}\``,
        hint: 'run `agentbrief update`',
      });
    }
  }

  for (const dir of meta.dirs || []) {
    if (!exists(path.join(root, dir))) {
      issues.push({
        level: 'error',
        area: 'layout',
        label: `${dir}/`,
        detail: 'directory is gone',
        hint: 'run `agentbrief update`',
      });
    }
  }

  const added = facts.commands.filter((c) => !(meta.commands || []).some((m) => m.key === c.key));
  for (const c of added) {
    issues.push({
      level: 'warn',
      area: 'command',
      label: c.cmd,
      detail: 'new command is not documented yet',
      hint: 'run `agentbrief update`',
    });
  }

  return { ok: issues.every((i) => i.level !== 'error'), issues };
}
