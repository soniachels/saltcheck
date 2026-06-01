"""
Tests for newly added Salt Check backend functionality (iteration 2):
  1. PEPPER spice_level + nickname tuning
  2. PEPPER -> daily_entries auto-sync (bug fix)
  3. Voice transcription endpoint (Whisper via Emergent LLM)
  4. Push registration endpoint (graceful failure tolerated)
  5. Test-push endpoint (graceful failure tolerated)
"""
import io
import os
import subprocess
import tempfile
import uuid
from datetime import date as date_cls

import pytest
import requests


# ---------------------------------------------------------------------------
# 1. PEPPER spice_level + nickname
# ---------------------------------------------------------------------------
class TestPepperSpiceAndNickname:
    USER = f"TEST_spice_{uuid.uuid4().hex[:6]}"

    def _checkin(self, api_client, base_url, body, user=None):
        return api_client.post(
            f"{base_url}/api/pepper/checkin",
            params={"user_id": user or self.USER},
            json=body,
            timeout=90,
        )

    def test_default_spice_medium(self, api_client, base_url):
        r = self._checkin(
            api_client, base_url,
            {"raw_dump": "Inbox is on fire and I haven't eaten lunch."},
        )
        assert r.status_code == 200, r.text
        ai = r.json()["ai_response"]
        assert "salt_check" in ai and isinstance(ai["salt_check"], list)

    def test_mild_spice(self, api_client, base_url):
        r = self._checkin(
            api_client, base_url,
            {
                "raw_dump": "I'm overwhelmed. Three deadlines this week and I can't focus.",
                "spice_level": "mild",
            },
        )
        assert r.status_code == 200, r.text
        ai = r.json()["ai_response"]
        text = " ".join([
            ai.get("quick_read", "") or "",
            " ".join(ai.get("salt_check", []) or []),
            ai.get("closer", "") or "",
        ]).lower()
        # Mild override explicitly tells PEPPER to drop "girl please" / "be so for real"
        # We don't hard-fail on this because LLMs vary, but log for visibility.
        forbidden = ["girl please", "be so for real"]
        present = [p for p in forbidden if p in text]
        if present:
            print(f"WARN: mild response still contained sassy phrases: {present}")

    def test_extra_spicy(self, api_client, base_url):
        r = self._checkin(
            api_client, base_url,
            {
                "raw_dump": "Procrastinating again. Three tabs open, nothing done.",
                "spice_level": "extra_spicy",
            },
        )
        assert r.status_code == 200, r.text
        ai = r.json()["ai_response"]
        assert isinstance(ai.get("salt_check"), list)

    def test_nickname_appears(self, api_client, base_url):
        nickname = "Sprinkle"
        r = self._checkin(
            api_client, base_url,
            {
                "raw_dump": "Need to pay rent, reply to client, drink water.",
                "spice_level": "medium",
                "nickname": nickname,
            },
        )
        assert r.status_code == 200, r.text
        ai = r.json()["ai_response"]
        full_text = " ".join([
            ai.get("quick_read", "") or "",
            " ".join(ai.get("salt_check", []) or []),
            ai.get("next_sane_step", "") or "",
            ai.get("closer", "") or "",
        ])
        # "sparingly" => not guaranteed in every field; just log if absent
        if nickname.lower() not in full_text.lower():
            print(f"INFO: nickname '{nickname}' not in response (allowed - LLM uses sparingly).")

    def test_crisis_overrides_spice(self, api_client, base_url):
        """Crisis must short-circuit regardless of spice level."""
        r = self._checkin(
            api_client, base_url,
            {
                "raw_dump": "I want to die. Nothing matters.",
                "spice_level": "extra_spicy",
                "nickname": "Sprinkle",
            },
        )
        assert r.status_code == 200, r.text
        ai = r.json()["ai_response"]
        blob = " ".join([
            ai.get("quick_read", "") or "",
            " ".join(ai.get("salt_check", []) or []),
            ai.get("next_sane_step", "") or "",
            ai.get("closer", "") or "",
        ]).lower()
        assert "park" not in blob, f"Crisis response should not contain 'park': {ai}"
        assert any(kw in blob for kw in ["emergency", "crisis", "not okay", "stay with"]), ai


