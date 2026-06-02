"""
Batch C tests — itemized bills/income on money-entries +
PEPPER-driven extraction of bills/income during checkin.
"""
import os
import time
import pytest
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
_mongo = MongoClient(os.getenv("MONGO_URL"))
_db = _mongo[os.getenv("DB_NAME", "saltcheck_db")]


def _purge(user_id: str):
    """Wipe all test-created docs for a TEST_ user across collections."""
    for col in ("money_entries", "ai_checkins", "daily_entries", "tasks",
                "body_logs", "person_notes"):
        _db[col].delete_many({"user_id": user_id})


@pytest.fixture(scope="module", autouse=True)
def _cleanup_test_users():
    for uid in ("TEST_bills_user", "TEST_pepper_bills",
                "TEST_pepper_no_money", "TEST_regression_user"):
        _purge(uid)
    yield


# ---------- 1. Itemized bills + income round-trip on money-entries ----------

class TestMoneyEntryBillsIncomeRoundTrip:
    user_id = "TEST_bills_user"

    def test_post_with_bills_and_income(self, api_client, base_url):
        payload = {
            "date": "2026-06-01",
            "currency": "USD",
            "cash_available": 1000,
            "bills": [
                {"label": "Rent", "amount": 1200, "due_date": "2026-06-15",
                 "recurring": "monthly", "paid": False},
                {"label": "Spotify", "amount": 12, "paid": True},
            ],
            "income": [
                {"label": "Paycheck", "amount": 3000,
                 "expected_date": "2026-06-05", "recurring": "monthly"}
            ],
        }
        r = api_client.post(
            f"{base_url}/api/money-entries?user_id={self.user_id}", json=payload
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["cash_available"] == 1000
        assert isinstance(data.get("bills"), list) and len(data["bills"]) == 2
        labels = sorted(b["label"] for b in data["bills"])
        assert labels == ["Rent", "Spotify"]
        rent = next(b for b in data["bills"] if b["label"] == "Rent")
        assert rent["amount"] == 1200
        assert rent["due_date"] == "2026-06-15"
        assert rent["recurring"] == "monthly"
        assert rent["paid"] is False
        spotify = next(b for b in data["bills"] if b["label"] == "Spotify")
        assert spotify["paid"] is True
        assert isinstance(data.get("income"), list) and len(data["income"]) == 1
        inc = data["income"][0]
        assert inc["label"] == "Paycheck"
        assert inc["amount"] == 3000
        assert inc["expected_date"] == "2026-06-05"
        assert inc["recurring"] == "monthly"
        # stash id for subsequent tests
        pytest.entry_id = data["id"]

    def test_put_update_bills_mark_paid_and_add_third(self, api_client, base_url):
        entry_id = getattr(pytest, "entry_id", None)
        assert entry_id, "previous test must run first"
        payload = {
            "date": "2026-06-01",
            "currency": "USD",
            "cash_available": 1000,
            "bills": [
                {"label": "Rent", "amount": 1200, "due_date": "2026-06-15",
                 "recurring": "monthly", "paid": True},   # now paid
                {"label": "Spotify", "amount": 12, "paid": True},
                {"label": "Internet", "amount": 60, "due_date": "2026-06-20",
                 "recurring": "monthly", "paid": False},  # newly added
            ],
            "income": [
                {"label": "Paycheck", "amount": 3000,
                 "expected_date": "2026-06-05", "recurring": "monthly"}
            ],
        }
        r = api_client.put(f"{base_url}/api/money-entries/{entry_id}", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert len(data["bills"]) == 3
        rent = next(b for b in data["bills"] if b["label"] == "Rent")
        assert rent["paid"] is True
        internet = next(b for b in data["bills"] if b["label"] == "Internet")
        assert internet["amount"] == 60

    def test_get_money_entries_returns_bills_income(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/money-entries/{self.user_id}")
        assert r.status_code == 200
        entries = r.json()
        assert len(entries) >= 1
        entry = entries[0]
        assert isinstance(entry.get("bills"), list) and len(entry["bills"]) == 3
        assert isinstance(entry.get("income"), list) and len(entry["income"]) == 1


# ---------- 2. PEPPER checkin extracts bills/income and merges ----------

class TestPepperCheckinMergesBillsIncome:
    user_id = "TEST_pepper_bills"

    def test_seed_initial_money_entry(self, api_client, base_url):
        payload = {
            "date": "2026-06-01",
            "currency": "USD",
            "cash_available": 500,
            "bills": [{"label": "electricity", "amount": 80, "paid": False}],
        }
        r = api_client.post(
            f"{base_url}/api/money-entries?user_id={self.user_id}", json=payload
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["bills"][0]["label"] == "electricity"
        assert data["bills"][0]["amount"] == 80

    def test_pepper_checkin_merges_into_latest(self, api_client, base_url):
        payload = {
            "raw_dump": ("rent is 1500 due on the 15th, monthly. "
                         "paycheck of 2400 hitting friday. "
                         "also electricity went up to 95."),
            "spice_level": "medium",
        }
        r = api_client.post(
            f"{base_url}/api/pepper/checkin?user_id={self.user_id}",
            json=payload, timeout=60,
        )
        assert r.status_code == 200, r.text
        # Give DB a beat
        time.sleep(1)
        r2 = api_client.get(f"{base_url}/api/money-entries/{self.user_id}")
        assert r2.status_code == 200
        entries = r2.json()
        assert len(entries) >= 1
        # Latest entry should be the one we seeded (no new doc created if existing found)
        # Find the entry that has the merged data
        bills_by_label = {}
        income_by_label = {}
        for e in entries:
            for b in (e.get("bills") or []):
                bills_by_label.setdefault(b["label"].lower(), b)
            for inc in (e.get("income") or []):
                income_by_label.setdefault(inc["label"].lower(), inc)

        # electricity should be present and updated to 95 (dedupe by lowercased label)
        assert "electricity" in bills_by_label, f"electricity missing; got {list(bills_by_label)}"
        assert bills_by_label["electricity"]["amount"] == 95, \
            f"electricity not updated: {bills_by_label['electricity']}"

        # rent should be added with amount 1500 + recurring monthly
        assert "rent" in bills_by_label, f"rent missing; got {list(bills_by_label)}"
        assert bills_by_label["rent"]["amount"] == 1500
        assert bills_by_label["rent"].get("recurring") == "monthly"

        # paycheck income with amount 2400
        assert "paycheck" in income_by_label, f"paycheck missing; got {list(income_by_label)}"
        assert income_by_label["paycheck"]["amount"] == 2400


# ---------- 3. PEPPER checkin with no money mention ----------

class TestPepperCheckinNoMoneyMention:
    user_id = "TEST_pepper_no_money"

    def test_seed_initial_entry(self, api_client, base_url):
        payload = {
            "date": "2026-06-01",
            "currency": "USD",
            "cash_available": 200,
            "bills": [{"label": "gym", "amount": 30, "paid": False}],
            "income": [{"label": "tutoring", "amount": 100}],
        }
        r = api_client.post(
            f"{base_url}/api/money-entries?user_id={self.user_id}", json=payload
        )
        assert r.status_code == 200, r.text

    def test_pepper_checkin_no_money_does_not_touch_entry(self, api_client, base_url):
        payload = {
            "raw_dump": "just stressed about my brother",
            "spice_level": "medium",
        }
        r = api_client.post(
            f"{base_url}/api/pepper/checkin?user_id={self.user_id}",
            json=payload, timeout=60,
        )
        assert r.status_code == 200, r.text
        time.sleep(1)
        r2 = api_client.get(f"{base_url}/api/money-entries/{self.user_id}")
        assert r2.status_code == 200
        entries = r2.json()
        # should still be exactly 1 entry, with exactly original bills/income
        assert len(entries) == 1, f"expected 1 entry, got {len(entries)}"
        e = entries[0]
        assert len(e.get("bills") or []) == 1
        assert e["bills"][0]["label"] == "gym"
        assert e["bills"][0]["amount"] == 30
        assert len(e.get("income") or []) == 1
        assert e["income"][0]["label"] == "tutoring"
        assert e["income"][0]["amount"] == 100


# ---------- 4. Sanity regression on prior batch endpoints ----------

class TestSanityRegression:
    user_id = "TEST_regression_user"

    def test_tasks_crud(self, api_client, base_url):
        # Create
        r = api_client.post(
            f"{base_url}/api/tasks?user_id={self.user_id}",
            json={"title": "TEST_loop_task_c", "status": "not_started"},
        )
        assert r.status_code == 200, r.text
        task_id = r.json()["id"]
        # Get
        r = api_client.get(f"{base_url}/api/tasks/{self.user_id}")
        assert r.status_code == 200
        assert any(t["id"] == task_id for t in r.json())
        # Update
        r = api_client.put(
            f"{base_url}/api/tasks/{task_id}",
            json={"title": "TEST_loop_task_c", "status": "done"},
        )
        assert r.status_code == 200
        assert r.json()["status"] == "done"
        # Delete
        r = api_client.delete(f"{base_url}/api/tasks/{task_id}")
        assert r.status_code == 200

    def test_daily_entry_priorities_done(self, api_client, base_url):
        payload = {
            "date": "2030-07-01",
            "top_priorities": ["a", "b", "c"],
            "priorities_done": [True, False, False],
        }
        r = api_client.post(
            f"{base_url}/api/daily-entries?user_id={self.user_id}", json=payload
        )
        assert r.status_code == 200, r.text
        eid = r.json()["id"]
        assert r.json()["priorities_done"] == [True, False, False]
        # GET by date
        r = api_client.get(
            f"{base_url}/api/daily-entries/{self.user_id}/2030-07-01"
        )
        assert r.status_code == 200
        assert r.json()["priorities_done"] == [True, False, False]
        # PUT update
        payload["priorities_done"] = [True, True, False]
        r = api_client.put(f"{base_url}/api/daily-entries/{eid}", json=payload)
        assert r.status_code == 200
        assert r.json()["priorities_done"] == [True, True, False]

    def test_body_logs_create_get(self, api_client, base_url):
        payload = {
            "date": "2030-07-01", "sleep": "6h", "mood": "ok",
            "medications": ["Vitamin D"],
        }
        r = api_client.post(
            f"{base_url}/api/body-logs?user_id={self.user_id}", json=payload
        )
        assert r.status_code == 200, r.text
        r = api_client.get(f"{base_url}/api/body-logs/{self.user_id}")
        assert r.status_code == 200
        assert len(r.json()) >= 1

    def test_person_notes_create_get(self, api_client, base_url):
        payload = {"person_name": "TEST_jay", "relationship_category": "romantic"}
        r = api_client.post(
            f"{base_url}/api/person-notes?user_id={self.user_id}", json=payload
        )
        assert r.status_code == 200, r.text
        r = api_client.get(f"{base_url}/api/person-notes/{self.user_id}")
        assert r.status_code == 200
        assert any(n["person_name"] == "TEST_jay" for n in r.json())

    def test_pepper_advise_person(self, api_client, base_url):
        r = api_client.post(
            f"{base_url}/api/pepper/advise-person?user_id={self.user_id}",
            json={
                "person_name": "TEST_jay", "relationship_context": "ex",
                "risk_trust_notes": "love-bombs when lonely",
                "spice_level": "medium",
            },
            timeout=60,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "vibe_read" in data
        assert "the_move" in data
        assert data.get("verdict") in ("trust", "caution", "cut")

    def test_pepper_advise_body(self, api_client, base_url):
        r = api_client.post(
            f"{base_url}/api/pepper/advise-body?user_id={self.user_id}",
            json={"sleep": "4h", "symptoms": "headache",
                  "medications": ["Vitamin D"], "spice_level": "medium"},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "vibe_read" in data
        assert "care_moves" in data and isinstance(data["care_moves"], list)
        assert "permission" in data
