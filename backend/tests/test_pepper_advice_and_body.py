"""
Iteration 3 tests:
- POST /api/pepper/advise-person
- POST /api/pepper/advise-body
- BodyLog extension (cycle/meds/appointments/mood) CRUD round-trip
- Regression smoke: register-push graceful skip
"""
from datetime import date as date_cls

import pytest


# ===================== advise-person =====================
class TestAdvisePerson:
    REQUIRED_KEYS = {"vibe_read", "the_move", "watch_out_for", "what_to_say", "verdict"}
    VALID_VERDICTS = {"trust", "caution", "cut"}

    def _assert_shape(self, data):
        assert isinstance(data, dict), data
        missing = self.REQUIRED_KEYS - set(data.keys())
        assert not missing, f"missing keys {missing} in {data}"
        assert data["verdict"] in self.VALID_VERDICTS, f"bad verdict: {data['verdict']}"
        assert isinstance(data["watch_out_for"], list)
        assert isinstance(data["vibe_read"], str) and len(data["vibe_read"]) > 0
        assert isinstance(data["the_move"], str) and len(data["the_move"]) > 0
        # what_to_say can be None OR string
        assert data["what_to_say"] is None or isinstance(data["what_to_say"], str)

    def test_minimum_payload_only_name(self, api_client, base_url):
        """Only person_name required; all other fields omittable."""
        r = api_client.post(
            f"{base_url}/api/pepper/advise-person",
            params={"user_id": "TEST_advise_person"},
            json={"person_name": "TEST Jamie"},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        self._assert_shape(r.json())

    def test_full_payload_medium(self, api_client, base_url):
        r = api_client.post(
            f"{base_url}/api/pepper/advise-person",
            params={"user_id": "TEST_advise_person"},
            json={
                "person_name": "TEST Riley",
                "relationship_context": "ex-friend",
                "promised": "would pay me back $200 last month",
                "asked_for": "another favor",
                "do_not_reveal": "my new address",
                "follow_up_needed": "the money",
                "risk_trust_notes": "love-bombs then disappears",
                "spice_level": "medium",
            },
            timeout=60,
        )
        assert r.status_code == 200, r.text
        self._assert_shape(r.json())

    def test_extra_spicy_tone(self, api_client, base_url):
        r = api_client.post(
            f"{base_url}/api/pepper/advise-person",
            params={"user_id": "TEST_advise_person"},
            json={
                "person_name": "TEST Sam",
                "asked_for": "to borrow my car for a week",
                "spice_level": "extra_spicy",
            },
            timeout=60,
        )
        assert r.status_code == 200, r.text
        self._assert_shape(r.json())

    def test_mild_tone(self, api_client, base_url):
        r = api_client.post(
            f"{base_url}/api/pepper/advise-person",
            params={"user_id": "TEST_advise_person"},
            json={
                "person_name": "TEST Pat",
                "relationship_context": "old uni friend",
                "spice_level": "mild",
            },
            timeout=60,
        )
        assert r.status_code == 200, r.text
        self._assert_shape(r.json())

    def test_missing_person_name_422(self, api_client, base_url):
        r = api_client.post(
            f"{base_url}/api/pepper/advise-person",
            json={"relationship_context": "friend"},
        )
        assert r.status_code == 422, r.text


# ===================== advise-body =====================
class TestAdviseBody:
    REQUIRED_KEYS = {"vibe_read", "care_moves", "doctor_flag", "permission"}

    def _assert_shape(self, data):
        assert isinstance(data, dict), data
        missing = self.REQUIRED_KEYS - set(data.keys())
        assert not missing, f"missing keys {missing} in {data}"
        assert isinstance(data["care_moves"], list)
        assert len(data["care_moves"]) >= 1, "care_moves must be non-empty"
        assert isinstance(data["vibe_read"], str) and len(data["vibe_read"]) > 0
        assert isinstance(data["permission"], str) and len(data["permission"]) > 0
        assert data["doctor_flag"] is None or isinstance(data["doctor_flag"], str)

    def test_empty_body_returns_helpful_placeholder(self, api_client, base_url):
        r = api_client.post(
            f"{base_url}/api/pepper/advise-body",
            params={"user_id": "TEST_advise_body"},
            json={},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        self._assert_shape(data)
        # Helpful 'log something first' messaging
        text = (data["vibe_read"] + " " + " ".join(data["care_moves"])).lower()
        assert any(kw in text for kw in ["log", "data", "one thing", "start"]), data

    def test_multi_field_reasoning(self, api_client, base_url):
        r = api_client.post(
            f"{base_url}/api/pepper/advise-body",
            params={"user_id": "TEST_advise_body"},
            json={
                "sleep": "4h, broken",
                "appetite": "low",
                "symptoms": "headache, cramping, nausea",
                "mood": "irritable",
                "water": 2,
                "period_started_on": "2026-01-08",
                "period_length_days": 5,
                "cycle_length_days": 28,
                "medications": ["Ozempic 0.5mg weekly", "Vitamin D"],
                "appointments": [{"label": "GP", "date": "2026-02-01"}],
                "notes": "tired all week",
                "spice_level": "medium",
            },
            timeout=60,
        )
        assert r.status_code == 200, r.text
        self._assert_shape(r.json())

    def test_health_tone_gentler_with_extra_spicy(self, api_client, base_url):
        """Even with extra_spicy, body advice should be gentle (no cruel language)."""
        r = api_client.post(
            f"{base_url}/api/pepper/advise-body",
            params={"user_id": "TEST_advise_body"},
            json={
                "sleep": "3h",
                "symptoms": "chest pain off and on",
                "spice_level": "extra_spicy",
            },
            timeout=60,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        self._assert_shape(data)
        blob = (
            data["vibe_read"] + " " + " ".join(data["care_moves"]) + " " + (data["permission"] or "")
        ).lower()
        # No cruel/dismissive language
        for bad in ["girl please", "be so for real", "we are not doing this", "lol", "skill issue"]:
            assert bad not in blob, f"cruel phrase '{bad}' found in body advice: {data}"


# ===================== BodyLog extension CRUD =====================
class TestBodyLogExtension:
    USER = "TEST_body_ext_user"
    created_id = None

    def test_create_with_extended_fields(self, api_client, base_url):
        payload = {
            "date": date_cls.today().isoformat(),
            "sleep": "7h",
            "appetite": "ok",
            "water": 6,
            "mood": "ok",
            "period_started_on": "2026-01-05",
            "period_length_days": 5,
            "cycle_length_days": 28,
            "medications": ["Ozempic 0.5mg weekly", "Vitamin D 1000IU"],
            "appointments": [
                {"label": "GP", "date": "2026-02-01"},
                {"label": "Dentist", "date": "2026-03-15"},
            ],
        }
        r = api_client.post(
            f"{base_url}/api/body-logs",
            params={"user_id": self.USER},
            json=payload,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        # Verify all extended fields round-tripped on POST response
        assert data["mood"] == "ok"
        assert data["period_started_on"] == "2026-01-05"
        assert data["period_length_days"] == 5
        assert data["cycle_length_days"] == 28
        assert data["medications"] == ["Ozempic 0.5mg weekly", "Vitamin D 1000IU"]
        assert isinstance(data["appointments"], list) and len(data["appointments"]) == 2
        assert data["appointments"][0]["label"] == "GP"
        assert data["appointments"][0]["date"] == "2026-02-01"
        TestBodyLogExtension.created_id = data["id"]

    def test_list_includes_extended_fields(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/body-logs/{self.USER}")
        assert r.status_code == 200, r.text
        logs = r.json()
        assert len(logs) >= 1
        match = next((l for l in logs if l["id"] == TestBodyLogExtension.created_id), None)
        assert match is not None, "created log not in list"
        assert match["mood"] == "ok"
        assert match["period_length_days"] == 5
        assert match["medications"] == ["Ozempic 0.5mg weekly", "Vitamin D 1000IU"]
        assert match["appointments"][1]["label"] == "Dentist"

    def test_update_extended_fields(self, api_client, base_url):
        lid = TestBodyLogExtension.created_id
        assert lid, "no log created"
        payload = {
            "date": date_cls.today().isoformat(),
            "sleep": "8h",
            "mood": "great",
            "period_started_on": "2026-01-05",
            "period_length_days": 6,
            "cycle_length_days": 30,
            "medications": ["Ozempic 1.0mg weekly"],
            "appointments": [{"label": "Therapy", "date": "2026-02-10"}],
        }
        r = api_client.put(f"{base_url}/api/body-logs/{lid}", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["mood"] == "great"
        assert data["period_length_days"] == 6
        assert data["cycle_length_days"] == 30
        assert data["medications"] == ["Ozempic 1.0mg weekly"]
        assert data["appointments"] == [{"label": "Therapy", "date": "2026-02-10"}]

    def test_backwards_compat_no_extended_fields(self, api_client, base_url):
        """Old-style payload without new fields should still work (fields default to None)."""
        r = api_client.post(
            f"{base_url}/api/body-logs",
            params={"user_id": self.USER + "_old"},
            json={"date": date_cls.today().isoformat(), "sleep": "5h", "water": 3},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["mood"] is None
        assert data["period_started_on"] is None
        assert data["medications"] is None
        assert data["appointments"] is None


# ===================== Regression smoke =====================
class TestRegression:
    def test_register_push_graceful(self, api_client, base_url):
        r = api_client.post(
            f"{base_url}/api/register-push",
            json={"user_id": "TEST_u", "platform": "android", "device_token": "tok"},
        )
        # Per previous iteration fix, should be 200/201 with status field, not 500
        assert r.status_code in (200, 201), r.text
        body = r.json()
        assert "status" in body
        assert body["status"] in ("registered", "skipped")
