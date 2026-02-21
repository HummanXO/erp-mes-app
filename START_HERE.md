# 🚀 Quick Start Guide

## Full Stack Production Control System

This is a complete ERP/MES system with FastAPI backend and Next.js frontend.

## 🎯 Two Modes

### 1️⃣ Quick Demo (localStorage only)

No backend needed - perfect for testing UI!

```bash
npm install
npm run dev
```

Visit: http://localhost:3000

**Features:**
- ✅ Works immediately
- ✅ No setup needed
- ✅ All UI features
- ⚠️ Single user
- ⚠️ No persistence

### 2️⃣ Full Stack (with Backend)

Real production setup with database!

```bash
# 1. Prepare environment files
cp .env.example .env
cp backend/.env.example backend/.env

# 2. Fill required secrets in .env and backend/.env
# SECRET_KEY, JWT_SECRET_KEY, POSTGRES_PASSWORD

# 3. Start services
docker-compose up -d

# 4. Setup database
docker-compose exec backend alembic upgrade head
docker-compose exec backend python seed_data.py

# 5. Access
```

- **Frontend**: http://localhost:3000
- **Backend**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs

**Demo Users:**
- `admin/admin123`
- `kolchin/kolchin123`
- `petrov/petrov123`
- `sidorov/sidorov123`

## 📚 Documentation

- [**Full Stack Guide**](FULLSTACK_README.md) - Complete documentation
- [**Backend API**](backend/README.md) - Backend setup & API reference
- [**Specification**](docs/backend-specification.md) - Technical spec

## 🔧 Configuration

Create env files from templates:

```bash
cp .env.example .env
cp backend/.env.example backend/.env

# Edit required secrets
# .env: POSTGRES_PASSWORD, SECRET_KEY, JWT_SECRET_KEY
# backend/.env: SECRET_KEY, JWT_SECRET_KEY

# Use API mode (backend)
NEXT_PUBLIC_API_BASE_URL=/api/v1
NEXT_PUBLIC_DEMO_MODE=false

# OR demo mode (no backend)
# NEXT_PUBLIC_API_BASE_URL=
# NEXT_PUBLIC_DEMO_MODE=true
```

Mode rules (single source of truth): see `docs/runtime-modes.md`.

## ✅ What's Implemented

### Backend
- ✅ FastAPI + PostgreSQL + Redis
- ✅ JWT authentication
- ✅ Role-based permissions (7 roles)
- ✅ All API endpoints per spec
- ✅ Task workflow (open → accepted → in_progress → review → done)
- ✅ Stage facts with shift validation
- ✅ Part progress calculation
- ✅ Audit logging
- ✅ Docker support

### Frontend
- ✅ Next.js 14 + TypeScript
- ✅ shadcn/ui components
- ✅ Dual mode: localStorage ↔ HTTP API
- ✅ Auto-switching data provider
- ✅ Full CRUD for Parts, Tasks, Facts
- ✅ Dashboard with metrics
- ✅ Task management
- ✅ Fact journal

### Gap Analysis Fixed
- ✅ `shift_type`: Added `"none"` for non-machining stages
- ✅ `qty_ready` alias for `qty_done`
- ✅ `is_read` boolean ↔ `read_by` array transformation
- ✅ Validation: machining requires shift + operator
- ✅ Permissions match across frontend/backend

## 🧪 Testing

### Test Backend

```bash
# Python 3.11 recommended
python3.11 -m venv .venv-backend
source .venv-backend/bin/activate
pip install -r backend/requirements.txt
npm run test:backend
```

### Test API with cURL

```bash
# Login
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"kolchin","password":"kolchin123"}'

# Get parts
curl http://localhost:8000/api/v1/parts \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Test Frontend

```bash
npm run lint
npm run typecheck
```

## 📦 Project Structure

```
.
├── backend/              # FastAPI backend
│   ├── app/
│   │   ├── main.py      # FastAPI app
│   │   ├── models.py    # SQLAlchemy models
│   │   ├── schemas.py   # Pydantic schemas
│   │   ├── auth.py      # JWT auth
│   │   └── routers/     # API endpoints
│   ├── alembic/         # DB migrations
│   └── seed_data.py     # Demo data
│
├── lib/
│   ├── data-provider.ts        # localStorage mode
│   ├── http-data-provider.ts   # API mode
│   ├── data-provider-adapter.ts # Auto-switch
│   └── api-client.ts           # HTTP client
│
├── components/          # React UI components
├── app/                 # Next.js pages
└── docker-compose.yml
```

## 🐛 Troubleshooting

### Backend not starting?

```bash
docker-compose logs backend
```

### Database errors?

```bash
# Reset database
docker-compose down -v
docker-compose up -d postgres
docker-compose exec backend alembic upgrade head
docker-compose exec backend python seed_data.py
```

### Frontend can't connect?

1. Check `.env` has `NEXT_PUBLIC_API_BASE_URL`
2. Check backend is running: `curl http://localhost:8000/api/v1/system/health`
3. Check browser console for CORS errors

### Switch to localStorage mode

Edit `.env`:
```bash
# Comment out or remove
# NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1
```

Restart dev server:
```bash
npm run dev
```

## 🎓 Next Steps

1. **Try the demo** - Use `admin/admin123` to login
2. **Create parts** - Add new parts with stages
3. **Add facts** - Record production data
4. **Manage tasks** - Create and track tasks
5. **View metrics** - Check dashboard

## 📞 Support

See [FULLSTACK_README.md](FULLSTACK_README.md) for detailed documentation.

---

**Built with:** FastAPI • PostgreSQL • Redis • Next.js • TypeScript • Tailwind CSS • shadcn/ui
