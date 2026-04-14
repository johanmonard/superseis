"""Dojo (ocfa) integration — holds the ProjectService singleton."""

from dojo.v3.services.project_service import ProjectService

_project_service: ProjectService | None = None


def init_project_service(storage_dir: str | None = None) -> ProjectService:
    """Create and store the ProjectService singleton. Called at app startup."""
    global _project_service
    _project_service = ProjectService(storage_dir=storage_dir)
    return _project_service


def get_dojo_project_service() -> ProjectService:
    """FastAPI dependency — returns the dojo ProjectService singleton."""
    if _project_service is None:
        raise RuntimeError("Dojo ProjectService not initialized")
    return _project_service
