from pathlib import Path
import zipfile

import pytest

from app.update_helper import safe_extract
from app.update_service import _version_tuple


def test_release_versions_are_compared_numerically():
    assert _version_tuple("v0.10.0") > _version_tuple("v0.9.9")
    assert _version_tuple("0.6.1") > _version_tuple("0.6.0")
    assert _version_tuple("0.6.0") == _version_tuple("v0.6.0")


def test_safe_extract_updates_only_allowlisted_files_and_preserves_user_data(tmp_path: Path):
    root = tmp_path
    (root / "backend" / "data").mkdir(parents=True)
    (root / "backend" / "data" / "market.db").write_text("keep-me", encoding="utf-8")
    archive = root / "release.zip"
    with zipfile.ZipFile(archive, "w") as bundle:
        bundle.writestr("backend/app/new_module.py", "VALUE = 42\\n")
        bundle.writestr("backend/requirements.txt", "fastapi\\n")
        bundle.writestr("backend/data/market.db", "overwrite-me")
        bundle.writestr("random.txt", "ignore-me")
    safe_extract(archive, root)
    assert (root / "backend/app/new_module.py").read_text(encoding="utf-8") == "VALUE = 42\\n"
    assert (root / "backend/requirements.txt").read_text(encoding="utf-8") == "fastapi\\n"
    assert (root / "backend/data/market.db").read_text(encoding="utf-8") == "keep-me"
    assert not (root / "random.txt").exists()


def test_safe_extract_rejects_path_traversal(tmp_path: Path):
    archive = tmp_path / "unsafe.zip"
    with zipfile.ZipFile(archive, "w") as bundle:
        bundle.writestr("backend/app/../../outside.txt", "bad")
    with pytest.raises(ValueError):
        safe_extract(archive, tmp_path)
