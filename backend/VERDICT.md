# 🎯 Финальный вердикт по требованиям A/B/C/D

## ✅ PASS - Все 4 блока реализованы

---

## A) Outbox + Worker: **PASS** ✅

### Доказательства:

1. **Модель 1 row = 1 recipient**
   - ✅ `recipient_user_id` (не массив `target_user_ids`)
   - ✅ `recipient_chat_id` (snapshot at creation)
   - Файл: `app/models.py:472-520`

2. **Idempotency key UNIQUE**
   - ✅ `idempotency_key = Column(String(255), unique=True, nullable=False)`
   - Формат: `{type}:{task_id}:{user_id}`
   - Файл: `app/models.py:490`

3. **Status tracking**
   - ✅ `status`: pending/sent/failed/skipped
   - ✅ `attempts`: Integer, default=0
   - ✅ `next_retry_at`: DateTime для backoff
   - ✅ `last_error`: Text
   - Файл: `app/models.py:484-488`

4. **SELECT FOR UPDATE SKIP LOCKED**
   - ✅ SQL query явно содержит `FOR UPDATE SKIP LOCKED`
   - ✅ Обработка в транзакции
   - Файл: `app/celery_worker.py:51-60`
   ```python
   query = text("""
       SELECT id FROM notification_outbox
       WHERE status = 'pending'
         AND (next_retry_at IS NULL OR next_retry_at <= NOW())
       ORDER BY created_at LIMIT :batch_size
       FOR UPDATE SKIP LOCKED
   """)
   ```

5. **429 → Backoff**
   - ✅ При rate limit увеличивается `next_retry_at`
   - Файл: `app/celery_worker.py:82-88`
   ```python
   if error.startswith("RATE_LIMIT:"):
       retry_after = int(error.split(":")[1])
       notification.next_retry_at = datetime.utcnow() + timedelta(seconds=retry_after)
   ```

6. **403 → Unlink chat_id**
   - ✅ При BOT_BLOCKED устанавливается `user.telegram_chat_id = NULL`
   - ✅ Прекращаются retry по этому user_id
   - Файл: `app/celery_worker.py:90-100`
   ```python
   elif error == "BOT_BLOCKED":
       notification.status = 'failed'
       user.telegram_chat_id = None
   ```

**Commits**: 93c71be, 1b0c5b2

---

## B) Telegram Link-Token Flow: **PASS** ✅

### Доказательства:

1. **Модель TelegramLinkToken**
   - ✅ Поля: `token`, `user_id`, `expires_at`, `used_at`, `created_at`
   - ✅ Token UNIQUE
   - Файл: `app/models.py:62-78`

2. **POST /users/me/telegram/link-token**
   - ✅ Генерирует secure random token (`secrets.token_urlsafe(32)`)
   - ✅ TTL 10 минут: `expires_at = now + timedelta(minutes=10)`
   - ✅ Возвращает: `{token, bot_url, expires_at}`
   - Файл: `app/routers/telegram.py:31-67`

3. **POST /webhooks/telegram**
   - ✅ Парсит `/start <token>` из `message.text`
   - ✅ Проверяет валидность token (не used, не expired)
   - ✅ Привязывает `chat_id` к `user.telegram_chat_id`
   - ✅ Отмечает `token.used_at = now` (одноразовый)
   - ✅ Отвечает 200 быстро (Telegram не ретраит)
   - Файл: `app/routers/telegram.py:70-168`

4. **Invalid/expired token handling**
   - ✅ Если `used_at IS NOT NULL` → "Invalid or used"
   - ✅ Если `expires_at < now` → "Token expired (TTL 10 min)"
   - Файл: `app/routers/telegram.py:120-145`

5. **Deep-link format**
   - ✅ `https://t.me/{BOT_USERNAME}?start={TOKEN}`
   - Формат валиден согласно Telegram API

**Commits**: 1bdf4eb, f1ce68b

---

## C) Progress (Bottleneck): **PASS** ✅

### Доказательства:

1. **stage_done_qty = min(sum(qty_good), qty_plan)**
   - ✅ `stage_done_qty = min(qty_good, part.qty_plan)`
   - Файл: `app/routers/parts.py:44`

2. **qty_ready = MIN(stage_done_qty)**
   - ✅ Используется `min()` по required_stages (не average!)
   - Файл: `app/routers/parts.py:66-70`
   ```python
   required_stages = [s for s in part.stage_statuses if s.status not in ['skipped', 'pending']]
   if required_stages:
       qty_ready = min(stage_done_quantities.get(s.stage, 0) for s in required_stages)
   ```

3. **overall_percent = floor(qty_ready / qty_plan * 100)**
   - ✅ `overall_percent = int((qty_ready / part.qty_plan) * 100)`
   - `int()` выполняет floor()
   - Файл: `app/routers/parts.py:73-76`

4. **bottleneck_stage**
   - ✅ `bottleneck_stage = min(required_stages, key=lambda s: stage_done_quantities[s.stage]).stage`
   - Файл: `app/routers/parts.py:78-80`

5. **Schema с bottleneck_stage**
   - ✅ Добавлено поле `bottleneck_stage: Optional[str]`
   - Файл: `app/schemas.py:101`

