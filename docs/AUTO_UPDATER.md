# NEXORA Windows launcher and automatic updates

Run `START_NEXORA.bat` from the repository root. It checks for Python 3.10+, creates or repairs the isolated backend environment, installs requirements, and starts FastAPI in the same Command Prompt window.

## Central automatic updates

- The browser checks the GitHub Releases updater endpoint every 30 seconds.
- GitHub Actions publishes a versioned release only after backend tests pass on `main`.
- The updater downloads `nexora-update.zip` and its SHA-256 checksum over HTTPS and verifies the archive before installation.
- A small background Python helper waits for the running API process to exit and applies the verified update. It does not open another CMD window or launch another server.
- The original `START_NEXORA.bat` detects the update marker, waits for installation to finish, checks updated dependencies, and starts Uvicorn again in that same original CMD window.
- The browser tab stays open and reconnects to the restarted local server; no second browser tab is opened.
- Update status, version, release notes, and local installation time are recorded in `.nexora_update_state.json`.

### Installation types

- **Git clone:** the updater requires a clean working tree on `main` and fast-forward updates from `origin/main`.
- **Repository ZIP:** the updater safely replaces only allowlisted application, requirements, launcher, version, and documentation files. Local databases and data folders are preserved.

Every release must increment both `VERSION` and `backend/app/version.py`. GitHub Actions intentionally fails if a release tag already exists.

## Recovery and resource behavior

The original CMD window owns the server lifecycle. During an update, the API process stops briefly, the helper applies files, and the same launcher CMD restarts the server. No additional CMD or PowerShell console window is created for the restart. A hidden one-shot PowerShell process is used only at initial launch to open the browser tab.

If installation fails, the helper records the error and releases the pending marker; the original launcher restarts the previous working server where possible. The launcher waits up to 180 seconds for the helper before reporting a timeout.

## Workspace and safety

The browser UI is served locally at `http://127.0.0.1:8000`. The chart uses a project-owned canvas renderer. NEXORA uses public market data only, does not place orders, and binds the local server to loopback.
