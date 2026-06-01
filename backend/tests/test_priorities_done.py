"""
Batch B tests:
1. DailyEntry priorities_done field round-trip (POST/GET/PUT)
2. PEPPER checkin preserves priorities_done across re-dumps (init + preserve+pad)
3. Tasks (loops) CRUD end-to-end + mark done
4. Regression sanity for existing endpoints
"""
import os
import pytest
import requests
from datetime import datetime


def _resolve_base_url() -> str:
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
USER = "default_user"
TODAY = datetime.utcnow().strftime("%Y-%m-%d")


# ---------------------------------------------------------------
# 1. DailyEntry priorities_done CRUD
# ---------------------------------------------------------------
class TestDailyEntryPrioritiesDone:
    """Verify priorities_done: List[bool] persists through POST → GET → PUT."""

    def test_post_then_get_then_put_priorities_done(self, api_client):
        # Use a non-today date so we don't collide with pepper auto-sync entry
        unique_date = f"2030-01-{(datetime.utcnow().second % 28) + 1:02d}"

        # ---- POST ----
        payload = {
            "date": unique_date,
            "top_priorities": ["a", "b", "c"],
            "priorities_done": [True, False, False],
            "water_checked": False,
            "food_checked": False,
            "hygiene_checked": False,
        }
        r = api_client.post(
            f"{BASE_URL}/api/daily-entries?user_id={USER}", json=payload
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["priorities_done"] == [True, False, False], body
        assert body["top_priorities"] == ["a", "b", "c"]
        entry_id = body["id"]

        # ---- GET by date ----
        r = api_client.get(f"{BASE_URL}/api/daily-entries/{USER}/{unique_date}")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["priorities_done"] == [True, False, False]
        assert body["top_priorities"] == ["a", "b", "c"]
        assert body["id"] == entry_id

        # ---- PUT update priorities_done ----
        update_payload = {
            "date": unique_date,
            "top_priorities": ["a", "b", "c"],
            "priorities_done": [True, True, False],
            "water_checked": False,
            "food_checked": False,
            "hygiene_checked": False,
        }
        r = api_client.put(
            f"{BASE_URL}/api/daily-entries/{entry_id}", json=update_payload
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["priorities_done"] == [True, True, False], body

        # ---- GET again to verify persisted ----
        r = api_client.get(f"{BASE_URL}/api/daily-entries/{USER}/{unique_date}")
        assert r.status_code == 200
        assert r.json()["priorities_done"] == [True, True, False]

    def test_post_default_priorities_done_empty(self, api_client):
        """If client omits priorities_done, it should default to []"""
        unique_date = "2030-02-15"
        payload = {
            "date": unique_date,
            "top_priorities": ["x"],
            "water_checked": False,
            "food_checked": False,
            "hygiene_checked": False,
        }
        r = api_client.post(
            f"{BASE_URL}/api/daily-entries?user_id={USER}", json=payload
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["priorities_done"] == [], body
        assert isinstance(body["priorities_done"], list)


# ---------------------------------------------------------------
# 2. PEPPER checkin priorities_done preservation
# ---------------------------------------------------------------
class TestPepperCheckinPrioritiesDone:
    """
    PEPPER checkin should:
      - On first call (no existing entry): init priorities_done = [False]*len(top_priorities)
      - On subsequent same-day call: preserve prior priorities_done by index,
        padding with False if list grew.
    """

    def _cleanup_today_entry(self, api_client):
        """Remove today's daily entry so first checkin behaves as fresh."""
        # No DELETE for daily-entries — overwrite with empty doc instead via PUT after locating
        r = api_client.get(f"{BASE_URL}/api/daily-entries/{USER}/{TODAY}")
        if r.status_code == 200:
            eid = r.json()["id"]
            # Reset to clean slate
            api_client.put(
                f"{BASE_URL}/api/daily-entries/{eid}",
                json={
                    "date": TODAY,
                    "top_priorities": [],
                    "priorities_done": [],
                    "water_checked": False,
                    "food_checked": False,
                    "hygiene_checked": False,
                },
            )

    def test_checkin_initializes_then_preserves_priorities_done(self, api_client):
        test_user = f"TEST_pepper_pdone_{int(datetime.utcnow().timestamp())}"

        # ---- First checkin ----
        r = api_client.post(
            f"{BASE_URL}/api/pepper/checkin?user_id={test_user}",
            json={
                "raw_dump": "rent due, dishes piled up, email backlog, gotta send invoice",
                "spice_level": "mild",
            },
        )
        assert r.status_code == 200, r.text

        # Read today's daily entry for this user
        r = api_client.get(f"{BASE_URL}/api/daily-entries/{test_user}/{TODAY}")
        assert r.status_code == 200, r.text
        entry = r.json()
        first_priorities = entry["top_priorities"]
        first_done = entry["priorities_done"]
        assert isinstance(first_done, list)
        assert len(first_done) == len(first_priorities), (
            f"priorities_done length {len(first_done)} != top_priorities length {len(first_priorities)}"
        )
        # Should be initialized all False
        assert all(v is False for v in first_done), f"Expected all False on init, got {first_done}"

        # ---- Simulate user checking first priority ----
        modified_done = list(first_done)
        if len(modified_done) > 0:
            modified_done[0] = True
        r = api_client.put(
            f"{BASE_URL}/api/daily-entries/{entry['id']}",
            json={
                "date": TODAY,
                "top_priorities": first_priorities,
                "priorities_done": modified_done,
                "water_checked": entry.get("water_checked", False),
                "food_checked": entry.get("food_checked", False),
                "hygiene_checked": entry.get("hygiene_checked", False),
            },
        )
        assert r.status_code == 200

        # ---- Second checkin same day ----
        r = api_client.post(
            f"{BASE_URL}/api/pepper/checkin?user_id={test_user}",
            json={
                "raw_dump": "still chaos, now also laundry, and dentist call, and groceries, and rent reminder",
                "spice_level": "mild",
            },
        )
        assert r.status_code == 200, r.text

        # ---- Verify priorities_done not fully reset ----
        r = api_client.get(f"{BASE_URL}/api/daily-entries/{test_user}/{TODAY}")
        assert r.status_code == 200
        entry2 = r.json()
        second_done = entry2["priorities_done"]
        second_priorities = entry2["top_priorities"]
        assert len(second_done) == len(second_priorities), (
            f"After re-checkin, length mismatch: done={len(second_done)} pri={len(second_priorities)}"
        )
        # The prior index-0 True must be preserved (since AI also returns up to 3 priorities)
        if len(modified_done) > 0 and modified_done[0] is True:
            assert second_done[0] is True, (
                f"priorities_done index 0 was True before re-checkin but is now {second_done[0]}. "
                f"Full prior={modified_done}, new={second_done}"
            )
        # Padding with False if list grew is acceptable
        # And not all values should be reset to False (at least index 0 keeps True)
        assert any(v is True for v in second_done) or all(v is False for v in modified_done), (
            f"All priorities_done reset to False: {second_done}"
        )


# ---------------------------------------------------------------
# 3. Tasks (loops) CRUD
# ---------------------------------------------------------------
class TestTasksLoops:
    def test_task_full_crud(self, api_client):
        # Create
        r = api_client.post(
            f"{BASE_URL}/api/tasks?user_id={USER}",
            json={
                "title": "TEST_loop_task",
                "next_action": "draft outline",
                "deadline": "2030-12-31",
                "status": "in_progress",
                "notes": "test note",
            },
        )
        assert r.status_code == 200, r.text
        task = r.json()
        assert task["title"] == "TEST_loop_task"
        assert task["status"] == "in_progress"
        assert task["deadline"] == "2030-12-31"
        task_id = task["id"]

        # GET list
        r = api_client.get(f"{BASE_URL}/api/tasks/{USER}")
        assert r.status_code == 200
        assert any(t["id"] == task_id for t in r.json())

        # PUT update status -> done
        r = api_client.put(
            f"{BASE_URL}/api/tasks/{task_id}",
            json={
                "title": "TEST_loop_task",
                "next_action": "draft outline",
                "deadline": "2030-12-31",
                "status": "done",
                "notes": "completed",
            },
        )
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "done"

        # GET and verify status=done
        r = api_client.get(f"{BASE_URL}/api/tasks/{USER}")
        match = [t for t in r.json() if t["id"] == task_id]
        assert match and match[0]["status"] == "done"

        # DELETE
        r = api_client.delete(f"{BASE_URL}/api/tasks/{task_id}")
        assert r.status_code == 200

        # GET — should be gone
        r = api_client.get(f"{BASE_URL}/api/tasks/{USER}")
        assert not any(t["id"] == task_id for t in r.json())


# ---------------------------------------------------------------
# 4. Regression sanity
# ---------------------------------------------------------------
class TestRegressionSanity:
    def test_get_tasks(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/tasks/{USER}")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_get_money_entries(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/money-entries/{USER}")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_get_body_logs(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/body-logs/{USER}")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_pepper_advise_person(self, api_client):
        r = api_client.post(
            f"{BASE_URL}/api/pepper/advise-person?user_id={USER}",
            json={
                "person_name": "TEST_Jay",
                "relationship_context": "ex",
                "risk_trust_notes": "love-bombs when lonely",
                "spice_level": "medium",
            },
        )
        assert r.status_code == 200, r.text
        body = r.json()
        # Must have core keys
        for k in ("vibe_read", "the_move", "verdict"):
            assert k in body, f"missing {k} in {body}"
        assert body["verdict"] in ("trust", "caution", "cut")

    def test_pepper_advise_body(self, api_client):
        r = api_client.post(
            f"{BASE_URL}/api/pepper/advise-body?user_id={USER}",
            json={
                "sleep": "4h",
                "symptoms": "headache",
                "period_started_on": "2026-05-15",
                "medications": ["Ozempic 0.5mg weekly"],
                "spice_level": "medium",
            },
        )
        assert r.status_code == 200, r.text
        body = r.json()
        for k in ("vibe_read", "care_moves", "permission"):
            assert k in body, f"missing {k} in {body}"
        assert isinstance(body["care_moves"], list)
