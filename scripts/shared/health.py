from __future__ import annotations

import urllib.request
import urllib.error


def check_server_health(server_url: str, timeout: int = 5) -> bool:
    """Check if a ComfyUI server is reachable by hitting /system_stats."""
    url = server_url.rstrip("/") + "/system_stats"
    try:
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=timeout):
            return True
    except (urllib.error.URLError, OSError):
        return False
