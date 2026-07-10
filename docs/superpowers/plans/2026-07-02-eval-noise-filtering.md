# Eval Noise Filtering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Comet eval sample-quality classification so comparison reports use a clean analysis set while preserving raw, flagged, and excluded run evidence.

**Architecture:** Add a focused `sample_quality` scaffold module that classifies one run from report/events/raw evidence. Persist the classification into each run report, then have `compare_baselines.py` partition raw reports into analysis, flagged, and excluded sets before computing headline metrics and verdicts. Keep HTML rendering Markdown-driven so the report output layer does not reimplement filtering rules.

**Tech Stack:** Python 3.11, pytest, existing Comet eval scaffold modules, Markdown/HTML report renderer, repo-local docs and changelog.

## Global Constraints

- Do not rewrite pytest runner, Docker harness, or Claude loop driver.
- Do not introduce automatic rerun scheduling in this implementation.
- Do not use LLM judge output to decide whether a sample is filtered.
- Do not delete or hide raw report JSON, raw stdout/stderr, events, or artifact snapshots.
- Only clear environment/runner failures become `excluded`; workflow/model/task failures remain included unless the run is explicitly hard noise.
- Keep old report JSON readable when `sample_quality` is absent.
- Headline metrics, pass@k/pass^k, spend summary, task outcomes, charts, and verdict must use the same analysis set.
- Run eval Python tests from `D:\Project\Comet\eval`.
- Changelog is English. As of 2026-07-02, `package.json` is `0.4.0-beta.1`, `origin/master:package.json` is `0.3.11`, and `CHANGELOG.md` already has a `0.4.0-beta.1` entry; unless this changes before execution, append to that entry and do not bump the version.

---

## File Structure

- Create `eval/scaffold/python/sample_quality.py`
  - Owns `SampleQuality`, reason codes, hard/soft noise detection, legacy report inference, and helper accessors.
- Create `eval/local/tests/scaffold/test_sample_quality.py`
  - Unit tests for hard noise, soft noise, valid signal, explicit metadata, and legacy raw-log inference.
- Modify `eval/scaffold/python/__init__.py`
  - Export the sample-quality dataclass and helper functions.
- Modify `eval/local/tests/conftest.py`
  - Build per-run report payloads with top-level `sample_quality`.
  - Extend `record_result` to accept subprocess returncode/stdout/stderr without changing runner semantics.
- Modify `eval/local/tests/tasks/test_tasks.py`
  - Pass `result.returncode`, `result.stdout`, and `result.stderr` into `record_result`.
- Modify `eval/local/tests/scaffold/test_conftest_helpers.py`
  - Unit-test the report payload helper so sample quality is persisted.
- Modify `eval/local/scripts/compare_baselines.py`
  - Partition raw reports into analysis, flagged, and excluded sets.
  - Render data quality summary, excluded/flagged runs, raw-vs-analysis sensitivity, and quality-aware verdicts.
- Modify `eval/local/tests/scaffold/test_compare_baselines.py`
  - Cover analysis-set metrics, data quality tables, insufficient clean data, sensitivity output, and HTML rendering.
- Modify `eval/local/README.md`
  - Explain data quality statuses from local eval user perspective.
- Modify `eval/README.md`
  - Explain raw set vs analysis set in the broader eval README.
- Modify `docs/operations/EVAL-USAGE-ZH.md`
  - Explain how users should read included/flagged/excluded report rows in Chinese.
- Modify `docs/operations/EVAL-USAGE.md`
  - Mirror the user-facing explanation in English.
- Modify `CHANGELOG.md`
  - Add an English user-visible release note under `0.4.0-beta.1`.

---

### Task 1: Add Sample-Quality Classifier

**Files:**

- Create: `eval/scaffold/python/sample_quality.py`
- Create: `eval/local/tests/scaffold/test_sample_quality.py`
- Modify: `eval/scaffold/python/__init__.py`

**Interfaces:**

- Produces:
  - `SampleQuality(status: str, reason_code: str, reason: str, include_in_analysis: bool, confidence: str, evidence: list[str])`
  - `infer_sample_quality(...)-> SampleQuality`
  - `quality_from_report(report: dict[str, Any], *, experiment_dir: Path | None = None) -> SampleQuality`
  - `sample_quality_dict(report: dict[str, Any], *, experiment_dir: Path | None = None) -> dict[str, Any]`
  - `include_in_analysis(report: dict[str, Any], *, experiment_dir: Path | None = None) -> bool`
- Consumes:
  - Report dictionaries with existing `checks_passed`, `checks_failed`, `events_summary`, `sample_quality`, and `artifact_references` fields.
  - Raw stdout/stderr paths produced by `build_eval_artifact_references()`.

- [ ] **Step 1: Write failing tests for hard noise, soft noise, valid signal, and legacy inference**

Add `eval/local/tests/scaffold/test_sample_quality.py`:

