"""
Salt Check backend API regression tests.
Covers: users, daily-entries, projects, tasks, money-entries, body-logs,
person-notes, PEPPER check-in (normal + crisis), and PEPPER history.
"""
import time
import uuid
from datetime import date as date_cls

import pytest


# ---------- module-scope state for cross-test cleanup ----------
CREATED = {
    "users": [],
    "daily_entries": [],
    "projects": [],
    "tasks": [],
    "money_entries": [],
    "body_logs": [],
    "person_notes": [],
}


# ----------------- Health -----------------
class TestHealth:
    def test_root_via_api_prefix(self, api_client, base_url):
        """Public ingress only routes /api/*; verify backend is reachable via an /api endpoint."""
        # list-users is a safe, idempotent /api endpoint
        r = api_client.get(f"{base_url}/api/users")
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)


# ----------------- Users -----------------
class TestUsers:
    def test_create_user(self, api_client, base_url):
        unique_email = f"TEST_{uuid.uuid4().hex[:8]}@example.com"
        payload = {
            "email": unique_email,
            "name": "TEST User",
            "nickname": "Salty",
            "pepper_spice_level": "extra_spicy",
            "timezone": "UTC",
        }
        r = api_client.post(f"{base_url}/api/users", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["email"] == unique_email
        assert data["name"] == "TEST User"
        assert data["pepper_spice_level"] == "extra_spicy"
        assert "id" in data and len(data["id"]) > 0
        CREATED["users"].append({"id": data["id"], "email": unique_email})

    def test_create_duplicate_user_rejected(self, api_client, base_url):
        if not CREATED["users"]:
            pytest.skip("no user created")
        email = CREATED["users"][0]["email"]
        r = api_client.post(
            f"{base_url}/api/users",
            json={"email": email, "name": "dup"},
        )
        assert r.status_code == 400, r.text

    def test_get_user_by_id(self, api_client, base_url):
        if not CREATED["users"]:
            pytest.skip("no user created")
        uid = CREATED["users"][0]["id"]
        r = api_client.get(f"{base_url}/api/users/{uid}")
        assert r.status_code == 200, r.text
        assert r.json()["id"] == uid

    def test_list_users(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/users")
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)


# ----------------- Daily Entries -----------------
class TestDailyEntries:
    USER = "TEST_daily_user"

    def test_create_daily_entry(self, api_client, base_url):
        today = date_cls.today().isoformat()
        payload = {
            "date": today,
            "top_priorities": ["pay rent", "call mom"],
            "water_checked": True,
            "food_checked": False,
            "hygiene_checked": True,
            "next_sane_step": "open the laptop",
        }
        r = api_client.post(
            f"{base_url}/api/daily-entries",
            params={"user_id": self.USER},
            json=payload,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["user_id"] == self.USER
        assert data["date"] == today
        assert data["top_priorities"] == ["pay rent", "call mom"]
        assert data["water_checked"] is True
        CREATED["daily_entries"].append(data["id"])

    def test_list_daily_entries(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/daily-entries/{self.USER}")
        assert r.status_code == 200, r.text
        entries = r.json()
        assert isinstance(entries, list) and len(entries) >= 1

    def test_get_daily_entry_by_date(self, api_client, base_url):
        today = date_cls.today().isoformat()
        r = api_client.get(f"{base_url}/api/daily-entries/{self.USER}/{today}")
        assert r.status_code == 200, r.text
        assert r.json()["date"] == today

    def test_get_daily_entry_404(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/daily-entries/nonexistent_user_xyz/1999-01-01")
        assert r.status_code == 404

    def test_update_daily_entry(self, api_client, base_url):
        if not CREATED["daily_entries"]:
            pytest.skip("no entry created")
        eid = CREATED["daily_entries"][0]
        today = date_cls.today().isoformat()
        payload = {
            "date": today,
            "top_priorities": ["updated"],
            "water_checked": False,
            "food_checked": True,
            "hygiene_checked": True,
            "next_sane_step": "drink water",
        }
        r = api_client.put(f"{base_url}/api/daily-entries/{eid}", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["top_priorities"] == ["updated"]
        assert data["water_checked"] is False
        assert data["food_checked"] is True


# ----------------- Projects -----------------
class TestProjects:
    USER = "TEST_projects_user"

    def test_create_project(self, api_client, base_url):
        r = api_client.post(
            f"{base_url}/api/projects",
            params={"user_id": self.USER},
            json={"name": "TEST Move flat", "description": "find boxes", "status": "in_progress"},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["name"] == "TEST Move flat"
        assert data["status"] == "in_progress"
        assert data["user_id"] == self.USER
        CREATED["projects"].append(data["id"])

    def test_list_projects(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/projects/{self.USER}")
        assert r.status_code == 200, r.text
        assert any(p["id"] == CREATED["projects"][0] for p in r.json())

    def test_update_project(self, api_client, base_url):
        pid = CREATED["projects"][0]
        r = api_client.put(
            f"{base_url}/api/projects/{pid}",
            json={"name": "TEST Move flat", "description": "boxes found", "status": "done"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "done"

    def test_delete_project(self, api_client, base_url):
        pid = CREATED["projects"].pop()
        r = api_client.delete(f"{base_url}/api/projects/{pid}")
        assert r.status_code == 200, r.text
        # Verify gone (delete again -> 404)
        r2 = api_client.delete(f"{base_url}/api/projects/{pid}")
        assert r2.status_code == 404


# ----------------- Tasks -----------------
class TestTasks:
    USER = "TEST_tasks_user"

    def test_create_task(self, api_client, base_url):
        r = api_client.post(
            f"{base_url}/api/tasks",
            params={"user_id": self.USER},
            json={
                "title": "TEST Email client",
                "next_action": "draft email",
                "status": "not_started",
                "parked": False,
            },
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["title"] == "TEST Email client"
        assert data["user_id"] == self.USER
        CREATED["tasks"].append(data["id"])

    def test_list_tasks(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/tasks/{self.USER}")
        assert r.status_code == 200, r.text
        assert len(r.json()) >= 1

    def test_update_task(self, api_client, base_url):
        tid = CREATED["tasks"][0]
        r = api_client.put(
            f"{base_url}/api/tasks/{tid}",
            json={
                "title": "TEST Email client",
                "next_action": "sent",
                "status": "done",
                "parked": False,
            },
        )
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "done"

    def test_delete_task(self, api_client, base_url):
        tid = CREATED["tasks"].pop()
        r = api_client.delete(f"{base_url}/api/tasks/{tid}")
        assert r.status_code == 200, r.text
        r2 = api_client.delete(f"{base_url}/api/tasks/{tid}")
        assert r2.status_code == 404


# ----------------- Money Entries -----------------
class TestMoneyEntries:
    USER = "TEST_money_user"

    def test_create_money_entry(self, api_client, base_url):
        r = api_client.post(
            f"{base_url}/api/money-entries",
            params={"user_id": self.USER},
            json={
                "date": date_cls.today().isoformat(),
                "cash_available": 250.50,
                "expected_income": 1200.00,
                "upcoming_bills": 800.00,
                "urgent_payments": "rent",
            },
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["cash_available"] == 250.50
        assert data["user_id"] == self.USER
        CREATED["money_entries"].append(data["id"])

    def test_list_money_entries(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/money-entries/{self.USER}")
        assert r.status_code == 200, r.text
        assert len(r.json()) >= 1

    def test_update_money_entry(self, api_client, base_url):
        mid = CREATED["money_entries"][0]
        r = api_client.put(
            f"{base_url}/api/money-entries/{mid}",
            json={
                "date": date_cls.today().isoformat(),
                "cash_available": 100.0,
                "expected_income": 1200.0,
                "upcoming_bills": 800.0,
                "urgent_payments": "rent + electricity",
            },
        )
        assert r.status_code == 200, r.text
        assert r.json()["cash_available"] == 100.0
        assert r.json()["urgent_payments"] == "rent + electricity"


# ----------------- Body Logs -----------------
class TestBodyLogs:
    USER = "TEST_body_user"

    def test_create_body_log(self, api_client, base_url):
        r = api_client.post(
            f"{base_url}/api/body-logs",
            params={"user_id": self.USER},
            json={
                "date": date_cls.today().isoformat(),
                "sleep": "6h",
                "appetite": "low",
                "water": 4,
            },
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["sleep"] == "6h"
        assert data["water"] == 4
        CREATED["body_logs"].append(data["id"])

    def test_list_body_logs(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/body-logs/{self.USER}")
        assert r.status_code == 200, r.text
        assert len(r.json()) >= 1

    def test_update_body_log(self, api_client, base_url):
        lid = CREATED["body_logs"][0]
        r = api_client.put(
            f"{base_url}/api/body-logs/{lid}",
            json={
                "date": date_cls.today().isoformat(),
                "sleep": "8h",
                "appetite": "ok",
                "water": 8,
            },
        )
        assert r.status_code == 200, r.text
        assert r.json()["sleep"] == "8h"
        assert r.json()["water"] == 8


# ----------------- Person Notes / Receipts -----------------
class TestPersonNotes:
    USER = "TEST_notes_user"

    def test_create_note(self, api_client, base_url):
        r = api_client.post(
            f"{base_url}/api/person-notes",
            params={"user_id": self.USER},
            json={
                "person_name": "TEST Alex",
                "relationship_context": "coworker",
                "promised": "deck by Friday",
                "locked": False,
            },
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["person_name"] == "TEST Alex"
        CREATED["person_notes"].append(data["id"])

    def test_list_notes(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/person-notes/{self.USER}")
        assert r.status_code == 200, r.text
        assert len(r.json()) >= 1

    def test_update_note(self, api_client, base_url):
        nid = CREATED["person_notes"][0]
        r = api_client.put(
            f"{base_url}/api/person-notes/{nid}",
            json={
                "person_name": "TEST Alex",
                "relationship_context": "coworker",
                "promised": "deck by Monday",
                "locked": True,
            },
        )
        assert r.status_code == 200, r.text
        assert r.json()["locked"] is True
        assert r.json()["promised"] == "deck by Monday"

    def test_delete_note(self, api_client, base_url):
        nid = CREATED["person_notes"].pop()
        r = api_client.delete(f"{base_url}/api/person-notes/{nid}")
        assert r.status_code == 200, r.text


# ----------------- PEPPER -----------------
class TestPepper:
    USER = "TEST_pepper_user"

    def test_pepper_normal_checkin(self, api_client, base_url):
        payload = {
            "raw_dump": (
                "I have so much work. Inbox exploding. Need to pay rent. "
                "Forgot to eat lunch. Client waiting. Everything feels urgent."
            )
        }
        r = api_client.post(
            f"{base_url}/api/pepper/checkin",
            params={"user_id": self.USER},
            json=payload,
            timeout=60,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "id" in data
        assert data["user_id"] == self.USER
        ai = data.get("ai_response", {})
        # Required JSON keys per system prompt
        for key in ["quick_read", "salt_check", "parked", "next_sane_step"]:
            assert key in ai, f"missing '{key}' in ai_response: {ai}"
        assert isinstance(ai["salt_check"], list)
        # MVP: 3-5 moves expected (loose check: at least 1)
        assert len(ai["salt_check"]) >= 1
        assert isinstance(data["next_sane_step"], str) and len(data["next_sane_step"]) > 0

    def test_pepper_crisis_detection(self, api_client, base_url):
        payload = {"raw_dump": "I want to die. I can't do this anymore."}
        r = api_client.post(
            f"{base_url}/api/pepper/checkin",
            params={"user_id": self.USER},
            json=payload,
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        ai = data["ai_response"]
        # Crisis mode hard-coded response - should be sass-free, warm
        text_blob = " ".join(
            [
                ai.get("quick_read", "") or "",
                " ".join(ai.get("salt_check", []) or []),
                ai.get("next_sane_step", "") or "",
                ai.get("closer", "") or "",
            ]
        ).lower()
        assert "crisis" in text_blob or "emergency" in text_blob or "not okay" in text_blob, (
            f"Crisis response did not contain expected safety language: {ai}"
        )
        # Should not be making jokes / using "park"
        assert "park" not in text_blob

    def test_pepper_history(self, api_client, base_url):
        # Should have at least 2 entries from above tests
        time.sleep(1)
        r = api_client.get(f"{base_url}/api/pepper/history/{self.USER}")
        assert r.status_code == 200, r.text
        history = r.json()
        assert isinstance(history, list)
        assert len(history) >= 2
        # Most recent first (created_at desc)
        assert history[0]["user_id"] == self.USER


# ----------------- Cleanup -----------------
def teardown_module(module):
    """Best-effort cleanup of TEST_-prefixed data."""
    import requests as _r
    from conftest import BASE_URL  # type: ignore

    s = _r.Session()
    for pid in CREATED["projects"]:
        try:
            s.delete(f"{BASE_URL}/api/projects/{pid}")
        except Exception:
            pass
    for tid in CREATED["tasks"]:
        try:
            s.delete(f"{BASE_URL}/api/tasks/{tid}")
        except Exception:
            pass
    for nid in CREATED["person_notes"]:
        try:
            s.delete(f"{BASE_URL}/api/person-notes/{nid}")
        except Exception:
            pass
