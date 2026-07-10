# Eval Noise Filtering 设计

**日期：** 2026-07-02
**状态：** 草案，待用户审阅后进入 implementation plan
**范围：** 为 Comet eval 实验和 HTML/Markdown 报告增加样本质量标记、默认去噪统计和可审计的 raw-vs-analysis 对比

## 1. 背景

当前 `eval/` 已经能通过 pytest、Docker、Claude Code 和本地验证脚本运行 Comet baseline
对比，并通过 `eval/local/scripts/compare_baselines.py` 产出 Markdown/HTML 报告。报告已经包含
rubric dimensions、pass@k/pass^k、task outcomes、spend summary、source evidence 和 failure
attribution。

现有 failure attribution 能说明失败更像 `harness`、`workflow`、`task` 还是 `model`，但它还不等于
样本质量控制。实验中会出现一些和 Skill 或模型能力无关的坏点，例如容器内 Claude API 超时、限额、
认证/网络异常、Docker 启动失败、外层 timeout 截断等。这些 run 如果直接进入 headline 均值、
pass@k、成本统计和 verdict，会让报告看起来像干净的 A/B 结论，实际却混入了环境噪声。

目标不是把坏数据藏起来，而是把报告变成两层口径：

- **Raw set**：保留所有 run，用于审计和复现。
- **Analysis set**：默认排除明确环境噪声，用于 headline metrics、图表和 verdict。

报告必须同时展示 raw-vs-analysis 差异，避免过滤策略本身成为新的黑箱。

## 2. 目标

- 为每个 eval run 写入结构化 `sample_quality` 元数据，描述它是否进入主统计以及原因。
- 默认将明确环境噪声从主统计排除，但在报告中完整列出。
- 将可疑 harness/task 噪声标记出来，并在敏感性分析中展示 raw set 与 analysis set 的差异。
- 保留真正的 workflow/model/task 信号，不因为失败影响分数就过滤。
- 让 HTML/Markdown 报告的 headline、charts、pass@k、spend summary 和 verdict 基于同一套 analysis set。
- 让用户能从报告判断下一步：重跑环境、修 eval harness、修 task/validator，还是修 Skill/workflow。
- 保持现有 report JSON 和 compare script 的兼容路径；旧报告缺少 `sample_quality` 时按 legacy 规则处理。

## 3. 非目标

- 不重写 pytest runner、Docker harness 或 Claude loop driver。
- 不引入自动重跑调度器。第一版只负责标记、过滤和报告；重跑策略可以后续加。
- 不让 LLM judge 决定样本是否过滤。去噪必须基于可解释的 run metadata、stderr/stdout 和验证结果。
- 不隐藏或删除任何原始 report、raw log、artifact snapshot。
- 不把所有 `harness` attribution 都自动排除。只有明确环境/运行器异常才进入 hard noise。
- 不改变 Comet rubric 维度的含义，也不把噪声过滤写进 rubric 分数本身。

## 4. 核心决策

### 4.1 默认策略：标记 + 主统计过滤

采用“标记 + 主统计默认过滤”，而不是只标记或直接静默过滤。

- Raw set 永远包含所有 report JSON。
- Analysis set 默认排除 hard noise。
- Soft noise 先进入 flagged 状态。第一版主统计可以继续包含 soft noise，但报告必须单独展示 raw-vs-analysis
  和 flagged counts；实现时保留配置开关，允许后续将部分 soft noise 排除或降权。
- Valid signal 全部保留，哪怕它们导致失败或低分。

这个策略类似论文实验中的 infrastructure failure exclusion：主结论只看可解释样本，但附录/审计区
清楚列出排除样本和原因。

### 4.2 样本质量分类

每个 run 归入一个顶层质量状态：

| 状态       | 是否进入主统计 | 含义                                                                    |
| ---------- | -------------- | ----------------------------------------------------------------------- |
| `included` | 是             | 可解释实验信号，进入 headline、charts、pass@k、spend summary 和 verdict |
| `excluded` | 否             | hard noise，明确不是 Skill/model/workflow 能力信号                      |
| `flagged`  | 是，单独标记   | soft noise 或边界情况，进入统计但报告必须显示风险                       |

同时使用 reason code 记录细分原因。

### 4.3 Hard noise

Hard noise 默认排除主统计。典型条件：

- `api_timeout`：Claude/API 调用超时，stdout 缺少完整 `result` 事件，或 stderr 明确包含 timeout。
- `rate_limited`：API 429、quota、rate limit、insufficient quota。
- `auth_failure`：API key、Claude CLI auth、proxy auth 明确失败。
- `network_failure`：DNS、TLS、connection reset/refused、gateway timeout 等网络错误。
- `container_failure`：Docker daemon 不可用、image build 失败、container 启动失败、挂载失败。
- `runner_timeout`：外层 pytest/subprocess timeout 截断，未得到完整 Claude result。
- `invalid_run_output`：stream-json 无法解析到任何有效 Claude result，且没有足够 artifact 证明任务真实执行。
- `missing_required_metadata`：没有 duration/tokens/cost/result 等基本元数据，且 stderr/stdout 指向运行器异常。