```python
"""Unit tests for eval sample-quality classification."""

import json
from pathlib import Path

from scaffold.python.sample_quality import (
    include_in_analysis,
    infer_sample_quality,
    quality_from_report,
    sample_quality_dict,
)


def test_api_timeout_is_excluded_from_analysis():
    quality = infer_sample_quality(
        checks_failed=["Validation failed: no result"],
        stdout='{"type":"assistant","message":{"content":[]}}\n',
        stderr="Error: API request timed out after 600s",
        returncode=1,
    )

    assert quality.status == "excluded"
    assert quality.reason_code == "api_timeout"
    assert quality.include_in_analysis is False
    assert "API request timed out" in " ".join(quality.evidence)


def test_rate_limit_is_excluded_from_analysis():
    quality = infer_sample_quality(stderr="429 rate_limit_error: insufficient quota")

    assert quality.status == "excluded"
    assert quality.reason_code == "rate_limited"
    assert quality.include_in_analysis is False


def test_container_failure_is_excluded_from_analysis():
    quality = infer_sample_quality(stderr="ERROR: Docker daemon not running")

    assert quality.status == "excluded"
    assert quality.reason_code == "container_failure"
    assert quality.include_in_analysis is False


def test_validator_failure_with_observable_run_is_included():
    quality = infer_sample_quality(
        events={
            "duration_seconds": 42,
            "total_tokens": 1000,
            "total_cost_usd": 0.12,
            "skills_invoked": ["comet"],
            "artifact_references": {"report": "reports/demo.json"},
        },
        checks_failed=["validator failed: output file missing"],
        stdout=json.dumps({"type": "result", "duration_ms": 42000}) + "\n",
        returncode=0,
    )

    assert quality.status == "included"
    assert quality.reason_code == "valid_signal"
    assert quality.include_in_analysis is True


def test_harness_attribution_without_hard_noise_is_flagged():
    quality = infer_sample_quality(
        events={"duration_seconds": 10, "skills_invoked": []},
        checks_failed=["Required skill not invoked: comet"],
        failure_attribution=[
            {
                "bucket": "harness",
                "check": "Required skill not invoked: comet",
                "reason": "target Skill was never invoked",
            }
        ],
        stdout=json.dumps({"type": "result", "duration_ms": 10000}) + "\n",
        returncode=0,
    )

    assert quality.status == "flagged"
    assert quality.reason_code == "harness_trigger_suspect"
    assert quality.include_in_analysis is True


def test_existing_sample_quality_is_respected():
    report = {
        "sample_quality": {
            "status": "excluded",
            "reason_code": "api_timeout",
            "reason": "API timeout",
            "include_in_analysis": False,
            "confidence": "high",
            "evidence": ["stderr timeout"],
        }
    }

    quality = quality_from_report(report)

    assert quality.status == "excluded"
    assert quality.reason_code == "api_timeout"
    assert include_in_analysis(report) is False
    assert sample_quality_dict(report)["include_in_analysis"] is False


def test_legacy_report_reads_raw_stderr_reference(tmp_path: Path):
    stderr = tmp_path / "raw" / "workflow_rep1_stderr.txt"
    stderr.parent.mkdir()
    stderr.write_text("Timeout after 600s", encoding="utf-8")
    report = {
        "checks_passed": [],
        "checks_failed": ["no result"],
        "events_summary": {
            "artifact_references": {"raw_stderr": str(stderr)},
        },
    }

    quality = quality_from_report(report)

    assert quality.status == "excluded"
    assert quality.reason_code == "runner_timeout"
    assert quality.include_in_analysis is False
```

- [ ] **Step 2: Run the classifier tests and verify they fail**

Run from `D:\Project\Comet\eval`:

```bash
uv run pytest local/tests/scaffold/test_sample_quality.py -q
```

Expected: FAIL during import with `ModuleNotFoundError: No module named 'scaffold.python.sample_quality'`.

- [ ] **Step 3: Implement the classifier module**

Create `eval/scaffold/python/sample_quality.py`:

```python
"""Sample-quality classification for eval reports."""

from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Literal

QualityStatus = Literal["included", "excluded", "flagged"]
QualityConfidence = Literal["high", "medium", "low"]

_API_TIMEOUT_RE = re.compile(r"(api request timed out|request timed out|read timed out)", re.I)
_RUNNER_TIMEOUT_RE = re.compile(r"(timeout after|timed out after|subprocess.*timeout)", re.I)
_RATE_LIMIT_RE = re.compile(r"(429|rate[_ -]?limit|insufficient quota|quota exceeded)", re.I)
_AUTH_RE = re.compile(r"(authentication|unauthorized|invalid api key|api key|auth token)", re.I)
_NETWORK_RE = re.compile(
    r"(dns|tls|connection reset|connection refused|gateway timeout|econnreset|etimedout)",
    re.I,
)
_CONTAINER_RE = re.compile(
    r"(docker daemon not running|docker not available|build failed|container.*failed|mount.*failed)",
    re.I,
)
_VALIDATOR_RE = re.compile(r"(validator|artifact path|task directory|not found in archive)", re.I)


@dataclass(frozen=True)
class SampleQuality:
    status: QualityStatus
    reason_code: str
    reason: str
    include_in_analysis: bool
    confidence: QualityConfidence = "high"
    evidence: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _coerce_quality(value: dict[str, Any]) -> SampleQuality:
    status = value.get("status", "flagged")
    if status not in {"included", "excluded", "flagged"}:
        status = "flagged"
    include = bool(value.get("include_in_analysis", status != "excluded"))
    confidence = value.get("confidence", "medium")
    if confidence not in {"high", "medium", "low"}:
        confidence = "medium"
    evidence = value.get("evidence", [])
    return SampleQuality(
        status=status,
        reason_code=str(value.get("reason_code") or "legacy_unknown"),
        reason=str(value.get("reason") or "legacy sample-quality metadata"),
        include_in_analysis=include,
        confidence=confidence,
        evidence=[str(item) for item in evidence if item],
    )


def _read_text(path: str | None) -> str | None:
    if not path:
        return None
    try:
        return Path(path).read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None


def _artifact_text(report: dict[str, Any], key: str) -> str | None:
    refs = report.get("events_summary", {}).get("artifact_references") or {}
    value = refs.get(key)
    return _read_text(value if isinstance(value, str) else None)


def _has_result_event(stdout: str | None) -> bool:
    if not stdout:
        return False
    for line in stdout.splitlines():
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            continue
        if payload.get("type") == "result":
            return True
    return False


def _text_parts(*values: Any) -> str:
    parts: list[str] = []
    for value in values:
        if value is None:
            continue
        if isinstance(value, (list, tuple)):
            parts.extend(str(item) for item in value if item is not None)
        else:
            parts.append(str(value))
    return "\n".join(parts)


def _hard_noise(text: str, returncode: int | None, has_result: bool) -> SampleQuality | None:
    if _RATE_LIMIT_RE.search(text):
        return SampleQuality("excluded", "rate_limited", "API rate limit or quota failure", False, evidence=[text[:200]])
    if _API_TIMEOUT_RE.search(text):
        return SampleQuality("excluded", "api_timeout", "Claude/API request timed out", False, evidence=[text[:200]])
    if returncode == 124 or (_RUNNER_TIMEOUT_RE.search(text) and not has_result):
        return SampleQuality("excluded", "runner_timeout", "Runner timed out before a complete result", False, evidence=[text[:200]])
    if _CONTAINER_RE.search(text):
        return SampleQuality("excluded", "container_failure", "Docker/container failed before evaluation completed", False, evidence=[text[:200]])
    if _AUTH_RE.search(text):
        return SampleQuality("excluded", "auth_failure", "Authentication failed before evaluation completed", False, evidence=[text[:200]])
    if _NETWORK_RE.search(text):
        return SampleQuality("excluded", "network_failure", "Network failure interrupted evaluation", False, evidence=[text[:200]])
    return None


def _soft_noise(
    text: str,
    failure_attribution: list[dict[str, Any]],
    events: dict[str, Any],
    has_result: bool,
) -> SampleQuality | None:
    if any(item.get("bucket") == "harness" for item in failure_attribution):
        return SampleQuality(
            "flagged",
            "harness_trigger_suspect",
            "Harness attribution indicates the target Skill may not have been triggered",
            True,
            "medium",
            [item.get("reason", "") for item in failure_attribution if item.get("bucket") == "harness"],
        )
    if _VALIDATOR_RE.search(text) and any(item.get("bucket") == "task" for item in failure_attribution):
        return SampleQuality(
            "flagged",
            "validator_assumption",
            "Failure may come from task or validator assumptions",
            True,
            "medium",
            [text[:200]],
        )
    if has_result and (events.get("total_tokens") is None or events.get("total_cost_usd") is None):
        return SampleQuality(
            "flagged",
            "partial_observability",
            "Run completed but token or cost telemetry is incomplete",
            True,
            "medium",
            ["result event present but telemetry missing"],
        )
    return None


def infer_sample_quality(
    *,
    report: dict[str, Any] | None = None,
    events: dict[str, Any] | None = None,
    checks_failed: list[str] | None = None,
    failure_attribution: list[dict[str, Any]] | None = None,
    stdout: str | None = None,
    stderr: str | None = None,
    returncode: int | None = None,
) -> SampleQuality:
    report = report or {}
    existing = report.get("sample_quality")
    if isinstance(existing, dict):
        return _coerce_quality(existing)

    events = events or report.get("events_summary") or {}
    checks_failed = checks_failed if checks_failed is not None else report.get("checks_failed", [])
    failure_attribution = (
        failure_attribution
        if failure_attribution is not None
        else events.get("failure_attribution", [])
    )
    stdout = stdout if stdout is not None else _artifact_text(report, "raw_stdout")
    stderr = stderr if stderr is not None else _artifact_text(report, "raw_stderr")

    has_result = _has_result_event(stdout) or events.get("duration_seconds") is not None
    text = _text_parts(stderr, stdout, checks_failed)

    hard = _hard_noise(text, returncode, has_result)
    if hard:
        return hard

    soft = _soft_noise(text, failure_attribution, events, has_result)
    if soft:
        return soft

    if not has_result and checks_failed:
        return SampleQuality(
            "flagged",
            "partial_observability",
            "Run has failures but no complete result event was observed",
            True,
            "low",
            [str(checks_failed[0])],
        )

    return SampleQuality(
        "included",
        "valid_signal",
        "Run completed with validator evidence",
        True,
        "high",
        ["result event present" if has_result else "legacy report treated as valid signal"],
    )


def quality_from_report(
    report: dict[str, Any],
    *,
    experiment_dir: Path | None = None,
) -> SampleQuality:
    if experiment_dir is not None:
        refs = report.get("events_summary", {}).get("artifact_references") or {}
        normalized_refs = {}
        for key, value in refs.items():
            if isinstance(value, str) and not Path(value).is_absolute():
                normalized_refs[key] = str(experiment_dir / value)
            else:
                normalized_refs[key] = value
        if normalized_refs:
            report = {
                **report,
                "events_summary": {
                    **report.get("events_summary", {}),
                    "artifact_references": normalized_refs,
                },
            }
    return infer_sample_quality(report=report)


def sample_quality_dict(
    report: dict[str, Any],
    *,
    experiment_dir: Path | None = None,
) -> dict[str, Any]:
    return quality_from_report(report, experiment_dir=experiment_dir).to_dict()


def include_in_analysis(
    report: dict[str, Any],
    *,
    experiment_dir: Path | None = None,
) -> bool:
    return quality_from_report(report, experiment_dir=experiment_dir).include_in_analysis
```

