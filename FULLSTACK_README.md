# ERP/MES Production Control - Full Stack

Complete production control system with FastAPI backend and Next.js frontend.

## Architecture

```
├── backend/          # FastAPI + PostgreSQL + Redis
├── components/       # React components
├── lib/              # Frontend logic
│   ├── data-provider.ts         # localStorage mode
│   ├── http-data-provider.ts    # HTTP API mode
│   ├── data-provider-adapter.ts # Auto-switch provider
│   └── api-client.ts            # HTTP client
└── docker-compose.yml
```

## Quick Start (Full Stack)

### 1. Start all services

```bash
docker-compose up -d
```

### 2. Initialize database

```bash
# Run migrations
docker-compose exec backend alembic upgrade head

# Seed demo data
docker-compose exec backend python seed_data.py
```

### 3. Access applications

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs

### Demo Users

- `admin/admin123` (Administrator)
- `kolchin/kolchin123` (Master)
- `petrov/petrov123` (Operator)
- `sidorov/sidorov123` (Supply)

## Development Modes

### Mode 1: Full Stack (API + Frontend)

```bash
# .env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1

# Start backend
cd backend
uvicorn app.main:app --reload

# Start frontend
npm run dev
```

**Features:**
- ✅ Real backend with PostgreSQL
- ✅ JWT authentication
- ✅ Multi-user support
- ✅ API validation
- ✅ Audit logging
- ✅ Background tasks (Celery)

### Mode 2: Frontend Only (localStorage)

```bash
# .env
# NEXT_PUBLIC_API_BASE_URL=

# Start frontend only
npm run dev
```

**Features:**
- ✅ Works offline
- ✅ No backend needed
- ✅ Fast prototyping
- ✅ Demo mode
- ⚠️ Single-user
- ⚠️ No persistence across devices

## Gap Analysis: Frontend ↔ Backend

### ✅ Fixed Issues

1. **shift_type compatibility**
   - Frontend: Added `"none"` to `ShiftType` type
   - Backend: Validates `shift_type` based on stage
   - Machining: must be `"day"` or `"night"`, operator required
   - Other stages: auto-set to `"none"`, operator optional

2. **qty_done vs qty_ready**
   - Backend returns both `qty_done` and `qty_ready` (alias)
   - Frontend uses `qty_ready` from API, falls back to `qty_done`

3. **read_by array vs is_read boolean**
   - Backend stores in `task_read_status` table
   - API returns `is_read: boolean` for current user
   - Frontend transforms to `read_by` array format

4. **Permissions**
   - Backend implements same role matrix as frontend
   - Middleware checks permissions on protected endpoints

### API Endpoints

See [backend/README.md](backend/README.md) for full API documentation.

Key endpoints:
- `POST /api/v1/auth/login` - Login
- `GET /api/v1/parts` - List parts (with progress)
- `POST /api/v1/parts/{id}/facts` - Create fact
- `GET /api/v1/tasks` - List tasks
- `POST /api/v1/tasks/{id}/accept` - Accept task

## Technology Stack

### Backend
- **FastAPI** 0.109 - Web framework
- **PostgreSQL** 16 - Database
- **SQLAlchemy** 2.0 - ORM
- **Alembic** - Migrations
- **Redis** - Caching & queues
- **Celery** - Background tasks
- **JWT** - Authentication

### Frontend
- **Next.js** 14 - React framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **shadcn/ui** - Component library
- **React Hook Form** - Forms

## Project Structure

```
backend/
├── alembic/              # Migrations
├── app/
│   ├── main.py          # FastAPI app
│   ├── config.py        # Settings
│   ├── models.py        # SQLAlchemy models
│   ├── schemas.py       # Pydantic schemas
│   ├── auth.py          # Authentication
│   └── routers/         # API endpoints
├── seed_data.py         # Demo data
└── requirements.txt

frontend/
├── app/                 # Next.js pages
├── components/          # React components
├── lib/
│   ├── types.ts         # TypeScript types
│   ├── data-provider.ts # localStorage mode
│   ├── http-data-provider.ts  # API mode
│   ├── api-client.ts    # HTTP client
│   └── app-context.tsx  # State management
└── package.json
```

## Testing

### Backend

```bash
cd backend
pytest
```

### Frontend

```bash
npm run test
```

### E2E

```bash
npm run test:e2e
```

## Deployment

### Docker Production

```bash
# Build images
docker-compose -f docker-compose.prod.yml build

# Start services
docker-compose -f docker-compose.prod.yml up -d

# Run migrations
docker-compose exec backend alembic upgrade head
```

### Manual Deployment

See individual README files:
- [Backend Deployment](backend/README.md#deployment)
- Frontend Deployment (Vercel/Netlify)

## Environment Variables

Initialize from templates:

```bash
cp .env.example .env
cp backend/.env.example backend/.env
```

### Backend (.env)

```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/erp_mes
REDIS_URL=redis://localhost:6379/0
JWT_SECRET_KEY=your-secret-key
TELEGRAM_BOT_TOKEN=your-bot-token  # Optional
```

### Frontend (.env.local)

```bash
# Use API mode
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1

# OR localStorage mode (leave empty)
# NEXT_PUBLIC_API_BASE_URL=
```

## API Examples

### Login

```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"kolchin","password":"kolchin123"}'
```

Response:
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "expires_in": 3600,
  "user": {
    "id": "uuid",
    "username": "kolchin",
    "initials": "Колчин А.А.",
    "role": "master"
  }
}
```

### Get Parts

```bash
TOKEN="your-token"
curl http://localhost:8000/api/v1/parts \
  -H "Authorization: Bearer $TOKEN"
```

### Create Stage Fact (machining with shift)

```bash
curl -X POST http://localhost:8000/api/v1/parts/PART_ID/facts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "stage": "machining",
    "date": "2026-02-05",
    "shift_type": "day",
    "operator_id": "OPERATOR_ID",
    "qty_good": 420,
    "qty_scrap": 5
  }'
```

### Create Stage Fact (fitting without shift)

```bash
curl -X POST http://localhost:8000/api/v1/parts/PART_ID/facts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "stage": "fitting",
    "date": "2026-02-05",
    "qty_good": 300
  }'
```

Note: `shift_type` is auto-set to `"none"` for non-machining stages.

## Troubleshooting

### Database connection error

```bash
# Check PostgreSQL is running
docker-compose ps postgres

# Check logs
docker-compose logs postgres
```

### Frontend can't connect to backend

1. Check `NEXT_PUBLIC_API_BASE_URL` in `.env`
2. Check backend is running: `curl http://localhost:8000/api/v1/system/health`
3. Check CORS settings in `backend/app/config.py`

### Migrations not applying

```bash
# Reset database (WARNING: deletes all data)
docker-compose down -v
docker-compose up -d postgres
docker-compose exec backend alembic upgrade head
docker-compose exec backend python seed_data.py
```

## License

Proprietary

## Support

For issues, please contact the development team.
