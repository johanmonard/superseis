"""Tenant isolation — provides company_id scoping for queries."""

from fastapi import Depends

from api.auth import AuthPrincipal, get_current_user


async def get_company_id(
    principal: AuthPrincipal = Depends(get_current_user),
) -> int:
    """Dependency that returns the current user's company_id.

    Use in routes: company_id: int = Depends(get_company_id)
    Then add .where(Model.company_id == company_id) to all queries.
    """
    return principal.company_id