- [ ] **Step 4: Export the new interface**

Modify `eval/scaffold/python/__init__.py`:

```python
from .sample_quality import (
    SampleQuality,
    include_in_analysis,
    infer_sample_quality,
    quality_from_report,
    sample_quality_dict,
)
```

Add these names to `__all__`:

```python
"SampleQuality", "infer_sample_quality", "quality_from_report",
"sample_quality_dict", "include_in_analysis",
```

- [ ] **Step 5: Run focused tests**

Run from `D:\Project\Comet\eval`:

```bash
uv run pytest local/tests/scaffold/test_sample_quality.py -q
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add eval/scaffold/python/sample_quality.py eval/local/tests/scaffold/test_sample_quality.py eval/scaffold/python/__init__.py
git commit -m "feat(eval): classify noisy samples"
```

---

### Task 2: Persist Sample Quality in Run Reports

**Files:**

- Modify: `eval/local/tests/conftest.py`
- Modify: `eval/local/tests/tasks/test_tasks.py`
- Modify: `eval/local/tests/scaffold/test_conftest_helpers.py`

**Interfaces:**

- Consumes:
  - `infer_sample_quality(...)` from Task 1.
- Produces:
  - `record_result(..., returncode: int | None = None, stdout: str | None = None, stderr: str | None = None)`
  - `conftest._build_report_payload(...) -> dict[str, Any]`
  - Top-level `report["sample_quality"]` in every newly saved per-run report.

- [ ] **Step 1: Write failing test for report payload metadata**

Append to `eval/local/tests/scaffold/test_conftest_helpers.py`:

```python
def test_build_report_payload_persists_sample_quality():
    report = conftest._build_report_payload(
        treatment_name="COMET_FULL_040_BETA",
        rep=1,
        run_id="run-1",
        events={"duration_seconds": 10, "total_tokens": 100, "total_cost_usd": 0.01},
        passed=["[RUBRIC] weighted_score: 1.00"],
        failed=[],
        scripts_used=[],
        artifact_references={"report": "reports/demo.json"},
        failure_attribution=[],
        returncode=0,
        stdout=json.dumps({"type": "result", "duration_ms": 10000}) + "\n",
        stderr="",
    )

    assert report["sample_quality"]["status"] == "included"
    assert report["sample_quality"]["reason_code"] == "valid_signal"
    assert report["sample_quality"]["include_in_analysis"] is True


def test_build_report_payload_marks_timeout_as_excluded():
    report = conftest._build_report_payload(
        treatment_name="COMET_FULL_039",
        rep=1,
        run_id="run-2",
        events={},
        passed=[],
        failed=["no result"],
        scripts_used=[],
        artifact_references={"report": "reports/demo.json"},
        failure_attribution=[],
        returncode=124,
        stdout="",
        stderr="Timeout after 600s",
    )

    assert report["sample_quality"]["status"] == "excluded"
    assert report["sample_quality"]["reason_code"] == "runner_timeout"
    assert report["sample_quality"]["include_in_analysis"] is False
```

