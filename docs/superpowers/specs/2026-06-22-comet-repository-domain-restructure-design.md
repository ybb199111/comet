# Comet 仓库领域化重组设计

**日期：** 2026-06-22
**状态：** 已完成（当前仓库已迁移到 `app/`、`domains/`、`platform/`、`config/`、`scripts/`、`test/` 等领域化布局）
**范围：** 将 Comet 仓库从以技术层为主的布局调整为以领域为主的布局，同时保持 CLI 对外行为和安装结果兼容

## 1. 背景

当前仓库已经不再是单一运行时源码目录，而是同时承载多条主线：

- CLI 命令入口与安装流程；
- Comet Classic runtime 与脚本产物链；
- Skill 发现、安装、校验与快照；
- Engine 运行与状态推进；
- Bundle / Factory；
- Eval 任务、treatment、日志与实验脚手架；
- Skills、rules、hooks 等发布资源。

这些能力目前分散在多个按技术层命名的目录中，例如：

- `src/cli/` 与 `src/commands/` 负责入口；
- `src/core/` 同时承载平台辅助、安装逻辑与部分业务模块；
- `src/skill/`、`src/engine/`、`src/bundle/`、`src/factory/` 分别承载局部领域；
- `src/compat/` 实际承担了 Comet Classic 产品面的主要逻辑；
- `scripts/` 同时包含构建脚本与 benchmark 入口；
- `test/ts/` 基本按文件平铺，难以直接映射业务域；
- `eval/` 已经是独立主题，但在仓库整体结构里尚未被当作一等概念处理。

这种组织方式在仓库规模较小时可接受，但随着功能增长，会持续带来两类问题：

1. 新人很难从目录名直接理解系统由哪些业务主题组成；
2. 业务逻辑、入口装配和平台基础设施混在一起，导致边界持续变模糊，后续扩展成本上升。

因此需要一次明确的仓库领域化重组：

- 顶层先按业务主题组织；
- 领域内再按职责细分；
- 对外 CLI 与安装结果保持兼容；
- 将路径同步和构建链影响作为一等设计约束，而不是重组后的补丁工作。

## 2. 目标

1. 将仓库主认知入口从“技术层目录”改为“业务主题目录”。
2. 让新人能够从顶层结构快速理解 Comet 的主要子系统。
3. 明确区分入口装配、业务领域和平台基础设施。
4. 将 Eval 提升为一等主题，而不是脚本附属物。
5. 保持 `comet` CLI 对外命令、参数和行为兼容。
6. 保持安装到用户目录后的 skills、rules、hooks 结果兼容。
7. 允许仓库内部源码路径重排，但避免同时改变发布产物相对路径。
8. 将路径定位规则收口，减少未来改目录时需要全仓库搜改硬编码路径的成本。
9. 让测试、脚本和文档结构能映射新的领域边界，而不是继续平铺增长。

## 3. 非目标

- 不在本次重组中改变任何用户可见的 CLI 命令名或命令语义。
- 不在本次重组中改变安装到用户平台目录后的 skills / rules / hooks 布局。
- 不在本次重组中重新设计 Comet Classic、Skill Engine、Bundle 或 Eval 的功能行为。
- 不把所有发布资源布局一并改成新的外部结构；外部资源兼容优先于仓库内部美观。
- 不把 eval 顶层工作区删除或并入 `scripts/`。
- 不要求本次同时拆分成 monorepo 多 package 结构。

## 4. 设计约束

本设计以以下用户确认过的约束为前提：

- 目标优先级：`新人更容易理解目录` 与 `模块边界更清楚，后续扩展不乱`。
- 重组方式：一次性重组，而不是分阶段长期兼容旧目录。
- 范围：整个仓库都可以一起按领域重排，包括 `test/`、`scripts/` 和 `docs/`。
- 对外兼容：CLI 命令和安装结果必须兼容。
- 资源兼容边界：npm 包内部组织可以调整，但安装到用户目录后的结果应保持兼容。
- `eval/` 是一等主题，不能降级成 `scripts/` 下面的脚本集合。
- 源码不要求继续放在总 `src/` 目录下，可以提升为顶层领域结构。

## 5. 顶层结构

推荐将仓库主结构调整为：

```text
app/
domains/
platform/
assets/
eval/
scripts/
test/
docs/
bin/
```

各层职责如下。

### 5.1 `app/`

