from fastapi.testclient import TestClient

from app.main import app



def test_chart_has_collision_aware_smc_markings_and_extended_drawing_tools():
    client = TestClient(app)
    page = client.get("/assets/index.html").text
    script = client.get("/assets/app.js").text
    assert 'data-draw="fib"' in page
    assert 'data-draw="ray"' in page
    assert 'data-draw="vertical"' in page
    assert "const smartTag=" in script
    assert 'smartTag("SWEEP"' in script
    assert 'smartTag(e.kind==="CHoCH"?"CHoCH":"BOS"' in script
    assert 'd.type==="fib"' in script
    assert 'd.type==="ray"' in script
    assert 'd.type==="vertical"' in script
