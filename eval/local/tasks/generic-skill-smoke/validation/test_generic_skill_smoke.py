from pathlib import Path

from scaffold.python.validation.core import write_test_results


def main():
    path = Path("result.md")
    passed = []
    failed = []

    if not path.exists():
        write_test_results({"passed": [], "failed": ["result.md missing"]})
        return

    text = path.read_text(encoding="utf-8")
    if "# Skill Smoke Result" in text:
        passed.append("result.md heading present")
    else:
        failed.append("result.md heading missing")

    bullets = [line for line in text.splitlines() if line.startswith("- ")]
    if len(bullets) == 3:
        passed.append("result.md has exactly three bullets")
    else:
        failed.append(f"result.md bullet count was {len(bullets)}")

    if "approach" in text.lower() or "used" in text.lower():
        passed.append("result.md describes approach")
    else:
        failed.append("result.md approach summary missing")

    write_test_results({"passed": passed, "failed": failed})


if __name__ == "__main__":
    main()
