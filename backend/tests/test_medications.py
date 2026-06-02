"""
Batch 2 — Medications tracking (separate collection)
Tests CRUD on /api/medications, mark taken (POST /take), undo (DELETE /take),
plus regression checks on the legacy body_logs medications field + other endpoints.
"""
import time
from datetime import datetime

import pytest
import requests

from conftest import BASE_URL

USER = f"TEST_med_user_{int(time.time())}"


# ---------- Medications CRUD ----------
class TestMedicationsCRUD:
    created_ids = []

    def test_01_create_weekly_morning(self, api_client):
        payload = {
            "name": "Ozempic",
            "dosage": "0.5mg",
            "frequency": "weekly",
            "time_of_day": "morning",
            "notes": "with food",
            "active": True,
        }
        r = api_client.post(f"{BASE_URL}/api/medications", params={"user_id": USER}, json=payload)
        assert r.status_code == 200, r.text
        body = r.json()
        # required fields
        for k in ["id", "name", "dosage", "frequency", "time_of_day", "notes", "intake_history", "created_at", "updated_at"]:
            assert k in body, f"missing field {k} in {body}"
        assert body["name"] == "Ozempic"
        assert body["dosage"] == "0.5mg"
        assert body["frequency"] == "weekly"
        assert body["time_of_day"] == "morning"
        assert body["notes"] == "with food"
        assert body["intake_history"] == []
        assert body["user_id"] == USER
        TestMedicationsCRUD.created_ids.append(body["id"])

    def test_02_create_daily_bedtime(self, api_client):
        time.sleep(0.05)  # ensure created_at ordering differs
        payload = {
            "name": "Melatonin",
            "dosage": "5mg",
            "frequency": "daily",
            "time_of_day": "bedtime",
            "active": True,
        }
        r = api_client.post(f"{BASE_URL}/api/medications", params={"user_id": USER}, json=payload)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["frequency"] == "daily"
        assert body["time_of_day"] == "bedtime"
        TestMedicationsCRUD.created_ids.append(body["id"])

    def test_03_create_as_needed_no_time(self, api_client):
        time.sleep(0.05)
        payload = {
            "name": "Ibuprofen",
            "dosage": "200mg",
            "frequency": "as_needed",
        }
        r = api_client.post(f"{BASE_URL}/api/medications", params={"user_id": USER}, json=payload)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["frequency"] == "as_needed"
        assert body["time_of_day"] is None
        TestMedicationsCRUD.created_ids.append(body["id"])

    def test_04_list_returns_three_sorted_desc(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/medications/{USER}")
        assert r.status_code == 200, r.text
        items = r.json()
        assert len(items) == 3, f"expected 3 meds, got {len(items)}"
        # sorted by created_at desc — newest first → as_needed, daily, weekly
        names = [i["name"] for i in items]
        assert names == ["Ibuprofen", "Melatonin", "Ozempic"], f"unexpected order: {names}"
        # verify created_at descending
        timestamps = [i["created_at"] for i in items]
        assert timestamps == sorted(timestamps, reverse=True), f"not desc sorted: {timestamps}"

    def test_05_invalid_frequency_rejected(self, api_client):
        payload = {"name": "BadMed", "frequency": "biweekly"}
        r = api_client.post(f"{BASE_URL}/api/medications", params={"user_id": USER}, json=payload)
        assert r.status_code == 422, f"expected 422, got {r.status_code}: {r.text}"

    def test_06_update_first_med_dosage(self, api_client):
        med_id = TestMedicationsCRUD.created_ids[0]  # Ozempic
        payload = {
            "name": "Ozempic",
            "dosage": "1.0mg",
            "frequency": "weekly",
            "time_of_day": "morning",
            "notes": "with food",
            "active": True,
        }
        r = api_client.put(f"{BASE_URL}/api/medications/{med_id}", json=payload)
        assert r.status_code == 200, r.text
        assert r.json()["dosage"] == "1.0mg"

        # Persisted via GET
        r2 = api_client.get(f"{BASE_URL}/api/medications/{USER}")
        assert r2.status_code == 200
        found = next((m for m in r2.json() if m["id"] == med_id), None)
        assert found is not None
        assert found["dosage"] == "1.0mg"

    def test_07_delete_third_med(self, api_client):
        med_id = TestMedicationsCRUD.created_ids[2]  # Ibuprofen
        r = api_client.delete(f"{BASE_URL}/api/medications/{med_id}")
        assert r.status_code == 200, r.text
        # Verify GET returns 2 left
        r2 = api_client.get(f"{BASE_URL}/api/medications/{USER}")
        assert r2.status_code == 200
        items = r2.json()
        assert len(items) == 2
        assert all(m["id"] != med_id for m in items)

    def test_08_delete_nonexistent_404(self, api_client):
        # Use a valid-looking ObjectId that does not exist
        fake_id = "507f1f77bcf86cd799439011"
        r = api_client.delete(f"{BASE_URL}/api/medications/{fake_id}")
        assert r.status_code == 404, f"expected 404, got {r.status_code}: {r.text}"


# ---------- Mark / undo intake ----------
class TestMedicationTake:
    med_id = None

    @classmethod
    def setup_class(cls):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        payload = {"name": "TestTakeMed", "dosage": "1mg", "frequency": "daily", "time_of_day": "morning"}
        r = s.post(f"{BASE_URL}/api/medications", params={"user_id": USER + "_take"}, json=payload)
        assert r.status_code == 200, r.text
        cls.med_id = r.json()["id"]
        cls.session = s

    @classmethod
    def teardown_class(cls):
        try:
            cls.session.delete(f"{BASE_URL}/api/medications/{cls.med_id}")
        except Exception:
            pass

    # NOTE: container clock is 2026-06-02 UTC. We pick a clearly different past date
    # ("2026-05-15") for "specific_date" tests so today/default isn't the same day.
    PAST_DATE = "2026-05-15"

    def test_01_take_with_specific_date(self):
        r = self.session.post(
            f"{BASE_URL}/api/medications/{self.med_id}/take",
            json={"date": self.PAST_DATE},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "intake_history" in body
        dates = [h["date"] for h in body["intake_history"]]
        assert dates == [self.PAST_DATE], f"expected single entry, got {dates}"
        assert "taken_at" in body["intake_history"][0]

    def test_02_take_same_date_no_duplicate(self):
        r = self.session.post(
            f"{BASE_URL}/api/medications/{self.med_id}/take",
            json={"date": self.PAST_DATE},
        )
        assert r.status_code == 200
        dates = [h["date"] for h in r.json()["intake_history"]]
        assert dates == [self.PAST_DATE], f"duplicate created: {dates}"

    def test_03_take_default_today(self):
        r = self.session.post(
            f"{BASE_URL}/api/medications/{self.med_id}/take",
            json={},
        )
        assert r.status_code == 200, r.text
        today = datetime.utcnow().strftime("%Y-%m-%d")
        assert today != self.PAST_DATE, "Test invariant: PAST_DATE must differ from today"
        dates = sorted([h["date"] for h in r.json()["intake_history"]])
        assert len(dates) == 2, f"expected 2 entries, got {dates}"
        assert self.PAST_DATE in dates
        assert today in dates

    def test_04_undo_specific_date(self):
        r = self.session.delete(
            f"{BASE_URL}/api/medications/{self.med_id}/take",
            params={"date": self.PAST_DATE},
        )
        assert r.status_code == 200, r.text
        today = datetime.utcnow().strftime("%Y-%m-%d")
        dates = [h["date"] for h in r.json()["intake_history"]]
        assert dates == [today], f"expected only today after undo, got {dates}"

    def test_05_undo_default_today(self):
        r = self.session.delete(f"{BASE_URL}/api/medications/{self.med_id}/take")
        assert r.status_code == 200, r.text
        assert r.json()["intake_history"] == []


# ---------- Regression: prior endpoints still healthy ----------
class TestRegression:
    def test_body_logs_still_accept_medications_list_of_strings(self, api_client):
        ruser = f"TEST_med_regression_{int(time.time())}"
        payload = {
            "date": "2026-06-01",
            "medications": ["Ozempic 0.5mg weekly", "Vitamin D"],
            "sleep": "6h",
        }
        r = api_client.post(f"{BASE_URL}/api/body-logs", params={"user_id": ruser}, json=payload)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["medications"] == ["Ozempic 0.5mg weekly", "Vitamin D"]

        # GET back
        r2 = api_client.get(f"{BASE_URL}/api/body-logs/{ruser}")
        assert r2.status_code == 200
        logs = r2.json()
        assert any(l["medications"] == ["Ozempic 0.5mg weekly", "Vitamin D"] for l in logs)

    def test_tasks_endpoint_healthy(self, api_client):
        ruser = f"TEST_med_reg_tasks_{int(time.time())}"
        r = api_client.post(f"{BASE_URL}/api/tasks", params={"user_id": ruser}, json={"title": "regression task"})
        assert r.status_code == 200, r.text
        tid = r.json()["id"]
        g = api_client.get(f"{BASE_URL}/api/tasks/{ruser}")
        assert g.status_code == 200
        assert any(t["id"] == tid for t in g.json())
        d = api_client.delete(f"{BASE_URL}/api/tasks/{tid}")
        assert d.status_code == 200

    def test_daily_entries_endpoint_healthy(self, api_client):
        ruser = f"TEST_med_reg_daily_{int(time.time())}"
        r = api_client.post(
            f"{BASE_URL}/api/daily-entries",
            params={"user_id": ruser},
            json={"date": "2026-06-10", "top_priorities": ["a", "b"]},
        )
        assert r.status_code == 200, r.text
        g = api_client.get(f"{BASE_URL}/api/daily-entries/{ruser}")
        assert g.status_code == 200
        assert len(g.json()) >= 1

    def test_money_entries_endpoint_healthy(self, api_client):
        ruser = f"TEST_med_reg_money_{int(time.time())}"
        r = api_client.post(
            f"{BASE_URL}/api/money-entries",
            params={"user_id": ruser},
            json={"date": "2026-06-10", "cash_available": 100.0},
        )
        assert r.status_code == 200, r.text
        g = api_client.get(f"{BASE_URL}/api/money-entries/{ruser}")
        assert g.status_code == 200
        assert any(e["cash_available"] == 100.0 for e in g.json())

    def test_person_notes_endpoint_healthy(self, api_client):
        ruser = f"TEST_med_reg_pn_{int(time.time())}"
        r = api_client.post(
            f"{BASE_URL}/api/person-notes",
            params={"user_id": ruser},
            json={"person_name": "RegressionTest", "relationship_category": "friendship"},
        )
        assert r.status_code == 200, r.text
        nid = r.json()["id"]
        api_client.delete(f"{BASE_URL}/api/person-notes/{nid}")
