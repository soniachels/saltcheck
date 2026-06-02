"""
Batch D backend tests for Salt Check / PEPPER.

Scope:
1. PersonNote with relationship_category (CRUD with all 5 categories + invalid handling)
2. PEPPER /api/pepper/advise-person honors relationship_category (blurry / professional / family)
3. POST /api/pepper/analyze-receipt (multipart vision upload) — happy path + size/missing-file rejections
4. Regression sanity for Batch A/B/C endpoints
"""
import io
import os
import time
import pytest
import requests
from PIL import Image, ImageDraw

from conftest import BASE_URL

TEST_USER = "TEST_cat_user"
SCREENSHOT_USER = "TEST_screenshot_user"

CATEGORIES = ["family", "romantic", "friendship", "professional", "blurry"]


# ------------------------------ Helpers ------------------------------ #

def _png_with_text(text: str, size=(640, 240)) -> bytes:
    """Generate a small real PNG with rendered text (not a blank/solid image)."""
    img = Image.new("RGB", size, color=(245, 245, 250))
    draw = ImageDraw.Draw(img)
    # Add some visual content (lines + text) so it is not flagged as blank
    draw.rectangle([10, 10, size[0] - 10, size[1] - 10], outline=(40, 40, 80), width=3)
    draw.line([(10, 60), (size[0] - 10, 60)], fill=(120, 120, 160), width=2)
    # Default font is OK — produces real pixels
    draw.text((30, 90), text, fill=(20, 20, 40))
    draw.text((30, 140), "— from: alex 11:47pm", fill=(80, 20, 20))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _cleanup_notes(user_id: str):
    try:
        r = requests.get(f"{BASE_URL}/api/person-notes/{user_id}", timeout=20)
        if r.status_code == 200:
            for note in r.json():
                requests.delete(f"{BASE_URL}/api/person-notes/{note['id']}", timeout=15)
    except Exception:
        pass


@pytest.fixture(scope="module", autouse=True)
def _cleanup_module():
    _cleanup_notes(TEST_USER)
    yield
    _cleanup_notes(TEST_USER)


# ===================== 1. PersonNote category CRUD ===================== #

class TestPersonNoteCategory:
    """PersonNote should accept all 5 categories on POST/PUT/GET."""

    note_ids = {}

    @pytest.mark.parametrize("category", CATEGORIES)
    def test_create_note_each_category(self, category):
        payload = {
            "person_name": f"TEST_{category}_person",
            "relationship_category": category,
            "relationship_context": f"context for {category}",
            "risk_trust_notes": "trying things",
        }
        r = requests.post(
            f"{BASE_URL}/api/person-notes?user_id={TEST_USER}",
            json=payload, timeout=20,
        )
        assert r.status_code == 200, f"Create failed for {category}: {r.status_code} {r.text}"
        data = r.json()
        assert data["relationship_category"] == category, (
            f"Expected category={category} in response, got {data.get('relationship_category')}"
        )
        assert data["person_name"] == payload["person_name"]
        assert "id" in data
        TestPersonNoteCategory.note_ids[category] = data["id"]

    def test_get_notes_returns_all_categories(self):
        r = requests.get(f"{BASE_URL}/api/person-notes/{TEST_USER}", timeout=20)
        assert r.status_code == 200
        notes = r.json()
        present = {n["relationship_category"] for n in notes if n.get("relationship_category")}
        for cat in CATEGORIES:
            assert cat in present, f"Missing category {cat} in GET response"

    def test_put_update_changes_category(self):
        # Update the family note to romantic
        family_id = TestPersonNoteCategory.note_ids.get("family")
        assert family_id, "family note id missing — earlier creation likely failed"
        payload = {
            "person_name": "TEST_family_person",
            "relationship_category": "romantic",
            "relationship_context": "now reclassified",
        }
        r = requests.put(f"{BASE_URL}/api/person-notes/{family_id}", json=payload, timeout=20)
        assert r.status_code == 200, f"PUT failed: {r.status_code} {r.text}"
        assert r.json()["relationship_category"] == "romantic"

        # Verify persistence via GET
        r2 = requests.get(f"{BASE_URL}/api/person-notes/{TEST_USER}", timeout=20)
        match = [n for n in r2.json() if n["id"] == family_id]
        assert match and match[0]["relationship_category"] == "romantic"

    def test_invalid_category_is_rejected_or_nulled(self):
        """'casual' is NOT in the Literal set → FastAPI should 422, OR accept as None."""
        payload = {
            "person_name": "TEST_invalid_cat",
            "relationship_category": "casual",
        }
        r = requests.post(
            f"{BASE_URL}/api/person-notes?user_id={TEST_USER}",
            json=payload, timeout=20,
        )
        if r.status_code in (400, 422):
            return  # rejected, as expected
        # If accepted, category must be None (server coerced) — the only other allowed behavior
        assert r.status_code == 200, f"Unexpected status: {r.status_code}"
        data = r.json()
        assert data.get("relationship_category") in (None, ""), (
            f"Invalid category 'casual' was accepted with value "
            f"{data.get('relationship_category')!r} — server should reject or null it"
        )