Hard noise 的共同特征是：任务没有被稳定执行到可评价阶段，不能说明 Skill 或模型能力。

### 4.4 Soft noise

Soft noise 默认标记为 `flagged`。典型条件：

- `harness_trigger_suspect`：target Skill 没触发，但 events/stdout 显示 profile、prompt、settings 或 injection
  可能有问题。
- `validator_assumption`：失败集中在路径、fixture 或 validator 假设上，而不是产物质量。
- `task_ambiguous`：任务定义自身给出互相冲突或不足以判断的要求。
- `partial_observability`：run 有 result 和部分 artifact，但关键 telemetry 缺失，仍能评价一部分信号。
- `judge_unavailable`：LLM judge 失败但规则 rubric 可用。它不影响主规则评分，只提示 qualitative overlay 缺失。

Soft noise 不应自动美化结果。报告需要让读者看到这些样本对结论的影响。

### 4.5 Valid signal

以下情况必须保留在主统计中：

- Skill 被调用但阶段推进失败。
- `.comet.yaml`、guard、handoff、archive 或验证报告缺失。
- 产物不完整、测试未写、实现错误。
- 模型选择错误路径、没有遵守决策点、没有完成用户要求。
- Validator 正常运行并报告任务失败。

这些失败是 Comet eval 要测量的对象，不能因为分数低就当噪声过滤。

## 5. 数据契约

每个 report JSON 在顶层或 `events_summary` 中新增 `sample_quality`。推荐放在顶层，方便 compare scripts
无需理解全部 events 也能过滤：

```json
{
  "sample_quality": {
    "status": "included",
    "reason_code": "valid_signal",
    "reason": "run completed with validator evidence",
    "include_in_analysis": true,
    "confidence": "high",
    "evidence": ["result event present", "validator completed", "artifact references present"]
  }
}
```

字段含义：

- `status`: `included | excluded | flagged`
- `reason_code`: 稳定机器可读代码，例如 `api_timeout`、`container_failure`、`validator_assumption`
- `reason`: 面向人的简短解释
- `include_in_analysis`: 是否进入主统计
- `confidence`: `high | medium | low`
- `evidence`: 触发判断的关键证据，避免报告只有结论没有依据

旧报告缺少 `sample_quality` 时，compare script 使用兼容推断：

- 有完整 report、events、rubric/validator evidence：按 `included`。
- stderr/stdout 或 checks 显示明确 hard noise：按 `excluded`。
- 只能从 failure attribution 看出 harness/task 可疑：按 `flagged`。

## 6. 组件边界

### 6.1 `eval/scaffold/python/sample_quality.py`

新增共享模块，负责：

- 定义 `SampleQuality` dataclass。
- 定义 reason code 常量。
- 根据 `report`、`events`、`stdout`、`stderr`、`returncode` 和 failure attribution 分类样本。
- 提供 `infer_sample_quality(...)` 和 `quality_from_legacy_report(...)`。

这个模块只做分类，不做聚合和渲染。

### 6.2 `eval/local/tests/conftest.py`

写 report 时调用 `infer_sample_quality(...)`，把结果保存到 report JSON。

`run_claude` 当前会保存 raw stdout/stderr；record_result 写 report 时已经能访问 events、passed/failed、artifact
references 和 attribution。第一版如果 record_result 拿不到 returncode/stdout/stderr，可以先基于 events 和
raw log reference 做分类，再在后续计划中把 subprocess result metadata 传入 record_result。

### 6.3 `eval/local/scripts/compare_baselines.py`

聚合时区分：

- `raw_by_treatment`
- `analysis_by_treatment`
- `flagged_by_treatment`
- `excluded_by_treatment`

所有 headline metric 读取 `analysis_by_treatment`。报告另增：

- `Data quality summary`
- `Excluded runs`
- `Flagged runs`
- `Raw vs analysis sensitivity`

source evidence 继续列出所有 raw runs，但标出 quality status。

### 6.4 `eval/scaffold/python/report_outputs.py`

HTML renderer 主要复用 Markdown 渲染。第一版无需复杂新组件，只要 Markdown 中有质量表格，HTML 就能呈现。

如果要让 paper figures 也反映去噪口径，应让 chart data 从 report Markdown 的 analysis tables 读取；
不要在 HTML 层重新判断过滤。

## 7. 报告设计

报告开头在 experiment metadata 后增加：

