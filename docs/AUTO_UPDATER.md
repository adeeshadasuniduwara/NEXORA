# NEXORA Windows launcher

Run `START_NEXORA.bat` from the repository root. It checks for Python 3.10+, creates an isolated backend virtual environment, repairs pip dependencies with retries, runs `pip check`, starts FastAPI, and opens the local browser workspace.

## Central automatic updates

The launcher no longer performs a silent Git pull at startup. Updates are controlled by the in-app GitHub Releases updater so every installation follows the same release and notification flow.

- The browser checks `/api/v1/system/update` every 60 seconds.
- GitHub Actions publishes a versioned release only after the backend tests pass on `main`.
- The updater downloads `nexora-update.zip` and its SHA-256 checksum over HTTPS and verifies the archive before installation.
- A detached helper waits for the current server to exit, applies the update, records its version/time/release notes, and starts NEXORA again.
- After reconnecting, the browser displays the update version, release notes, and local installation time.

### Installation types

- **Git clone:** the updater verifies that the working tree is clean, then uses a fast-forward pull from `origin/main`. If local changes are present, it refuses to overwrite them.
- **Repository ZIP:** the updater applies only allowlisted app, requirements, launcher and documentation files. It does not package the local database or data folders.

Every release must increment the semantic version in both `VERSION` and `backend/app/version.py`. GitHub Actions deliberately fails if a release tag already exists. Do not reuse an existing version for a different update.

### What users will see

1. A short notification that a new version has been found and is being installed.
2. NEXORA briefly restarts automatically.
3. After the browser reconnects, a notification shows **Updated to vX.Y.Z**, the change notes and the exact local update time.

If GitHub is unreachable, the existing app keeps running and retries later. If the update archive checksum is invalid, installation is cancelled. A Git clone with local modifications is protected rather than force-reset.

## Recovery

The launcher attempts to recreate a broken virtual environment and retries dependency installation using pip cache purge, no-cache mode, extended timeout and retries. It cannot repair missing Windows system components, blocked network access, incompatible hardware, or third-party antivirus/firewall restrictions; those are reported.

## Workspace and safety

The browser UI is served locally at `http://127.0.0.1:8000`. The chart uses a project-owned canvas renderer. NEXORA uses public market data only, does not place orders, and binds the local server to loopback.