# ============= 2. PEPPER advise-person honors category ============= #

class TestAdvisePersonCategory:
    """PEPPER advice should adapt to relationship_category."""

    responses = {}

    @staticmethod
    def _post_advise(category: str, notes: str):
        body = {
            "person_name": "Alex",
            "relationship_category": category,
            "relationship_context": "my ex but we're 'best friends' now",
            "risk_trust_notes": notes,
            "spice_level": "medium",
        }
        r = requests.post(
            f"{BASE_URL}/api/pepper/advise-person?user_id=default_user",
            json=body, timeout=90,
        )
        return r

    def test_blurry_category_response_shape(self):
        notes = "texts me at 2am, says he misses me, has new gf"
        r = self._post_advise("blurry", notes)
        assert r.status_code == 200, f"advise-person blurry failed: {r.status_code} {r.text}"
        data = r.json()
        for key in ("vibe_read", "the_move", "watch_out_for", "verdict"):
            assert key in data, f"Missing key {key} in blurry response: {data}"
        assert data["verdict"] in ("trust", "caution", "cut"), f"Bad verdict: {data['verdict']}"
        assert isinstance(data["watch_out_for"], list)
        # sanity: not blank
        assert data["vibe_read"].strip() and data["the_move"].strip()
        # Loose check for boundary/lane vocabulary — non-blocking
        blob = (str(data.get("vibe_read", "")) + " " + str(data.get("the_move", "")) + " "
                + " ".join(data.get("watch_out_for") or [])).lower()
        TestAdvisePersonCategory.responses["blurry"] = data
        hint_present = any(kw in blob for kw in ("lane", "boundary", "blur", "mixed", "role"))
        # informational only — print but do not fail
        if not hint_present:
            print(f"INFO: blurry response did not include lane/boundary/blur keyword. blob={blob[:300]}")

    def test_professional_category_response_differs_and_tactical(self):
        notes = "texts me at 2am, says he misses me, has new gf"
        r = self._post_advise("professional", notes)
        assert r.status_code == 200
        data = r.json()
        for key in ("vibe_read", "the_move", "watch_out_for", "verdict"):
            assert key in data
        TestAdvisePersonCategory.responses["professional"] = data

        # Must differ from blurry response
        blurry = TestAdvisePersonCategory.responses.get("blurry") or {}
        assert (data.get("vibe_read"), data.get("the_move")) != (
            blurry.get("vibe_read"), blurry.get("the_move")
        ), "Professional response identical to blurry — category directive not applied"

        # Tactical keywords loose check
        blob = (str(data.get("the_move", "")) + " " + str(data.get("vibe_read", "")) + " "
                + " ".join(data.get("watch_out_for") or [])).lower()
        tactical_kws = ("script", "paper trail", "escalat", "hr", "document", "email",
                        "boundar", "role", "manager", "policy", "tactic", "professional",
                        "writ", "record", "work hours", "in writing", "message",
                        "respond", "outside work")
        assert any(k in blob for k in tactical_kws), (
            f"Professional response lacks tactical vocabulary. text={blob[:400]}"
        )

    def test_family_category_response(self):
        notes = "texts me at 2am, says he misses me, has new gf"
        r = self._post_advise("family", notes)
        assert r.status_code == 200
        data = r.json()
        for key in ("vibe_read", "the_move", "watch_out_for", "verdict"):
            assert key in data
        assert data["verdict"] in ("trust", "caution", "cut")
        assert data["vibe_read"].strip() and data["the_move"].strip()
        TestAdvisePersonCategory.responses["family"] = data