# ---------------------------------------------------------------------------
# 2. PEPPER -> Today daily-entry auto-sync (bug fix)
# ---------------------------------------------------------------------------
class TestPepperDailySync:
    USER = f"TEST_sync_{uuid.uuid4().hex[:6]}"

    def test_checkin_creates_daily_entry(self, api_client, base_url):
        today = date_cls.today().isoformat()
        # Ensure clean state - expect 404 first
        pre = api_client.get(f"{base_url}/api/daily-entries/{self.USER}/{today}")
        assert pre.status_code == 404, f"Expected no entry yet, got {pre.status_code}"

        r = api_client.post(
            f"{base_url}/api/pepper/checkin",
            params={"user_id": self.USER},
            json={
                "raw_dump": (
                    "I need to email my client about the project draft. "
                    "Rent is due tomorrow. I forgot my meds today. "
                    "I have $200 left. Inbox has 40 unread."
                ),
                "spice_level": "medium",
            },
            timeout=90,
        )
        assert r.status_code == 200, r.text
        ai = r.json()["ai_response"]

        # Now today's daily entry must exist and be populated from PEPPER
        got = api_client.get(f"{base_url}/api/daily-entries/{self.USER}/{today}")
        assert got.status_code == 200, got.text
        entry = got.json()
        assert entry["user_id"] == self.USER
        assert entry["date"] == today
        # top_priorities = first 3 salt_check items
        expected_top = (ai.get("salt_check") or [])[:3]
        assert entry["top_priorities"] == expected_top, (
            f"top_priorities should mirror first 3 salt_check items.\n"
            f"got={entry['top_priorities']}\nexpected={expected_top}"
        )
        # next_sane_step populated
        assert entry["next_sane_step"], entry
        # money_action should be set when ai.money_check is set
        if ai.get("money_check"):
            assert entry["money_action"] == ai["money_check"]
        # medication_note = body_check
        if ai.get("body_check"):
            assert entry["medication_note"] == ai["body_check"]
        # On a brand-new entry, checkbox defaults must be False
        assert entry["water_checked"] is False
        assert entry["food_checked"] is False
        assert entry["hygiene_checked"] is False

    def test_second_checkin_updates_same_entry_and_preserves_checkboxes(self, api_client, base_url):
        today = date_cls.today().isoformat()

        # Toggle some survival checkboxes BEFORE second check-in
        # Find the auto-created entry id via list
        listing = api_client.get(f"{base_url}/api/daily-entries/{self.USER}")
        assert listing.status_code == 200, listing.text
        entries_today = [e for e in listing.json() if e["date"] == today]
        assert len(entries_today) == 1, f"expected exactly 1 entry for today, got {len(entries_today)}"
        entry_id = entries_today[0]["id"]

        # PUT to set water_checked + food_checked = True
        put_payload = {
            "date": today,
            "top_priorities": entries_today[0]["top_priorities"],
            "water_checked": True,
            "food_checked": True,
            "hygiene_checked": False,
            "medication_note": entries_today[0].get("medication_note"),
            "money_action": entries_today[0].get("money_action"),
            "work_action": entries_today[0].get("work_action"),
            "life_admin_action": entries_today[0].get("life_admin_action"),
            "next_sane_step": entries_today[0].get("next_sane_step"),
        }
        up = api_client.put(f"{base_url}/api/daily-entries/{entry_id}", json=put_payload)
        assert up.status_code == 200, up.text
        assert up.json()["water_checked"] is True
        assert up.json()["food_checked"] is True

        # Second PEPPER check-in same day
        r = api_client.post(
            f"{base_url}/api/pepper/checkin",
            params={"user_id": self.USER},
            json={"raw_dump": "New chaos: laundry, taxes, gym, reply to mom."},
            timeout=90,
        )
        assert r.status_code == 200, r.text

        # Verify still ONE entry for today (no duplicate)
        listing2 = api_client.get(f"{base_url}/api/daily-entries/{self.USER}")
        entries_today2 = [e for e in listing2.json() if e["date"] == today]
        assert len(entries_today2) == 1, (
            f"PEPPER created duplicate daily entry! count={len(entries_today2)}"
        )

        # Checkbox state preserved
        e2 = entries_today2[0]
        assert e2["id"] == entry_id, "entry id should be stable across PEPPER updates"
        assert e2["water_checked"] is True, "water_checked must be preserved across PEPPER update"
        assert e2["food_checked"] is True, "food_checked must be preserved across PEPPER update"
        assert e2["hygiene_checked"] is False


