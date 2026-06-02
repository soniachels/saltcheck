"""
Batch: PEPPER intelligence upgrade — strict classification, auto-link Top 3 to Loops,
clarity questions, and Receipts advice history.

Tests:
1. DailyEntry.priorities_task_ids round-trip
2. PEPPER checkin auto-creates loops, links to top-3 via priorities_task_ids
   and classifies bills (rent) outside salt_check
3. PEPPER clarity flow — vague dump triggers needs_clarity=True with questions,
   no new tasks created, daily_entry not blown away with clarity questions
4. Receipts: advise-person caches last_advice + appends to advice_history
5. Regression sweep: tasks/daily-entries/money-entries/person-notes/analyze-receipt
"""
import os
import io
import time
from datetime import datetime

import pytest
import requests

from conftest import BASE_URL


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------
def _today() -> str:
    return datetime.utcnow().strftime("%Y-%m-%d")


def _get_json(url: str, retries: int = 3, sleep_s: float = 0.8):
    """GET with retries; some ingress runs occasionally return non-JSON HTML chrome."""
    last_exc = None
    for _ in range(retries):
        try:
            r = requests.get(url, timeout=15)
            if r.status_code == 200:
                return r.json()
            last_exc = RuntimeError(f"status {r.status_code}: {r.text[:200]}")
        except Exception as e:
            last_exc = e
        time.sleep(sleep_s)
    raise last_exc or RuntimeError("get_json failed")


def _cleanup_user(user_id: str):
    """Best-effort: delete tasks, daily-entries, money-entries, person-notes for a user."""
    try:
        tasks = requests.get(f"{BASE_URL}/api/tasks/{user_id}", timeout=10).json()
        for t in tasks if isinstance(tasks, list) else []:
            tid = t.get("id")
            if tid:
                requests.delete(f"{BASE_URL}/api/tasks/{tid}", timeout=10)
    except Exception:
        pass
    try:
        notes = requests.get(f"{BASE_URL}/api/person-notes/{user_id}", timeout=10).json()
        for n in notes if isinstance(notes, list) else []:
            nid = n.get("id")
            if nid:
                requests.delete(f"{BASE_URL}/api/person-notes/{nid}", timeout=10)
    except Exception:
        pass


# ----------------------------------------------------------------------
# 1. DailyEntry.priorities_task_ids round-trip
# ----------------------------------------------------------------------
class TestPrioritiesTaskIds:
    USER_ID = f"TEST_pti_user_{int(time.time())}"

    @classmethod
    def teardown_class(cls):
        _cleanup_user(cls.USER_ID)

    def test_post_get_put_priorities_task_ids(self, api_client):
        today = _today()
        payload = {
            "date": today,
            "top_priorities": ["a", "b", "c"],
            "priorities_done": [False, False, False],
            "priorities_task_ids": ["507f1f77bcf86cd799439011", None, "507f1f77bcf86cd799439013"],
        }
        r = api_client.post(f"{BASE_URL}/api/daily-entries?user_id={self.USER_ID}", json=payload)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["priorities_task_ids"] == payload["priorities_task_ids"]
        entry_id = body["id"]

        # GET by date
        r2 = api_client.get(f"{BASE_URL}/api/daily-entries/{self.USER_ID}/{today}")
        assert r2.status_code == 200
        assert r2.json()["priorities_task_ids"] == payload["priorities_task_ids"]

        # PUT update
        new_ids = [None, "507f1f77bcf86cd799439020", None]
        upd = {**payload, "priorities_task_ids": new_ids}
        r3 = api_client.put(f"{BASE_URL}/api/daily-entries/{entry_id}", json=upd)
        assert r3.status_code == 200
        assert r3.json()["priorities_task_ids"] == new_ids

        # GET list also reflects
        r4 = api_client.get(f"{BASE_URL}/api/daily-entries/{self.USER_ID}")
        assert r4.status_code == 200
        found = [e for e in r4.json() if e["id"] == entry_id]
        assert found and found[0]["priorities_task_ids"] == new_ids

    def test_default_empty_list(self, api_client):
        today = _today()
        # Remove existing if any
        existing = api_client.get(f"{BASE_URL}/api/daily-entries/{self.USER_ID}/{today}")
        if existing.status_code == 200:
            pass  # will be overwritten by upsert path; just create a new user
        u2 = self.USER_ID + "_default"
        payload = {"date": today, "top_priorities": ["x"]}
        r = api_client.post(f"{BASE_URL}/api/daily-entries?user_id={u2}", json=payload)
        assert r.status_code == 200
        assert r.json()["priorities_task_ids"] == []
        _cleanup_user(u2)