- [ ] **Step 2: Run the new helper tests and verify they fail**

Run from `D:\Project\Comet\eval`:

```bash
uv run pytest local/tests/scaffold/test_conftest_helpers.py::test_build_report_payload_persists_sample_quality local/tests/scaffold/test_conftest_helpers.py::test_build_report_payload_marks_timeout_as_excluded -q
```

Expected: FAIL with `AttributeError: module 'conftest' has no attribute '_build_report_payload'`.

- [ ] **Step 3: Add report payload helper and extend record_result**

In `eval/local/tests/conftest.py`, add the import:

```python
from scaffold.python.sample_quality import infer_sample_quality
```

Add this helper near the existing record-result code:

```python
def _build_report_payload(
    *,
    treatment_name: str,
    rep: int,
    run_id: str,
    events: dict[str, Any],
    passed: list[str],
    failed: list[str],
    scripts_used: list[str],
    artifact_references: dict[str, str],
    failure_attribution: list[dict[str, str]],
    returncode: int | None = None,
    stdout: str | None = None,
    stderr: str | None = None,
) -> dict[str, Any]:
    sample_quality = infer_sample_quality(
        events=events,
        checks_failed=failed,
        failure_attribution=failure_attribution,
        stdout=stdout,
        stderr=stderr,
        returncode=returncode,
    ).to_dict()
    return {
        "name": treatment_name,
        "rep": rep,
        "passed": len(failed) == 0,
        "run_id": run_id,
        "checks_passed": passed,
        "checks_failed": failed,
        "sample_quality": sample_quality,
        "events_summary": {
            "duration_seconds": events.get("duration_seconds"),
            "num_turns": events.get("num_turns"),
            "tool_calls": len(events.get("tool_calls", [])),
            "input_tokens": events.get("input_tokens"),
            "output_tokens": events.get("output_tokens"),
            "cache_read_input_tokens": events.get("cache_read_input_tokens"),
            "cache_creation_input_tokens": events.get("cache_creation_input_tokens"),
            "total_tokens": events.get("total_tokens"),
            "total_cost_usd": events.get("total_cost_usd"),
            "model_usage": events.get("model_usage", {}),
            "files_created": events.get("files_created", []),
            "skills_invoked": events.get("skills_invoked", []),
            "scripts_used": scripts_used,
            "profile": events.get("profile"),
            "skill_sources": events.get("skill_sources", []),
            "eval_manifest": events.get("eval_manifest"),
            "interaction": events.get("interaction", {}),
            "artifact_references": artifact_references,
            "failure_attribution": failure_attribution,
        },
        "timestamp": datetime.now().isoformat(),
    }
```

Change the inner `_record` signature:

```python
    def _record(
        events: dict[str, Any],
        passed: list[str],
        failed: list[str],
        run_id: str = "",
        returncode: int | None = None,
        stdout: str | None = None,
        stderr: str | None = None,
    ):
```

Replace the inline `report = { ... }` block with:

```python
        report = _build_report_payload(
            treatment_name=treatment_name,
            rep=rep,
            run_id=run_id,
            events=events,
            passed=passed,
            failed=failed,
            scripts_used=scripts_used,
            artifact_references=artifact_references,
            failure_attribution=failure_attribution,
            returncode=returncode,
            stdout=stdout,
            stderr=stderr,
        )
```

- [ ] **Step 4: Pass subprocess metadata from the task runner**

In `eval/local/tests/tasks/test_tasks.py`, replace:

```python
    fixtures.record_result(events, passed, failed, run_id=run_id)
```

with:

```python
    fixtures.record_result(
        events,
        passed,
        failed,
        run_id=run_id,
        returncode=result.returncode,
        stdout=result.stdout,
        stderr=result.stderr,
    )
```

- [ ] **Step 5: Run focused tests**

Run from `D:\Project\Comet\eval`:

```bash
uv run pytest local/tests/scaffold/test_conftest_helpers.py::test_build_report_payload_persists_sample_quality local/tests/scaffold/test_conftest_helpers.py::test_build_report_payload_marks_timeout_as_excluded -q
```

Expected: PASS.

- [ ] **Step 6: Run related scaffold tests**

Run from `D:\Project\Comet\eval`:

```bash
uv run pytest local/tests/scaffold/test_conftest_helpers.py local/tests/scaffold/test_logging.py -q
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add eval/local/tests/conftest.py eval/local/tests/tasks/test_tasks.py eval/local/tests/scaffold/test_conftest_helpers.py
git commit -m "feat(eval): persist sample quality in reports"
```

---

### Task 3: Use Analysis Set in Baseline Comparison Reports

**Files:**

- Modify: `eval/local/scripts/compare_baselines.py`
- Modify: `eval/local/tests/scaffold/test_compare_baselines.py`

**Interfaces:**

- Consumes:
  - `quality_from_report(report, experiment_dir=experiment_dir)` from Task 1.
  - Top-level `sample_quality` from Task 2.
- Produces:
  - `ReportPartitions(raw, analysis, flagged, excluded)`
  - `_partition_reports(by_treatment, experiment_dir) -> ReportPartitions`
  - Report sections: `Data quality summary`, `Excluded runs`, `Flagged runs`, `Raw vs analysis sensitivity`
  - Verdicts: `Insufficient clean data`, `Inconclusive due to data quality`, and existing stable/regression verdicts with analysis-set counts.

- [ ] **Step 1: Write failing tests for analysis-set aggregation**

Append to `eval/local/tests/scaffold/test_compare_baselines.py`:

