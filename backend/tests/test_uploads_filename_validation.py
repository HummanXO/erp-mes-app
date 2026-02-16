from fastapi import HTTPException

from app.routers.uploads import _sanitize_filename


def test_sanitize_filename_accepts_uuid_filename_with_extension() -> None:
    filename = "35bf5afa-184f-495e-8a0d-7257fe204aa0.png"
    assert _sanitize_filename(filename) == filename


def test_sanitize_filename_rejects_path_traversal() -> None:
    try:
        _sanitize_filename("../35bf5afa-184f-495e-8a0d-7257fe204aa0.png")
        assert False, "Expected HTTPException"
    except HTTPException as exc:
        assert exc.status_code == 400