# ================= 3. Screenshot analyze-receipt ================= #

class TestAnalyzeReceipt:
    """POST /api/pepper/analyze-receipt multipart vision endpoint."""

    def test_happy_path_returns_structured_advice(self):
        png_bytes = _png_with_text("hey can we meet tomorrow?")
        assert len(png_bytes) > 500, "Generated PNG is too small to be real visual content"

        files = {"file": ("screenshot.png", png_bytes, "image/png")}
        data = {
            "user_id": SCREENSHOT_USER,
            "person_name": "Sam",
            "relationship_category": "romantic",
            "spice_level": "medium",
        }
        r = requests.post(
            f"{BASE_URL}/api/pepper/analyze-receipt",
            files=files, data=data, timeout=120,
        )
        assert r.status_code == 200, f"analyze-receipt failed: {r.status_code} {r.text[:500]}"
        body = r.json()
        required = ("tldr", "the_red_flags", "the_green_flags",
                    "what_they_actually_want", "the_move", "verdict")
        for k in required:
            assert k in body, f"Missing key {k} in vision response: {list(body.keys())}"
        assert isinstance(body["the_red_flags"], list)
        assert isinstance(body["the_green_flags"], list)
        assert body["verdict"] in ("trust", "caution", "cut"), f"Bad verdict: {body['verdict']}"
        assert body["tldr"].strip()

    def test_oversize_file_returns_413(self):
        # ~9MB of bytes — server limit is 8MB
        big = b"\x89PNG\r\n\x1a\n" + b"A" * (9 * 1024 * 1024)
        files = {"file": ("big.png", big, "image/png")}
        data = {
            "user_id": SCREENSHOT_USER,
            "person_name": "Sam",
            "relationship_category": "romantic",
            "spice_level": "medium",
        }
        r = requests.post(
            f"{BASE_URL}/api/pepper/analyze-receipt",
            files=files, data=data, timeout=60,
        )
        assert r.status_code == 413, f"Expected 413 for oversize, got {r.status_code}: {r.text[:200]}"

    def test_missing_file_returns_422(self):
        data = {
            "user_id": SCREENSHOT_USER,
            "person_name": "Sam",
            "relationship_category": "romantic",
            "spice_level": "medium",
        }
        r = requests.post(
            f"{BASE_URL}/api/pepper/analyze-receipt",
            data=data, timeout=30,
        )
        assert r.status_code == 422, f"Expected 422 for missing file, got {r.status_code}: {r.text[:200]}"


# ===================== 4. Regression sanity (A/B/C) ===================== #

class TestRegression:
    """Verify earlier-batch endpoints are still healthy."""

    def test_list_users(self):
        r = requests.get(f"{BASE_URL}/api/users", timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_daily_entries_get(self):
        r = requests.get(f"{BASE_URL}/api/daily-entries/default_user", timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_tasks_get(self):
        r = requests.get(f"{BASE_URL}/api/tasks/default_user", timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_money_entries_get(self):
        r = requests.get(f"{BASE_URL}/api/money-entries/default_user", timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_body_logs_get(self):
        r = requests.get(f"{BASE_URL}/api/body-logs/default_user", timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_pepper_advise_body(self):
        r = requests.post(
            f"{BASE_URL}/api/pepper/advise-body?user_id=default_user",
            json={"sleep": "4h", "symptoms": "headache", "spice_level": "medium"},
            timeout=90,
        )
        assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
        body = r.json()
        for k in ("vibe_read", "care_moves", "permission"):
            assert k in body, f"missing {k}"
