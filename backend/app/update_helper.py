"""Detached installer: waits for the API process to exit, applies a release, and relaunches NEXORA."""
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

ALLOWED_PREFIXES = ("backend/app/", "backend/requirements.txt", "START_NEXORA.bat", "VERSION", "docs/")


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


def _remove(path: Path) -> None:
    if path.is_dir() and not path.is_symlink():
        shutil.rmtree(path)
    elif path.exists() or path.is_symlink():
        path.unlink()


def _copy_path(source: Path, destination: Path) -> None:
    if source.is_dir():
        shutil.copytree(source, destination, dirs_exist_ok=True)
    elif source.is_file():
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)


def safe_extract(archive: Path, root: Path) -> None:
    """Stage allowlisted paths, back up existing files, and roll back partial copies."""
    update_root = root / ".nexora_updates"
    staging = update_root / "extract"
    if staging.exists():
        shutil.rmtree(staging)
    staging.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as bundle:
        for info in bundle.infolist():
            name = info.filename.replace("\\", "/")
            path = PurePosixPath(name)
            if path.is_absolute() or ".." in path.parts:
                raise ValueError(f"Unsafe archive path: {name}")
            if info.is_dir() or not any(name.startswith(prefix) for prefix in ALLOWED_PREFIXES):
                continue
            destination = staging.joinpath(*path.parts)
            destination.parent.mkdir(parents=True, exist_ok=True)
            with bundle.open(info) as source, destination.open("wb") as target:
                shutil.copyfileobj(source, target)

    backup = update_root / "backup" / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    originally_present: set[str] = set()
    for prefix in ALLOWED_PREFIXES:
        source = root / prefix
        if source.exists():
            originally_present.add(prefix)
            _copy_path(source, backup / prefix)

    try:
        for prefix in ALLOWED_PREFIXES:
            source = staging / prefix
            if source.exists():
                _copy_path(source, root / prefix)
    except Exception:
        for prefix in ALLOWED_PREFIXES:
            destination = root / prefix
            _remove(destination)
            if prefix in originally_present:
                _copy_path(backup / prefix, destination)
        raise


def restart_workspace(root: Path) -> None:
    launcher = root / "START_NEXORA.bat"
    if os.name == "nt" and launcher.exists():
        flags = getattr(subprocess, "DETACHED_PROCESS", 0x00000008) | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0x00000200)
        subprocess.Popen(
            ["cmd.exe", "/c", str(launcher)], cwd=root, stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=flags,
        )
    else:
        subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"],
            cwd=root / "backend",
        )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True)
    parser.add_argument("--archive", required=True)
    parser.add_argument("--parent-pid", required=True, type=int)
    parser.add_argument("--manifest", required=True)
    args = parser.parse_args()
    root, archive = Path(args.root).resolve(), Path(args.archive).resolve()
    manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    wait_for_process(args.parent_pid)

    failure = None
    try:
        if (root / ".git").exists():
            status = subprocess.run(["git", "status", "--porcelain"], cwd=root, capture_output=True, text=True)
            branch = subprocess.run(["git", "branch", "--show-current"], cwd=root, capture_output=True, text=True)
            if status.returncode != 0 or status.stdout.strip() or branch.stdout.strip() != "main":
                raise RuntimeError("Git working tree is no longer clean on main; refusing to overwrite local changes.")
            subprocess.run(["git", "fetch", "origin", "main"], cwd=root, check=True, timeout=90)
            subprocess.run(["git", "pull", "--ff-only", "origin", "main"], cwd=root, check=True, timeout=90)
        else:
            safe_extract(archive, root)
    except Exception as exc:
        failure = f"{type(exc).__name__}: {exc}"

    state = {
        "status": "failed" if failure else "installed",
        "version": manifest["version"],
        "tag": manifest["tag"],
        "published_at": manifest.get("published_at", ""),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "release_notes": manifest.get("release_notes", ""),
        "error": failure,
    }
    (root / ".nexora_update_state.json").write_text(json.dumps(state, indent=2), encoding="utf-8")
    restart_workspace(root)
    return 1 if failure else 0


if __name__ == "__main__":
    raise SystemExit(main())
