import pytest


@pytest.mark.asyncio
async def test_webhook_secret_validation(client):
    # Wrong secret should be rejected
    response = await client.post(
        "/webhooks/tradingview",
        json={
            "secret": "wrong",
            "pair": "BTC/USDT",
            "direction": "LONG",
            "entry": 100.0,
            "tp1": 110.0,
            "tp2": 120.0,
            "sl": 90.0,
            "reason": "test"
        }
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_webhook_valid_signal(client, db):
    # Assuming webhook secret in .env is "change_me" for test
    payload = {
        "secret": "change_me",
        "pair": "BTC/USDT",
        "direction": "LONG",
        "entry": 100.0,
        "tp1": 110.0,
        "tp2": 120.0,
        "sl": 90.0,
        "reason": "test"
    }
    response = await client.post("/webhooks/tradingview", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["status"] == "created"
    assert "signal_id" in data
