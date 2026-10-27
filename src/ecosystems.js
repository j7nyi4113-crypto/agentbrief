import path from 'node:path';
import { exists, readJson, readText } from './util.js';

const KEY_ORDER = ['install', 'dev', 'build', 'test', 'lint', 'typecheck', 'format'];

export const LABELS = {
  install: 'Install',
  dev: 'Dev server',
  build: 'Build',
  test: 'Test',
  lint: 'Lint',
  typecheck: 'Typecheck',
  format: 'Format',
};

function add(list, key, cmd, src, note) {
  if (!cmd) return;
  if (list.some((c) => c.key === key)) return;
  list.push({ key, cmd, src, note });
}

function firstExisting(root, names) {
  for (const n of names) {
    if (exists(path.join(root, n))) return n;
  }
  return null;
}

/* ------------------------------------------------------------------ node */

const SCRIPT_KEYS = {
  dev: ['dev', 'start', 'serve', 'watch'],
  build: ['build', 'compile'],
  test: ['test', 'test:unit', 'vitest', 'jest'],
  lint: ['lint', 'lint:js', 'eslint'],
  typecheck: ['typecheck', 'type-check', 'tsc', 'check-types', 'check:types'],
  format: ['format', 'fmt', 'prettier'],
};

const PRETTIER_FILES = [
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.yml',
  '.prettierrc.yaml',
  '.prettierrc.js',
  '.prettierrc.cjs',
  'prettier.config.js',
  'prettier.config.mjs',
  'prettier.config.cjs',
];

const ESLINT_FILES = [
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  '.eslintrc',
  '.eslintrc.json',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.yml',
];

