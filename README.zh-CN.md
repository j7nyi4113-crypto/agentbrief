<div align="center">

# agentbrief

**你的 AGENTS.md，早在三次重构前就不成立了。**

`agentbrief` 从仓库里读出事实写进 `AGENTS.md`，
并在这些事实失效时让 CI 失败。

<img src="https://raw.githubusercontent.com/j7nyi4113-crypto/agentbrief/main/assets/demo.svg" alt="agentbrief 初始化，重命名脚本后 check 失败" width="880">

[![dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](package.json)
[![node](https://img.shields.io/badge/node-%3E%3D18-blue)](package.json)
[![tests](https://img.shields.io/badge/tests-12%20passing-brightgreen)](test)
[![license](https://img.shields.io/badge/license-MIT-black)](LICENSE)

[English](README.md) · [简体中文](README.zh-CN.md)

</div>

---

## 问题

`AGENTS.md` 是 coding agent 打开仓库后读的第一个文件。它告诉 agent 怎么装依赖、怎么构建、怎么跑测试——
然后项目开始动：脚本改名、目录删除、jest 换成 vitest。没人发现，因为没有东西会去检查一段散文。
于是 agent 继续遵守几个月前就失效的指令，而且遵守得非常自信。

让大模型写一份 `AGENTS.md` 也能写得很漂亮。它做不到的是：告诉你这份文件是哪天开始说谎的。

## 它做什么

- 读取仓库里本来就存在的清单文件、锁文件和 CI 配置。
- 往 `AGENTS.md` 里写入一个 `Repo facts` 区块：技术栈、命令、目录结构、CI、约定。
- 把**每条事实的来源**记在旁边的元数据注释里。
- `agentbrief check` 重新读仓库，逐条验证事实是否还成立——不成立就退出码 1。

不需要 API Key，不联网，零依赖。跑一次约 40 毫秒，所以它适合放进 CI。

## 快速开始

```bash
npx agentbrief init      # 从仓库生成 AGENTS.md
npx agentbrief check     # 校验；有漂移时退出码 1
```

`init` 不会覆盖你已有的文件。如果 `AGENTS.md` 存在但没有生成区块，它会把区块追加到末尾，你的内容原样保留。

## 生成出来长什么样

刻意做得很无聊，而且每一行都标了出处：

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

<!-- agentbrief:end -->
```

那行元数据是 `check` 能工作的原因：`package.json#scripts.build` 是一个承诺——`scripts.build` 还在。
它不在了，你就会看到一行明确指出这件事的报错。

## 命令

| 命令 | 作用 |
| --- | --- |
| `agentbrief init [dir]` | 从仓库创建 `AGENTS.md` |
| `agentbrief update [dir]` | 只刷新生成区块，保留你写的内容 |
| `agentbrief check [dir]` | 校验每条事实，漂移则退出码 1 |
| `agentbrief show [dir]` | 以 JSON 打印检测结果 |

参数：`--dry-run`（只打印不写入）、`--json`（机器可读）、`--quiet`、`--version`。

## 放进 CI

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
      - run: npx agentbrief check
```

失败时会指出是哪条事实坏了、哪个文件不再支撑它，修复通常只需要改一行 `package.json`，或者跑一次
`agentbrief update`。可直接复制的版本：[`docs/ci.yml`](docs/ci.yml)。

## 检测范围

| 生态 | 读取 | 命令 |
| --- | --- | --- |
| Node / TypeScript | `package.json`、锁文件、`tsconfig.json` | install、dev、build、test、lint、typecheck、format |
| Python | `pyproject.toml`、`requirements.txt`、`uv.lock`、`poetry.lock` | install、test、lint、typecheck、format |
| Rust | `Cargo.toml` | build、test、clippy、fmt |
| Go | `go.mod` | build、test、vet、gofmt |
| 任意带 Makefile 的仓库 | `Makefile` 目标 | install、build、test、lint、format |

包管理器从 `packageManager` 字段或锁文件推断，npm / pnpm / yarn / bun 都会给出正确的命令。
工具装了但没有对应脚本时（比如 `devDependencies` 里的 `xo` 或 `tsc`），会退化成 `npx <tool>`，
而不是编造一个不存在的脚本。

## 它不做什么

- **不替你写判断。** 这个项目是干什么的、哪里会坑到新人、哪些决定是承重的——这些留给你，
  `update` 永远不碰。
- **不猜。** 无法从文件证明的命令，它不会写进去。
- **还不扫描嵌套 workspace。** v0.1 只读仓库根目录，会列出发现的 workspace glob。

## 常见问题

**为什么不直接让大模型写 AGENTS.md？**
可以，而且写得很漂亮。问题从第二天开始。`agentbrief` 不是想比模型写得更好，而是想让这份文件里
「事实的那一半」变成**可校验的**。两个一起用：模型写判断，工具写事实并持续验证。

**会覆盖我改的内容吗？**
只覆盖 `<!-- agentbrief:begin -->` 和 `<!-- agentbrief:end -->` 之间的部分，其余逐字节保留。
如果你改了区块内部，`update` 会把它替换掉——这是约定。

**支持 Claude Code / Codex / Cursor 吗？**
支持，它们都读 `AGENTS.md`。如果你的工具只认 `CLAUDE.md`，让它引用同一个文件即可：

```md
@AGENTS.md
```

## 路线图

- [ ] 扫描嵌套 workspace（`packages/*`、`apps/*`）
- [ ] `--lang zh` 输出中文
- [ ] 把漂移报告发成 PR 评论
- [ ] 封装成 GitHub Action

## 许可

MIT
