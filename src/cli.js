import fs from 'node:fs';
import path from 'node:path';
import { check } from './check.js';
import { scan } from './scan.js';
import { renderFile } from './render.js';
import { c, exists, isDir, plural, table } from './util.js';

const VERSION = '0.1.0';

const HELP = `
  ${c.bold('agentbrief')} ${c.dim(`v${VERSION}`)}
  AGENTS.md that can't go stale — generated from your repo, verified in CI.

  ${c.bold('Usage')}
    agentbrief init   [dir]        create AGENTS.md from the repository
    agentbrief update [dir]        refresh the generated block, keep your prose
    agentbrief check  [dir]        verify every claim in AGENTS.md (exit 1 on drift)
    agentbrief show   [dir]        print detected facts as JSON

  ${c.bold('Flags')}
    --dry-run     print the block instead of writing
    --json        machine-readable output
    --quiet       only errors
    --version     print version
    --help        print this

  ${c.bold('Examples')}
    npx agentsbrief init
    npx agentsbrief check --json
    agentbrief update docs/

  ${c.dim('Docs: https://github.com/j7nyi4113-crypto/agentbrief')}
`;

function parseArgs(argv) {
  const args = { _: [], flags: {} };
  for (const a of argv) {
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      args.flags[k] = v === undefined ? true : v;
    } else {
      args._.push(a);
    }
  }
  return args;
}

function header(facts, root) {
  const stack = facts.stack.length ? facts.stack.join(' · ') : 'unknown stack';
  return `\n  ${c.bold('agentbrief')} ${c.dim(`· ${facts.name || path.basename(root)}`)}\n  ${c.gray(stack)}\n`;
}

function summary(facts) {
  const bits = [];
  if (facts.commands.length) bits.push(plural(facts.commands.length, 'command'));
  const dirs = facts.layout.filter((l) => l.kind === 'dir').length;
  if (dirs) bits.push(`${dirs} ${dirs === 1 ? 'directory' : 'directories'} tracked`);
  if (facts.ci.length) bits.push(plural(facts.ci.length, 'workflow'));
  return bits.join(' · ') || 'nothing detected';
}

function runInit(root, flags) {
  const facts = scan(root);
  const agentsPath = path.join(root, 'AGENTS.md');
  const existing = exists(agentsPath) ? fs.readFileSync(agentsPath, 'utf8') : null;

  if (!flags.json) process.stdout.write(header(facts, root));

  if (existing && existing.includes('<!-- agentbrief:begin -->')) {
    if (flags.json) {
      process.stdout.write(JSON.stringify({ ok: false, reason: 'already-initialized' }) + '\n');
      return 1;
    }
    process.stdout.write(`  ${c.yellow('!')} AGENTS.md already has a generated block\n`);
    process.stdout.write(`  ${c.gray('run')} agentbrief update ${c.gray('to refresh it')}\n\n`);
    return 1;
  }

  const output = renderFile(facts, existing);

  if (flags['dry-run']) {
    process.stdout.write(output + '\n');
    return 0;
  }

  fs.writeFileSync(agentsPath, output);
  if (!flags.json) {
    process.stdout.write(`  ${c.green('✓')} wrote ${c.bold('AGENTS.md')} ${c.gray(`(${summary(facts)})`)}\n`);
    process.stdout.write(`  ${c.gray('next')} agentbrief check ${c.gray('· fails CI when this drifts')}\n\n`);
  } else {
    process.stdout.write(JSON.stringify({ ok: true, wrote: 'AGENTS.md', facts }) + '\n');
  }
  return 0;
}