function detectPackageManager(root, pkg) {
  const declared = typeof pkg?.packageManager === 'string' ? pkg.packageManager.split('@')[0] : null;
  if (declared) return declared;
  if (exists(path.join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (exists(path.join(root, 'yarn.lock'))) return 'yarn';
  if (exists(path.join(root, 'bun.lockb')) || exists(path.join(root, 'bun.lock'))) return 'bun';
  if (exists(path.join(root, 'package-lock.json'))) return 'npm';
  return 'npm';
}

function nodeStack(root, pkg, pm, deps, all) {
  const stack = [];
  if (exists(path.join(root, 'tsconfig.json')) || all.typescript) stack.push('TypeScript');
  const frameworks = [
    ['next', 'Next.js'],
    ['nuxt', 'Nuxt'],
    ['@angular/core', 'Angular'],
    ['svelte', 'Svelte'],
    ['vue', 'Vue'],
    ['astro', 'Astro'],
    ['@remix-run/react', 'Remix'],
    ['react', 'React'],
    ['express', 'Express'],
    ['fastify', 'Fastify'],
    ['@nestjs/core', 'NestJS'],
  ];
  for (const [dep, label] of frameworks) {
    if (deps[dep]) {
      stack.push(label);
      break;
    }
  }
  const nvmrc = readText(path.join(root, '.nvmrc'))?.trim().replace(/^v/, '');
  const engines = typeof pkg?.engines?.node === 'string' ? pkg.engines.node.trim() : '';
  stack.push(nvmrc ? `Node.js ${nvmrc}` : engines ? `Node.js ${engines}` : 'Node.js');
  stack.push(pm);
  return stack;
}

function nodeProject(root) {
  const pkg = readJson(path.join(root, 'package.json'));
  if (!pkg) return null;

  const pm = detectPackageManager(root, pkg);
  const scripts = pkg.scripts || {};
  const deps = pkg.dependencies || {};
  const dev = pkg.devDependencies || {};
  const all = { ...deps, ...dev };
  const commands = [];

  const install =
    pm === 'pnpm'
      ? 'pnpm install'
      : pm === 'yarn'
        ? 'yarn install'
        : pm === 'bun'
          ? 'bun install'
          : 'npm install';

  const installSrc =
    pm === 'pnpm'
      ? 'pnpm-lock.yaml'
      : pm === 'yarn'
        ? 'yarn.lock'
        : pm === 'bun'
          ? exists(path.join(root, 'bun.lock'))
            ? 'bun.lock'
            : exists(path.join(root, 'bun.lockb'))
              ? 'bun.lockb'
              : 'package.json'
          : exists(path.join(root, 'package-lock.json'))
            ? 'package-lock.json'
            : 'package.json';
  add(commands, 'install', install, installSrc);

  for (const [key, candidates] of Object.entries(SCRIPT_KEYS)) {
    for (const name of candidates) {
      const value = scripts[name];
      if (typeof value !== 'string') continue;
      if (/no test specified/i.test(value)) continue;
      const cmd = pm === 'npm' ? `npm run ${name}` : `${pm} run ${name}`;
      add(commands, key, cmd, `package.json#scripts.${name}`);
      break;
    }
  }

  const prettierFile = firstExisting(root, PRETTIER_FILES) || (pkg.prettier ? 'package.json' : null);
  const eslintFile = firstExisting(root, ESLINT_FILES) || (pkg.eslintConfig ? 'package.json' : null);
  const hasTs = Boolean(all.typescript);

  // Fall back to the tool itself when there is no script for it.
  if (!commands.some((c) => c.key === 'lint')) {
    const linters = [
      ['xo', 'npx xo', true],
      ['@biomejs/biome', 'npx biome check .', true],
      ['oxlint', 'npx oxlint', true],
      ['eslint', 'npx eslint .', Boolean(eslintFile)],
    ];
    for (const [dep, cmd, allowed] of linters) {
      if (!allowed || !dev[dep]) continue;
      add(commands, 'lint', cmd, `package.json#devDependencies.${dep}`);
      break;
    }
  }

  if (!commands.some((c) => c.key === 'typecheck') && hasTs && exists(path.join(root, 'tsconfig.json'))) {
    add(commands, 'typecheck', 'npx tsc --noEmit', 'tsconfig.json');
  }

  if (!commands.some((c) => c.key === 'format')) {
    if (dev.prettier && prettierFile) {
      add(commands, 'format', 'npx prettier --check .', 'package.json#devDependencies.prettier');
    } else if (dev['@biomejs/biome']) {
      add(commands, 'format', 'npx biome format .', 'package.json#devDependencies.@biomejs/biome');
    }
  }

  const conventions = [];
  if (prettierFile) conventions.push({ name: 'Formatter', detail: `Prettier (${prettierFile})`, src: prettierFile });
  if (eslintFile) conventions.push({ name: 'Linter', detail: `ESLint (${eslintFile})`, src: eslintFile });
  else if (dev.xo) conventions.push({ name: 'Linter', detail: 'XO (package.json)', src: 'package.json' });
  else if (dev.oxlint) conventions.push({ name: 'Linter', detail: 'oxlint (package.json)', src: 'package.json' });
  else if (dev['@biomejs/biome']) conventions.push({ name: 'Tooling', detail: 'Biome (package.json)', src: 'package.json' });

  const commitlint = firstExisting(root, [
    'commitlint.config.js',
    'commitlint.config.cjs',
    'commitlint.config.mjs',
    '.commitlintrc',
    '.commitlintrc.json',
  ]);
  if (commitlint) {
    conventions.push({ name: 'Commits', detail: `Conventional Commits (${commitlint})`, src: commitlint });
  }

  return {
    kind: 'node',
    stack: nodeStack(root, pkg, pm, deps, all),
    commands,
    conventions,
    name: pkg.name,
    description: pkg.description,
  };
}

/* ---------------------------------------------------------------- python */

function tomlSections(text) {
  const out = new Set();
  for (const m of text.matchAll(/^\s*\[([^\]]+)\]/gm)) out.add(m[1].trim());
  return out;
}

function pythonProject(root) {
  const pyprojectPath = path.join(root, 'pyproject.toml');
  const pyproject = readText(pyprojectPath);
  const requirements = readText(path.join(root, 'requirements.txt'));
  const setupPy = exists(path.join(root, 'setup.py'));
  if (!pyproject && !requirements && !setupPy) return null;

  const sections = pyproject ? tomlSections(pyproject) : new Set();
  const blob = `${pyproject || ''}\n${requirements || ''}`;
  const has = (re) => re.test(blob);

  const stack = [];
  const pyVersion = pyproject?.match(/requires-python\s*=\s*"([^"]+)"/)?.[1];
  const cleanVersion = pyVersion?.replace(/[>=^~\s]/g, '').replace(/\.\*$/, '');
  stack.push(cleanVersion ? `Python ${cleanVersion}` : 'Python');
  const pyFrameworks = [
    ['fastapi', 'FastAPI'],
    ['django', 'Django'],
    ['flask', 'Flask'],
  ];
  for (const [dep, label] of pyFrameworks) {
    if (new RegExp(`\\b${dep}\\b`, 'i').test(blob)) {
      stack.push(label);
      break;
    }
  }

  const uv = exists(path.join(root, 'uv.lock'));
  const poetry = exists(path.join(root, 'poetry.lock'));
  if (uv) stack.push('uv');
  else if (poetry) stack.push('Poetry');

  const commands = [];
  if (uv) add(commands, 'install', 'uv sync', 'uv.lock');
  else if (poetry) add(commands, 'install', 'poetry install', 'poetry.lock');
  else if (requirements) add(commands, 'install', 'pip install -r requirements.txt', 'requirements.txt');
  else if (pyproject) add(commands, 'install', 'pip install -e .', 'pyproject.toml');

  const depSrc = requirements ? 'requirements.txt' : 'pyproject.toml';
  const hasPytest =
    sections.has('tool.pytest.ini_options') || /(^|\n)pytest[<>=[]/.test(requirements || '') || has(/\bpytest\b/);
  if (hasPytest) {
    const src = sections.has('tool.pytest.ini_options') ? 'pyproject.toml#tool.pytest.ini_options' : depSrc;
    add(commands, 'test', uv ? 'uv run pytest' : 'pytest', src);
  }

  const hasRuff = sections.has('tool.ruff') || has(/\bruff\b/);
  if (hasRuff) {
    const src = sections.has('tool.ruff') ? 'pyproject.toml#tool.ruff' : depSrc;
    add(commands, 'lint', uv ? 'uv run ruff check .' : 'ruff check .', src);
    add(commands, 'format', uv ? 'uv run ruff format .' : 'ruff format .', src);
  } else if (has(/\bblack\b/)) {
    add(commands, 'format', 'black .', 'pyproject.toml#tool.black');
  }
  if (sections.has('tool.mypy') || has(/\bmypy\b/)) {
    const src = sections.has('tool.mypy') ? 'pyproject.toml#tool.mypy' : depSrc;
    add(commands, 'typecheck', uv ? 'uv run mypy .' : 'mypy .', src);
  }

  const conventions = [];
  if (hasRuff) conventions.push({ name: 'Linter', detail: 'Ruff (pyproject.toml)', src: 'pyproject.toml' });
  if (sections.has('tool.mypy')) conventions.push({ name: 'Types', detail: 'mypy (pyproject.toml)', src: 'pyproject.toml' });

  const name = pyproject?.match(/^name\s*=\s*"([^"]+)"/m)?.[1];
  const description = pyproject?.match(/^description\s*=\s*"([^"]+)"/m)?.[1];

  return { kind: 'python', stack, commands, conventions, name, description };
}

