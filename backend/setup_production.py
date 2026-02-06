#!/usr/bin/env python3
"""Setup production environment with real users and machines."""
import sys
import uuid
from pathlib import Path

# Add app to path
sys.path.insert(0, str(Path(__file__).parent))

from app.database import SessionLocal
from app.models import Organization, User, Machine, Part, Task, StageFact, PartStageStatus, TaskReadStatus, TaskComment, TaskAttachment, NotificationOutbox, MachineNorm
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def setup():
    """Setup production environment."""
    db = SessionLocal()
    
    try:
        print("🚀 Setting up production environment...")
        
        # Check if organization exists
        org = db.query(Organization).first()
        if not org:
            print("❌ Organization not found. Run seed_data.py first to create organization.")
            return
        
        print(f"✅ Using organization: {org.name}")
        
        # ==========================================
        # 1. CLEAN DEMO DATA
        # ==========================================
        print("\n🧹 Cleaning demo data...")
        
        # Delete notifications
        deleted_notifications = db.query(NotificationOutbox).delete()
        print(f"  - Deleted {deleted_notifications} notifications")
        
        # Delete task read statuses
        deleted_read_status = db.query(TaskReadStatus).delete()
        print(f"  - Deleted {deleted_read_status} task read statuses")
        
        # Delete task attachments
        deleted_task_attachments = db.query(TaskAttachment).delete()
        print(f"  - Deleted {deleted_task_attachments} task attachments")
        
        # Delete task comments
        deleted_comments = db.query(TaskComment).delete()
        print(f"  - Deleted {deleted_comments} task comments")
        
        # Delete tasks
        deleted_tasks = db.query(Task).delete()
        print(f"  - Deleted {deleted_tasks} tasks")
        
        # Delete stage facts
        deleted_facts = db.query(StageFact).delete()
        print(f"  - Deleted {deleted_facts} stage facts")
        
        # Delete part stage statuses
        deleted_statuses = db.query(PartStageStatus).delete()
        print(f"  - Deleted {deleted_statuses} part stage statuses")
        
        # Delete parts
        deleted_parts = db.query(Part).delete()
        print(f"  - Deleted {deleted_parts} parts")
        
        # Delete machine norms
        deleted_norms = db.query(MachineNorm).delete()
        print(f"  - Deleted {deleted_norms} machine norms")
        
        # Delete demo machines
        deleted_machines = db.query(Machine).delete()
        print(f"  - Deleted {deleted_machines} machines")
        
        # Delete demo users
        deleted_users = db.query(User).delete()
        print(f"  - Deleted {deleted_users} demo users")
        
        db.commit()
        
        # ==========================================
        # 2. CREATE REAL MACHINES
        # ==========================================
        print("\n🏭 Creating machines...")
        
        machines_data = [
            {
                'id': uuid.UUID('10000000-0000-0000-0000-000000000001'),
                'name': 'Tsugami S205A',
                'code': 'TSUGAMI-01',
                'department': 'machining',
                'rate_per_shift': 400,
            },
            {
                'id': uuid.UUID('10000000-0000-0000-0000-000000000002'),
                'name': 'NextTurn SA12B',
                'code': 'NEXTTURN-01',
                'department': 'machining',
                'rate_per_shift': 350,
            },
        ]
        
        machines = []
        for machine_data in machines_data:
            machine = Machine(org_id=org.id, **machine_data)
            db.add(machine)
            machines.append(machine)
            print(f"  ✓ {machine.name}")
        
        db.flush()
        
        # ==========================================
        # 3. CREATE REAL USERS
        # ==========================================
        print("\n👥 Creating users...")
        
        users_data = [
            # Администратор (не требует смены пароля)
            {
                'id': uuid.UUID('20000000-0000-0000-0000-000000000000'),
                'username': 'HummanXo',
                'password': 'Kolchin4228',
                'initials': 'Администратор',
                'role': 'admin',
                'must_change_password': False,
            },
            # Генеральный директор
            {
                'id': uuid.UUID('20000000-0000-0000-0000-000000000001'),
                'username': 'gorbenko',
                'password': 'gorbenko123',
                'initials': 'Горбенко А.А.',
                'role': 'director',
                'must_change_password': True,
            },
            # Главный инженер
            {
                'id': uuid.UUID('20000000-0000-0000-0000-000000000002'),
                'username': 'shamaev',
                'password': 'shamaev123',
                'initials': 'Шамаев А.А.',
                'role': 'chief_engineer',
                'must_change_password': True,
            },
            # Начальник цеха
            {
                'id': uuid.UUID('20000000-0000-0000-0000-000000000003'),
                'username': 'berzhanovsky',
                'password': 'berzhanovsky123',
                'initials': 'Бержановский Г.В.',
                'role': 'shop_head',
                'must_change_password': True,
            },
            # Мастер
            {
                'id': uuid.UUID('20000000-0000-0000-0000-000000000004'),
                'username': 'kozlov',
                'password': 'kozlov123',
                'initials': 'Козлов А.Ю.',
                'role': 'master',
                'must_change_password': True,
            },
            # Снабжение/Кооперация (2 человека)
            {
                'id': uuid.UUID('20000000-0000-0000-0000-000000000005'),
                'username': 'kolchin',
                'password': 'kolchin123',
                'initials': 'Колчин А.А.',
                'role': 'supply',
                'must_change_password': True,
            },
            {
                'id': uuid.UUID('20000000-0000-0000-0000-000000000006'),
                'username': 'kuznetsov',
                'password': 'kuznetsov123',
                'initials': 'Кузнецов В.С.',
                'role': 'supply',
                'must_change_password': True,
            },
            # Операторы (4 человека)
            {
                'id': uuid.UUID('20000000-0000-0000-0000-000000000007'),
                'username': 'ilinykh',
                'password': 'ilinykh123',
                'initials': 'Ильиных Е.Б.',
                'role': 'operator',
                'must_change_password': True,
            },
            {
                'id': uuid.UUID('20000000-0000-0000-0000-000000000008'),
                'username': 'vakhrushev',
                'password': 'vakhrushev123',
                'initials': 'Вахрушев А.В.',
                'role': 'operator',
                'must_change_password': True,
            },
            {
                'id': uuid.UUID('20000000-0000-0000-0000-000000000009'),
                'username': 'shumilov',
                'password': 'shumilov123',
                'initials': 'Шумилов А.В.',
                'role': 'operator',
                'must_change_password': True,
            },
            {
                'id': uuid.UUID('20000000-0000-0000-0000-000000000010'),
                'username': 'solovyev',
                'password': 'solovyev123',
                'initials': 'Соловьев А.С.',
                'role': 'operator',
                'must_change_password': True,
            },
        ]
        
        users = []
        for user_data in users_data:
            password = user_data.pop('password')
            must_change = user_data.pop('must_change_password', True)  # По умолчанию требуем смену
            user = User(
                org_id=org.id,
                password_hash=pwd_context.hash(password),
                is_active=True,
                must_change_password=must_change,
                **user_data
            )
            db.add(user)
            users.append(user)
            change_mark = " [ТРЕБУЕТСЯ СМЕНА ПАРОЛЯ]" if must_change else ""
            print(f"  ✓ {user.initials} ({user.username} / {password}) - {user.role}{change_mark}")
        
        db.commit()
        
        print("\n✅ Production environment setup complete!")
        print("\n📋 Login credentials:")
        print("\n  🔑 Администратор (постоянный доступ):")
        print("     HummanXo / Kolchin4228")
        print("\n  ⚠️  Все остальные пользователи ОБЯЗАНЫ сменить пароль при первом входе:")
        print("\n  🔹 Генеральный директор:")
        print("     gorbenko / gorbenko123")
        print("\n  🔹 Главный инженер:")
        print("     shamaev / shamaev123")
        print("\n  🔹 Начальник цеха:")
        print("     berzhanovsky / berzhanovsky123")
        print("\n  🔹 Мастер:")
        print("     kozlov / kozlov123")
        print("\n  🔹 Снабжение:")
        print("     kolchin / kolchin123")
        print("     kuznetsov / kuznetsov123")
        print("\n  🔹 Операторы:")
        print("     ilinykh / ilinykh123")
        print("     vakhrushev / vakhrushev123")
        print("     shumilov / shumilov123")
        print("     solovyev / solovyev123")
        print("\n🏭 Станки:")
        print("  - Tsugami S205A")
        print("  - NextTurn SA12B")
        
    except Exception as e:
        db.rollback()
        print(f"❌ Error setting up production: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    setup()
