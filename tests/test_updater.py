from __future__ import annotations

import io
import json
import sys
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from shared.frontend_update import perform_frontend_update
from shared.updater import CompositeUpdateProvider


class FakeProvider:
    def __init__(self, check_result: dict, update_result: dict | None = None) -> None:
        self._check_result = check_result
        self._update_result = update_result or {"success": True}

    def check(self) -> dict:
        return dict(self._check_result)

    def update(self) -> dict:
        return dict(self._update_result)


class FrontendUpdateTests(unittest.TestCase):
    def test_perform_frontend_update_replaces_static_dir(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            static_dir = Path(tmpdir) / "static"
            static_dir.mkdir()
            (static_dir / "index.html").write_text("old", encoding="utf-8")
            (static_dir / "version.json").write_text(json.dumps({"commit": "oldcommit"}), encoding="utf-8")

            def fake_download(_url: str, path: Path) -> None:
                with tarfile.open(path, "w:gz") as archive:
                    index_data = b"new"
                    index_info = tarfile.TarInfo("index.html")
                    index_info.size = len(index_data)
                    archive.addfile(index_info, io.BytesIO(index_data))

                    version_data = json.dumps({"commit": "newcommit"}).encode("utf-8")
                    version_info = tarfile.TarInfo("version.json")
                    version_info.size = len(version_data)
                    archive.addfile(version_info, io.BytesIO(version_data))

            release = {
                "assets": [
                    {
                        "name": "frontend-dist.tar.gz",
                        "browser_download_url": "https://example.invalid/frontend-dist.tar.gz",
                    }
                ]
            }

            with patch("shared.frontend_update._fetch_release", return_value=release), patch(
                "shared.frontend_update._download_to_path",
                side_effect=fake_download,
            ):
                result = perform_frontend_update(static_dir)

            self.assertTrue(result["success"])
            self.assertEqual(result["commit_before"], "oldcommi")
            self.assertEqual(result["commit_after"], "newcommi")
            self.assertEqual((static_dir / "index.html").read_text(encoding="utf-8"), "new")


class CompositeUpdateProviderTests(unittest.TestCase):
    def test_check_falls_back_to_frontend_when_git_unavailable(self) -> None:
        provider = CompositeUpdateProvider(
            system_provider=FakeProvider({"has_update": False, "error": "fetch_failed"}),
            frontend_provider=FakeProvider(
                {
                    "has_update": True,
                    "local_commit": "11111111",
                    "remote_commit": "22222222",
                }
            ),
        )

        result = provider.check()

        self.assertTrue(result["has_update"])
        self.assertEqual(result["target"], "frontend")
        self.assertEqual(result["local_commit"], "11111111")
        self.assertEqual(result["remote_commit"], "22222222")

    def test_check_prefers_system_update_when_available(self) -> None:
        provider = CompositeUpdateProvider(
            system_provider=FakeProvider(
                {
                    "has_update": True,
                    "local_commit": "aaaa1111",
                    "remote_commit": "bbbb2222",
                }
            ),
            frontend_provider=FakeProvider(
                {
                    "has_update": True,
                    "local_commit": "cccc3333",
                    "remote_commit": "dddd4444",
                }
            ),
        )

        result = provider.check()

        self.assertTrue(result["has_update"])
        self.assertEqual(result["target"], "system")
        self.assertEqual(result["local_commit"], "aaaa1111")
        self.assertEqual(result["remote_commit"], "bbbb2222")

    def test_update_falls_back_to_frontend_when_git_update_fails(self) -> None:
        provider = CompositeUpdateProvider(
            system_provider=FakeProvider(
                {"has_update": True, "local_commit": "aaaa1111", "remote_commit": "bbbb2222"},
                {"success": False, "message": "git failed"},
            ),
            frontend_provider=FakeProvider(
                {"has_update": True, "local_commit": "cccc3333", "remote_commit": "dddd4444"},
                {"success": True, "commit_before": "cccc3333", "commit_after": "dddd4444"},
            ),
        )

        result = provider.update()

        self.assertTrue(result["success"])
        self.assertEqual(result["component"], "frontend")
        self.assertEqual(result["commit_before"], "cccc3333")
        self.assertEqual(result["commit_after"], "dddd4444")
        self.assertIn("git failed", result["message"])


if __name__ == "__main__":
    unittest.main()
