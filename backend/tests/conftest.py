import pytest
import requests
import os


def _resolve_base_url() -> str:
    # Prefer public URL (with /api ingress routing). Fallback: read frontend env.
    url = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
    if not url:
        env_path = "/app/frontend/.env"
        if os.path.exists(env_path):
            with open(env_path) as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                        url = line.split("=", 1)[1].strip().strip('"')
                        break
    if not url:
        raise RuntimeError("EXPO_PUBLIC_BACKEND_URL not configured")
    return url.rstrip("/")


BASE_URL = _resolve_base_url()


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture(scope="session")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s
