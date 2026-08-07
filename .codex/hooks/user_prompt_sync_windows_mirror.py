#!/usr/bin/env python3
import json
import os
import subprocess
import sys
from pathlib import Path

WEAPP_KEYWORDS = (
    "微信",
    "小程序",
    "weapp",
    "mcp",
    "devtools",
    "开发者工具",
)


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def helper_path() -> Path:
    override = os.environ.get("WEAPP_HOOK_ENSURE_SCRIPT")
    if override:
        return Path(override)
    return repo_root() / "scripts" / "dev" / "weapp-hook-ensure.sh"


def should_prepare_mcp(payload: object) -> bool:
    haystack = json.dumps(payload, ensure_ascii=False).lower()
    return any(keyword in haystack for keyword in WEAPP_KEYWORDS)


def resolve_git_bash() -> Path:
    candidates = (
        os.environ.get("WEAPP_GIT_BASH"),
        os.environ.get("BASH_BIN"),
        r"D:\Soft\Git\bin\bash.exe",
        str(Path(os.environ.get("ProgramFiles", "")) / "Git" / "bin" / "bash.exe"),
        str(Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "Git" / "bin" / "bash.exe"),
    )
    for candidate in candidates:
        if candidate and Path(candidate).is_absolute() and Path(candidate).is_file():
            return Path(candidate)
    raise FileNotFoundError("Git Bash was not found; set WEAPP_GIT_BASH to bash.exe")


def to_git_bash_path(file_path: Path) -> str:
    normalized = str(file_path.resolve()).replace("\\", "/")
    if len(normalized) >= 2 and normalized[1] == ":":
        return f"/{normalized[0].lower()}{normalized[2:]}"
    return normalized


def run_helper(mode: str) -> subprocess.CompletedProcess[str]:
    helper = helper_path()
    command = [str(helper), mode]
    if os.name == "nt" and helper.suffix.lower() == ".sh":
        command = [str(resolve_git_bash()), to_git_bash_path(helper), mode]
    return subprocess.run(
        command,
        cwd=repo_root(),
        capture_output=True,
        text=True,
        check=False,
    )


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError:
        payload = {}

    mode = "mcp" if should_prepare_mcp(payload) else "mirror"
    try:
        result = run_helper(mode)
    except OSError as error:
        result = subprocess.CompletedProcess([], 1, "", str(error))
    if result.returncode == 0:
        return 0

    message = (result.stderr or result.stdout or "未知错误").strip()
    json.dump(
        {
            "continue": False,
            "stopReason": "Windows 微信开发环境未就绪",
            "systemMessage": f"Windows 微信开发环境准备失败：{message}",
        },
        sys.stdout,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
