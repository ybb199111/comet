# Comet 使用指南

## 一句话概括

Comet 是一个 AI 编码工作流引擎，把"提出需求 - 技术设计 - 写代码 - 验证 - 归档"这五步串成一条自动流水线。你只需 `/comet` 一个命令，剩下的交给它。

---

## 前置条件

- Node.js 20+
- Git
- Bash 环境（macOS/Linux 自带，Windows 用户需有 Git Bash）

---

## 安装

```bash
npm install -g @rpamis/comet
```

验证安装：

```bash
comet --version
```

---

## 快速上手（3 步开始）

### 1. 进入你的项目目录

```bash
cd your-project
```

### 2. 初始化

```bash
comet init
```

初始化过程会问你几个问题：

1. **选择 AI 平台** - 支持自动检测。比如你项目里已有 `.claude/` 目录，它会自动勾选 Claude Code。支持 28 个平台（Claude Code、Codex、Cursor、Windsurf 等）。
2. **安装范围** - `project`（当前项目）或 `global`（全局，所有项目共享）。
3. **Skill 语言** - English 或 中文。
4. 然后它会自动安装 OpenSpec + Superpowers + Comet 三组 Skill。

### 3. 开始工作

在你的 AI 编码工具（如 Claude Code、Codex）里输入：

```
/comet
```

Comet 会自动检测当前有没有活跃的 Spec（需求规格），然后引导你进入第一步。

---

## 五阶段工作流

Comet 把开发流程分成五个阶段，每个阶段完成后自动推进到下一个：

```
/comet-open -> /comet-design -> /comet-build -> /comet-verify -> /comet-archive
```

### 阶段 1：Open - 提出需求

- 命令：`/comet-open`
- 做什么：描述你要做什么功能/改动，生成 proposal.md、design.md、tasks.md
- 你需要做的：告诉 AI 你想要什么

### 阶段 2：Design - 深度设计

- 命令：`/comet-design`
- 做什么：头脑风暴，产出 Design Doc 和 delta spec
- 你需要做的：审核设计方案，确认技术路线

### 阶段 3：Build - 规划与构建

- 命令：`/comet-build`
- 做什么：生成实现计划，写代码，每个任务一个 commit
- 你需要做的：确认隔离方式（branch/worktree）和执行模式（subagent/TDD/直接构建等）

### 阶段 4：Verify - 验证与完成

- 命令：`/comet-verify`
- 做什么：运行测试，生成验证报告，处理分支状态
- 你需要做的：确认验证通过

### 阶段 5：Archive - 归档

- 命令：`/comet-archive`
- 做什么：把 delta spec 同步到主 spec，归档 change，更新状态
- 你需要做的：确认归档

---

## 快捷路径

不是所有改动都需要走完整的五阶段。Comet 提供了两条快捷路径：

### `/comet-hotfix` - 快速修 Bug

跳过头脑风暴和设计阶段，适合紧急修复：

```
open -> build -> verify -> archive
```

### `/comet-tweak` - 小改动

跳过头脑风暴和完整计划，适合文案调整、配置修改、文档优化等：

```
open -> 轻量构建 -> 轻量验证 -> archive
```

---

## 断点续传

这是 Comet 的核心优势之一。如果你中途关闭了 AI 编码会话（比如下班了），下次回来只需要：

```
/comet
```

Comet 会自动：

1. 找到所有活跃的 Spec
2. 如果有多个，让你选一个
3. 识别当前执行到哪个阶段
4. 从断点继续

不需要重新描述需求，不需要重新看代码确认进度。

---

## CLI 命令速查

| 命令 | 作用 |
|---|---|
| `comet init` | 在项目中初始化 Comet 工作流 |
| `comet status` | 查看当前活跃的 change 和下一步该做什么 |
| `comet doctor` | 诊断安装是否健康（检查 Skill、脚本、配置等） |
| `comet update` | 更新到最新版本并刷新 Skill |
| `comet --version` | 查看版本号 |
| `comet --help` | 查看帮助 |

---

## 项目结构说明

初始化后，你的项目会多出这些内容：

```
your-project/
├── .comet/
│   └── config.yaml              # Comet 配置（上下文压缩、自动流转等）
├── .claude/skills/              # Skill 文件（以 Claude Code 为例）
│   ├── comet/                   # Comet 核心 Skill 和脚本
│   ├── comet-*/                 # 各阶段子 Skill
│   ├── openspec-*/              # OpenSpec Skill
│   └── brainstorming/           # Superpowers Skill
├── openspec/                    # 需求管理
│   └── changes/<name>/          # 每个 change 一个目录
│       ├── .openspec.yaml       # OpenSpec 状态
│       ├── .comet.yaml          # Comet 工作流状态
│       ├── proposal.md          # 需求提案
│       ├── design.md            # 设计文档
│       ├── specs/               # 功能规格
│       └── tasks.md             # 任务清单
└── docs/superpowers/            # 设计和计划文档
    ├── specs/                   # 设计文档
    └── plans/                   # 实现计划
```

---

## 常用配置

在 `.comet/config.yaml` 中可以配置：

### 上下文压缩（节省 Token）

```yaml
context_compression: beta   # 开启后 Build 阶段输入 token 减少 25-30%
```

### 自动流转

```yaml
auto_transition: true   # true：阶段完成后自动触发下一个 Skill
                       # false：每个阶段完成后暂停，手动触发
```

---

## 支持的 AI 平台

Comet 支持 28 个 AI 编码平台，常用的包括：

Claude Code、Codex、Cursor、Windsurf、Cline、RooCode、Continue、GitHub Copilot、Gemini CLI、Amazon Q Developer、Kiro 等。

完整列表见 `comet init` 的交互选择。

---

## 典型使用场景

### 场景一：开发新功能

```
你：/comet
AI：检测到没有活跃 Spec，开始新 change。
你：我想加一个用户注册功能，支持邮箱和手机号。
AI：（自动进入 Open 阶段，生成 proposal、tasks）
    （自动进入 Design 阶段，头脑风暴后产出 Design Doc）
    （自动进入 Build 阶段，选择执行模式后开始编码）
    ...
```

### 场景二：修 Bug

```
你：/comet-hotfix
AI：开始 hotfix 流程。
你：登录页面在 Safari 上按钮点击无响应。
AI：（跳过设计，直接定位问题，修复，验证，归档）
```

### 场景三：小调整

```
你：/comet-tweak
AI：开始 tweak 流程。
你：把首页标题改成"欢迎使用"。
AI：（轻量流程，快速完成修改和归档）
```

### 场景四：断点续传

```
（上次在 Build 阶段下班了）
你：/comet
AI：检测到 1 个活跃 change：用户注册功能
    当前阶段：build（已完成 3/5 个任务）
    继续执行...
```

---

## 更新 Comet

```bash
comet update
```

或者：

```bash
npm install -g @rpamis/comet@latest
```

---

## 视频教程

- [Bilibili 视频](https://www.bilibili.com/video/BV1y4Gi6CEo1/)
- [抖音搜索 Comet](https://www.douyin.com/search/comet?aid=cd8fcc82-498b-4d59-8860-617deb719412&modal_id=7646429015808936293&type=general)