```python
def _write_quality_report(
    reports_dir: Path,
    filename: str,
    *,
    name: str,
    weighted_score: float,
    tokens: int,
    cost: float,
    sample_quality: dict,
    passed: bool = True,
):
    report = {
        "name": name,
        "passed": passed,
        "run_id": filename,
        "checks_passed": [f"[RUBRIC] weighted_score: {weighted_score:.2f}"],
        "checks_failed": [] if passed else ["validator failed"],
        "sample_quality": sample_quality,
        "events_summary": {
            "total_tokens": tokens,
            "total_cost_usd": cost,
            "artifact_references": {"report": f"reports/{filename}.json"},
        },
    }
    (reports_dir / f"{filename}.json").write_text(json.dumps(report), encoding="utf-8")


def test_compare_report_excludes_hard_noise_from_analysis_metrics(tmp_path: Path):
    experiment = tmp_path / "experiment"
    reports = experiment / "reports"
    reports.mkdir(parents=True)
    _write_report(reports, "CONTROL", 100, 0.01)
    _write_quality_report(
        reports,
        "workflow_clean",
        name="comet-fix-median-COMET_FULL_040_BETA",
        weighted_score=1.0,
        tokens=200,
        cost=0.02,
        sample_quality={
            "status": "included",
            "reason_code": "valid_signal",
            "reason": "clean",
            "include_in_analysis": True,
            "confidence": "high",
            "evidence": ["result event present"],
        },
    )
    _write_quality_report(
        reports,
        "workflow_timeout",
        name="comet-fix-median-COMET_FULL_040_BETA-r1",
        weighted_score=0.0,
        tokens=999,
        cost=9.99,
        sample_quality={
            "status": "excluded",
            "reason_code": "api_timeout",
            "reason": "timeout",
            "include_in_analysis": False,
            "confidence": "high",
            "evidence": ["stderr timeout"],
        },
        passed=False,
    )
    _write_report(reports, "COMET_FULL_039", 300, 0.03)

    report = build_report(experiment)

    assert "## Data quality summary" in report
    assert "| COMET_FULL_040_BETA | 2 | 1 | 0 | 1 |" in report
    assert "| COMET_FULL_040_BETA | 1 |" in report
    assert "| COMET_FULL_040_BETA | 1 | 200 | $0.0200 | 200 | $0.0200 |" in report
    assert "workflow_timeout" in report
    assert "api_timeout" in report
    assert "999" not in report.split("## Spend summary", 1)[1].split("## Source evidence", 1)[0]


def test_compare_report_lists_flagged_runs_without_excluding_them(tmp_path: Path):
    experiment = tmp_path / "experiment"
    reports = experiment / "reports"
    reports.mkdir(parents=True)
    _write_report(reports, "CONTROL", 100, 0.01)
    _write_report(reports, "COMET_FULL_039", 300, 0.03)
    _write_quality_report(
        reports,
        "workflow_flagged",
        name="comet-full-workflow-COMET_FULL_040_BETA",
        weighted_score=0.5,
        tokens=200,
        cost=0.02,
        sample_quality={
            "status": "flagged",
            "reason_code": "harness_trigger_suspect",
            "reason": "target Skill may not have been triggered",
            "include_in_analysis": True,
            "confidence": "medium",
            "evidence": ["target Skill was never invoked"],
        },
    )

    report = build_report(experiment)

    assert "## Flagged runs" in report
    assert "harness_trigger_suspect" in report
    assert "| COMET_FULL_040_BETA | 1 | 200 | $0.0200 | 200 | $0.0200 |" in report


def test_compare_report_reports_insufficient_clean_data(tmp_path: Path):
    experiment = tmp_path / "experiment"
    reports = experiment / "reports"
    reports.mkdir(parents=True)
    _write_report(reports, "CONTROL", 100, 0.01)
    _write_report(reports, "COMET_FULL_039", 300, 0.03)
    _write_quality_report(
        reports,
        "workflow_timeout",
        name="comet-full-workflow-COMET_FULL_040_BETA",
        weighted_score=0.0,
        tokens=999,
        cost=9.99,
        sample_quality={
            "status": "excluded",
            "reason_code": "runner_timeout",
            "reason": "timeout",
            "include_in_analysis": False,
            "confidence": "high",
            "evidence": ["Timeout after 600s"],
        },
        passed=False,
    )

    report = build_report(experiment)

    assert "Insufficient clean data" in report
    assert "COMET_FULL_040_BETA" in report


def test_html_report_includes_data_quality_summary(tmp_path: Path):
    experiment = tmp_path / "experiment"
    reports = experiment / "reports"
    reports.mkdir(parents=True)
    _write_report(reports, "CONTROL", 100, 0.01)
    _write_report(reports, "COMET_FULL_040_BETA", 200, 0.02)
    _write_report(reports, "COMET_FULL_039", 300, 0.03)

    markdown = build_report(experiment)
    html = render_markdown_html(markdown, title="Comet Baseline Comparison Report")

    assert "Data quality summary" in html
    assert "paper-figure" in html
```

- [ ] **Step 2: Run comparison tests and verify they fail**

Run from `D:\Project\Comet\eval`:

```bash
uv run pytest local/tests/scaffold/test_compare_baselines.py -q
```

Expected: FAIL because `Data quality summary`, flagged/excluded tables, and clean-data verdicts do not exist yet.

- [ ] **Step 3: Add report partitioning helpers**

In `eval/local/scripts/compare_baselines.py`, add imports:

```python
from dataclasses import dataclass
from scaffold.python.sample_quality import quality_from_report, sample_quality_dict
```

Add after treatment constants:

```python
@dataclass(frozen=True)
class ReportPartitions:
    raw: dict[str, list[dict]]
    analysis: dict[str, list[dict]]
    flagged: dict[str, list[dict]]
    excluded: dict[str, list[dict]]
```

Add helper functions near `_load_reports`:

```python
def _partition_reports(
    by_treatment: dict[str, list[dict]],
    experiment_dir: Path,
) -> ReportPartitions:
    analysis: dict[str, list[dict]] = defaultdict(list)
    flagged: dict[str, list[dict]] = defaultdict(list)
    excluded: dict[str, list[dict]] = defaultdict(list)

    for treatment, reports in by_treatment.items():
        for report in reports:
            quality = quality_from_report(report, experiment_dir=experiment_dir)
            if quality.status == "excluded" or not quality.include_in_analysis:
                excluded[treatment].append(report)
            else:
                analysis[treatment].append(report)
                if quality.status == "flagged":
                    flagged[treatment].append(report)

    return ReportPartitions(
        raw={key: list(value) for key, value in by_treatment.items()},
        analysis={key: list(value) for key, value in analysis.items()},
        flagged={key: list(value) for key, value in flagged.items()},
        excluded={key: list(value) for key, value in excluded.items()},
    )


def _quality_counts(partitions: ReportPartitions, treatment: str) -> tuple[int, int, int, int]:
    raw = len(partitions.raw.get(treatment, []))
    included = len(partitions.analysis.get(treatment, []))
    flagged = len(partitions.flagged.get(treatment, []))
    excluded = len(partitions.excluded.get(treatment, []))
    return raw, included, flagged, excluded


def _report_ref(report: dict) -> str:
    return (
        (report.get("events_summary", {}).get("artifact_references") or {}).get("report")
        or report.get("run_id")
        or "none"
    )


def _quality_run_rows(
    reports: list[dict],
    treatment: str,
    experiment_dir: Path,
    *,
    include_column: bool,
) -> list[str]:
    rows: list[str] = []
    for report in reports:
        quality = sample_quality_dict(report, experiment_dir=experiment_dir)
        task = _task_name(report, treatment)
        evidence = "; ".join(quality.get("evidence", [])[:2]) or "none"
        include_text = f" | {'yes' if quality.get('include_in_analysis') else 'no'}" if include_column else ""
        rows.append(
            f"| `{report.get('run_id') or 'n/a'}` | {task} | {treatment} | "
            f"{quality.get('reason_code')} | {evidence}{include_text} | {_report_ref(report)} |"
        )
    return rows


def _overall_by_reports(reports: list[dict]) -> float | None:
    if not reports:
        return None
    return _overall(_aggregate(reports))


def _fmt_optional_score(value: float | None) -> str:
    return "—" if value is None else f"{value:.2f}"
```

- [ ] **Step 4: Switch headline aggregation to analysis set**

In `build_report`, replace the beginning:

```python
    by_treatment = _load_reports(experiment_dir)
    aggregated = {t: _aggregate(reps) for t, reps in by_treatment.items() if reps}
```

with:

```python
    raw_by_treatment = _load_reports(experiment_dir)
    partitions = _partition_reports(raw_by_treatment, experiment_dir)
    by_treatment = partitions.analysis
    aggregated = {t: _aggregate(reps) for t, reps in by_treatment.items() if reps}
    raw_aggregated = {t: _aggregate(reps) for t, reps in raw_by_treatment.items() if reps}
```

Change the treatments line:

```python
    lines.append(f"- Treatments with data: {', '.join(sorted(raw_by_treatment)) or 'none'}")
```

Keep `aggregated` for analysis metrics. Use `raw_by_treatment` only for data quality, source evidence, excluded/flagged tables, sensitivity, and failure attribution.

- [ ] **Step 5: Add data quality summary before run counts**

Insert after the `not aggregated` early return block, but before `## Run counts`:

```python
    lines.append("## Data quality summary")
    lines.append("")
    lines.append("| Treatment | Raw runs | Included | Flagged | Excluded |")
    lines.append("|-----------|----------|----------|---------|----------|")
    for t in TREATMENTS:
        raw, included, flagged, excluded = _quality_counts(partitions, t)
        if raw == 0:
            continue
        lines.append(f"| {t} | {raw} | {included} | {flagged} | {excluded} |")
    lines.append("")
```

Change the run-count heading line to make the analysis-set scope explicit:

```python
    lines.append("## Run counts")
    lines.append("")
    lines.append("_Analysis set only; excluded hard-noise runs are omitted._")
    lines.append("")
```

- [ ] **Step 6: Make source evidence quality-aware and keep it raw**

Change `_source_summary` to accept quality:

```python
def _source_summary(report: dict, quality: dict[str, Any]) -> str:
    events = report.get("events_summary", {})
    run_id = report.get("run_id") or "n/a"
    profile = events.get("profile") or "n/a"
    sources = events.get("skill_sources") or []
    source_text = ", ".join(
        (
            f"{item.get('name', 'skill')}@{item.get('hash', item.get('path', 'unknown'))}"
            if isinstance(item, dict)
            else str(item)
        )
        for item in sources
    ) or "none"
    manifest = events.get("eval_manifest") or "none"
    report_ref = (events.get("artifact_references") or {}).get("report", "none")
    return (
        f"| `{run_id}` | {quality.get('status')} | {quality.get('reason_code')} | "
        f"{profile} | {source_text} | {manifest} | {report_ref} |"
    )
```

Change source evidence rendering:

```python
    lines.append("## Source evidence")
    lines.append("")
    lines.append("| Run | Quality | Reason | Profile | Skill sources | Eval manifest | Report |")
    lines.append("|-----|---------|--------|---------|---------------|---------------|--------|")
    for treatment in TREATMENTS:
        for rep in raw_by_treatment.get(treatment, []):
            quality = sample_quality_dict(rep, experiment_dir=experiment_dir)
            lines.append(_source_summary(rep, quality))
    lines.append("")
```

- [ ] **Step 7: Add excluded, flagged, and sensitivity sections before failure attribution**

Insert before `## Failure attribution`:

```python
    excluded_total = sum(len(items) for items in partitions.excluded.values())
    if excluded_total:
        lines.append("## Excluded runs")
        lines.append("")
        lines.append("| Run | Task | Treatment | Reason | Evidence | Report |")
        lines.append("|-----|------|-----------|--------|----------|--------|")
        for treatment in TREATMENTS:
            lines.extend(
                _quality_run_rows(
                    partitions.excluded.get(treatment, []),
                    treatment,
                    experiment_dir,
                    include_column=False,
                )
            )
        lines.append("")

    flagged_total = sum(len(items) for items in partitions.flagged.values())
    if flagged_total:
        lines.append("## Flagged runs")
        lines.append("")
        lines.append("| Run | Task | Treatment | Reason | Evidence | Included? | Report |")
        lines.append("|-----|------|-----------|--------|----------|-----------|--------|")
        for treatment in TREATMENTS:
            lines.extend(
                _quality_run_rows(
                    partitions.flagged.get(treatment, []),
                    treatment,
                    experiment_dir,
                    include_column=True,
                )
            )
        lines.append("")

    lines.append("## Raw vs analysis sensitivity")
    lines.append("")
    lines.append("| Metric | Raw | Analysis | Delta |")
    lines.append("|--------|-----|----------|-------|")
    for treatment in TREATMENTS:
        raw_value = _overall(raw_aggregated[treatment]) if treatment in raw_aggregated else None
        analysis_value = _overall(aggregated[treatment]) if treatment in aggregated else None
        if raw_value is None and analysis_value is None:
            continue
        delta = "—" if raw_value is None or analysis_value is None else f"{analysis_value - raw_value:+.2f}"
        lines.append(
            f"| {treatment} overall | {_fmt_optional_score(raw_value)} | "
            f"{_fmt_optional_score(analysis_value)} | {delta} |"
        )
    lines.append("")
```

