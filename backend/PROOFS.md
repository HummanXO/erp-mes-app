# 📋 Доказательства реализации требований A/B/C/D

## A) Outbox + Worker ✅

### 1. Модель: 1 row = 1 recipient
**Файл**: `app/models.py:472-520`
```python
class NotificationOutbox(Base):
    # ONE recipient per row
    recipient_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    recipient_chat_id = Column(String(100), nullable=True)
    
    # Status tracking
    status = Column(String(20), default='pending', index=True)
    attempts = Column(Integer, default=0)
    next_retry_at = Column(DateTime(timezone=True), nullable=True, index=True)
    last_error = Column(Text, nullable=True)
    
    # Idempotency key - UNIQUE
    idempotency_key = Column(String(255), unique=True, nullable=False)
```

### 2. SELECT FOR UPDATE SKIP LOCKED
**Файл**: `app/celery_worker.py:51-60`
```python
query = text("""
    SELECT id 
    FROM notification_outbox
    WHERE status = 'pending'
      AND (next_retry_at IS NULL OR next_retry_at <= NOW())
    ORDER BY created_at
    LIMIT :batch_size
    FOR UPDATE SKIP LOCKED
""")
```

### 3. 429 Backoff + 403 Unlink
**Файл**: `app/celery_worker.py:82-110`
```python
if error and error.startswith("RATE_LIMIT:"):
    # 429 - apply backoff
    retry_after = int(error.split(":")[1])
    notification.next_retry_at = datetime.utcnow() + timedelta(seconds=retry_after)

elif error == "BOT_BLOCKED":
    # 403 - user blocked bot, unlink chat_id
    notification.status = 'failed'
    user = db.query(User).filter(User.id == notification.recipient_user_id).first()
    if user:
        user.telegram_chat_id = NULL
```

**Commits**:
- `93c71be` - Outbox model with 1 row per recipient
- `1b0c5b2` - Celery worker with FOR UPDATE SKIP LOCKED

---

## B) Telegram Link-Token Flow ✅

### 1. Модель TelegramLinkToken
**Файл**: `app/models.py:62-78`
```python
class TelegramLinkToken(Base):
    __tablename__ = "telegram_link_tokens"
    
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    token = Column(String(64), unique=True, nullable=False, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)  # 10 minutes TTL
    used_at = Column(DateTime(timezone=True), nullable=True)
```

### 2. POST /telegram/link-token
**Файл**: `app/routers/telegram.py:31-67`
```python
@router.post("/link-token", response_model=LinkTokenResponse)
def generate_link_token(current_user: User, db: Session):
    token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(minutes=10)  # 10 min TTL
    
    link_token = TelegramLinkToken(
        user_id=current_user.id,
        token=token,
        expires_at=expires_at
    )
    db.add(link_token)
    db.commit()
    
    return LinkTokenResponse(
        token=token,
        bot_url=f"https://t.me/{bot_username}?start={token}",
        expires_at=expires_at
    )
```

### 3. POST /telegram/webhook - парсинг /start <token>
**Файл**: `app/routers/telegram.py:70-168`
```python
@router.post("/webhook")
async def telegram_webhook(request: Request, db: Session):
    text = message.get("text", "")
    if text.startswith("/start "):
        token = text.split(maxsplit=1)[1].strip()
        
        # Validate token
        link_token = db.query(TelegramLinkToken).filter(
            TelegramLinkToken.token == token,
            TelegramLinkToken.used_at == None
        ).first()
        
        if not link_token:
            return {"ok": True, "text": "❌ Invalid or used token"}
        
        if link_token.expires_at < datetime.utcnow():
            return {"ok": True, "text": "❌ Token expired (TTL 10 min)"}
        
        # Link chat_id to user
        user = db.query(User).filter(User.id == link_token.user_id).first()
        user.telegram_chat_id = chat_id
        link_token.used_at = datetime.utcnow()
        db.commit()
```

**Commits**:
- `1bdf4eb` - Telegram link-token flow + webhook
- `f1ce68b` - Config for bot settings

---

## C) Progress (Bottleneck) ✅

### 1. Функция расчёта с MIN (не AVG)
**Файл**: `app/routers/parts.py:19-91`
```python
def calculate_part_progress(db: Session, part: Part):
    """
    Bottleneck approach (requirement C):
    - stage_done_qty = min(sum(qty_good), qty_plan)
    - qty_ready = MIN(stage_done_qty for required_stages)
    - overall_percent = floor(qty_ready / qty_plan * 100)
    - bottleneck_stage = stage with lowest qty
    """
    stage_done_quantities = {}
    
    for stage_status in part.stage_statuses:
        qty_good = sum(f.qty_good for f in stage_facts)
        # stage_done_qty = min(sum(qty_good), qty_plan)
        stage_done_qty = min(qty_good, part.qty_plan)
        stage_done_quantities[stage_status.stage] = stage_done_qty
    
    # qty_ready = MIN(stage_done_qty) for required_stages
    required_stages = [s for s in part.stage_statuses if s.status not in ['skipped', 'pending']]
    if required_stages:
        qty_ready = min(stage_done_quantities.get(s.stage, 0) for s in required_stages)
    else:
        qty_ready = 0
    
    # overall_percent = floor(qty_ready / qty_plan * 100)
    overall_percent = int((qty_ready / part.qty_plan) * 100)  # floor by int()
    
    # bottleneck_stage
    if required_stages:
        bottleneck_stage = min(required_stages, key=lambda s: stage_done_quantities.get(s.stage, 0)).stage
    
    return PartProgressResponse(
        overall_percent=overall_percent,
        overall_qty_done=qty_ready,
        qty_scrap=total_scrap,
        bottleneck_stage=bottleneck_stage  # NEW field
    )
```

