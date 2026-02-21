# ERP/MES Production Control - Backend

FastAPI backend for Production Control System.

## Stack

- **FastAPI** 0.109 - Web framework
- **PostgreSQL** 16 - Database
- **SQLAlchemy** 2.0 - ORM
- **Alembic** - Database migrations
- **Redis** - Caching & task queue
- **Celery** - Background tasks
- **JWT** - Authentication

## Models Source of Truth

Runtime SQLAlchemy models are defined only in `app/models.py`. This is the only canonical model module for routers/services/migrations.

## Use-case Logic Map

Router handlers are intentionally thin; business branches live in `app/use_cases/`. Current map:
- `app/use_cases/task_transitions.py` (task status flows)
- `app/use_cases/part_lifecycle.py` (part deletion flow)
- `app/use_cases/movements_use_cases.py` (movement lifecycle rules)
- `app/use_cases/inventory_slice.py` (inventory vertical slice for API mode)

See `USE_CASES.md` for the short entrypoint guide.

## Quick Start

### 1. Setup Environment

```bash
cd backend
cp .env.example .env
# Edit .env with your configuration
```

### 2. Install Dependencies

```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Start Services (Docker)

```bash
# From project root
docker-compose up postgres redis -d
```

### 4. Run Migrations

```bash
# Fresh empty DB
python alembic_bootstrap.py
alembic upgrade head
```

If you have an existing database created historically via `Base.metadata.create_all()` and it has no `alembic_version` table:

```bash
python alembic_bootstrap.py
alembic upgrade head
```

### 5. Seed Database

```bash
python seed_data.py
```

This creates demo users:
- `admin/admin123` (Administrator)
- `kolchin/kolchin123` (Master)
- `petrov/petrov123` (Operator)
- `sidorov/sidorov123` (Supply)

### 6. Start Server

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API available at: http://localhost:8000

Interactive docs: http://localhost:8000/docs

## Docker (Full Stack)

```bash
# From project root
docker-compose up -d

# Run migrations
docker-compose exec backend alembic upgrade head

# Seed database
docker-compose exec backend python seed_data.py
```

## API Endpoints

### Auth
- `POST /api/v1/auth/login` - Login
- `POST /api/v1/auth/refresh` - Refresh token
- `POST /api/v1/auth/logout` - Logout
- `GET /api/v1/auth/me` - Current user

### Users
- `GET /api/v1/users` - List users
- `GET /api/v1/users/{id}` - Get user
- `GET /api/v1/users/operators` - List operators
- `GET /api/v1/users/by-role/{role}` - Users by role

### Parts
- `GET /api/v1/parts` - List parts
- `GET /api/v1/parts/{id}` - Get part with progress
- `POST /api/v1/parts` - Create part
- `PUT /api/v1/parts/{id}` - Update part

### Inventory (Vertical Slice #1)
- `GET /api/v1/inventory/capabilities` - Runtime feature capabilities for API mode
- `GET /api/v1/inventory/metal` - Minimal inventory positions (selection read-model)
- `GET /api/v1/inventory/movements` - Inventory movement journal
- `POST /api/v1/inventory/movements` - Create inventory movement

### Stage Facts
- `POST /api/v1/parts/{id}/facts` - Create fact
- `GET /api/v1/parts/{id}/facts` - List facts

### Tasks
- `GET /api/v1/tasks` - List tasks
- `GET /api/v1/tasks/{id}` - Get task
- `POST /api/v1/tasks` - Create task
- `POST /api/v1/tasks/{id}/accept` - Accept task
- `POST /api/v1/tasks/{id}/start` - Start task
- `POST /api/v1/tasks/{id}/send-to-review` - Send for review
- `POST /api/v1/tasks/{id}/review` - Review task
- `POST /api/v1/tasks/{id}/comments` - Add comment
- `POST /api/v1/tasks/{id}/read` - Mark as read

### System
- `GET /api/v1/system/health` - Health check
- `GET /api/v1/system/current-shift` - Current shift

## Database Migrations

```bash
# Create new migration
alembic revision --autogenerate -m "description"

# Apply migrations
alembic upgrade head

# Rollback
alembic downgrade -1
```

## Testing

```bash
SECRET_KEY=ci-secret JWT_SECRET_KEY=ci-jwt DATABASE_URL=sqlite:///./ci.db pytest -q
```

## cURL Examples

### Login
```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"kolchin","password":"kolchin123"}'
```

### Get Parts
```bash
curl http://localhost:8000/api/v1/parts \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Create Stage Fact (machining)
```bash
curl -X POST http://localhost:8000/api/v1/parts/PART_UUID/facts \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "stage": "machining",
    "date": "2026-02-05",
    "shift_type": "day",
    "operator_id": "OPERATOR_UUID",
    "qty_good": 420,
    "qty_scrap": 5,
    "comment": "Normal shift"
  }'
```

### Create Stage Fact (fitting - no shift)
```bash
curl -X POST http://localhost:8000/api/v1/parts/PART_UUID/facts \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "stage": "fitting",
    "date": "2026-02-05",
    "qty_good": 300,
    "comment": "Fitting work done"
  }'
```

### Create Task
```bash
curl -X POST http://localhost:8000/api/v1/tasks \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Deliver tooling",
    "description": "Need special tooling for operation 2",
    "assignee_type": "role",
    "assignee_role": "supply",
    "is_blocker": true,
    "due_date": "2026-02-10",
    "category": "tooling"
  }'
```

### Accept Task
```bash
curl -X POST http://localhost:8000/api/v1/tasks/TASK_UUID/accept \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Environment Variables

See `.env.example` for all available configuration options.

## Project Structure

```
backend/
├── alembic/              # Database migrations
├── app/
│   ├── __init__.py
│   ├── main.py          # FastAPI app
│   ├── config.py        # Settings
│   ├── database.py      # Database setup
│   ├── models.py        # SQLAlchemy models
│   ├── schemas.py       # Pydantic schemas
│   ├── auth.py          # Authentication
│   └── routers/         # API endpoints
│       ├── auth.py
│       ├── users.py
│       ├── parts.py
│       ├── facts.py
│       └── tasks.py
├── tests/               # Tests
├── uploads/             # File uploads
├── requirements.txt     # Dependencies
├── seed_data.py         # Database seeding
└── README.md
```

## Gap Analysis Summary

### Frontend Compatibility

1. **shift_type**: Added "none" to frontend types for non-machining stages
2. **qty_ready**: Added as alias for qty_done in API responses
3. **read_by**: Converted to `is_read` boolean in responses
4. **Stage validation**: 
   - Machining: `shift_type` must be "day" or "night", operator required
   - Other stages: `shift_type` auto-set to "none", operator optional
5. **Permissions**: Implemented role-based permissions matching frontend

### Key Features

- ✅ JWT authentication with refresh tokens
- ✅ Role-based access control (7 roles)
- ✅ Task workflow (open → accepted → in_progress → review → done)
- ✅ Stage facts with shift validation
- ✅ Part progress calculation
- ✅ Audit logging
- ✅ Multi-tenant support (organizations)
- ✅ CORS enabled
- ✅ Docker support

## License

Proprietary
