from fastapi.testclient import TestClient

from app.main import app


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
    paths = {route.path for route in app.routes}
    assert "/api/v1/system/update" in paths
    assert "/api/v1/system/update/apply" in paths