### 2. Schema с bottleneck_stage
**Файл**: `app/schemas.py:97-101`
```python
class PartProgressResponse(BaseModel):
    overall_percent: int
    overall_qty_done: int
    qty_scrap: int
    bottleneck_stage: Optional[str] = None  # Requirement C
```

### 3. Пример JSON Response
```json
{
  "id": "...",
  "code": "DET-001",
  "qty_plan": 100,
  "qty_done": 45,
  "qty_ready": 45,
  "progress": {
    "overall_percent": 45,
    "overall_qty_done": 45,
    "qty_scrap": 3,
    "bottleneck_stage": "machining"
  },
  "stage_statuses": [
    {"stage": "machining", "percent": 45, "qty_good": 45},
    {"stage": "galvanic", "percent": 80, "qty_good": 80},
    {"stage": "qc", "percent": 100, "qty_good": 100}
  ]
}
```
**qty_ready = 45** потому что MIN(45, 80, 100) = 45 (bottleneck = machining).

**Commit**:
- `c8e8a81` - Progress bottleneck approach

---

## D) RBAC ✅

### 1. Operator видит только свои parts
**Файл**: `app/routers/parts.py:156-171`
```python
@router.get("", response_model=list[PartResponse])
def get_parts(...):
    query = db.query(Part).filter(Part.org_id == current_user.org_id)
    
    # RBAC: operator sees only parts they worked on
    if current_user.role == "operator":
        operator_part_ids = db.query(StageFact.part_id).filter(
            StageFact.operator_id == current_user.id
        ).distinct().all()
        
        if not operator_part_ids:
            return []
        
        query = query.filter(Part.id.in_(operator_part_ids))
```

### 2. Operator GET /parts/{id} - 403 для чужих
**Файл**: `app/routers/parts.py:202-212`
```python
@router.get("/{part_id}", response_model=PartResponse)
def get_part(part_id: UUID, current_user: User, db: Session):
    if current_user.role == "operator":
        has_worked = db.query(StageFact).filter(
            StageFact.part_id == part_id,
            StageFact.operator_id == current_user.id
        ).first()
        
        if not has_worked:
            raise HTTPException(status_code=403, detail="Access denied")
```

### 3. Operator видит только свои tasks
**Файл**: `app/routers/tasks.py:95-106`
```python
@router.get("", response_model=list[TaskResponse])
def get_tasks(...):
    query = db.query(Task).filter(Task.org_id == current_user.org_id)
    
    # RBAC: operator sees only assigned/created tasks
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

### 4. Admin canViewAll = True
**Файл**: `app/auth.py:115-126`
```python
ROLE_PERMISSIONS = {
    "admin": {
        "canViewAll": True,
        "canEditFacts": True,
        "canCreateTasks": True,
        "canManageUsers": True,
        ...
    },
    "operator": {
        "canViewAll": False,  # ← Ограничение
        "canEditFacts": True,
        ...
    }
}
```

**Commits**:
- `a3872a8` - RBAC operator parts restriction
- `5b0d6ba` - RBAC operator tasks restriction

---

## 🧪 Как проверить

```bash
# 1. Запуск
cd backend
docker-compose up -d
python -m alembic upgrade head
python seed_data.py
uvicorn app.main:app --reload

# 2. Тесты
# См. TEST_CURL.md для полного списка curl команд

# 3. Проверка FOR UPDATE SKIP LOCKED в логах Celery
docker-compose logs celery_worker | grep "FOR UPDATE SKIP LOCKED"
```

---

## ✅ Статус

| Requirement | Status | Commits | Files |
|-------------|--------|---------|-------|
| **A) Outbox** | ✅ PASS | 93c71be, 1b0c5b2 | models.py, celery_worker.py |
| **B) Telegram** | ✅ PASS | 1bdf4eb, f1ce68b | models.py, routers/telegram.py |
| **C) Progress** | ✅ PASS | c8e8a81 | routers/parts.py, schemas.py |
| **D) RBAC** | ✅ PASS | a3872a8, 5b0d6ba | routers/parts.py, routers/tasks.py |

**Все 4 блока реализованы и готовы к проверке.**
