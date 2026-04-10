"""First-run bootstrap — creates the super-admin when the database is empty."""

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from api.config import SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD
from api.db.models import Company, User
from api.security import hash_password


async def bootstrap_super_admin(db: AsyncSession) -> None:
    """Create the super-admin user and company if no users exist yet."""
    result = await db.execute(select(func.count()).select_from(User))
    count = result.scalar_one()
    if count > 0:
        return

    company = Company(name="SuperSeis", is_active=True, max_users=100)
    db.add(company)
    await db.flush()

    admin = User(
        email=SUPER_ADMIN_EMAIL,
        password_hash=hash_password(SUPER_ADMIN_PASSWORD),
        company_id=company.id,
        role="super_admin",
        is_active=True,
    )
    db.add(admin)
    await db.commit()
