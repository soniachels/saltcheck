"""
Iteration 9 — Batch 5: PEPPER advise-person clarity-first flow.

Verifies:
1. Thin context => needs_clarity=true, clarity_questions has 1-3 short Qs,
   the_move/watch_out_for/what_to_say empty/null/[] and verdict == "caution".
2. Second call with user_clarification => needs_clarity=false (or absent),
   real the_move + real watch_out_for list.
3. Rich context => needs_clarity=false (or absent), real the_move.
4. All 3 calls append to advice_history when person_note_id is provided.
"""
import time
import pytest


# ===================== Helpers =====================
def _post_advise(api_client, base_url, payload, user_id="TEST_clarity_user", timeout=90):
    return api_client.post(
        f"{base_url}/api/pepper/advise-person",
        params={"user_id": user_id},
        json=payload,
        timeout=timeout,
    )


def _is_clarity(data: dict) -> bool:
    return bool(data.get("needs_clarity"))


def _create_person_note(api_client, base_url, name="TEST_Clarity_Jamie") -> str:
    r = api_client.post(
        f"{base_url}/api/person-notes",
        params={"user_id": "TEST_clarity_user"},
        json={
            "person_name": name,
            "relationship_category": "romantic",
            "relationship_context": "ex from 2yr ago",
            "locked": False,
        },
        timeout=30,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    note_id = body.get("id") or body.get("_id")
    assert note_id, f"no id in person-note response: {body}"
    return note_id


def _get_person_note(api_client, base_url, note_id, user_id="TEST_clarity_user"):
    r = api_client.get(f"{base_url}/api/person-notes/{user_id}", timeout=30)
    assert r.status_code == 200, r.text
    for n in r.json():
        if (n.get("id") or n.get("_id")) == note_id:
            return n
    return None


# ===================== Test 1: Thin context triggers clarity =====================
class TestThinContextClarity:
    """Thin context => needs_clarity=true with proper clarity_questions array."""

    def _thin_payload(self):
        return {
            "person_name": "Jamie",
            "relationship_category": "romantic",
            "relationship_context": "idk",
            "risk_trust_notes": "",
        }

    def test_thin_context_returns_needs_clarity(self, api_client, base_url):
        # Per spec: "if it doesn't on 1 run, re-run once"
        attempts = 0
        last_data = None
        last_status = None
        while attempts < 2:
            r = _post_advise(api_client, base_url, self._thin_payload())
            last_status = r.status_code
            assert r.status_code == 200, r.text
            last_data = r.json()
            if _is_clarity(last_data):
                break
            attempts += 1
            time.sleep(1)

        assert last_status == 200
        assert _is_clarity(last_data), (
            f"Expected needs_clarity=true after retry; got: {last_data}"
        )

        # clarity_questions shape
        cqs = last_data.get("clarity_questions")
        assert isinstance(cqs, list), f"clarity_questions must be a list, got {type(cqs).__name__}"
        assert 1 <= len(cqs) <= 3, f"expected 1-3 clarity_questions, got {len(cqs)}: {cqs}"
        for q in cqs:
            assert isinstance(q, str) and q.strip(), f"clarity question not a non-empty string: {q!r}"

        # When needs_clarity=true: vibe_read MAY be filled, but action fields should be empty
        the_move = last_data.get("the_move")
        watch = last_data.get("watch_out_for")
        what_to_say = last_data.get("what_to_say")
        verdict = last_data.get("verdict")

        # the_move should be empty/None
        assert (the_move is None) or (isinstance(the_move, str) and the_move.strip() == ""), (
            f"the_move should be empty when needs_clarity=true, got {the_move!r}"
        )
        # watch_out_for should be [] (or absent)
        if watch is not None:
            assert isinstance(watch, list), f"watch_out_for must be list, got {type(watch).__name__}"
            assert len(watch) == 0, f"watch_out_for should be empty when needs_clarity=true, got {watch}"
        # what_to_say None or empty string
        assert (what_to_say is None) or (
            isinstance(what_to_say, str) and what_to_say.strip() == ""
        ), f"what_to_say should be empty/null when needs_clarity=true, got {what_to_say!r}"
        # verdict must be "caution"
        assert verdict == "caution", f"verdict must be 'caution' when needs_clarity=true, got {verdict!r}"


# ===================== Test 2: Clarification skips clarity =====================
class TestClarificationFlow:
    """When user_clarification is provided, the model must NOT loop on clarity."""

    def test_clarification_unlocks_real_advice(self, api_client, base_url):
        payload = {
            "person_name": "Jamie",
            "relationship_category": "romantic",
            "relationship_context": "ex from 2yr ago",
            "user_clarification": (
                "They texted me at 2am yesterday saying they miss me, but they have a new gf. "
                "I'm deciding whether to reply at all."
            ),
            "risk_trust_notes": "",
        }
        r = _post_advise(api_client, base_url, payload)
        assert r.status_code == 200, r.text
        data = r.json()

        assert not _is_clarity(data), (
            f"needs_clarity must be false when user_clarification given; got {data}"
        )

        # real the_move (non-empty string)
        the_move = data.get("the_move")
        assert isinstance(the_move, str) and len(the_move.strip()) > 0, (
            f"expected non-empty the_move, got {the_move!r}"
        )

        # real watch_out_for list (non-empty list of non-empty strings)
        watch = data.get("watch_out_for")
        assert isinstance(watch, list), f"watch_out_for must be list, got {type(watch).__name__}"
        assert len(watch) >= 1, f"watch_out_for should have at least 1 item, got {watch}"
        for item in watch:
            assert isinstance(item, str) and item.strip(), f"watch_out_for entry not a non-empty string: {item!r}"

        # verdict still valid
        assert data.get("verdict") in {"trust", "caution", "cut"}, f"bad verdict: {data.get('verdict')!r}"


# ===================== Test 3: Rich context skips clarity =====================
class TestRichContextSkipsClarity:
    """Rich context (incident + asks + risk) should NOT trigger clarity."""

    def test_rich_context_gives_real_move(self, api_client, base_url):
        payload = {
            "person_name": "Sam",
            "relationship_category": "professional",
            "relationship_context": "my boss",
            "promised": "raise by end of Q2",
            "asked_for": "new responsibilities now",
            "risk_trust_notes": "keeps delaying the raise conversation",
        }
        # If the model is stubborn, allow ONE retry (per agent note)
        attempts = 0
        data = None
        while attempts < 2:
            r = _post_advise(api_client, base_url, payload)
            assert r.status_code == 200, r.text
            data = r.json()
            if not _is_clarity(data):
                break
            attempts += 1
            time.sleep(1)

        assert not _is_clarity(data), (
            f"Rich context should NOT need clarity; got {data}"
        )
        the_move = data.get("the_move")
        assert isinstance(the_move, str) and len(the_move.strip()) > 0, (
            f"expected non-empty the_move on rich context, got {the_move!r}"
        )
        assert data.get("verdict") in {"trust", "caution", "cut"}


# ===================== Test 4: advice_history caching =====================
class TestAdviceHistoryAppend:
    """All 3 calls should append to advice_history when person_note_id provided."""

    def test_history_grows_across_three_calls(self, api_client, base_url):
        note_id = _create_person_note(api_client, base_url, name="TEST_Clarity_Jamie_History")

        # Baseline
        note0 = _get_person_note(api_client, base_url, note_id)
        assert note0 is not None
        baseline_len = len(note0.get("advice_history") or [])

        # Call 1 — thin (triggers clarity, but still should append)
        r1 = _post_advise(
            api_client, base_url,
            {
                "person_note_id": note_id,
                "person_name": "TEST_Clarity_Jamie_History",
                "relationship_category": "romantic",
                "relationship_context": "idk",
                "risk_trust_notes": "",
            },
        )
        assert r1.status_code == 200, r1.text

        # Call 2 — with clarification
        r2 = _post_advise(
            api_client, base_url,
            {
                "person_note_id": note_id,
                "person_name": "TEST_Clarity_Jamie_History",
                "relationship_category": "romantic",
                "relationship_context": "ex from 2yr ago",
                "user_clarification": "They texted me at 2am saying they miss me; new gf in pic. Deciding to reply.",
                "risk_trust_notes": "",
            },
        )
        assert r2.status_code == 200, r2.text

        # Call 3 — rich
        r3 = _post_advise(
            api_client, base_url,
            {
                "person_note_id": note_id,
                "person_name": "TEST_Clarity_Jamie_History",
                "relationship_category": "romantic",
                "relationship_context": "ex from 2yr ago — clear incident",
                "promised": "we'd stay no-contact",
                "asked_for": "to meet up",
                "risk_trust_notes": "breaks no-contact whenever lonely",
            },
        )
        assert r3.status_code == 200, r3.text

        note1 = _get_person_note(api_client, base_url, note_id)
        assert note1 is not None
        hist = note1.get("advice_history") or []
        assert len(hist) - baseline_len >= 3, (
            f"expected at least 3 new advice_history entries, got delta={len(hist) - baseline_len}, total={len(hist)}"
        )

        # Each entry should have advice + snapshot_context + spice_level + created_at
        for entry in hist[:3]:
            assert "advice" in entry, f"missing advice key: {entry.keys()}"
            assert "snapshot_context" in entry, f"missing snapshot_context: {entry.keys()}"
            assert "spice_level" in entry, f"missing spice_level: {entry.keys()}"

        # last_advice should be set (most recent)
        assert note1.get("last_advice"), "last_advice should be set"
        assert note1.get("last_advice_at"), "last_advice_at should be set"

        # cleanup
        api_client.delete(f"{base_url}/api/person-notes/{note_id}", timeout=15)


# ===================== Test 5: Regression smoke — prior endpoints =====================
class TestRegressionSmoke:
    """Quick check that core prior endpoints still respond cleanly."""

    def test_get_person_notes_works(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/person-notes/TEST_clarity_user", timeout=15)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_get_tasks_works(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/tasks/TEST_clarity_user", timeout=15)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_get_medications_works(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/medications/TEST_clarity_user", timeout=15)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_get_money_entries_works(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/money-entries/TEST_clarity_user", timeout=15)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_get_daily_entries_works(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/daily-entries/TEST_clarity_user", timeout=15)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)
