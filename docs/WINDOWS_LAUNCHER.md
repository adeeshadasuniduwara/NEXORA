# Windows launcher and NEXORA workspace

Run `START_NEXORA.bat` from the repository root. It checks for Python 3.10+, creates or repairs the isolated backend environment, installs requirements, and starts the local FastAPI service in the current Command Prompt window.

## Automatic updates

Updates are installed through the in-app GitHub Releases updater. A verified update uses a background Python helper to wait for the API process and replace application files. The helper does not launch another CMD window. The original launcher CMD waits for the helper, checks dependencies, and restarts Uvicorn in the same window. The existing browser tab reconnects automatically.

For Git clones, updates require a clean working tree on `main`. For ZIP installs, only allowlisted application files are replaced; local databases and data folders are preserved.

## Recovery

The launcher attempts to recreate a broken virtual environment and retries dependency installation using pip cache purge, no-cache mode, extended timeout, and retries. It cannot repair missing Windows system components, blocked network access, incompatible hardware, or third-party antivirus/firewall restrictions; those are reported.

## Workspace

The browser UI is served locally at `http://127.0.0.1:8000`. Charts use a project-owned canvas renderer; no TradingView embed or feed is used.

## Scope

Public-data analysis only. No order placement or exchange trading credentials. The local server binds to loopback.
