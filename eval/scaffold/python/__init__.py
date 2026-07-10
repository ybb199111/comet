"""Python-specific scaffold components for comet skill benchmarks."""

from .logging import (
    ExperimentLogger,
    ReportColumn,
    TreatmentResult,
    bool_column,
    default_columns,
    extract_events,
    parse_output,
    quality_column,
    save_events,
    save_raw,
    save_report,
    strip_ansi,
)
from .manifests import SkillEvalManifest, load_eval_manifest
from .profiles import (
    AUTHORING_SKILL_PROFILE,
    COMET_WORKFLOW_PROFILE,
    GENERIC_PROFILE,
    ProfileSpec,
    all_rubric_dimensions,
    get_profile,
    list_profiles,
    resolve_profile_name,
    run_profile_rubric,
)
from .evidence import EvalArtifactReference, build_eval_artifact_references
from .attribution import FailureAttribution, classify_failures
from .sample_quality import (
    SampleQuality,
    include_in_analysis,
    infer_sample_quality,
    quality_from_report,
    sample_quality_dict,
)
from .report_outputs import (
    ReportOutputConfig,
    load_report_output_config,
    preferred_report_path,
    render_markdown_html,
    write_report_outputs,
)
from .schema import NoiseTask, Treatment
from .utils import (
    build_docker_image,
    check_claude_available,
    check_docker_available,
    get_field,
    get_nested_field,
    make_execution_validator,
    normalize_score,
    read_json_file,
    retry_with_backoff,
    run_claude_in_docker,
    run_eval_in_docker,
    run_node_in_docker,
    run_python_in_docker,
    run_shell,
)
from .validation import (
    ValidatorFn,
    check_code_execution,
    check_file_exists,
    check_no_pattern,
    check_pattern,
    check_python_execution,
    check_skill_invoked,
    check_typescript_execution,
    compose_validators,
    run_validators,
)

__all__ = [
    "NoiseTask", "Treatment", "ValidatorFn", "compose_validators", "run_validators",
    "check_file_exists", "check_pattern", "check_no_pattern", "check_skill_invoked",
    "check_code_execution", "check_python_execution", "check_typescript_execution",
    "run_shell", "check_docker_available", "check_claude_available", "build_docker_image",
    "run_python_in_docker", "make_execution_validator", "run_eval_in_docker",
    "run_node_in_docker", "run_claude_in_docker", "retry_with_backoff", "read_json_file",
    "get_field", "get_nested_field", "normalize_score", "parse_output", "extract_events",
    "strip_ansi", "ExperimentLogger", "TreatmentResult", "save_events", "save_raw",
    "save_report", "ReportColumn", "bool_column", "quality_column", "default_columns",
    "EvalArtifactReference", "build_eval_artifact_references",
    "FailureAttribution", "classify_failures",
    "SkillEvalManifest", "load_eval_manifest",
    "AUTHORING_SKILL_PROFILE", "COMET_WORKFLOW_PROFILE", "GENERIC_PROFILE",
    "ProfileSpec", "all_rubric_dimensions", "get_profile", "list_profiles",
    "resolve_profile_name", "run_profile_rubric",
    "ReportOutputConfig", "load_report_output_config", "preferred_report_path",
    "render_markdown_html", "write_report_outputs",
    "SampleQuality", "infer_sample_quality", "quality_from_report",
    "sample_quality_dict", "include_in_analysis",
]
