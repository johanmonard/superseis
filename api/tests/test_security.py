from api.security import hash_password, verify_password


def test_hash_and_verify():
    plain = "my-secret-password"
    hashed = hash_password(plain)
    assert hashed != plain
    assert verify_password(plain, hashed) is True


def test_wrong_password_fails():
    hashed = hash_password("correct-password")
    assert verify_password("wrong-password", hashed) is False
