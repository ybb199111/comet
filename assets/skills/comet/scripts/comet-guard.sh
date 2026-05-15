#!/bin/bash
# Comet Phase Guard — validates exit conditions before phase transitions
# Usage: comet-guard.sh <change-name> <from-phase>
# Phases: open, design, build, verify, archive
# Exit 0 = all checks pass, exit 1 = blocked (reasons printed to stderr)

set -euo pipefail

CHANGE="$1"
PHASE="$2"
CHANGE_DIR="openspec/changes/$CHANGE"

red() { echo -e "\033[31m$1\033[0m" >&2; }
green() { echo -e "\033[32m$1\033[0m" >&2; }
warn() { echo -e "\033[33m$1\033[0m" >&2; }

BLOCK=0
check() {
  local desc="$1"
  shift
  if "$@" 2>/dev/null; then
    green "  [PASS] $desc"
  else
    red "  [FAIL] $desc"
    BLOCK=1
  fi
}

# --- Helper functions ---

tasks_all_done() {
  local tasks="$CHANGE_DIR/tasks.md"
  [ -f "$tasks" ] || return 1
  grep -q '\- \[x\]' "$tasks" || return 1
  ! grep -q '\- \[ \]' "$tasks"
}

tasks_has_any() {
  local tasks="$CHANGE_DIR/tasks.md"
  [ -f "$tasks" ] && grep -q '\- \[' "$tasks"
}

yaml_has_field() {
  local field="$1"
  local yaml="$CHANGE_DIR/.openspec.yaml"
  [ -f "$yaml" ] && grep -q "^${field}:" "$yaml"
}

yaml_field_value() {
  local field="$1"
  local yaml="$CHANGE_DIR/.openspec.yaml"
  if [ -f "$yaml" ]; then
    # Escape dots for literal match (YAML field names contain dots)
    local escaped
    escaped=$(echo "$field" | sed 's/\./\\./g')
    grep "^${escaped}:" "$yaml" | sed "s/^${escaped}: *//" | tr -d '"' | tr -d "'"
  fi
}

file_nonempty() {
  [ -f "$1" ] && [ -s "$1" ]
}

maven_compiles() {
  mvn compile -q 2>/dev/null
}

verify_result_is_pass() {
  local result
  result=$(yaml_field_value "comet.verify_result" 2>/dev/null || true)
  [ "$result" = "pass" ]
}

# --- Phase-specific checks ---

guard_open() {
  echo "=== Guard: open → design ===" >&2

  check "proposal.md exists and non-empty" file_nonempty "$CHANGE_DIR/proposal.md"
  check "design.md exists and non-empty" file_nonempty "$CHANGE_DIR/design.md"
  check "tasks.md exists and non-empty" file_nonempty "$CHANGE_DIR/tasks.md"
  check "tasks.md has at least one task" tasks_has_any
}

guard_design() {
  echo "=== Guard: design → build ===" >&2

  local design_doc
  design_doc=$(yaml_field_value "comet.design_doc" 2>/dev/null || true)

  check "proposal.md exists" file_nonempty "$CHANGE_DIR/proposal.md"
  check "tasks.md exists" file_nonempty "$CHANGE_DIR/tasks.md"

  if [ -n "$design_doc" ] && [ "$design_doc" != "null" ]; then
    check "Design Doc ($design_doc) exists" file_nonempty "$design_doc"
  else
    warn "  [WARN] No design_doc recorded in .openspec.yaml"
  fi
}

guard_build() {
  echo "=== Guard: build → verify ===" >&2

  check "tasks.md all tasks checked" tasks_all_done
  check "proposal.md exists" file_nonempty "$CHANGE_DIR/proposal.md"
  check "Maven compile passes" maven_compiles
}

guard_verify() {
  echo "=== Guard: verify → archive ===" >&2

  check "verify_result is pass" verify_result_is_pass
  check "tasks.md all tasks checked" tasks_all_done
  check "Maven compile passes" maven_compiles
}

guard_archive() {
  echo "=== Guard: archive completeness ===" >&2

  check "proposal.md exists" file_nonempty "$CHANGE_DIR/proposal.md"
  check "tasks.md all tasks checked" tasks_all_done
}

# --- Main ---

case "$PHASE" in
  open)     guard_open ;;
  design)   guard_design ;;
  build)    guard_build ;;
  verify)   guard_verify ;;
  archive)  guard_archive ;;
  *)
    red "Unknown phase: $PHASE"
    echo "Valid phases: open, design, build, verify, archive" >&2
    exit 1
    ;;
esac

if [ "$BLOCK" -eq 1 ]; then
  echo "" >&2
  red "BLOCKED — fix failing checks before proceeding to next phase"
  exit 1
else
  echo "" >&2
  green "ALL CHECKS PASSED — ready for next phase"
  exit 0
fi