/* ------------------------------------------------------------ rust & go */

function rustProject(root) {
  const text = readText(path.join(root, 'Cargo.toml'));
  if (!text) return null;
  const commands = [];
  add(commands, 'build', 'cargo build', 'Cargo.toml');
  add(commands, 'test', 'cargo test', 'Cargo.toml');
  add(commands, 'lint', 'cargo clippy --all-targets -- -D warnings', 'Cargo.toml');
  add(commands, 'format', 'cargo fmt', 'Cargo.toml');
  const conventions = [{ name: 'Formatter', detail: 'rustfmt', src: 'Cargo.toml' }];
  const name = text.match(/^name\s*=\s*"([^"]+)"/m)?.[1];
  const description = text.match(/^description\s*=\s*"([^"]+)"/m)?.[1];
  return { kind: 'rust', stack: ['Rust', 'Cargo'], commands, conventions, name, description };
}

function goProject(root) {
  const text = readText(path.join(root, 'go.mod'));
  if (!text) return null;
  const commands = [];
  add(commands, 'build', 'go build ./...', 'go.mod');
  add(commands, 'test', 'go test ./...', 'go.mod');
  add(commands, 'lint', 'go vet ./...', 'go.mod');
  add(commands, 'format', 'gofmt -l .', 'go.mod');
  const conventions = [{ name: 'Formatter', detail: 'gofmt', src: 'go.mod' }];
  const module = text.match(/^module\s+(\S+)/m)?.[1];
  const version = text.match(/^go\s+(\S+)/m)?.[1];
  return { kind: 'go', stack: [`Go ${version || ''}`.trim(), 'go modules'], commands, conventions, name: module };
}