```text
## Data quality summary

| Treatment | Raw runs | Included | Flagged | Excluded |
|-----------|----------|----------|---------|----------|
| CONTROL | 5 | 5 | 0 | 0 |
| COMET_FULL_040_BETA | 5 | 4 | 1 | 0 |
| COMET_FULL_039 | 5 | 3 | 0 | 2 |
```

如果存在 excluded run，verdict 前必须出现：

```text
## Excluded runs

| Run | Task | Treatment | Reason | Evidence | Report |
|-----|------|-----------|--------|----------|--------|
| run-abc | comet-full-workflow | COMET_FULL_039 | api_timeout | stderr timeout; missing result event | reports/...json |
```

如果存在 flagged run，必须出现：

```text
## Flagged runs

| Run | Task | Treatment | Reason | Included? | Report |
```

敏感性分析展示过滤是否改变结论：

```text
## Raw vs analysis sensitivity

| Metric | Raw | Analysis | Delta |
|--------|-----|----------|-------|
| COMET_FULL_039 overall | 0.42 | 0.58 | +0.16 |
```

Verdict 必须写明口径：

- `Workflow is stable (analysis set: 4/5 included runs; 1 flagged; 0 excluded)`
- 若 excluded 太多，结论降级为 `inconclusive`，而不是强行判胜负。

## 8. Verdict 规则

主结论默认基于 analysis set。

如果任一关键 treatment 的 included runs 为 0：

- Verdict: `Insufficient clean data`
- 提示用户重跑该 treatment 或检查环境。

如果任一关键 treatment 的 excluded 比例超过 50%：

- Verdict: `Inconclusive due to data quality`
- 仍展示已包含样本的指标，但不应输出强 A/B 结论。

如果 raw-vs-analysis 改变了结论方向：

- Verdict 加风险提示：`Result is sensitive to excluded/flagged runs`
- 报告建议重跑 flagged/excluded task+treatment pair。

否则按现有 workflow-vs-baseline 规则输出 stable/regression。

## 9. 错误处理

- 分类器无法确定时使用 `flagged`，不要静默 `included` 或 `excluded`。
- 缺失 report JSON 时不生成假样本，只在 compare script 中提示 missing data。
- malformed report JSON 继续跳过读取，但在后续计划中可以增加 `load_errors` 报告。
- reason code 必须稳定，面向用户的 reason 可以调整。
- 旧报告兼容推断必须保守：只有明确 hard noise 才排除。

## 10. 测试策略

新增或扩展测试：

- `eval/local/tests/scaffold/test_sample_quality.py`
  - API timeout / rate limit / Docker failure -> `excluded`
  - validator failure with artifacts -> `included`
  - harness trigger suspect -> `flagged`
  - legacy report without `sample_quality` -> conservative inference
- `eval/local/tests/scaffold/test_compare_baselines.py`
  - excluded runs 不进入 run counts、pass@k、overall、spend summary
  - raw data quality summary 仍列出全部 raw runs
  - excluded/flagged tables 包含 report references
  - verdict 在 clean data 不足时输出 inconclusive
  - raw-vs-analysis sensitivity 出现并使用正确数字
- 保持 HTML renderer 测试：
  - HTML 包含 `Data quality summary`
  - charts 仍可渲染
  - 无外部 JS 依赖

验证命令从 `eval/` 目录执行：

```bash
uv run pytest local/tests/scaffold/test_sample_quality.py -q
uv run pytest local/tests/scaffold/test_compare_baselines.py -q
uv run pytest local/tests/scaffold -q
python -m compileall scaffold local/scripts
```

仓库级检查仍按项目要求在根目录执行：

```bash
pnpm format:check
pnpm lint
pnpm build
pnpm test
```

本地 Windows 若 pnpm wrapper 出现环境噪声，可用直接底层命令补充证明，但最终需要说明哪些检查真实执行成功。

## 11. 文档更新

实现完成后更新：

- `eval/local/README.md`：说明 data quality summary、included/flagged/excluded 的含义。
- `eval/README.md`：说明报告默认使用 analysis set，Raw set 仍保留审计。
- `docs/operations/EVAL-USAGE-ZH.md` 和 `docs/operations/EVAL-USAGE.md`：用户视角解释报告怎么读，不暴露过多 harness 术语。

如果只改内部报告逻辑但用户可见报告行为变化，`CHANGELOG.md` 应在当前版本条目下写英文 release note。

## 12. 成功标准

- 一个 API timeout run 不再拉低主报告的 pass@k、overall、cost efficiency 或 verdict。
- 报告仍能看到该 timeout run 的 task、treatment、reason、evidence 和 raw report 路径。
- 一个真实 workflow 失败不会被过滤，只会通过 failure attribution 解释。
- clean data 不足时报告明确说 inconclusive，而不是给出误导性的胜负结论。
- 旧实验报告仍能被 compare script 读取，不需要一次性重跑历史实验。
