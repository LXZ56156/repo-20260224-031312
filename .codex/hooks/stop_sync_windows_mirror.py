#!/usr/bin/env python3
import json
import os
import subprocess
import sys
from pathlib import Path
from user_prompt_sync_windows_mirror import resolve_git_bash, to_git_bash_path


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def helper_path() -> Path:
    override = os.environ.get("WEAPP_HOOK_ENSURE_SCRIPT")
    if override:
        return Path(override)
    return repo_root() / "scripts" / "dev" / "weapp-hook-ensure.sh"


def run_helper() -> subprocess.CompletedProcess[str]:
    helper = helper_path()
    command = [str(helper), "mirror"]
    if os.name == "nt" and helper.suffix.lower() == ".sh":
        command = [str(resolve_git_bash()), to_git_bash_path(helper), "mirror"]
    return subprocess.run(
        command,
        cwd=repo_root(),
        capture_output=True,
        text=True,
        check=False,
    )


def main() -> int:
    try:
        json.load(sys.stdin)
    except json.JSONDecodeError:
        pass

    try:
        result = run_helper()
    except OSError as error:
        result = subprocess.CompletedProcess([], 1, "", str(error))
    if result.returncode == 0:
        return 0

    message = (result.stderr or result.stdout or "未知错误").strip()
    json.dump(
        {
            "continue": False,
            "stopReason": "Windows 微信预览镜像未同步",
            "systemMessage": f"Windows 镜像同步失败：{message}",
        },
        sys.stdout,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