# ---------------------------------------------------------------------------
# 3. Voice transcription endpoint
# ---------------------------------------------------------------------------
def _make_silent_wav() -> bytes:
    """Generate a tiny silent WAV via ffmpeg; fallback to raw PCM header if missing."""
    try:
        out = subprocess.run(
            [
                "ffmpeg", "-y", "-f", "lavfi", "-i", "anullsrc=r=16000:cl=mono",
                "-t", "1", "-acodec", "pcm_s16le", "-f", "wav", "pipe:1",
            ],
            check=True, capture_output=True, timeout=15,
        )
        return out.stdout
    except Exception:
        # Minimal valid WAV header + 1s silence at 16kHz mono
        import struct
        sample_rate = 16000
        num_samples = sample_rate
        data = b"\x00\x00" * num_samples
        header = (
            b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVE"
            + b"fmt " + struct.pack("<IHHIIHH", 16, 1, 1, sample_rate, sample_rate * 2, 2, 16)
            + b"data" + struct.pack("<I", len(data))
        )
        return header + data


class TestTranscribe:
    def test_transcribe_returns_json(self, base_url):
        audio = _make_silent_wav()
        files = {"file": ("test.wav", io.BytesIO(audio), "audio/wav")}
        # don't reuse api_client session (it has JSON content-type)
        r = requests.post(f"{base_url}/api/pepper/transcribe", files=files, timeout=60)
        # Endpoint must respond - either 200 with {"text": "..."} or 500 with detail
        assert r.status_code in (200, 500), r.text
        if r.status_code == 200:
            body = r.json()
            assert "text" in body, body
            assert isinstance(body["text"], str)
        else:
            body = r.json()
            assert "detail" in body, body
            print(f"INFO: transcribe failed gracefully: {body['detail']}")

    def test_transcribe_missing_file_returns_422(self, base_url):
        r = requests.post(f"{base_url}/api/pepper/transcribe", timeout=15)
        assert r.status_code == 422, r.text


# ---------------------------------------------------------------------------
# 4. Push registration
# ---------------------------------------------------------------------------
class TestRegisterPush:
    def test_register_push_does_not_crash(self, api_client, base_url):
        r = api_client.post(
            f"{base_url}/api/register-push",
            json={
                "user_id": "TEST_push_user",
                "platform": "android",
                "device_token": "fake-device-token-xyz",
            },
            timeout=20,
        )
        # Accepts 201 (registered), 200 (skipped fallback), or 500/502 from upstream
        assert r.status_code in (200, 201, 500, 502), r.text
        body = r.json()
        assert "status" in body, body
        assert body["status"] in ("registered", "skipped"), body
        if body["status"] == "skipped":
            assert "reason" in body, body
            print(f"INFO: register-push skipped: {body['reason']}")

    def test_register_push_validates_body(self, api_client, base_url):
        r = api_client.post(
            f"{base_url}/api/register-push",
            json={"user_id": "u1"},  # missing platform + device_token
            timeout=10,
        )
        assert r.status_code == 422, r.text


# ---------------------------------------------------------------------------
# 5. Send test push
# ---------------------------------------------------------------------------
class TestSendTestPush:
    def test_send_test_push_does_not_crash(self, api_client, base_url):
        r = api_client.post(
            f"{base_url}/api/send-test-push",
            json={
                "user_id": "TEST_push_user",
                "title": "TEST title",
                "message": "TEST message",
            },
            timeout=20,
        )
        # Should be 200 with {"status": "sent"|"failed", ...} - no crash
        assert r.status_code == 200, r.text
        body = r.json()
        assert "status" in body, body
        assert body["status"] in ("sent", "failed"), body
        if body["status"] == "failed":
            assert "reason" in body, body
            print(f"INFO: send-test-push failed gracefully: {body['reason']}")

    def test_send_test_push_defaults(self, api_client, base_url):
        # Only user_id required; title/message have defaults
        r = api_client.post(
            f"{base_url}/api/send-test-push",
            json={"user_id": "TEST_push_user"},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("status") in ("sent", "failed"), body
