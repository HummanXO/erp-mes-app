# Curl Test Suite - Proof of A/B/C/D Requirements

## Setup
```bash
# 1. Create .env
cp .env.example .env
# Edit .env: set DATABASE_URL, SECRET_KEY, JWT_SECRET_KEY

# 2. Start services
docker-compose up -d db redis

# 3. Run migration
python -m alembic upgrade head

# 4. Seed data
python seed_data.py

# 5. Start server
uvicorn app.main:app --reload
```

## Test 1: Login (Admin + Operator)
```bash
# Admin login
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin123"}'

# Save token
export ADMIN_TOKEN="<access_token_from_response>"

# Operator login
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "kolchin", "password": "kolchin123"}'

export OPERATOR_TOKEN="<access_token>"
```

## Test 2: RBAC (Requirement D)
```bash
# Admin sees all parts
curl http://localhost:8000/api/v1/parts \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Operator sees only their parts (403 or empty if no facts)
curl http://localhost:8000/api/v1/parts \
  -H "Authorization: Bearer $OPERATOR_TOKEN"

# Expected: operator gets [] or only parts they worked on
```

## Test 3: Progress Calculation (Requirement C - Bottleneck)
```bash
# Get part with progress - should have bottleneck_stage
curl http://localhost:8000/api/v1/parts/{PART_ID} \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Response should include:
# {
#   "progress": {
#     "overall_percent": <floor(qty_ready/qty_plan*100)>,
#     "overall_qty_done": <MIN(stage_done_qty)>,
#     "qty_scrap": <sum>,
#     "bottleneck_stage": "machining"  # Stage with lowest progress
#   },
#   "stage_statuses": [...]
# }
```

## Test 4: Stage Facts - shift_type validation (Requirement C)
```bash
# Machining fact - MUST have day/night + operator_id
curl -X POST http://localhost:8000/api/v1/facts \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "part_id": "...",
    "stage": "machining",
    "date": "2026-02-05",
    "shift_type": "day",
    "operator_id": "...",
    "qty_good": 50,
    "qty_scrap": 2
  }'

# Non-machining fact - shift_type auto-set to "none"
curl -X POST http://localhost:8000/api/v1/facts \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "part_id": "...",
    "stage": "galvanic",
    "date": "2026-02-05",
    "shift_type": "none",
    "qty_good": 45
  }'
```

## Test 5: Task Workflow
```bash
# Create task
curl -X POST http://localhost:8000/api/v1/tasks \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "part_id": "...",
    "title": "Test task",
    "description": "Test description",
    "assignee_type": "user",
    "assignee_id": "...",
    "due_date": "2026-02-10",
    "category": "quality"
  }'

# Accept task
curl -X POST http://localhost:8000/api/v1/tasks/{TASK_ID}/accept \
  -H "Authorization: Bearer $OPERATOR_TOKEN"

# Start task
curl -X POST http://localhost:8000/api/v1/tasks/{TASK_ID}/start \
  -H "Authorization: Bearer $OPERATOR_TOKEN"

# Send for review
curl -X POST http://localhost:8000/api/v1/tasks/{TASK_ID}/send-to-review \
  -H "Authorization: Bearer $OPERATOR_TOKEN"

# Review and approve
curl -X POST http://localhost:8000/api/v1/tasks/{TASK_ID}/review \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"approved": true, "comment": "Good job"}'
```

## Test 6: Telegram Link Token (Requirement B)
```bash
# Generate link token
curl -X POST http://localhost:8000/api/v1/telegram/link-token \
  -H "Authorization: Bearer $OPERATOR_TOKEN"

# Response:
# {
#   "token": "abc123...",
#   "bot_url": "https://t.me/YOUR_BOT?start=abc123...",
#   "expires_at": "2026-02-05T12:10:00Z"
# }

# Simulate webhook (bot receives /start abc123...)
curl -X POST http://localhost:8000/api/v1/telegram/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "update_id": 123456,
    "message": {
      "message_id": 1,
      "from": {"id": 987654321, "first_name": "Kolchin"},
      "chat": {"id": 987654321, "type": "private"},
      "date": 1234567890,
      "text": "/start abc123..."
    }
  }'

# Expected: 200 OK, user.telegram_chat_id = "987654321"
```

## Test 7: Notification Outbox (Requirement A - proof of FOR UPDATE SKIP LOCKED)
```bash
# Check outbox table after task creation
docker-compose exec db psql -U erp_user -d erp_mes_db -c "
  SELECT id, recipient_user_id, status, attempts, idempotency_key 
  FROM notification_outbox 
  LIMIT 5;
"

# Start Celery worker with DEBUG logs
docker-compose up celery_worker

# Logs should show:
# "📨 Locked N notifications for processing"
# And SQL query with "FOR UPDATE SKIP LOCKED"
```

## Test 8: Comment + Attachment
```bash
# Add comment to task
curl -X POST http://localhost:8000/api/v1/tasks/{TASK_ID}/comments \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Progress update", "attachments": []}'
```

## Expected Results (PASS/FAIL Criteria)

### A) Outbox + Worker: PASS if
✅ `notification_outbox` table has 1 row per recipient
✅ `idempotency_key` is UNIQUE
✅ Has columns: `attempts`, `next_retry_at`, `last_error`, `recipient_user_id`, `recipient_chat_id`
✅ Celery worker logs show "FOR UPDATE SKIP LOCKED"
✅ 429 error increases `next_retry_at` (backoff)
✅ 403 error sets `users.telegram_chat_id = NULL`

### B) Telegram: PASS if
✅ POST `/telegram/link-token` returns token + bot_url + expires_at (10 min)
✅ POST `/telegram/webhook` parses `/start <token>` and links chat_id
✅ Token is one-time use (used_at column)
✅ Expired tokens return error
✅ Webhook responds 200 quickly

### C) Progress: PASS if
✅ `qty_ready = MIN(stage_done_qty for required_stages)`
✅ `overall_percent = floor(qty_ready / qty_plan * 100)`
✅ `bottleneck_stage` = stage with minimum progress
✅ NO averaging - only MIN
✅ Response includes `stage_statistics` array

### D) RBAC: PASS if
✅ Operator GET `/parts` returns only parts with their facts
✅ Operator GET `/parts/{id}` returns 403 for others' parts
✅ Operator GET `/tasks` returns only assigned/created tasks
✅ Operator GET `/tasks/{id}` returns 403 for unassigned tasks
✅ Admin sees everything