function runUpdate(root, flags) {
  const facts = scan(root);
  const agentsPath = path.join(root, 'AGENTS.md');
  const existing = exists(agentsPath) ? fs.readFileSync(agentsPath, 'utf8') : null;

  if (!flags.json) process.stdout.write(header(facts, root));

  if (!existing) {
    if (!flags.json) {
      process.stdout.write(`  ${c.red('✗')} no AGENTS.md in this directory\n`);
      process.stdout.write(`  ${c.gray('run')} agentbrief init\n\n`);
    } else {
      process.stdout.write(JSON.stringify({ ok: false, reason: 'missing-file' }) + '\n');
    }
    return 1;
  }

  const output = renderFile(facts, existing);

  if (flags['dry-run']) {
    process.stdout.write(output + '\n');
    return 0;
  }

  if (output === existing) {
    if (!flags.json) process.stdout.write(`  ${c.green('✓')} already up to date\n\n`);
    else process.stdout.write(JSON.stringify({ ok: true, changed: false }) + '\n');
    return 0;
  }

  fs.writeFileSync(agentsPath, output);
  if (!flags.json) {
    process.stdout.write(`  ${c.green('✓')} updated ${c.bold('AGENTS.md')} ${c.gray(`(${summary(facts)})`)}\n\n`);
  } else {
    process.stdout.write(JSON.stringify({ ok: true, changed: true, facts }) + '\n');
  }
  return 0;
}

function runCheck(root, flags) {
  const result = check(root);
  const facts = scan(root);

  if (flags.json) {
    process.stdout.write(JSON.stringify({ ok: result.ok, issues: result.issues }, null, 2) + '\n');
    return result.ok ? 0 : 1;
  }

  process.stdout.write(header(facts, root));

  if (!result.issues.length) {
    process.stdout.write(`  ${c.green('✓')} AGENTS.md matches the repository\n\n`);
    return 0;
  }

  const rows = result.issues.map((i) => {
    const mark = i.level === 'error' ? c.red('✗') : c.yellow('!');
    const label = i.label.length > 34 ? `${i.label.slice(0, 33)}…` : i.label;
    return [mark, c.bold(label), i.detail, c.gray(i.area)];
  });

  process.stdout.write(table(rows, 2).replace(/^/gm, '  ') + '\n');

  const errors = result.issues.filter((i) => i.level === 'error').length;
  const warns = result.issues.length - errors;
  const bits = [];
  if (errors) bits.push(`${errors} broken`);
  if (warns) bits.push(`${warns} stale`);
  const next = exists(path.join(root, 'AGENTS.md')) ? 'agentbrief update' : 'agentbrief init';
  process.stdout.write(`\n  ${c.gray(bits.join(' · '))} ${c.gray('→')} ${next}\n\n`);

  return result.ok ? 0 : 1;
}

function runShow(root, flags) {
  const facts = scan(root);
  if (flags.json) {
    process.stdout.write(JSON.stringify(facts, null, 2) + '\n');
    return 0;
  }
  process.stdout.write(header(facts, root));
  const rows = facts.commands.map((cmd) => [c.cyan(cmd.key), cmd.cmd, c.gray(cmd.src)]);
  if (rows.length) process.stdout.write(table(rows, 2).replace(/^/gm, '  ') + '\n');
  process.stdout.write('\n');
  return 0;
}

export function main(argv) {
  const args = parseArgs(argv);
  const flags = args.flags;

  if (flags.version) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }
  if (flags.help || !args._.length) {
    process.stdout.write(HELP);
    return 0;
  }

  const command = args._[0];
  const target = args._[1] && !args._[1].startsWith('-') ? args._[1] : '.';
  const root = path.resolve(process.cwd(), target);

  if (!isDir(root)) {
    process.stderr.write(`\n  ${c.red('✗')} not a directory: ${target}\n\n`);
    return 2;
  }

  try {
    switch (command) {
      case 'init':
        return runInit(root, flags);
      case 'update':
        return runUpdate(root, flags);
      case 'check':
        return runCheck(root, flags);
      case 'show':
        return runShow(root, flags);
      default:
        process.stderr.write(`\n  ${c.red('✗')} unknown command: ${command}\n`);
        process.stderr.write(HELP);
        return 2;
    }
  } catch (err) {
    process.stderr.write(`\n  ${c.red('✗')} ${err.message}\n\n`);
    if (process.env.DEBUG) process.stderr.write(err.stack + '\n');
    return 2;
  }
}