入口装配层。负责：

- CLI 参数解析；
- 命令路由；
- JSON / 终端输出格式化；
- 进程退出码控制；
- 调用领域 use case。

它承接当前：

- `src/cli/`
- `src/commands/`

它不再持有 skills 安装、classic 状态机规则、eval 协议等核心业务逻辑。

### 5.2 `domains/`

核心业务领域层。每个目录都应表达稳定的业务概念，而不是技术实现手段。

### 5.3 `platform/`

跨领域基础设施层。只保留脱离业务名词后仍然成立的环境与共享能力，例如：

- 文件系统；
- 进程与 shell 辅助；
- 平台识别；
- 安装目标路径解析；
- 通用错误类型；
- 版本与 package metadata 读取。

### 5.4 `assets/`

发布资源根目录。保持对外安装结果兼容，但仓库内部资源来源与生成逻辑可以更清晰。

### 5.5 `eval/`

评测工作区与实验资产目录。保留一级主题地位，继续承载：

- tasks；
- treatments；
- logs；
- regression baseline；
- scaffold；
- provider / suite 级资源。

### 5.6 `scripts/`

薄入口和构建发布脚本。脚本只做入口、编排和发布动作，不承载核心业务实现。

### 5.7 `test/`

按领域镜像组织测试，而不是继续将大量测试文件平铺在同一层级。

### 5.8 `docs/`

按架构、运维、指南等主题分类，和新的领域结构形成对应关系。

## 6. 领域划分

`domains/` 推荐采用以下结构：

```text
domains/
  comet-classic/
  skill/
  engine/
  bundle/
  factory/
  eval/
  integrations/
    openspec/
    superpowers/
    codegraph/
```

### 6.1 `domains/comet-classic`

承接当前 `src/compat/`。其真实语义不是“兼容层”，而是 Comet Classic 产品面。

建议内部继续分为：

- `runtime/`
- `state/`
- `guard/`
- `handoff/`
- `archive/`
- `migrate/`
- `resolver/`

### 6.2 `domains/skill`

承接当前 `src/skill/`，以及当前 `src/core/skills.ts` 中真正属于 Skill 生命周期的逻辑：

- discovery；
- install；
- load；
- validate；
- snapshot；
- package inspection。

此领域负责“Skill 作为产品能力”的生命周期，不负责宿主平台路径规则的底层实现。

### 6.3 `domains/engine`

承接当前 `src/engine/`。建议按运行时职责分组，而非仅按文件平铺：

- `run/`
- `state/`
- `resolver/`
- `guardrails/`
- `evals/`
- `store/`

### 6.4 `domains/bundle`

承接当前 `src/bundle/`，保持 Bundle authoring / distribute / publish 主线独立。

### 6.5 `domains/factory`

承接当前 `src/factory/`，独立描述 Bundle Factory 相关能力。

### 6.6 `domains/eval`

源码层中的评测能力实现。这里负责：

- 评测协议；
- provider 接口；
- 任务执行编排；
- 结果模型；
- 与顶层 `eval/` 工作区交互的领域逻辑。

顶层 `eval/` 保持为工作区和实验资产，`domains/eval` 则是源码实现。

### 6.7 `domains/integrations`

将外部能力集成明确建模为集成域，而非放在模糊的 `core/` 下。

- `integrations/openspec`
- `integrations/superpowers`
- `integrations/codegraph`

## 7. `app` 与 `platform` 的边界

### 7.1 `app` 的职责

`app/` 只做装配，不做业务判断。它应负责：

- 解析命令参数；
- 选择命令处理器；
- 协调一个或多个领域 use case；
- 控制输出与退出码。

例如 `init`、`update`、`uninstall` 最终应表现为：

```text
app/commands/init
  -> domains/skill
  -> domains/integrations/openspec
  -> domains/integrations/superpowers
  -> domains/integrations/codegraph
  -> platform/install
```

### 7.2 `platform` 的职责

`platform/` 只留真正跨领域复用的环境能力。适合迁入 `platform/` 的包括：

- 当前 `src/core/platforms.ts` 中的平台描述；
- 当前 `src/core/detect.ts` 中的平台探测与安装目标解析；
- 当前 `src/core/command-error.ts`；
- 当前 `src/core/shell-quote.ts`；
- 当前 `src/core/version.ts`；
- 当前 `src/utils/` 中通用文件系统与进程辅助。

