#!/usr/bin/env python3
import json
import subprocess
import sys
from pathlib import Path


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def helper_path() -> Path:
    return repo_root() / "scripts" / "dev" / "weapp-hook-ensure.sh"


def run_helper() -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [str(helper_path()), "mirror"],
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

    result = run_helper()
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
