from fastapi.testclient import TestClient

from app.main import app


def test_pro_chart_workspace_assets_and_context_menu_are_served():
    client = TestClient(app)
    page = client.get("/assets/index.html")
    script = client.get("/assets/workspace_pro.js")
    styles = client.get("/assets/workspace_pro.css")
    assert page.status_code == 200
    assert 'workspace_pro.js' in page.text
    assert 'workspace_pro.css' in page.text
    assert script.status_code == 200
    for feature in ("Reset chart view", "nexoraResetChartBtn", "Table view", "Object tree", "Chart settings", "autoSignal", "compileScript", "nexoraContextMenu"):
        assert feature in script.text
    assert styles.status_code == 200
    assert ".nx-context" in styles.text
    assert "Bullish candle" in script.text
    assert "Chart background" in script.text
    assert "NEXORA_CHART_UP" in client.get("/assets/app.js").text


def test_pine_subset_is_explicitly_limited_and_safe():
    client = TestClient(app)
    script = client.get("/assets/workspace_pro.js").text
    assert "Deliberately limited Pine-inspired parser" in script
    assert "no eval" in script
    assert "plot(ta.ema" in script
    assert "unsupported syntax" in script
    assert "eval(" not in script
    assert "Ctrl + C" in script
    assert "altKey&&e.key.toLowerCase()==="a"" in script
    app = client.get("/assets/app.js").text
    assert "if(state.draft&&!state.dragging)" in app
    assert "if(state.draft)drawManualMark" in app
    assert "if(event.button!==0)return" in app
