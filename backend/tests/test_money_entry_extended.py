"""
Iteration 4: extended MoneyEntry fields — currency, doom_spends, soft_savings.
Verifies POST/GET/PUT round-trip and backwards-compat for legacy payloads.
"""
from datetime import date as date_cls

import pytest


CREATED_IDS = []


class TestMoneyEntryExtended:
    USER = "TEST_money_ext_user"

    def test_create_with_all_new_fields(self, api_client, base_url):
        today = date_cls.today().isoformat()
        payload = {
            "date": today,
            "currency": "EUR",
            "cash_available": 412.75,
            "expected_income": 1800.00,
            "upcoming_bills": 950.00,
            "debts": 1200.00,
            "urgent_payments": "rent + phone",
            "payment_followups": "refund from utility",
            "afford_note": "skip takeout this week",
            "doom_spends": [
                {"label": "late-night ASOS", "amount": 78.50, "regret": 4, "date": today},
                {"label": "uber eats", "amount": 22.30, "regret": 3, "date": today},
            ],
            "soft_savings": [
                {"label": "coffee at home", "amount": 5.00, "date": today},
                {"label": "skipped takeaway", "amount": 18.00, "date": today},
            ],
        }
        r = api_client.post(
            f"{base_url}/api/money-entries",
            params={"user_id": self.USER},
            json=payload,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["user_id"] == self.USER
        assert data["currency"] == "EUR"
        assert data["debts"] == 1200.00
        # doom_spends round-trip
        assert isinstance(data["doom_spends"], list) and len(data["doom_spends"]) == 2
        ds0 = data["doom_spends"][0]
        assert ds0["label"] == "late-night ASOS"
        assert ds0["amount"] == 78.50
        assert ds0["regret"] == 4
        assert ds0["date"] == today
        # soft_savings round-trip
        assert isinstance(data["soft_savings"], list) and len(data["soft_savings"]) == 2
        ss1 = data["soft_savings"][1]
        assert ss1["label"] == "skipped takeaway"
        assert ss1["amount"] == 18.00
        assert ss1["date"] == today
        CREATED_IDS.append(data["id"])

    def test_get_returns_new_fields(self, api_client, base_url):
        if not CREATED_IDS:
            pytest.skip("no entry created")
        r = api_client.get(f"{base_url}/api/money-entries/{self.USER}")
        assert r.status_code == 200, r.text
        entries = r.json()
        assert len(entries) >= 1
        match = next((e for e in entries if e["id"] == CREATED_IDS[0]), None)
        assert match is not None, "created entry not returned in GET list"
        assert match["currency"] == "EUR"
        assert isinstance(match["doom_spends"], list) and len(match["doom_spends"]) == 2
        assert isinstance(match["soft_savings"], list) and len(match["soft_savings"]) == 2
        assert match["doom_spends"][0]["regret"] == 4

    def test_update_preserves_and_replaces_new_fields(self, api_client, base_url):
        if not CREATED_IDS:
            pytest.skip("no entry created")
        mid = CREATED_IDS[0]
        today = date_cls.today().isoformat()
        new_payload = {
            "date": today,
            "currency": "GBP",
            "cash_available": 500.0,
            "expected_income": 1800.0,
            "upcoming_bills": 950.0,
            "debts": 1100.0,
            "urgent_payments": "rent",
            "payment_followups": None,
            "afford_note": None,
            "doom_spends": [
                {"label": "midnight amazon", "amount": 45.00, "regret": 2, "date": today}
            ],
            "soft_savings": [
                {"label": "walked instead of cab", "amount": 12.00, "date": today}
            ],
        }
        r = api_client.put(f"{base_url}/api/money-entries/{mid}", json=new_payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["currency"] == "GBP"
        assert data["debts"] == 1100.0
        assert len(data["doom_spends"]) == 1
        assert data["doom_spends"][0]["label"] == "midnight amazon"
        assert data["doom_spends"][0]["regret"] == 2
        assert len(data["soft_savings"]) == 1
        assert data["soft_savings"][0]["label"] == "walked instead of cab"

    def test_legacy_payload_without_new_fields(self, api_client, base_url):
        """Backwards-compat: old client without currency/doom_spends/soft_savings still works."""
        legacy_user = "TEST_money_legacy_user"
        today = date_cls.today().isoformat()
        r = api_client.post(
            f"{base_url}/api/money-entries",
            params={"user_id": legacy_user},
            json={
                "date": today,
                "cash_available": 50.0,
                "upcoming_bills": 200.0,
            },
        )
        assert r.status_code == 200, r.text
        data = r.json()
        # currency should default to "USD"
        assert data["currency"] == "USD"
        # new fields should be None (not crash)
        assert data["doom_spends"] is None
        assert data["soft_savings"] is None
        CREATED_IDS.append(data["id"])

    def test_doom_spends_regret_range_values(self, api_client, base_url):
        """Verify regret values 0-4 inclusive round-trip cleanly (spec says 0-4)."""
        user = "TEST_money_regret_user"
        today = date_cls.today().isoformat()
        doom = [
            {"label": f"item-{i}", "amount": 10.0 + i, "regret": i, "date": today}
            for i in range(5)  # 0..4
        ]
        r = api_client.post(
            f"{base_url}/api/money-entries",
            params={"user_id": user},
            json={"date": today, "currency": "USD", "doom_spends": doom, "soft_savings": []},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert len(data["doom_spends"]) == 5
        regrets = [d["regret"] for d in data["doom_spends"]]
        assert regrets == [0, 1, 2, 3, 4]
        assert data["soft_savings"] == []
        CREATED_IDS.append(data["id"])

    def test_empty_lists_round_trip(self, api_client, base_url):
        user = "TEST_money_empty_lists"
        today = date_cls.today().isoformat()
        r = api_client.post(
            f"{base_url}/api/money-entries",
            params={"user_id": user},
            json={
                "date": today,
                "currency": "JPY",
                "doom_spends": [],
                "soft_savings": [],
            },
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["currency"] == "JPY"
        assert data["doom_spends"] == []
        assert data["soft_savings"] == []
        CREATED_IDS.append(data["id"])
