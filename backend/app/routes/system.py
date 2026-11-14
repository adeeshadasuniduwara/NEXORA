"""Local system and update endpoints."""
from fastapi import APIRouter, HTTPException

from app.update_service import begin_update, update_status

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/update")
def get_update_status():
    return update_status()


@router.post("/update/apply")
def apply_update():
    try:
        result = begin_update()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Update could not be prepared: {type(exc).__name__}: {exc}") from exc
    if result.get("reason") == "local_changes":
        raise HTTPException(status_code=409, detail=result.get("message"))
    return result
