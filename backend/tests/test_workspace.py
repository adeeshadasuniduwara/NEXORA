from fastapi.testclient import TestClient

from app.main import app
from app.routes.system import router as system_router


def test_workspace_home_redirects_to_local_ui():
    client = TestClient(app)
    response = client.get("/", follow_redirects=False)
    assert response.status_code == 307
    assert response.headers["location"] == "/assets/index.html"


def test_workspace_assets_are_served():
    client = TestClient(app)
    page = client.get("/assets/index.html")
    script = client.get("/assets/app.js")
    styles = client.get("/assets/styles.css")
    assert page.status_code == 200
    assert "NEXORA" in page.text
    assert script.status_code == 200
    assert "candleChart" in script.text
    assert "checkForNexoraUpdate" in script.text
    assert "updateToast" in page.text
    assert styles.status_code == 200


def test_system_update_endpoints_are_registered():
    paths = {route.path for route in system_router.routes}
    assert "/system/update" in paths
    assert "/system/update/apply" in paths


def test_chart_analysis_panel_and_engine_are_served():
    client = TestClient(app)
    page = client.get("/assets/index.html").text
    script = client.get("/assets/app.js").text
    styles = client.get("/assets/styles.css").text

    assert 'id="analysisPanel"' in page
    assert 'id="analysisBias"' in page
    assert "calculateAnalysis" in script
    assert "Bullish FVG" in script
    assert "Bearish CHoCH" in script
    assert "a.fvgs" in script
    assert ".analysis-grid" in styles


def test_chart_workspace_has_single_trade_desk_and_strategy_packs():
    client = TestClient(app)
    page = client.get("/assets/index.html").text
    script = client.get("/assets/app.js").text
    styles = client.get("/assets/styles.css").text

    assert 'id="tradeDeskActive"' in page
    assert 'id="positionLongBtn"' in page
    assert 'id="positionShortBtn"' in page
    assert 'data-pack="smc"' in page
    assert 'data-pack="ict"' in page
    assert 'data-pack="alchemist"' in page
    assert 'data-pack="orderflow"' in page
    assert 'data-indicator="ema20"' in page
    assert 'data-indicator="bb"' in page
    assert 'data-draw="trendline"' in page
    assert 'id="rsiChart"' in page
    assert "nexora-active-position" in script
    assert "function createPosition" in script
    assert "function drawManualMark" in script
    assert "function drawRsi" in script
    assert "state.view.visible" in script
    assert "orderBlocks" in script
    assert "liquidity sweep" in script.lower()
    assert ".trade-layout" in styles
    assert ".indicator-toolbar" in styles


def test_live_chart_uses_trade_ticks_and_keeps_historical_window():
    client = TestClient(app)
    script = client.get("/assets/app.js").text

    assert "function updateTrade(trade)" in script
    assert "scheduleMarketPaint()" in script
    assert "last.high=Math.max(Number(last.high),price)" in script
    assert "state.candles.length>5000" in script
    assert "function schedulePressureRender()" in script


def test_pair_picker_supports_full_scroll_list_and_live_suggestions():
    client = TestClient(app)
    page = client.get("/assets/index.html").text
    script = client.get("/assets/app.js").text
    styles = client.get("/assets/styles.css").text

    assert 'id="pairSuggestions"' in page
    assert 'id="pairSuggestionCount"' in page
    assert "function renderPairSuggestions" in script
    assert "item.symbol.includes(q)" in script
    assert "state.symbols.forEach" not in script
    assert ".pair-suggestions" in styles
    assert "overflow:auto" in styles


def test_smc_pack_includes_inducement_and_extended_core_concepts():
    client = TestClient(app)
    page = client.get("/assets/index.html").text
    script = client.get("/assets/app.js").text

    for concept in ("idm", "ifvg", "breakers", "mitigation", "rejection", "displacement", "liquidityVoid", "premiumDiscount"):
        assert f'data-confirm="{concept}"' in page
    for concept in ("Inducement (IDM)", "Bullish IFVG", "Breaker Block", "Mitigation Block candidate", "Liquidity Void", "Bullish Displacement"):
        assert concept in script
    assert 'id="analysisPanel"' in page
