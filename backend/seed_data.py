"""Seed database with production users and machines (no demo entities)."""

import uuid
from app.database import SessionLocal, Base, engine
from app.models import Organization, User, Machine
from app.auth import get_password_hash


def seed():
    """Recreate schema and seed initial production access data."""
    print("📦 Recreating database schema...")
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    print("✅ Schema recreated")

    db = SessionLocal()
    try:
        org = Organization(
            id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
            name="ERP MES Production",
            code="ERP_MES",
        )
        db.add(org)
        db.flush()

        # All business users are forced to change password on first login.
        users_data = [
            # Admin
            {
                "username": "HummanXo",
                "password": "Kolchin4228",
                "name": "Системный администратор",
                "initials": "Админ",
                "role": "admin",
                "must_change_password": False,
            },
            # Operators
            {
                "username": "ilynykh",
                "password": "Start12345",
                "name": "Ильиных Евгений Борисович",
                "initials": "Ильиных Е.Б.",
                "role": "operator",
                "must_change_password": True,
            },
            {
                "username": "vakhrushev",
                "password": "Start12345",
                "name": "Вахрушев Александр Вячеславович",
                "initials": "Вахрушев А.В.",
                "role": "operator",
                "must_change_password": True,
            },
            {
                "username": "shumilov",
                "password": "Start12345",
                "name": "Шумилов Александр Владимирович",
                "initials": "Шумилов А.В.",
                "role": "operator",
                "must_change_password": True,
            },
            {
                "username": "solovyev",
                "password": "Start12345",
                "name": "Соловьев Александр Сергеевич",
                "initials": "Соловьев А.С.",
                "role": "operator",
                "must_change_password": True,
            },
            # Master
            {
                "username": "kozlov",
                "password": "Start12345",
                "name": "Козлов Андрей Юрьевич",
                "initials": "Козлов А.Ю.",
                "role": "master",
                "must_change_password": True,
            },
            # Shop head
            {
                "username": "berzhanovskiy",
                "password": "Start12345",
                "name": "Бержановский Глеб Валерьевич",
                "initials": "Бержановский Г.В.",
                "role": "shop_head",
                "must_change_password": True,
            },
            # Supply / cooperation
            {
                "username": "kolchin",
                "password": "Start12345",
                "name": "Колчин Александр Алексеевич",
                "initials": "Колчин А.А.",
                "role": "supply",
                "must_change_password": True,
            },
            {
                "username": "kuznetsov",
                "password": "Start12345",
                "name": "Кузнецов Василий Сергеевич",
                "initials": "Кузнецов В.С.",
                "role": "supply",
                "must_change_password": True,
            },
            # Chief engineer
            {
                "username": "shamaev",
                "password": "Start12345",
                "name": "Шамаев Артур Александрович",
                "initials": "Шамаев А.А.",
                "role": "chief_engineer",
                "must_change_password": True,
            },
            # Director
            {
                "username": "gorbenko",
                "password": "Start12345",
                "name": "Горбенко Александр Александрович",
                "initials": "Горбенко А.А.",
                "role": "director",
                "must_change_password": True,
            },
        ]

        for item in users_data:
            password = item.pop("password")
            user = User(
                org_id=org.id,
                password_hash=get_password_hash(password),
                **item,
            )
            db.add(user)

        machines_data = [
            {
                "name": "Tsugami S205A",
                "code": "TSUGAMI-S205A",
                "department": "machining",
                "rate_per_shift": 400,
            },
            {
                "name": "NextTurn SA12B",
                "code": "NEXTTURN-SA12B",
                "department": "machining",
                "rate_per_shift": 350,
            },
        ]

        for machine_data in machines_data:
            machine = Machine(org_id=org.id, **machine_data)
            db.add(machine)

        db.commit()
        print("✅ Seed completed")
        print("\nUsers created:")
        print("  HummanXo / Kolchin4228 (admin)")
        print("  ilynykh / Start12345 (operator, must change password)")
        print("  vakhrushev / Start12345 (operator, must change password)")
        print("  shumilov / Start12345 (operator, must change password)")
        print("  solovyev / Start12345 (operator, must change password)")
        print("  kozlov / Start12345 (master, must change password)")
        print("  berzhanovskiy / Start12345 (shop_head, must change password)")
        print("  kolchin / Start12345 (supply, must change password)")
        print("  kuznetsov / Start12345 (supply, must change password)")
        print("  shamaev / Start12345 (chief_engineer, must change password)")
        print("  gorbenko / Start12345 (director, must change password)")

    except Exception as exc:
        db.rollback()
        print(f"❌ Seed failed: {exc}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
