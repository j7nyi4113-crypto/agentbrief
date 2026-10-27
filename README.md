<div align="center">

# agentbrief

**Your AGENTS.md was true three refactors ago.**

`agentbrief` writes the facts in `AGENTS.md` from your repository —
and fails CI when they stop being true.

<img src="https://raw.githubusercontent.com/j7nyi4113-crypto/agentbrief/main/assets/demo.svg" alt="agentbrief init, then check failing after a script is renamed" width="880">

[![dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](package.json)
[![node](https://img.shields.io/badge/node-%3E%3D20-blue)](package.json)
[![CI](https://github.com/j7nyi4113-crypto/agentbrief/actions/workflows/ci.yml/badge.svg)](https://github.com/j7nyi4113-crypto/agentbrief/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-black)](LICENSE)

[English](README.md) · [简体中文](README.zh-CN.md)

</div>

---

## The problem

`AGENTS.md` is the first file a coding agent reads. It tells the agent how to build, test and lint
your project — and then the project moves: a script gets renamed, a folder is deleted, jest becomes
vitest. Nobody notices, because nothing checks prose. The agent keeps following instructions that
stopped being true months ago, and it follows them confidently.

An LLM can write a convincing `AGENTS.md` too. What it cannot do is tell you the day it became wrong.

## What it does

- Reads the manifests, lockfiles and CI workflows that already exist in your repo.
- Writes a `Repo facts` block into `AGENTS.md`: stack, commands, layout, CI, conventions.
- Records **where every fact came from**, in a metadata comment next to it.
- `agentbrief check` re-reads the repo and verifies each fact still holds — exit code 1 if not.

No API key. No network. No dependencies. It runs in about 40 ms, so it belongs in CI.

## Quick start

```bash
# straight from GitHub — works today
npx github:j7nyi4113-crypto/agentbrief init
npx github:j7nyi4113-crypto/agentbrief check

# from npm
npx agentsbrief init
```

Or install it once and keep it:

```bash
npm i -g github:j7nyi4113-crypto/agentbrief
agentbrief init
```

`init` never overwrites a file you already have. If `AGENTS.md` exists without a generated block,
the block is appended and your prose stays where it is.

## What gets written

The generated part is deliberately boring, and every row says where it came from:

```md
<!-- agentbrief:begin -->
<!-- agentbrief:meta {"v":1,"commands":[{"key":"test","cmd":"npm run test","src":"package.json#scripts.test"}],...} -->

## Repo facts

**Stack:** TypeScript · Node.js >=22 · pnpm · 137 files

### Commands

| Task | Command | Source |
| --- | --- | --- |
| Install | `pnpm install` | `pnpm-lock.yaml` |
| Build | `pnpm run build` | `package.json#scripts.build` |
| Test | `pnpm run test` | `package.json#scripts.test` |
| Lint | `npx xo` | `package.json#devDependencies.xo` |
| Typecheck | `npx tsc --noEmit` | `tsconfig.json` |

### Layout

| Path | Contents |
| --- | --- |
| `src/` | source · 24 files |
| `test/` | tests · 66 files |

### CI

- `.github/workflows/main.yml` runs on every push — `pnpm install`, `pnpm run test`

<!-- agentbrief:end -->
```

The metadata line is what makes `check` possible: `package.json#scripts.build` is a promise that
`scripts.build` still exists. When it doesn't, you get one line that says exactly that.

## Commands

| Command | What it does |
| --- | --- |
| `agentbrief init [dir]` | Create `AGENTS.md` from the repository |
| `agentbrief update [dir]` | Refresh the generated block, keep your prose |
| `agentbrief check [dir]` | Verify every fact; exit 1 on drift |
| `agentbrief show [dir]` | Print what was detected, as JSON |

Flags: `--dry-run` (print instead of write), `--json` (machine-readable), `--quiet`, `--version`.

## In CI

```yaml
name: AGENTS.md
on: [push, pull_request]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npx agentsbrief check
```

When it fails, the output names the broken fact and the file that no longer backs it, so the fix is
usually one line in `package.json` or one `agentbrief update`.

Ready to copy: [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

## What it detects

| Ecosystem | Read from | Commands |
| --- | --- | --- |
| Node / TypeScript | `package.json`, lockfiles, `tsconfig.json` | install, dev, build, test, lint, typecheck, format |
| Python | `pyproject.toml`, `requirements.txt`, `uv.lock`, `poetry.lock` | install, test, lint, typecheck, format |
| Rust | `Cargo.toml` | build, test, clippy, fmt |
| Go | `go.mod` | build, test, vet, gofmt |
| Anything with a Makefile | `Makefile` targets | install, build, test, lint, format |

Package managers are inferred from `packageManager` or the lockfile: npm, pnpm, yarn and bun all
produce the right command. When a tool is installed but has no script (a `xo` or `tsc` in
`devDependencies`), it falls back to `npx <tool>` rather than inventing a script that doesn't exist.

## What it does not do

- **It does not write your judgment.** What the project is for, what will bite a new contributor,
  which decisions are load-bearing — that stays yours, and `update` never touches it.
- **It does not guess.** If it cannot prove a command from a file, it does not write the command.
- **It does not scan nested workspaces yet.** v0.1 reads the repository root and lists the
  workspace globs it finds.

## FAQ

**Why not just ask an LLM to write AGENTS.md?**
You can, and it will look great. The problem starts on day two. `agentbrief` is not trying to write
better prose than a model — it is trying to make the factual half of the file *checkable*. Use both:
the model writes the judgment, the tool writes and verifies the facts.

**Will it overwrite my edits?**
Only the lines between `<!-- agentbrief:begin -->` and `<!-- agentbrief:end -->`. Everything else is
preserved byte for byte. If you edit inside the block, `update` will replace it — that is the deal.

**Does it work with Claude Code / Codex / Cursor?**
Yes. They all read `AGENTS.md`. If your tool insists on `CLAUDE.md`, point it at the same file:

```md
@AGENTS.md
```

**Is it on npm?**
The package is called `agentsbrief`, because `agentbrief` was already taken on npm by an unrelated
project. It is not published yet — publishing needs a maintainer with registry access. Install from
GitHub until then; the package has no dependencies, so there is nothing to build.

The binary is `agentbrief` (with `agentsbrief` as an alias), so the commands below stay the same
either way.

**Why is the block full of tables?**
Because agents read tables well, and tables diff well. A changed command shows up as one changed
line in review, not as a rewritten paragraph.

## Roadmap

- [ ] scan nested workspaces (`packages/*`, `apps/*`)
- [ ] `--lang zh` for non-English output
- [ ] post the drift report as a PR comment
- [ ] a real GitHub Action wrapper

## Contributing

Issues and PRs are welcome. Run `npm test` before opening a PR, and run
`node bin/agentbrief.js update` if you changed a script or moved a directory — this repository keeps
its own `AGENTS.md` honest with the workflow in [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

## License

MIT
