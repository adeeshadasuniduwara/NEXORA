"""Detached installer: waits for the API process to exit, updates files, and relaunches NEXORA."""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

ALLOWED_PREFIXES = ("backend/app/", "backend/requirements.txt", "START_NEXORA.bat", "docs/")


def wait_for_process(pid: int, timeout: int = 120) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if os.name == "nt":
            result = subprocess.run(
                ["tasklist", "/FI", f"PID eq {pid}", "/FO", "CSV", "/NH"],
                capture_output=True, text=True, timeout=5,
            )
            if str(pid) not in result.stdout:
                return
        else:
            try:
                os.kill(pid, 0)
            except OSError:
                return
        time.sleep(0.5)
    raise TimeoutError("NEXORA server process did not stop in time; update was not applied.")


def safe_extract(archive: Path, root: Path) -> None:
    staging = root / ".nexora_updates" / "extract"
    if staging.exists():
        shutil.rmtree(staging)
    staging.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as bundle:
        for info in bundle.infolist():
            name = info.filename.replace("\\", "/")
            path = PurePosixPath(name)
            if path.is_absolute() or ".." in path.parts:
                raise ValueError(f"Unsafe archive path: {name}")
            if info.is_dir():
                continue
            if not any(name.startswith(prefix) for prefix in ALLOWED_PREFIXES):
                continue
            destination = staging.joinpath(*path.parts)
            destination.parent.mkdir(parents=True, exist_ok=True)
            with bundle.open(info) as source, destination.open("wb") as target:
                shutil.copyfileobj(source, target)
    backup = root / ".nexora_updates" / "backup" / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    for prefix in ALLOWED_PREFIXES:
        source = root / prefix
        if source.is_file():
            target = backup / prefix
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
        elif source.is_dir():
            target = backup / prefix
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copytree(source, target, dirs_exist_ok=True)
    for prefix in ALLOWED_PREFIXES:
        source = staging / prefix
        if source.is_file():
            target = root / prefix
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
        elif source.is_dir():
            shutil.copytree(source, root / prefix, dirs_exist_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True)
    parser.add_argument("--archive", required=True)
    parser.add_argument("--parent-pid", required=True, type=int)
    parser.add_argument("--version", required=True)
    parser.add_argument("--tag", required=True)
    parser.add_argument("--published-at", default="")
    parser.add_argument("--notes", default="")
    args = parser.parse_args()
    root, archive = Path(args.root).resolve(), Path(args.archive).resolve()
    wait_for_process(args.parent_pid)
    if (root / ".git").exists():
        status = subprocess.run(["git", "status", "--porcelain"], cwd=root, capture_output=True, text=True)
        if status.returncode != 0 or status.stdout.strip():
            raise RuntimeError("Git working tree changed while the update was being prepared; refusing to overwrite local changes.")
        subprocess.run(["git", "fetch", "origin", "main"], cwd=root, check=True, timeout=90)
        subprocess.run(["git", "pull", "--ff-only", "origin", "main"], cwd=root, check=True, timeout=90)
    else:
        safe_extract(archive, root)
    state = {
        "version": args.version, "tag": args.tag, "published_at": args.published_at,
        "updated_at": datetime.now(timezone.utc).isoformat(), "release_notes": args.notes,
    }
    (root / ".nexora_update_state.json").write_text(json.dumps(state, indent=2), encoding="utf-8")
    launcher = root / "START_NEXORA.bat"
    if os.name == "nt" and launcher.exists():
        flags = getattr(subprocess, "DETACHED_PROCESS", 0x00000008) | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0x00000200)
        subprocess.Popen(["cmd.exe", "/c", str(launcher)], cwd=root, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=flags)
    else:
        subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"],
            cwd=root / "backend",
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