### 7.3 不应保留在 `platform/` 的内容

以下内容属于业务域，不应继续放在共享基础设施层：

- OpenSpec 安装逻辑；
- Superpowers 安装逻辑；
- Skill 生命周期逻辑；
- Codegraph 业务判断；
- Comet Classic 状态机规则。

## 8. `core/` 的拆解策略

当前 `src/core/` 不再保留为目标结构。其内容按以下原则分流：

### 8.1 迁入 `platform/`

- `detect.ts`
- `platforms.ts`
- `command-error.ts`
- `shell-quote.ts`
- `version.ts`
- 共享环境级 `types.ts`

### 8.2 迁入业务域

- `skills.ts` -> `domains/skill`
- `openspec.ts` -> `domains/integrations/openspec`
- `superpowers.ts` -> `domains/integrations/superpowers`
- `codegraph.ts` -> `domains/integrations/codegraph`

### 8.3 删除 `core` 作为认知入口

重组后，开发者不再通过“core 是什么”理解系统，而是通过：

- `app` 看入口；
- `domains` 看业务；
- `platform` 看基础设施。

## 9. 评测主题的独立性

`eval/` 已经具备独立主题的特征，不能被视为 `scripts/` 子集。

本设计明确将评测拆成两层：

- 顶层 `eval/`：工作区、task corpus、treatments、logs、baseline、scaffold；
- `domains/eval/`：源码层的评测协议、执行逻辑和结果模型。

`scripts/` 仅保留调用评测能力的薄入口，例如 benchmark 启动器或回归脚本入口。

## 10. 测试、脚本与文档布局

### 10.1 测试布局

当前 `test/ts/` 大量按文件平铺。建议迁移为按领域镜像：

```text
test/
  app/
  domains/
    comet-classic/
    skill/
    engine/
    bundle/
    factory/
    eval/
    integrations/
  platform/
  fixtures/
```

测试命名应优先反映业务域与能力边界，而不是旧目录名。

### 10.2 脚本布局

建议将 `scripts/` 内部按职责再分组：

```text
scripts/
  build/
  release/
  benchmark/
  install/
```

其中：

- Classic runtime build 归入 `scripts/build/`；
- benchmark / regression 入口归入 `scripts/benchmark/`；
- postinstall / prepublish 检查归入 `scripts/install/` 或 `scripts/release/`。

### 10.3 文档布局

建议将 `docs/` 重新归类为：

```text
docs/
  architecture/
  operations/
  superpowers/
```

其中：

- 结构设计、领域边界、产物链说明归入 `architecture/`；
- 构建、发布、hook、manifest、安装维护说明归入 `operations/`。

## 11. 对外兼容边界

### 11.1 必须保持兼容的部分

1. CLI 对外命令名、参数名和行为。
2. 安装到用户平台目录后的 `skills/`、`rules/`、`hooks/` 结果。
3. Skills 文档、hook 和 manifest 所依赖的发布产物相对路径。

### 11.2 允许调整的部分

1. 仓库内部源码目录。
2. 仓库内部脚本目录。
3. 仓库内部测试目录与命名。
4. 仓库内部文档分组。
5. npm 包内部资源生成来源，只要最终安装结果保持兼容。

### 11.3 Classic runtime 的兼容原则

Classic runtime 的源码位置可以迁移，但生成后的产物路径在本次重组中应保持稳定，继续落到当前 manifest 与 skills 文档所依赖的位置。

原因是该路径同时影响：

- skills 文档引用；
- `assets/manifest.json`；
- hook 安装逻辑；
- update / install 逻辑；
- 多个测试夹具与契约测试。

因此本次优先迁源码路径，不先变更发布产物的相对路径协议。

## 12. 路径治理原则

### 12.1 先建立路径注册表，再迁目录

本次重组不应依赖全仓库搜索替换硬编码路径。应先建立统一的路径定位层，集中管理：

- assets 根路径；
- manifest 路径；
- 语言 skills 根路径；
- classic runtime entry 路径；
- classic runtime output 路径；
- install target roots；
- test fixture 关键根路径。

### 12.2 禁止未来继续散落硬编码路径

重组后，业务域和命令层不应继续直接书写：

- `path.join('assets', ...)`
- `path.resolve('assets', 'skills', ...)`
- `src/compat/...` 这类旧目录硬编码