/* -------------------------------------------------------------- makefile */

function makefileCommands(root, commands) {
  const text = readText(path.join(root, 'Makefile'));
  if (!text) return;
  const targets = new Set();
  for (const m of text.matchAll(/^([A-Za-z0-9_.-]+):(?!=)/gm)) {
    if (!m[1].startsWith('.')) targets.add(m[1]);
  }
  const wanted = [
    ['install', ['install', 'setup', 'deps']],
    ['build', ['build', 'all', 'compile']],
    ['test', ['test', 'tests', 'check']],
    ['lint', ['lint']],
    ['format', ['fmt', 'format']],
  ];
  for (const [key, names] of wanted) {
    for (const name of names) {
      if (!targets.has(name)) continue;
      add(commands, key, `make ${name}`, `Makefile#${name}`);
      break;
    }
  }
}

/* ------------------------------------------------------------------ main */

export function detect(root) {
  const projects = [nodeProject(root), pythonProject(root), rustProject(root), goProject(root)].filter(Boolean);
  const primary = projects[0] || null;

  const commands = [];
  for (const p of projects) for (const cmd of p.commands) add(commands, cmd.key, cmd.cmd, cmd.src, cmd.note);
  makefileCommands(root, commands);
  commands.sort((a, b) => KEY_ORDER.indexOf(a.key) - KEY_ORDER.indexOf(b.key));

  const conventions = projects.flatMap((p) => p.conventions);

  if (exists(path.join(root, '.editorconfig'))) {
    conventions.push({ name: 'Editor', detail: '.editorconfig', src: '.editorconfig' });
  }

  const licenseFile = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'COPYING'].find((f) => exists(path.join(root, f)));
  const pkgLicense = readJson(path.join(root, 'package.json'))?.license;
  if (!licenseFile && typeof pkgLicense === 'string') {
    conventions.push({ name: 'License', detail: `${pkgLicense} (package.json)`, src: 'package.json' });
  }
  if (licenseFile) {
    const head = (readText(path.join(root, licenseFile)) || '').slice(0, 400);
    const kind = /MIT License/i.test(head)
      ? 'MIT'
      : /Apache License/i.test(head)
        ? 'Apache-2.0'
        : /GNU GENERAL PUBLIC LICENSE/i.test(head)
          ? 'GPL'
          : /BSD/i.test(head)
            ? 'BSD'
            : null;
    conventions.push({ name: 'License', detail: kind ? `${kind} (${licenseFile})` : licenseFile, src: licenseFile });
  }

  const stack = [];
  const seen = new Set();
  for (const p of projects) {
    for (const s of p.stack) {
      if (!s || seen.has(s)) continue;
      seen.add(s);
      stack.push(s);
    }
  }

  const pkg = readJson(path.join(root, 'package.json'));
  const workspaces =
    (Array.isArray(pkg?.workspaces) ? pkg.workspaces : pkg?.workspaces?.packages) ||
    (exists(path.join(root, 'pnpm-workspace.yaml')) ? ['pnpm-workspace.yaml'] : null);

  return {
    kind: projects.map((p) => p.kind),
    stack,
    commands,
    conventions,
    name: primary?.name || path.basename(root),
    description: primary?.description || '',
    workspaces: workspaces || null,
  };
}

export { KEY_ORDER };
