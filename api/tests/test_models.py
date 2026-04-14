import pytest
from sqlalchemy import select

from api.db.models import Company, Project, User


@pytest.mark.asyncio
async def test_create_company(db_session):
    company = Company(name="Acme Corp", is_active=True, max_users=10)
    db_session.add(company)
    await db_session.commit()

    result = await db_session.execute(select(Company))
    saved = result.scalar_one()
    assert saved.name == "Acme Corp"
    assert saved.is_active is True
    assert saved.max_users == 10
    assert saved.created_at is not None


@pytest.mark.asyncio
async def test_create_user_with_company(db_session):
    company = Company(name="Acme Corp", is_active=True, max_users=10)
    db_session.add(company)
    await db_session.commit()

    user = User(
        email="alice@acme.com",
        password_hash="fakehash",
        company_id=company.id,
        role="member",
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()

    result = await db_session.execute(select(User))
    saved = result.scalar_one()
    assert saved.email == "alice@acme.com"
    assert saved.company_id == company.id
    assert saved.role == "member"
    assert saved.company.name == "Acme Corp"


@pytest.mark.asyncio
async def test_company_has_users_relationship(db_session):
    company = Company(name="Acme Corp", is_active=True, max_users=10)
    db_session.add(company)
    await db_session.commit()

    user1 = User(email="a@acme.com", password_hash="h", company_id=company.id, role="admin", is_active=True)
    user2 = User(email="b@acme.com", password_hash="h", company_id=company.id, role="member", is_active=True)
    db_session.add_all([user1, user2])
    await db_session.commit()

    await db_session.refresh(company, ["users"])
    assert len(company.users) == 2


