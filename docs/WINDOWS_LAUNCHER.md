# Windows launcher and NEXORA workspace

Run `START_NEXORA.bat` from the repository root. It checks for Python, creates an isolated backend virtual environment, repairs pip dependencies with retries, runs `pip check`, and starts the local FastAPI service and browser workspace.

## Automatic source updates

When the folder is a Git clone with a clean working tree, the launcher fetches and fast-forward pulls `origin/main` before startup. If local modifications exist, it skips updating rather than overwriting user work. A downloaded ZIP is not a Git clone and cannot self-update through Git; use a fresh clone or download a newer source archive.

## Recovery

The launcher attempts to recreate a broken virtual environment and retries dependency installation using pip cache purge, no-cache mode, extended timeout, and retries. It cannot repair missing Windows system components, blocked network access, incompatible hardware, or third-party antivirus/firewall restrictions; those are reported.

## Workspace

The browser UI is served locally at `http://127.0.0.1:8000`. Charts use a project-owned canvas renderer; no TradingView embed or feed is used.

## Scope

Public-data analysis only. No order placement or exchange trading credentials. The local server binds to loopback.
