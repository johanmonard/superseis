import pytest
from sqlalchemy import select

from api.bootstrap import bootstrap_super_admin
from api.db.models import Company, User


@pytest.mark.asyncio
async def test_bootstrap_creates_super_admin_when_no_users(db_session):
    await bootstrap_super_admin(db_session)

    result = await db_session.execute(select(User))
    user = result.scalar_one()
    assert user.email == "admin@superseis.com"
    assert user.role == "super_admin"
    assert user.company.name == "SuperSeis"


@pytest.mark.asyncio
async def test_bootstrap_skips_when_users_exist(db_session):
    company = Company(name="Existing", is_active=True, max_users=10)
    db_session.add(company)
    await db_session.commit()

    user = User(email="existing@test.com", password_hash="x", company_id=company.id, role="member", is_active=True)
    db_session.add(user)
    await db_session.commit()

    await bootstrap_super_admin(db_session)

    result = await db_session.execute(select(User))
    users = result.scalars().all()
    assert len(users) == 1
    assert users[0].email == "existing@test.com"
