from __future__ import annotations

import urllib.request
import urllib.error


def check_server_health(server_url: str, auth: str = "", timeout: int = 5) -> bool:
    """Check if a ComfyUI server is reachable by hitting /system_stats."""
    return test_server_connection(server_url, auth, timeout)[0]


def test_server_connection(
    server_url: str, auth: str = "", timeout: int = 5
) -> tuple[bool, str]:
    """Test connection to a ComfyUI server.

    Returns (success, message) where message describes the error on failure.
    """
    url = server_url.rstrip("/") + "/system_stats"
    try:
        req = urllib.request.Request(url, method="GET")
        if auth:
            req.add_header("Authorization", auth)
        with urllib.request.urlopen(req, timeout=timeout):
            return True, "OK"
    except urllib.error.HTTPError as e:
        if e.code == 401:
            return False, "Authentication failed (401 Unauthorized)"
        if e.code == 403:
            return False, "Access denied (403 Forbidden)"
        return False, f"HTTP {e.code}: {e.reason}"
    except urllib.error.URLError as e:
        reason = str(e.reason) if hasattr(e, "reason") else str(e)
        return False, f"Cannot reach server: {reason}"
    except TimeoutError:
        return False, f"Connection timed out after {timeout}s"
    except OSError as e:
        return False, f"Network error: {e}"