统一通过路径注册表或资源定位器访问。

## 13. 迁移顺序

迁移应按依赖链，而不是按目录名推进。

### 13.1 第一步：建立新骨架

先创建目标结构：

- `app/`
- `domains/`
- `platform/`
- `test/` 新镜像子树
- `docs/` 新分组

此阶段先不删除旧目录。

### 13.2 第二步：抽路径注册表

将关键路径定义从当前分散位置收口。优先覆盖：

- skills 安装链；
- classic runtime build 链；
- update / init / uninstall 相关路径；
- manifest 与 rules / hooks 发布链。

### 13.3 第三步：迁移源码领域

建议顺序：

1. `src/compat/` -> `domains/comet-classic/`
2. `src/skill/` + `src/core/skills.ts` -> `domains/skill/`
3. `src/engine/` -> `domains/engine/`
4. `src/bundle/` -> `domains/bundle/`
5. `src/factory/` -> `domains/factory/`
6. `src/core/` 剩余模块 -> `platform/` 与 `domains/integrations/`

### 13.4 第四步：迁移 `app/`

将当前 CLI 与 commands 调整为只依赖新的领域入口与平台基础设施。

### 13.5 第五步：整理测试、脚本、文档与 eval

在源码层稳定后，再统一迁移：

- `test/` -> 新镜像结构；
- `scripts/` -> 构建 / 发布 / benchmark / install 分组；
- `docs/` -> architecture / operations / superpowers 分组；
- `eval/` -> 保持一级主题并补齐与 `domains/eval` 的边界说明。

## 14. 关键同步点

### 14.1 CLI

CLI 需要重接到新的 `app/` 和领域入口，但不改变对外命令面。

### 14.2 Rules

继续以 `assets/manifest.json` 作为唯一发布清单来源，避免 rule 路径在多个地方重复定义。

### 14.3 Hooks

hook 安装结果保持兼容，但安装逻辑应迁入明确模块，而不再散在 skills 安装流程中。

### 14.4 Build

Classic runtime build 链需要改为读取新的源码入口，但输出路径继续保持稳定。

### 14.5 Tests

测试需要同步新目录映射与新的路径注册表，避免继续依赖旧的源目录名。

### 14.6 Docs

架构与运维文档需要更新对源码入口、构建链、manifest 与 hook 关系的描述。

## 15. 推荐决策总结

本设计的推荐决策是：

1. 去掉总 `src/` 作为源码根。
2. 将仓库顶层改成 `app / domains / platform / assets / eval / scripts / test / docs`。
3. 将 `eval/` 维持为一级主题，并在源码层新增 `domains/eval/`。
4. 将 `src/compat/` 重新命名并迁移为 `domains/comet-classic/`。
5. 拆解当前 `src/core/`，将业务模块下沉到 domain，将环境能力收口到 `platform/`。
6. 保持 CLI 和安装结果兼容，不在本次重组中改变发布产物相对路径协议。
7. 在真正迁目录前先建立路径注册表，降低后续维护成本。

## 16. 风险与缓解

### 16.1 风险：路径同步遗漏

表现：build、tests、update/install、hook 或 manifest 链出现隐性断裂。

缓解：

- 先建立路径注册表；
- 迁移时按依赖链推进；
- 保留 classic runtime 输出路径稳定；
- 为 manifest、hook、runtime freshness、install/update 增加针对性验证。

### 16.2 风险：领域边界表面重命名，内部耦合未降

表现：目录更好看，但 `app` 仍直接做业务判断，`platform` 仍吸纳业务逻辑。

缓解：

- 明确 `app` 只做装配；
- 明确 `platform` 只留环境能力；
- 在迁移时优先处理 `core/` 的去语义化拆分。

### 16.3 风险：eval 被二次边缘化

表现：虽然保留顶层 `eval/`，但新增逻辑继续堆在脚本里。

缓解：

- 将评测协议和执行逻辑明确放入 `domains/eval/`；
- 将 `scripts/` 限制为薄入口；
- 在测试与文档中同时体现这条边界。

## 17. 实施前置条件

实施该重组前，应先产出实现计划，至少覆盖：

- 路径注册表设计；
- 源码迁移步骤；
- build / manifest / hook / install / update 同步点；
- tests 重组与验证命令；
- docs 更新清单；
- 对外兼容验证清单。

在实现计划获批前，不应直接开始大规模目录移动。