- [ ] **Step 8: Keep failure attribution raw**

In the failure attribution loop, change:

```python
        attr = _attributions(by_treatment.get(t, []))
```

to:

```python
        attr = _attributions(raw_by_treatment.get(t, []))
```

- [ ] **Step 9: Add data-quality verdict guards**

At the start of the verdict decision block, before comparing regressions, compute:

```python
    key_treatments = (WORKFLOW, BASELINE)
    missing_clean = [t for t in key_treatments if not by_treatment.get(t)]
    noisy_majority = []
    for t in key_treatments:
        raw, _included, _flagged, excluded = _quality_counts(partitions, t)
        if raw > 0 and excluded / raw > 0.5:
            noisy_majority.append(t)
```

Then update verdict conditions:

```python
    if missing_clean:
        lines.append(
            "⚠️ **Insufficient clean data**: analysis set has no included runs for "
            + ", ".join(f"`{t}`" for t in missing_clean)
            + ". Rerun the affected task/treatment pairs or inspect the excluded runs above."
        )
    elif noisy_majority:
        lines.append(
            "⚠️ **Inconclusive due to data quality**: more than half of the raw runs were "
            "excluded for "
            + ", ".join(f"`{t}`" for t in noisy_majority)
            + ". The analysis metrics are shown, but the A/B verdict should not be treated as final."
        )
    elif WORKFLOW not in aggregated or BASELINE not in aggregated:
        lines.append(f"Insufficient data: need both `{WORKFLOW}` and `{BASELINE}` runs.")
```

Keep the existing `elif regressions:` and stable/overall-lower branches after these guards.

Append one line after the final verdict text when clean data exists:

```python
        raw, included, flagged, excluded = _quality_counts(partitions, WORKFLOW)
        lines.append("")
        lines.append(
            f"_Verdict uses analysis set: `{WORKFLOW}` included {included}/{raw} raw run(s), "
            f"flagged {flagged}, excluded {excluded}._"
        )
```

- [ ] **Step 10: Run focused comparison tests**

Run from `D:\Project\Comet\eval`:

```bash
uv run pytest local/tests/scaffold/test_compare_baselines.py -q
```

Expected: PASS.

- [ ] **Step 11: Run related scaffold tests**

Run from `D:\Project\Comet\eval`:

```bash
uv run pytest local/tests/scaffold/test_sample_quality.py local/tests/scaffold/test_compare_baselines.py local/tests/scaffold/test_report_style_demo_charts.py -q
```

Expected: PASS.

- [ ] **Step 12: Commit Task 3**

```bash
git add eval/local/scripts/compare_baselines.py eval/local/tests/scaffold/test_compare_baselines.py
git commit -m "feat(eval): filter noisy runs from comparison metrics"
```

---

### Task 4: Update Eval Docs and Changelog

**Files:**

- Modify: `eval/local/README.md`
- Modify: `eval/README.md`
- Modify: `docs/operations/EVAL-USAGE-ZH.md`
- Modify: `docs/operations/EVAL-USAGE.md`
- Modify: `CHANGELOG.md`

**Interfaces:**

- Consumes:
  - Report sections and semantics from Task 3.
- Produces:
  - User-facing documentation for raw set, analysis set, included, flagged, and excluded runs.
  - English changelog entry for the user-visible report behavior change.

- [ ] **Step 1: Update local eval README**

In `eval/local/README.md`, after the existing line:

```markdown
每次运行的报告都会包含 profile、Skill 来源元数据、run id、产物引用，以及结构化失败归因。归因桶包括 `harness`、`workflow`、`task` 和 `model`。
```

add:

```markdown
比较报告还会显示 `Data quality summary`。报告保留所有 raw runs 供审计，但 headline 指标、pass@k/pass^k、成本统计、图表和 verdict 默认使用 analysis set。`excluded` 表示明确的环境或运行器噪声（例如 API timeout、rate limit、Docker 启动失败），不会进入主统计；`flagged` 表示可疑 harness/task 噪声，仍进入主统计但会在报告中单独标出；真实 workflow/model/task 失败会保留为 `included`，不会因为分数低被过滤。
```

- [ ] **Step 2: Update top-level eval README**

In `eval/README.md`, after the “快速开始” command section and before “评估任意 Skill”, add:

```markdown
### 报告中的去噪口径

Eval 报告同时保留 raw set 和 analysis set。Raw set 包含所有 run，方便追查原始 stdout/stderr、events、reports 和 artifacts；analysis set 默认排除明确环境噪声，用于 headline 指标、pass@k/pass^k、成本统计、图表和 verdict。

- `included`：可解释实验信号，进入主统计。真实 workflow、model、task 或 validator 失败仍属于这一类。
- `flagged`：可疑 harness/task 噪声，进入主统计，但报告会提示它可能影响结论。
- `excluded`：明确环境或运行器噪声，不进入主统计，例如 API timeout、rate limit、认证/网络失败、Docker/container failure 或外层 runner timeout。

如果关键 treatment 的 clean data 不足，报告会输出 `Insufficient clean data` 或 `Inconclusive due to data quality`，而不是给出误导性的胜负结论。
```

- [ ] **Step 3: Update Chinese operations guide**

In `docs/operations/EVAL-USAGE-ZH.md`, after the section that explains failure attribution, add:

```markdown
报告还会区分 raw set 和 analysis set。Raw set 保留所有运行记录；analysis set 是默认用于 headline、pass@k、成本、图表和 verdict 的去噪集合。`excluded` 通常表示 API timeout、rate limit、认证/网络失败、Docker/container failure 或外层 timeout，这类样本会保留在报告里但不进入主统计。`flagged` 表示 harness 或 task 假设可疑，仍进入主统计，但报告会提示风险。真实的 Skill、workflow、model 或 validator 失败不会被过滤，会作为 `included` 样本进入主统计。

如果报告显示 `Insufficient clean data` 或 `Inconclusive due to data quality`，优先重跑对应 task/treatment 或检查环境，不要把当前 verdict 当作最终质量结论。
```

