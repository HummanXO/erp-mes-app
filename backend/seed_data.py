"""Seed database with demo data."""
from app.database import SessionLocal, Base, engine
from app.models import (
    Organization, User, Machine, Part, PartStageStatus, 
    StageFact, Task, MachineNorm
)
from app.auth import get_password_hash
from datetime import date, timedelta
import uuid

def seed():
    """Seed database with demo data."""
    # Create all tables
    print("📦 Creating database tables...")
    Base.metadata.create_all(bind=engine)
    print("✅ Tables created")
    
    db = SessionLocal()
    
    try:
        # Create organization
        org = Organization(
            id=uuid.UUID('00000000-0000-0000-0000-000000000001'),
            name="Демо завод",
            code="DEMO"
        )
        db.add(org)
        db.flush()
        
        # Create users
        users_data = [
            {
                'id': uuid.UUID('00000000-0000-0000-0000-000000000101'),
                'username': 'admin',
                'password': 'admin123',
                'name': 'Администратор',
                'initials': 'Админ',
                'role': 'admin'
            },
            {
                'id': uuid.UUID('00000000-0000-0000-0000-000000000102'),
                'username': 'kolchin',
                'password': 'kolchin123',
                'name': 'Колчин Андрей Александрович',
                'initials': 'Колчин А.А.',
                'role': 'master'
            },
            {
                'id': uuid.UUID('00000000-0000-0000-0000-000000000103'),
                'username': 'petrov',
                'password': 'petrov123',
                'name': 'Петров Пётр Петрович',
                'initials': 'Петров П.П.',
                'role': 'operator'
            },
            {
                'id': uuid.UUID('00000000-0000-0000-0000-000000000104'),
                'username': 'sidorov',
                'password': 'sidorov123',
                'name': 'Сидоров Сергей Сергеевич',
                'initials': 'Сидоров С.С.',
                'role': 'supply'
            },
        ]
        
        users = []
        for user_data in users_data:
            password = user_data.pop('password')
            user = User(
                org_id=org.id,
                password_hash=get_password_hash(password),
                **user_data
            )
            db.add(user)
            users.append(user)
        
        db.flush()
        
        # Create machines
        machines_data = [
            {
                'id': uuid.UUID('00000000-0000-0000-0000-000000000201'),
                'name': 'Станок #1 (ЧПУ)',
                'code': 'CNC-01',
                'department': 'machining',
                'rate_per_shift': 400
            },
            {
                'id': uuid.UUID('00000000-0000-0000-0000-000000000202'),
                'name': 'Станок #2 (Токарный)',
                'code': 'LATHE-02',
                'department': 'machining',
                'rate_per_shift': 350
            },
        ]
        
        machines = []
        for machine_data in machines_data:
            machine = Machine(org_id=org.id, **machine_data)
            db.add(machine)
            machines.append(machine)
        
        db.flush()
        
        # Create parts
        today = date.today()
        parts_data = [
            {
                'id': uuid.UUID('00000000-0000-0000-0000-000000000301'),
                'code': '01488.900.725',
                'name': 'Корпус основной',
                'qty_plan': 2450,
                'qty_done': 0,
                'priority': 'high',
                'deadline': today + timedelta(days=12),
                'status': 'not_started',
                'is_cooperation': False,
                'machine_id': machines[0].id,
                'customer': 'Заказчик №1',
                'required_stages': ['machining', 'fitting', 'galvanic', 'qc']
            },
            {
                'id': uuid.UUID('00000000-0000-0000-0000-000000000302'),
                'code': '01488.900.726',
                'name': 'Крышка верхняя',
                'qty_plan': 1800,
                'qty_done': 0,
                'priority': 'medium',
                'deadline': today + timedelta(days=15),
                'status': 'not_started',
                'is_cooperation': False,
                'machine_id': machines[1].id,
                'customer': 'Заказчик №1',
                'required_stages': ['machining', 'fitting', 'qc']
            },
        ]
        
        parts = []
        for part_data in parts_data:
            part = Part(org_id=org.id, **part_data)
            db.add(part)
            parts.append(part)
        
        db.flush()
        
        # Create stage statuses for parts
        for part in parts:
            for stage in part.required_stages:
                stage_status = PartStageStatus(
                    part_id=part.id,
                    stage=stage,
                    status='pending'
                )
                db.add(stage_status)
        
        db.flush()
        
        # Create some stage facts
        facts_data = [
            {
                'part_id': parts[0].id,
                'stage': 'machining',
                'date': today - timedelta(days=2),
                'shift_type': 'day',
                'machine_id': machines[0].id,
                'operator_id': users[2].id,  # petrov
                'qty_good': 380,
                'qty_scrap': 5,
                'comment': 'Нормальная смена'
            },
            {
                'part_id': parts[0].id,
                'stage': 'machining',
                'date': today - timedelta(days=2),
                'shift_type': 'night',
                'machine_id': machines[0].id,
                'operator_id': users[2].id,
                'qty_good': 390,
                'qty_scrap': 3,
                'comment': 'Ночная смена'
            },
            {
                'part_id': parts[0].id,
                'stage': 'machining',
                'date': today - timedelta(days=1),
                'shift_type': 'day',
                'machine_id': machines[0].id,
                'operator_id': users[2].id,
                'qty_good': 420,
                'qty_scrap': 4,
                'comment': 'Отличная смена'
            },
        ]
        
        for fact_data in facts_data:
            fact = StageFact(
                org_id=org.id,
                created_by_id=users[2].id,
                **fact_data
            )
            db.add(fact)
        
        db.flush()
        
        # Update part qty_done and status
        parts[0].qty_done = 380 + 390 + 420
        parts[0].status = 'in_progress'
        
        # Update stage status
        machining_status = db.query(PartStageStatus).filter(
            PartStageStatus.part_id == parts[0].id,
            PartStageStatus.stage == 'machining'
        ).first()
        if machining_status:
            machining_status.status = 'in_progress'
            machining_status.operator_id = users[2].id
        
        # Create machine norms
        norms_data = [
            {
                'machine_id': machines[0].id,
                'part_id': parts[0].id,
                'stage': 'machining',
                'qty_per_shift': 400,
                'is_configured': True
            },
            {
                'machine_id': machines[1].id,
                'part_id': parts[1].id,
                'stage': 'machining',
                'qty_per_shift': 350,
                'is_configured': True
            },
        ]
        
        for norm_data in norms_data:
            norm = MachineNorm(**norm_data)
            db.add(norm)
        
        # Create some tasks
        tasks_data = [
            {
                'part_id': parts[0].id,
                'title': 'Доставить оснастку для детали 725',
                'description': 'Нужна специальная оснастка для второй операции',
                'creator_id': users[1].id,  # kolchin
                'assignee_type': 'role',
                'assignee_role': 'supply',
                'status': 'open',
                'is_blocker': True,
                'due_date': today + timedelta(days=3),
                'category': 'tooling',
                'stage': 'machining'
            },
            {
                'part_id': parts[0].id,
                'title': 'Проверить качество партии после гальваники',
                'description': 'После гальваники необходимо проверить толщину покрытия',
                'creator_id': users[1].id,
                'assignee_type': 'role',
                'assignee_role': 'operator',
                'status': 'open',
                'is_blocker': False,
                'due_date': today + timedelta(days=10),
                'category': 'quality',
                'stage': 'galvanic'
            },
        ]
        
        for task_data in tasks_data:
            task = Task(org_id=org.id, **task_data)
            db.add(task)
        
        db.commit()
        print("✅ Database seeded successfully!")
        print("\nDemo users:")
        print("  admin/admin123 (Administrator)")
        print("  kolchin/kolchin123 (Master)")
        print("  petrov/petrov123 (Operator)")
        print("  sidorov/sidorov123 (Supply)")
        
    except Exception as e:
        db.rollback()
        print(f"❌ Error seeding database: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
