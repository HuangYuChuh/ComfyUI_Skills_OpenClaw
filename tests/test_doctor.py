from __future__ import annotations

import unittest
from unittest.mock import patch

from scripts import comfyui_client, doctor


class DummyResponse:
    def __init__(self, *, ok: bool, status_code: int, payload=None, text: str = ""):
        self.ok = ok
        self.status_code = status_code
        self._payload = payload
        self.text = text

    def json(self):
        if self._payload is None:
            raise ValueError("no json")
        return self._payload


class DoctorCloudDiagnosticsTests(unittest.TestCase):
    def test_probe_cloud_server_reports_free_tier_api_restriction(self) -> None:
        server = {
            "id": "cloud",
            "server_type": "comfy_cloud",
            "url": "https://cloud.comfy.org",
            "api_key": "cck_test",
        }
        response = DummyResponse(
            ok=False,
            status_code=403,
            payload={"message": "API key authentication is not available for free tier accounts"},
        )

        with patch("scripts.doctor.requests.get", return_value=response):
            result = doctor.probe_cloud_server(server)

        self.assertEqual("cloud_api_key_free_tier_unsupported", result["code"])
        self.assertIn("free tier accounts cannot use the Cloud API", result["message"])

    def test_probe_server_health_includes_cloud_error_detail(self) -> None:
        server = {
            "id": "cloud",
            "server_type": "comfy_cloud",
            "url": "https://cloud.comfy.org",
            "api_key": "cck_test",
        }
        response = DummyResponse(
            ok=False,
            status_code=403,
            payload={"message": "API key authentication is not available for free tier accounts"},
        )

        with patch("scripts.comfyui_client.requests.get", return_value=response):
            healthy, reason = comfyui_client.probe_server_health(server)

        self.assertFalse(healthy)
        self.assertIn("HTTP 403", reason)
        self.assertIn("free tier accounts", reason)


if __name__ == "__main__":
    unittest.main()