- [ ] **Step 4: Update English operations guide**

In `docs/operations/EVAL-USAGE.md`, after the section that explains failure attribution, add:

```markdown
Reports also distinguish the raw set from the analysis set. The raw set keeps every run for auditability; the analysis set is the default source for headline metrics, pass@k/pass^k, cost, charts, and the verdict. `excluded` usually means API timeout, rate limiting, auth/network failure, Docker/container failure, or an outer runner timeout; these runs stay visible in the report but do not affect headline metrics. `flagged` means a harness or task assumption looks suspicious; the run remains in the analysis set but is called out as a risk. Real Skill, workflow, model, or validator failures remain `included` and are not filtered away just because they lower the score.

If the report says `Insufficient clean data` or `Inconclusive due to data quality`, rerun the affected task/treatment pair or inspect the environment before treating the verdict as final.
```

- [ ] **Step 5: Update changelog after version check**

Before editing `CHANGELOG.md`, run from `D:\Project\Comet`:

```bash
node -e "const fs=require('fs'); console.log(JSON.parse(fs.readFileSync('package.json','utf8')).version)"
git show origin/master:package.json
git tag --sort=-creatordate
git log 0.3.9..HEAD --oneline
```

Expected current decision unless branch state changed:

- current version: `0.4.0-beta.1`
- origin/master version: `0.3.11`
- latest tag: `0.3.9`
- append to existing `## What's Changed [0.4.0-beta.1] - 2026-06-27`

Under the existing `### Changed` section for `0.4.0-beta.1`, add:

```markdown
- **Eval report data quality**: Eval comparison reports now separate raw, flagged, excluded, and analysis-set runs so infrastructure noise such as API timeouts no longer distorts headline metrics while remaining visible for audit and rerun decisions.
```

- [ ] **Step 6: Run docs formatting checks**

Run from `D:\Project\Comet`:

```bash
.\node_modules\.bin\prettier.CMD --check eval/local/README.md eval/README.md docs/operations/EVAL-USAGE-ZH.md docs/operations/EVAL-USAGE.md CHANGELOG.md
```

Expected: PASS.

If it fails, run:

```bash
.\node_modules\.bin\prettier.CMD --write eval/local/README.md eval/README.md docs/operations/EVAL-USAGE-ZH.md docs/operations/EVAL-USAGE.md CHANGELOG.md
```

Then rerun the check.

- [ ] **Step 7: Commit Task 4**

```bash
git add eval/local/README.md eval/README.md docs/operations/EVAL-USAGE-ZH.md docs/operations/EVAL-USAGE.md CHANGELOG.md
git commit -m "docs(eval): explain report data quality"
```

---

### Task 5: Final Verification and Integration Check

**Files:**

- Verify: `eval/scaffold/python/sample_quality.py`
- Verify: `eval/local/tests/conftest.py`
- Verify: `eval/local/scripts/compare_baselines.py`
- Verify: docs and changelog from Task 4

**Interfaces:**

- Consumes:
  - All implemented tasks.
- Produces:
  - Passing focused eval tests, Python compile check, markdown formatting proof, and repo-level verification result notes.

- [ ] **Step 1: Run focused eval scaffold tests**

Run from `D:\Project\Comet\eval`:

```bash
uv run pytest local/tests/scaffold/test_sample_quality.py local/tests/scaffold/test_compare_baselines.py local/tests/scaffold/test_conftest_helpers.py -q
```

Expected: PASS.

- [ ] **Step 2: Run broader eval scaffold tests**

Run from `D:\Project\Comet\eval`:

```bash
uv run pytest local/tests/scaffold -q
```

Expected: PASS.

- [ ] **Step 3: Compile Python eval modules**

Run from `D:\Project\Comet\eval`:

```bash
python -m compileall scaffold local/scripts
```

Expected: exits 0 with compile output and no syntax errors.

- [ ] **Step 4: Run repository formatting checks for touched docs**

Run from `D:\Project\Comet`:

```bash
.\node_modules\.bin\prettier.CMD --check docs/superpowers/plans/2026-07-02-eval-noise-filtering.md docs/superpowers/specs/2026-07-02-eval-noise-filtering-design.md eval/local/README.md eval/README.md docs/operations/EVAL-USAGE-ZH.md docs/operations/EVAL-USAGE.md CHANGELOG.md
```

Expected: PASS.

- [ ] **Step 5: Run repo-level checks required by project policy**

Run from `D:\Project\Comet`:

```bash
pnpm format:check
pnpm lint
pnpm build
pnpm test
```

Expected: PASS. If this Windows environment hits known pnpm wrapper noise, rerun the equivalent direct commands and record the exact failure and substitute evidence in the final summary:

```bash
.\node_modules\.bin\prettier.CMD --check app/ domains/ platform/
.\node_modules\.bin\eslint.CMD app/ domains/ platform/
node scripts/lint/architecture.mjs
node build.js
npx vitest run
```

- [ ] **Step 6: Inspect final diff**

Run from `D:\Project\Comet`:

```bash
git status --short
git diff --stat
git diff --check
```

Expected:

- Only intended eval, docs, and changelog files are modified.
- `git diff --check` exits 0.

- [ ] **Step 7: Commit final verification fixes if any**

If verification required small fixes, stage only those fixes and commit:

```bash
git add <exact files fixed during verification>
git commit -m "test(eval): verify noise filtering reports"
```

If no files changed during verification, do not create an empty commit.

---

## Self-Review Notes

- Spec coverage:
  - `sample_quality` metadata is covered by Tasks 1 and 2.
  - Hard noise exclusion and soft noise flagging are covered by Task 1 tests and Task 3 report partitioning.
  - Analysis-set headline metrics, pass@k/pass^k, spend, task outcomes, charts, and verdict are covered by Task 3.
  - Raw audit visibility, excluded/flagged tables, source evidence, and sensitivity analysis are covered by Task 3.
  - Docs and changelog are covered by Task 4.
  - Verification commands are covered by Task 5.
- Placeholder scan:
  - The plan contains no forbidden placeholder markers or unspecified implementation steps.
  - Each code-changing step names exact files, functions, and snippets.
- Type consistency:
  - `SampleQuality.to_dict()` feeds top-level `report["sample_quality"]`.
  - `quality_from_report()` is the single reader used by `compare_baselines.py`.
  - `include_in_analysis` means the same thing in saved JSON, classifier helpers, and report partitioning.