# ----------------------------------------------------------------------
# 2. PEPPER auto-creates loops, links to top-3, classifies bills
# ----------------------------------------------------------------------
class TestPepperAutoLinkAndClassify:
    USER_ID = "TEST_intel_user"

    @classmethod
    def setup_class(cls):
        _cleanup_user(cls.USER_ID)

    @classmethod
    def teardown_class(cls):
        _cleanup_user(cls.USER_ID)

    def test_checkin_creates_tasks_links_and_classifies_bills(self, api_client):
        # snapshot tasks before
        tasks_before = api_client.get(f"{BASE_URL}/api/tasks/{self.USER_ID}").json()
        n_before = len(tasks_before) if isinstance(tasks_before, list) else 0

        dump = ("need to send pitch to Naomi by Friday, finalize the slides, "
                "also pay rent of 1500 by the 15th, and book dentist sometime")
        payload = {"raw_dump": dump, "spice_level": "medium"}
        r = api_client.post(
            f"{BASE_URL}/api/pepper/checkin?user_id={self.USER_ID}",
            json=payload,
            timeout=60,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        ai = body["ai_response"]
        assert isinstance(ai, dict)

        # salt_check up to 3
        sc = ai.get("salt_check") or []
        assert isinstance(sc, list)
        assert 0 < len(sc) <= 3, f"salt_check length unexpected: {sc}"

        # CRITICAL: salt_check must not contain rent/pay bills
        bill_kw = ["pay rent", "rent of", "rent $", "credit card bill"]
        for item in sc:
            low = item.lower() if isinstance(item, str) else ""
            for kw in bill_kw:
                assert kw not in low, f"salt_check leaks bill: {item!r}"

        # loops_to_create at least 3 items (per request hint), some with linked_priority_index
        loops = ai.get("loops_to_create") or []
        assert isinstance(loops, list), "loops_to_create must be list"
        assert len(loops) >= 3, f"expected >=3 loops, got {len(loops)}: {loops}"
        linked_idxs = [
            l.get("linked_priority_index") for l in loops
            if isinstance(l, dict) and isinstance(l.get("linked_priority_index"), int)
        ]
        assert len(linked_idxs) >= 1, "no loops linked to top-3 via linked_priority_index"

        # tasks created: count delta == count of loops with non-empty title
        tasks_after = api_client.get(f"{BASE_URL}/api/tasks/{self.USER_ID}").json()
        assert isinstance(tasks_after, list)
        n_after = len(tasks_after)
        non_empty_loops = [l for l in loops if isinstance(l, dict) and (l.get("title") or "").strip()]
        assert n_after - n_before == len(non_empty_loops), (
            f"tasks delta {n_after - n_before} != non_empty_loops {len(non_empty_loops)}"
        )

        # daily entry priorities_task_ids
        today = _today()
        de = api_client.get(f"{BASE_URL}/api/daily-entries/{self.USER_ID}/{today}").json()
        pti = de.get("priorities_task_ids") or []
        assert len(pti) == len(sc), f"pti length {len(pti)} != salt_check length {len(sc)}"

        # each non-null pti must point at a real task
        task_ids_in_db = {t["id"] for t in tasks_after}
        for tid in pti:
            if tid is not None:
                assert tid in task_ids_in_db, f"linked task_id {tid} not in tasks collection"

        # at least one slot is linked since linked_idxs >=1
        assert any(t is not None for t in pti), "expected at least one priorities_task_id to be set"

        # bills array contains rent ~1500
        bills = ai.get("bills") or []
        assert isinstance(bills, list)
        rent_hits = [
            b for b in bills if isinstance(b, dict)
            and "rent" in (b.get("label") or "").lower()
        ]
        assert rent_hits, f"bills array missing rent: {bills}"
        # amount roughly 1500
        amt = rent_hits[0].get("amount")
        assert amt in (1500, 1500.0) or (isinstance(amt, (int, float)) and 1400 <= amt <= 1600), (
            f"rent amount unexpected: {amt}"
        )


# ----------------------------------------------------------------------
# 3. Clarity flow
# ----------------------------------------------------------------------
class TestPepperClarity:
    USER_ID = "TEST_clarity_user"

    @classmethod
    def setup_class(cls):
        _cleanup_user(cls.USER_ID)

    @classmethod
    def teardown_class(cls):
        _cleanup_user(cls.USER_ID)

    def test_vague_dump_triggers_clarity_no_tasks(self, api_client):
        # snapshot
        tasks_before = api_client.get(f"{BASE_URL}/api/tasks/{self.USER_ID}").json()
        n_before = len(tasks_before) if isinstance(tasks_before, list) else 0

        # Pre-seed today's daily entry with known priorities to confirm not blown away
        today = _today()
        seed_payload = {
            "date": today,
            "top_priorities": ["original A", "original B"],
            "priorities_done": [True, False],
            "priorities_task_ids": [None, None],
        }
        seed = api_client.post(
            f"{BASE_URL}/api/daily-entries?user_id={self.USER_ID}", json=seed_payload
        )
        assert seed.status_code == 200

        r = api_client.post(
            f"{BASE_URL}/api/pepper/checkin?user_id={self.USER_ID}",
            json={"raw_dump": "everything feels like shit", "spice_level": "medium"},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        ai = r.json()["ai_response"]

        # needs_clarity should be true (with LLM variance, allow soft fail-with-info)
        nc = ai.get("needs_clarity")
        cq = ai.get("clarity_questions") or []
        assert nc is True, f"expected needs_clarity=True, got {nc}; clarity_questions={cq}"
        assert isinstance(cq, list)
        assert 1 <= len(cq) <= 3, f"clarity_questions expected 1-3 items, got {cq}"
        for q in cq:
            assert isinstance(q, str) and q.strip(), f"empty/non-string clarity question: {q!r}"

        # No new tasks created
        tasks_after = api_client.get(f"{BASE_URL}/api/tasks/{self.USER_ID}").json()
        n_after = len(tasks_after) if isinstance(tasks_after, list) else 0
        assert n_after == n_before, f"expected no new tasks, got {n_after - n_before}"

        # Daily entry top_priorities not replaced with clarity questions
        de = api_client.get(f"{BASE_URL}/api/daily-entries/{self.USER_ID}/{today}").json()
        tp = de.get("top_priorities") or []
        # Must still contain the original seeded priorities (not the clarity questions)
        assert tp == seed_payload["top_priorities"], (
            f"top_priorities was overwritten on clarity flow: {tp}"
        )
        # priorities_done preserved
        assert de.get("priorities_done") == [True, False], (
            f"priorities_done was lost: {de.get('priorities_done')}"
        )


# ----------------------------------------------------------------------
# 4. Receipts advice_history & last_advice
# ----------------------------------------------------------------------
class TestReceiptsAdviceHistory:
    USER_ID = "TEST_history_user"

    @classmethod
    def setup_class(cls):
        _cleanup_user(cls.USER_ID)

    @classmethod
    def teardown_class(cls):
        _cleanup_user(cls.USER_ID)

    def test_advice_history_appends_and_caches(self, api_client):
        # Create note
        note_payload = {
            "person_name": "Aunt Linda",
            "relationship_category": "family",
            "relationship_context": "calls weekly, guilt trips",
        }
        r = api_client.post(
            f"{BASE_URL}/api/person-notes?user_id={self.USER_ID}", json=note_payload
        )
        assert r.status_code == 200, r.text
        note = r.json()
        note_id = note["id"]
        assert note.get("advice_history") == []
        assert note.get("last_advice") is None

        # First advice call
        adv_payload = {
            "person_note_id": note_id,
            "person_name": "Aunt Linda",
            "relationship_category": "family",
            "relationship_context": "calls weekly, guilt trips",
            "promised": "to call back",
            "spice_level": "medium",
        }
        a1 = api_client.post(
            f"{BASE_URL}/api/pepper/advise-person?user_id={self.USER_ID}",
            json=adv_payload, timeout=60,
        )
        assert a1.status_code == 200, a1.text
        advice1 = a1.json()
        assert "vibe_read" in advice1 and "the_move" in advice1 and "verdict" in advice1

        # GET note → 1 history entry
        notes_after_1 = api_client.get(f"{BASE_URL}/api/person-notes/{self.USER_ID}").json()
        n1 = next((n for n in notes_after_1 if n["id"] == note_id), None)
        assert n1 is not None
        assert n1.get("last_advice") is not None, "last_advice should be set"
        assert n1.get("last_advice_at") is not None, "last_advice_at should be set"
        hist1 = n1.get("advice_history") or []
        assert len(hist1) == 1, f"expected 1 history entry, got {len(hist1)}"
        assert "advice" in hist1[0]
        assert "created_at" in hist1[0]
        assert hist1[0]["advice"].get("vibe_read") == advice1.get("vibe_read")

        # Second advice — small delay so created_at differs
        time.sleep(1.1)
        a2 = api_client.post(
            f"{BASE_URL}/api/pepper/advise-person?user_id={self.USER_ID}",
            json={**adv_payload, "asked_for": "money this time"},
            timeout=60,
        )
        assert a2.status_code == 200, a2.text

        notes_after_2 = api_client.get(f"{BASE_URL}/api/person-notes/{self.USER_ID}").json()
        n2 = next((n for n in notes_after_2 if n["id"] == note_id), None)
        hist2 = n2.get("advice_history") or []
        assert len(hist2) == 2, f"expected 2 history entries, got {len(hist2)}"
        # Newest first: hist2[0].created_at > hist2[1].created_at
        c0 = hist2[0].get("created_at")
        c1 = hist2[1].get("created_at")
        assert c0 and c1 and str(c0) >= str(c1), (
            f"history not ordered newest-first: {c0} vs {c1}"
        )


# ----------------------------------------------------------------------
# 5. Regression
# ----------------------------------------------------------------------
class TestRegression:
    USER_ID = "TEST_regression_intel"

    @classmethod
    def teardown_class(cls):
        _cleanup_user(cls.USER_ID)

    def test_task_crud(self, api_client):
        r = api_client.post(
            f"{BASE_URL}/api/tasks?user_id={self.USER_ID}",
            json={"title": "TEST_reg_task", "status": "not_started"},
        )
        assert r.status_code == 200
        tid = r.json()["id"]
        g = api_client.get(f"{BASE_URL}/api/tasks/{self.USER_ID}")
        assert g.status_code == 200
        assert any(t["id"] == tid for t in g.json())
        u = api_client.put(
            f"{BASE_URL}/api/tasks/{tid}",
            json={"title": "TEST_reg_task_upd", "status": "in_progress"},
        )
        assert u.status_code == 200
        assert u.json()["title"] == "TEST_reg_task_upd"
        assert u.json()["status"] == "in_progress"

    def test_daily_entry_crud(self, api_client):
        u = self.USER_ID + "_de"
        today = _today()
        r = api_client.post(
            f"{BASE_URL}/api/daily-entries?user_id={u}",
            json={"date": today, "top_priorities": ["x"]},
        )
        assert r.status_code == 200
        eid = r.json()["id"]
        g = api_client.get(f"{BASE_URL}/api/daily-entries/{u}/{today}")
        assert g.status_code == 200
        upd = api_client.put(
            f"{BASE_URL}/api/daily-entries/{eid}",
            json={"date": today, "top_priorities": ["y", "z"]},
        )
        assert upd.status_code == 200
        assert upd.json()["top_priorities"] == ["y", "z"]
        _cleanup_user(u)

    def test_money_entry_crud(self, api_client):
        u = self.USER_ID + "_money"
        today = _today()
        r = api_client.post(
            f"{BASE_URL}/api/money-entries?user_id={u}",
            json={"date": today, "currency": "USD", "cash_available": 100.0},
        )
        assert r.status_code == 200
        eid = r.json()["id"]
        g = api_client.get(f"{BASE_URL}/api/money-entries/{u}")
        assert g.status_code == 200
        assert any(e["id"] == eid for e in g.json())
        upd = api_client.put(
            f"{BASE_URL}/api/money-entries/{eid}",
            json={"date": today, "currency": "USD", "cash_available": 200.0},
        )
        assert upd.status_code == 200
        assert upd.json()["cash_available"] == 200.0

    def test_person_note_crud(self, api_client):
        u = self.USER_ID + "_pn"
        r = api_client.post(
            f"{BASE_URL}/api/person-notes?user_id={u}",
            json={"person_name": "Bob", "relationship_category": "friendship"},
        )
        assert r.status_code == 200
        nid = r.json()["id"]
        g = api_client.get(f"{BASE_URL}/api/person-notes/{u}")
        assert g.status_code == 200
        assert any(n["id"] == nid for n in g.json())
        upd = api_client.put(
            f"{BASE_URL}/api/person-notes/{nid}",
            json={"person_name": "Bob", "relationship_category": "professional"},
        )
        assert upd.status_code == 200
        assert upd.json()["relationship_category"] == "professional"
        _cleanup_user(u)

    def test_analyze_receipt_vision(self, api_client):
        # Build a tiny real PNG via Pillow if available; else skip
        try:
            from PIL import Image, ImageDraw
        except Exception:
            pytest.skip("Pillow not installed")
        img = Image.new("RGB", (240, 160), "white")
        d = ImageDraw.Draw(img)
        d.rectangle([10, 10, 230, 80], outline="black")
        d.text((20, 30), "hey can we meet tomorrow?", fill="black")
        d.text((20, 100), "from: alex 11:47pm", fill="black")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)

        files = {"file": ("convo.png", buf.read(), "image/png")}
        data = {
            "user_id": "TEST_vision_intel",
            "person_name": "Alex",
            "relationship_category": "romantic",
            "spice_level": "medium",
        }
        # Don't pass Content-Type from session — let requests build multipart
        s = requests.Session()
        r = s.post(f"{BASE_URL}/api/pepper/analyze-receipt", files=files, data=data, timeout=90)
        assert r.status_code == 200, r.text
        body = r.json()
        for k in ("tldr", "the_red_flags", "the_green_flags",
                  "what_they_actually_want", "the_move", "verdict"):
            assert k in body, f"missing key in vision response: {k}"
        assert body["verdict"] in ("trust", "caution", "cut")
