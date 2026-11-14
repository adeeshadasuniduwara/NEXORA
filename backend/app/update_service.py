"""Release-based updater for locally installed NEXORA workspaces.

The browser polls the local status endpoint. The server checks GitHub Releases,
verifies the published archive checksum, then hands installation to a detached
helper so the running server can exit cleanly before files are replaced.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import signal
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path
from typing import Any

import httpx

from app.version import APP_VERSION, GITHUB_REPOSITORY

API_ROOT = f"https://api.github.com/repos/{GITHUB_REPOSITORY}"
_CACHE: dict[str, Any] = {"checked_at": 0.0, "payload": None}


def _version_tuple(value: str) -> tuple[int, ...]:
    numbers = re.findall(r"\d+", value)
    return tuple(int(part) for part in numbers) or (0,)


def _root_dir() -> Path:
    # backend/app/update_service.py -> repository root
    return Path(__file__).resolve().parents[2]


def _release_payload(force: bool = False) -> dict[str, Any]:
    now = time.monotonic()
    cached = _CACHE.get("payload")
    if cached and not force and now - float(_CACHE["checked_at"]) < 45:
        return dict(cached)
    try:
        response = httpx.get(
            f"{API_ROOT}/releases/latest",
            headers={"Accept": "application/vnd.github+json", "User-Agent": "NEXORA-Updater"},
            timeout=8.0,
            follow_redirects=True,
        )
        response.raise_for_status()
        release = response.json()
        tag = str(release.get("tag_name", ""))
        latest_version = tag.removeprefix("v")
        assets = {str(asset.get("name")): asset for asset in release.get("assets", [])}
        archive = assets.get("nexora-update.zip")
        checksum = assets.get("nexora-update.zip.sha256")
        payload = {
            "status": "available" if _version_tuple(latest_version) > _version_tuple(APP_VERSION) else "current",
            "current_version": APP_VERSION,
            "latest_version": latest_version,
            "tag": tag,
            "release_name": release.get("name") or f"NEXORA {latest_version}",
            "release_notes": str(release.get("body") or ""),
            "published_at": release.get("published_at"),
            "html_url": release.get("html_url"),
            "archive_url": archive.get("browser_download_url") if archive else None,
            "checksum_url": checksum.get("browser_download_url") if checksum else None,
            "downloadable": bool(archive and checksum),
        }
    except Exception as exc:  # Network failures must not prevent the terminal from starting.
        payload = {
            "status": "offline", "current_version": APP_VERSION,
            "latest_version": None, "downloadable": False,
            "message": f"Update check unavailable: {type(exc).__name__}",
        }
    _CACHE.update({"checked_at": now, "payload": payload})
    return dict(payload)


def update_status() -> dict[str, Any]:
    result = _release_payload()
    state_file = _root_dir() / ".nexora_update_state.json"
    if state_file.exists():
        try:
            import json
            result["last_update"] = json.loads(state_file.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            result["last_update"] = None
    else:
        result["last_update"] = None
    return result


def _download_verified_archive(release: dict[str, Any]) -> Path:
    if not release.get("downloadable"):
        raise RuntimeError("The latest GitHub Release does not contain the update archive and checksum.")
    root = _root_dir()
    staging = Path(tempfile.gettempdir()) / "nexora_updates" / "adeeshadasuniduwara_NEXORA"
    staging.mkdir(parents=True, exist_ok=True)
    headers = {"User-Agent": "NEXORA-Updater"}
    archive_response = httpx.get(release["archive_url"], headers=headers, timeout=90.0, follow_redirects=True)
    archive_response.raise_for_status()
    checksum_response = httpx.get(release["checksum_url"], headers=headers, timeout=20.0, follow_redirects=True)
    checksum_response.raise_for_status()
    expected = checksum_response.text.strip().split()[0].lower()
    actual = hashlib.sha256(archive_response.content).hexdigest()
    if not re.fullmatch(r"[a-f0-9]{64}", expected) or actual != expected:
        raise RuntimeError("Update archive SHA-256 verification failed; installation was cancelled.")
    archive_path = staging / "nexora-update.zip"
    archive_path.write_bytes(archive_response.content)
    return archive_path


def begin_update() -> dict[str, Any]:
    release = _release_payload(force=True)
    if release.get("status") != "available":
        return {"started": False, "reason": "no_update", **release}
    if not release.get("downloadable"):
        return {"started": False, "reason": "release_asset_missing", **release}

    root = _root_dir()
    git_dir = root / ".git"
    if git_dir.exists():
        check = subprocess.run(
            ["git", "status", "--porcelain"], cwd=root, capture_output=True, text=True, timeout=10
        )
        if check.returncode != 0:
            return {"started": False, "reason": "git_status_failed", "message": check.stderr[-500:]}
        if check.stdout.strip():
            return {
                "started": False, "reason": "local_changes",
                "message": "Local Git changes were detected. They were preserved; automatic update was not applied.",
            }
        branch = subprocess.run(
            ["git", "branch", "--show-current"], cwd=root, capture_output=True, text=True, timeout=10
        )
        if branch.returncode != 0 or branch.stdout.strip() != "main":
            return {
                "started": False, "reason": "not_main_branch",
                "message": "Automatic Git updates require a clean main branch. Your current branch was left unchanged.",
            }

    archive_path = _download_verified_archive(release)
    manifest_path = archive_path.with_suffix(".json")
    manifest_path.write_text(json.dumps({
        "version": release["latest_version"],
        "tag": release["tag"],
        "published_at": release.get("published_at") or "",
        "release_notes": release.get("release_notes") or "",
    }, ensure_ascii=False), encoding="utf-8")
    helper = Path(__file__).with_name("update_helper.py")
    command = [
        sys.executable, str(helper), "--root", str(root), "--archive", str(archive_path),
        "--manifest", str(manifest_path), "--parent-pid", str(os.getpid()),
    ]
    creation_flags = 0
    if os.name == "nt":
        creation_flags = getattr(subprocess, "DETACHED_PROCESS", 0x00000008) | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0x00000200)
    subprocess.Popen(
        command, cwd=root, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL, close_fds=True, creationflags=creation_flags,
    )
    # Let FastAPI return the HTTP response before asking Uvicorn to shut down.
    server_pid = os.getpid()
    def request_shutdown() -> None:
        try:
            os.kill(server_pid, signal.SIGTERM)
        except OSError:
            pass
    timer = threading.Timer(2.0, request_shutdown)
    timer.daemon = True
    timer.start()
    return {"started": True, "status": "installing", "version": release["latest_version"], "message": "Update verified and installation is starting."}