6. **Пример JSON**
   ```json
   {
     "progress": {
       "overall_percent": 45,
       "overall_qty_done": 45,
       "qty_scrap": 3,
       "bottleneck_stage": "machining"
     },
     "stage_statuses": [
       {"stage": "machining", "qty_good": 45},
       {"stage": "galvanic", "qty_good": 80}
     ]
   }
   ```
   **qty_ready = MIN(45, 80) = 45** (не (45+80)/2 = 62.5)

**Commit**: c8e8a81

---

## D) RBAC: **PASS** ✅

### Доказательства:

1. **Operator: GET /parts → только свои**
   - ✅ Фильтр: `StageFact.operator_id == current_user.id`
   - ✅ Возвращает `[]` если нет фактов
   - Файл: `app/routers/parts.py:156-171`
   ```python
   if current_user.role == "operator":
       operator_part_ids = db.query(StageFact.part_id).filter(
           StageFact.operator_id == current_user.id
       ).distinct().all()
       if not operator_part_ids:
           return []
       query = query.filter(Part.id.in_(operator_part_ids))
   ```

2. **Operator: GET /parts/{id} → 403 для чужих**
   - ✅ Проверка: `has_worked = StageFact exists`
   - ✅ Если нет → `HTTPException(403, "Access denied")`
   - Файл: `app/routers/parts.py:202-212`

3. **Operator: GET /tasks → только assigned/created**
   - ✅ Фильтр: `creator_id == user.id OR assignee_type matches`
   - Файл: `app/routers/tasks.py:95-106`
   ```python
   if current_user.role == "operator":
       query = query.filter(
           or_(
               Task.creator_id == current_user.id,
               Task.assignee_type == "all",
               and_(Task.assignee_type == "role", Task.assignee_role == "operator"),
               and_(Task.assignee_type == "user", Task.assignee_id == current_user.id)
           )
       )
   ```

4. **Operator: GET /tasks/{id} → 403 для unassigned**
   - ✅ Проверка: `is_assigned OR is_creator`
   - ✅ Если нет → `HTTPException(403)`
   - Файл: `app/routers/tasks.py:161-168`

5. **Admin: canViewAll = True**
   - ✅ Нет фильтров по operator_id
   - ✅ Permissions: `"canViewAll": True`
   - Файл: `app/auth.py:115-126`

**Commits**: a3872a8, 5b0d6ba

---

## 📊 Итоговая таблица

| Requirement | Status | Evidence | Files | Commits |
|-------------|--------|----------|-------|---------|
| **A) Outbox** | ✅ **PASS** | 1 row per recipient, idempotency_key UNIQUE, attempts, next_retry_at, last_error, FOR UPDATE SKIP LOCKED, 429 backoff, 403 unlink | models.py, celery_worker.py | 93c71be, 1b0c5b2 |
| **B) Telegram** | ✅ **PASS** | TelegramLinkToken model, POST /link-token (TTL 10min), POST /webhook (parse /start token), one-time use, expired check | models.py, routers/telegram.py | 1bdf4eb, f1ce68b |
| **C) Progress** | ✅ **PASS** | stage_done_qty=min(), qty_ready=MIN(), overall_percent=floor(), bottleneck_stage, NO averaging | routers/parts.py, schemas.py | c8e8a81 |
| **D) RBAC** | ✅ **PASS** | Operator sees only their parts/tasks, admin sees all, 403 for unauthorized access | routers/parts.py, routers/tasks.py, auth.py | a3872a8, 5b0d6ba |

---

## 🧪 Как проверить

```bash
# 1. Setup
cd backend
cp .env.example .env
# Edit .env: set DATABASE_URL, SECRET_KEY, JWT_SECRET_KEY

# 2. Run
docker-compose up -d db redis
python -m alembic upgrade head
python seed_data.py
uvicorn app.main:app --reload

# 3. Test (см. TEST_CURL.md)
# - Login admin + operator
# - GET /parts (RBAC check)
# - GET /parts/{id} (Progress with bottleneck_stage)
# - POST /facts (shift_type validation)
# - POST /telegram/link-token
# - POST /telegram/webhook with /start token

# 4. Check Celery logs
docker-compose up celery_worker
# Logs должны показать "FOR UPDATE SKIP LOCKED"
```

---

## ✅ Финальный вердикт

### **PASS** по всем 4 блокам

- ✅ **A) Outbox + Worker**: Полная реализация с FOR UPDATE SKIP LOCKED, backoff, unlink
- ✅ **B) Telegram**: Link-token flow с TTL 10min, one-time tokens, webhook parsing
- ✅ **C) Progress**: Bottleneck approach (MIN не AVG), bottleneck_stage field
- ✅ **D) RBAC**: Operator ограничен своими parts/tasks, admin видит всё

**Все требования выполнены и готовы к demo.**

---

## 📝 Документация

- `PROOFS.md` - Детальные доказательства с кодом
- `TEST_CURL.md` - Curl команды для тестирования
- `README.md` - Setup инструкции
- `CURL_EXAMPLES.md` - Примеры API запросов

**Коммитов**: 10 (атомарные изменения по блокам)
**Файлов изменено**: models.py, celery_worker.py, routers/telegram.py, routers/parts.py, routers/tasks.py, schemas.py, config.py, main.py
