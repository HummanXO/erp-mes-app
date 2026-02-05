# Backend Specification for ERP/MES Production Control System

> Документ сгенерирован на основе анализа фронтенд-прототипа.  
> Версия: 1.0 | Дата: 2026-02-03

---

## 1. Резюме фронтенда

### 1.1 Сущности

| Сущность | Описание | Основные поля |
|----------|----------|---------------|
| **User** | Пользователь системы | id, role, name, initials, username |
| **Part** | Деталь/изделие | id, code, name, qty_plan, qty_done, priority, deadline, status, stage_statuses[], machine_id, is_cooperation |
| **Machine** | Станок/оборудование | id, name, rate_per_shift, department |
| **StageFact** | Факт выработки за смену | id, date, shift_type, part_id, stage, operator_id, qty_good, qty_scrap, qty_expected, comment, attachments[] |
| **Task** | Задача | id, title, description, creator_id, assignee_type, assignee_id/assignee_role, status, is_blocker, due_date, comments[], category |
| **TaskComment** | Комментарий к задаче | id, task_id, user_id, message, attachments[], created_at |
| **TaskAttachment** | Вложение | id, name, url, type |
| **MachineNorm** | Норма выработки | machine_id, part_id, stage, qty_per_shift, is_configured |
| **LogisticsEntry** | Запись логистики | id, part_id, type, description, quantity, date, status |
| **AuditEntry** | Запись аудита | id, action, entity_type, entity_id, user_id, timestamp, details |
| **NotificationOutbox** | Исходящие уведомления | id, payload, status, created_at |

### 1.2 Роли пользователей

```typescript
type UserRole = "admin" | "director" | "chief_engineer" | "shop_head" | "supply" | "master" | "operator"
```

**Матрица прав:**

| Право | admin | director | chief_engineer | shop_head | supply | master | operator |
|-------|-------|----------|----------------|-----------|--------|--------|----------|
| canViewAll | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| canViewCooperation | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| canEditFacts | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ |
| canCreateTasks | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| canCreateParts | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| canEditParts | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| canManageLogistics | ✓ | ✓ | ✗ | ✓ | ✓ | ✗ | ✗ |
| canManageUsers | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| canDeleteData | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

### 1.3 Статусы задач и переходы

```
open → accepted → in_progress → review → done
                      ↑______________|  (возврат при reject)
```

**Кто может выполнять переходы:**

| Переход | Кто может |
|---------|-----------|
| open → accepted | Назначенный исполнитель (или из группы) |
| accepted → in_progress | Принявший задачу |
| in_progress → review | Исполнитель |
| review → done | Создатель задачи (проверяющий) |
| review → in_progress | Создатель задачи (возврат) |

### 1.4 Этапы производства

```typescript
type ProductionStage = 
  | "machining"      // Механообработка - смены day/night, оператор обязателен
  | "fitting"        // Слесарка
  | "galvanic"       // Гальваника  
  | "heat_treatment" // Термообработка
  | "grinding"       // Шлифовка
  | "qc"             // ОТК
  | "logistics"      // Логистика
```

---

## 2. Доменная модель бэкенда

### 2.1 Таблица `organizations` (задел под мультитенант)

```sql
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50) UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_organizations_code ON organizations(code);
```

### 2.2 Таблица `users`

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  username VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  initials VARCHAR(50) NOT NULL, -- "Колчин А.А."
  role VARCHAR(50) NOT NULL CHECK (role IN (
    'admin', 'director', 'chief_engineer', 'shop_head', 'supply', 'master', 'operator'
  )),
  telegram_chat_id VARCHAR(50), -- для уведомлений
  email VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_org_id ON users(org_id);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_username ON users(username);
```

### 2.3 Таблица `machines`

```sql
CREATE TABLE machines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  name VARCHAR(255) NOT NULL,
  code VARCHAR(100),
  department VARCHAR(50) NOT NULL CHECK (department IN (
    'machining', 'fitting', 'galvanic', 'heat_treatment', 'grinding', 'qc', 'logistics'
  )),
  rate_per_shift INTEGER DEFAULT 400,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_machines_org_id ON machines(org_id);
CREATE INDEX idx_machines_department ON machines(department);
```

### 2.4 Таблица `parts`

```sql
CREATE TABLE parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  code VARCHAR(100) NOT NULL, -- "01488.900.725"
  name VARCHAR(255) NOT NULL,
  description TEXT,
  qty_plan INTEGER NOT NULL CHECK (qty_plan > 0),
  qty_done INTEGER DEFAULT 0 CHECK (qty_done >= 0),
  priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  deadline DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'done')),
  drawing_url TEXT,
  is_cooperation BOOLEAN DEFAULT false,
  cooperation_partner VARCHAR(255),
  machine_id UUID REFERENCES machines(id),
  customer VARCHAR(255),
  required_stages JSONB NOT NULL DEFAULT '[]', -- ProductionStage[]
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(org_id, code)
);

CREATE INDEX idx_parts_org_id ON parts(org_id);
CREATE INDEX idx_parts_code ON parts(code);
CREATE INDEX idx_parts_status ON parts(status);
CREATE INDEX idx_parts_deadline ON parts(deadline);
CREATE INDEX idx_parts_machine_id ON parts(machine_id);
CREATE INDEX idx_parts_is_cooperation ON parts(is_cooperation);
```

### 2.5 Таблица `part_stage_statuses`

```sql
CREATE TABLE part_stage_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id UUID NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
  stage VARCHAR(50) NOT NULL CHECK (stage IN (
    'machining', 'fitting', 'galvanic', 'heat_treatment', 'grinding', 'qc', 'logistics'
  )),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'done', 'skipped')),
  operator_id UUID REFERENCES users(id),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(part_id, stage)
);

CREATE INDEX idx_part_stage_statuses_part_id ON part_stage_statuses(part_id);
CREATE INDEX idx_part_stage_statuses_status ON part_stage_statuses(status);
```

### 2.6 Таблица `stage_facts`

```sql
CREATE TABLE stage_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  part_id UUID NOT NULL REFERENCES parts(id),
  stage VARCHAR(50) NOT NULL CHECK (stage IN (
    'machining', 'fitting', 'galvanic', 'heat_treatment', 'grinding', 'qc', 'logistics'
  )),
  machine_id UUID REFERENCES machines(id),
  operator_id UUID REFERENCES users(id),
  date DATE NOT NULL,
  shift_type VARCHAR(10) NOT NULL CHECK (shift_type IN ('day', 'night', 'none')),
  qty_good INTEGER NOT NULL CHECK (qty_good >= 0),
  qty_scrap INTEGER DEFAULT 0 CHECK (qty_scrap >= 0),
  qty_expected INTEGER, -- норма на момент создания
  comment TEXT,
  deviation_reason VARCHAR(50) CHECK (deviation_reason IN (
    'setup', 'quality', 'material', 'tooling', 'operator', 'machine', 'external', 'logistics'
  ) OR deviation_reason IS NULL),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by_id UUID REFERENCES users(id),
  
  -- Ограничение: для machining смена обязательна (day/night), для остальных = none
  CONSTRAINT chk_shift_type_for_stage CHECK (
    (stage = 'machining' AND shift_type IN ('day', 'night')) OR
    (stage != 'machining' AND shift_type = 'none')
  ),
  -- Ограничение: для machining оператор обязателен
  CONSTRAINT chk_operator_for_machining CHECK (
    stage != 'machining' OR operator_id IS NOT NULL
  )
);

CREATE INDEX idx_stage_facts_org_id ON stage_facts(org_id);
CREATE INDEX idx_stage_facts_part_id ON stage_facts(part_id);
CREATE INDEX idx_stage_facts_date ON stage_facts(date);
CREATE INDEX idx_stage_facts_stage ON stage_facts(stage);
CREATE INDEX idx_stage_facts_operator_id ON stage_facts(operator_id);
CREATE INDEX idx_stage_facts_machine_id ON stage_facts(machine_id);
CREATE INDEX idx_stage_facts_date_shift ON stage_facts(date, shift_type);

-- Уникальность: один факт на дату+смену+деталь+этап (для machining)
CREATE UNIQUE INDEX idx_stage_facts_unique_machining 
  ON stage_facts(part_id, stage, date, shift_type) 
  WHERE stage = 'machining';
```

### 2.7 Таблица `stage_fact_attachments`

```sql
CREATE TABLE stage_fact_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_fact_id UUID NOT NULL REFERENCES stage_facts(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  url TEXT NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('image', 'file')),
  size INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_stage_fact_attachments_fact_id ON stage_fact_attachments(stage_fact_id);
```

### 2.8 Таблица `machine_norms`

```sql
CREATE TABLE machine_norms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID NOT NULL REFERENCES machines(id),
  part_id UUID NOT NULL REFERENCES parts(id),
  stage VARCHAR(50) NOT NULL,
  qty_per_shift INTEGER NOT NULL CHECK (qty_per_shift > 0),
  is_configured BOOLEAN DEFAULT false,
  configured_at TIMESTAMPTZ,
  configured_by_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(machine_id, part_id, stage)
);

CREATE INDEX idx_machine_norms_machine_part ON machine_norms(machine_id, part_id);
```

### 2.9 Таблица `tasks`

```sql
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  part_id UUID REFERENCES parts(id),
  machine_id UUID REFERENCES machines(id),
  stage VARCHAR(50) CHECK (stage IN (
    'machining', 'fitting', 'galvanic', 'heat_treatment', 'grinding', 'qc', 'logistics'
  ) OR stage IS NULL),
  title VARCHAR(500) NOT NULL,
  description TEXT,
  creator_id UUID NOT NULL REFERENCES users(id),
  
  -- Назначение: user (конкретный), role (группа), all (всем)
  assignee_type VARCHAR(20) NOT NULL CHECK (assignee_type IN ('user', 'role', 'all')),
  assignee_id UUID REFERENCES users(id), -- если assignee_type = 'user'
  assignee_role VARCHAR(50), -- если assignee_type = 'role'
  
  accepted_by_id UUID REFERENCES users(id),
  accepted_at TIMESTAMPTZ,
  
  status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'in_progress', 'review', 'done')),
  is_blocker BOOLEAN DEFAULT false,
  due_date DATE NOT NULL,
  category VARCHAR(50) DEFAULT 'general' CHECK (category IN (
    'tooling', 'quality', 'machine', 'material', 'logistics', 'general'
  )),
  
  review_comment TEXT,
  reviewed_by_id UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ограничения
  CONSTRAINT chk_assignee_user CHECK (
    assignee_type != 'user' OR assignee_id IS NOT NULL
  ),
  CONSTRAINT chk_assignee_role CHECK (
    assignee_type != 'role' OR assignee_role IS NOT NULL
  )
);

CREATE INDEX idx_tasks_org_id ON tasks(org_id);
CREATE INDEX idx_tasks_part_id ON tasks(part_id);
CREATE INDEX idx_tasks_creator_id ON tasks(creator_id);
CREATE INDEX idx_tasks_assignee_id ON tasks(assignee_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);
CREATE INDEX idx_tasks_is_blocker ON tasks(is_blocker) WHERE is_blocker = true;
```

### 2.10 Таблица `task_read_status`

```sql
CREATE TABLE task_read_status (
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  read_at TIMESTAMPTZ DEFAULT NOW(),
  
  PRIMARY KEY (task_id, user_id)
);

CREATE INDEX idx_task_read_status_user_id ON task_read_status(user_id);
```

### 2.11 Таблица `task_comments`

```sql
CREATE TABLE task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_task_comments_task_id ON task_comments(task_id);
CREATE INDEX idx_task_comments_created_at ON task_comments(created_at);
```

### 2.12 Таблица `task_attachments`

```sql
CREATE TABLE task_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES task_comments(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  url TEXT NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('image', 'file')),
  size INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Должен быть либо task_id, либо comment_id
  CONSTRAINT chk_attachment_parent CHECK (
    (task_id IS NOT NULL AND comment_id IS NULL) OR
    (task_id IS NULL AND comment_id IS NOT NULL)
  )
);

CREATE INDEX idx_task_attachments_task_id ON task_attachments(task_id);
CREATE INDEX idx_task_attachments_comment_id ON task_attachments(comment_id);
```

### 2.13 Таблица `audit_events`

```sql
CREATE TABLE audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  action VARCHAR(50) NOT NULL CHECK (action IN (
    'task_created', 'task_status_changed', 'task_accepted', 'task_comment_added',
    'task_sent_for_review', 'task_approved', 'task_returned', 'task_attachment_added',
    'fact_added', 'fact_updated', 'part_created', 'part_updated', 'part_stage_changed',
    'norm_configured', 'user_login', 'user_logout'
  )),
  entity_type VARCHAR(20) NOT NULL CHECK (entity_type IN ('task', 'part', 'fact', 'norm', 'logistics', 'user')),
  entity_id UUID NOT NULL,
  entity_name VARCHAR(255),
  user_id UUID REFERENCES users(id),
  user_name VARCHAR(100),
  details JSONB DEFAULT '{}',
  part_id UUID REFERENCES parts(id),
  part_code VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_events_org_id ON audit_events(org_id);
CREATE INDEX idx_audit_events_entity ON audit_events(entity_type, entity_id);
CREATE INDEX idx_audit_events_user_id ON audit_events(user_id);
CREATE INDEX idx_audit_events_part_id ON audit_events(part_id);
CREATE INDEX idx_audit_events_created_at ON audit_events(created_at);
CREATE INDEX idx_audit_events_action ON audit_events(action);
```

### 2.14 Таблица `notification_outbox`

```sql
CREATE TABLE notification_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  type VARCHAR(50) NOT NULL CHECK (type IN (
    'task_created', 'task_accepted', 'task_comment', 'task_for_review',
    'task_approved', 'task_returned', 'task_assigned', 'fact_added'
  )),
  task_id UUID REFERENCES tasks(id),
  task_title VARCHAR(500),
  part_code VARCHAR(100),
  triggered_by_id UUID REFERENCES users(id),
  triggered_by_name VARCHAR(100),
  target_user_ids UUID[] NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  retries INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);

CREATE INDEX idx_notification_outbox_status ON notification_outbox(status);
CREATE INDEX idx_notification_outbox_created_at ON notification_outbox(created_at);
CREATE INDEX idx_notification_outbox_target ON notification_outbox USING GIN(target_user_ids);
```

### 2.15 Таблица `logistics_entries`

```sql
CREATE TABLE logistics_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  part_id UUID NOT NULL REFERENCES parts(id),
  type VARCHAR(50) NOT NULL CHECK (type IN (
    'material_in', 'tooling_in', 'shipping_out', 'coop_out', 'coop_in'
  )),
  description TEXT NOT NULL,
  quantity INTEGER,
  date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_transit', 'received', 'completed')),
  tracking_number VARCHAR(100),
  counterparty VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_logistics_entries_part_id ON logistics_entries(part_id);
CREATE INDEX idx_logistics_entries_date ON logistics_entries(date);
```

---

## 3. Бизнес-правила и расчёты

### 3.1 Общий прогресс детали

**Алгоритм (как реализовано во фронте):**

```python
def calculate_overall_progress(part):
    active_stages = [s for s in part.stage_statuses if s.status != 'skipped']
    
    if not active_stages:
        return 0
    
    total_progress = 0
    for stage in active_stages:
        if stage.status == 'done':
            total_progress += 100
        else:
            # Процент = (сумма qty_good по этапу / qty_plan) * 100
            facts = get_facts_for_part_and_stage(part.id, stage.stage)
            stage_qty = sum(f.qty_good for f in facts)
            stage_percent = min((stage_qty / part.qty_plan) * 100, 100)
            total_progress += stage_percent
    
    return round(total_progress / len(active_stages))
```

**API должен возвращать:**
```json
{
  "overall_progress_percent": 45,
  "overall_qty_done": 1102,
  "stages": [
    {
      "stage": "machining",
      "status": "in_progress",
      "percent": 50,
      "qty_good": 1220,
      "qty_scrap": 15
    },
    {
      "stage": "fitting",
      "status": "pending",
      "percent": 0,
      "qty_good": 0
    }
  ]
}
```

### 3.2 Смены

**Правила:**
1. Текущая смена определяется по серверному времени:
   - `day`: 09:00-21:00
   - `night`: 21:00-09:00
2. Смена актуальна **только для machining**
3. Для всех остальных этапов `shift_type = 'none'`

**Бэкенд должен:**
- При создании факта для `machining` валидировать, что `shift_type` in `['day', 'night']`
- При создании факта для других этапов автоматически ставить `shift_type = 'none'`
- Возвращать текущую смену в `/api/system/current-shift`

### 3.3 Workflow задач

```
┌─────┐   accept   ┌──────────┐   start   ┌─────────────┐   send_for_review   ┌────────┐   approve   ┌──────┐
│ open├───────────►│ accepted ├──────────►│ in_progress ├───────────────────►│ review ├────────────►│ done │
└─────┘            └──────────┘           └─────────────┘                     └────┬───┘            └──────┘
                                                 ▲                                 │
                                                 │           return                │
                                                 └─────────────────────────────────┘
```

**Переходы:**

| Переход | Эндпоинт | Кто может | Создаёт |
|---------|----------|-----------|---------|
| open → accepted | POST /tasks/{id}/accept | Назначенный (user/role/all) | AuditEvent + Notification |
| accepted → in_progress | POST /tasks/{id}/start | accepted_by_id | AuditEvent |
| in_progress → review | POST /tasks/{id}/send-to-review | accepted_by_id | AuditEvent + Notification |
| review → done | POST /tasks/{id}/review {approved: true} | creator_id | AuditEvent + Notification |
| review → in_progress | POST /tasks/{id}/review {approved: false} | creator_id | AuditEvent + Notification |

**Идемпотентность:**
- Повторный вызов `accept` для уже принятой задачи = 200 OK (без изменений)
- Повторный вызов `send-to-review` для задачи в статусе `review` = 200 OK

### 3.4 Журнал событий

**Единая лента включает:**
- Все AuditEvents
- Связанные через `part_id` или `entity_id`

**Фильтрация:**
- `by_part`: `/parts/{id}/events`
- `by_task`: `/tasks/{id}/events`
- `by_event_type`: `?action=fact_added,task_created`
- `by_date_range`: `?from=2026-01-01&to=2026-01-31`
- `by_user`: `?user_id=xxx`

---

## 4. API контракт (REST)

### 4.1 Общие соглашения

**Base URL:** `/api/v1`

**Формат ошибок:**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "qty_good must be non-negative",
    "details": {
      "field": "qty_good",
      "value": -5
    }
  }
}
```

**Пагинация:**
```
GET /parts?limit=20&offset=0
GET /parts?cursor=abc123&limit=20

Response:
{
  "data": [...],
  "pagination": {
    "total": 150,
    "limit": 20,
    "offset": 0,
    "next_cursor": "xyz789"
  }
}
```

**Сортировка:**
```
GET /tasks?sort=-created_at,due_date
```

### 4.2 Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /auth/login | Логин |
| POST | /auth/refresh | Обновить токен |
| POST | /auth/logout | Выход |
| GET | /auth/me | Текущий пользователь |

**POST /auth/login**
```json
// Request
{
  "username": "kolchin",
  "password": "secret123"
}

// Response 200
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "expires_in": 3600,
  "user": {
    "id": "uuid",
    "username": "kolchin",
    "name": "Колчин Андрей Александрович",
    "initials": "Колчин А.А.",
    "role": "master"
  }
}

// Response 401
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid username or password"
  }
}
```

### 4.3 Users

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /users | Список пользователей |
| GET | /users/{id} | Пользователь по ID |
| GET | /users/operators | Только операторы |
| GET | /users/by-role/{role} | По роли |

**GET /users**
```json
// Response
{
  "data": [
    {
      "id": "uuid",
      "username": "kolchin",
      "name": "Колчин Андрей Александрович",
      "initials": "Колчин А.А.",
      "role": "master",
      "is_active": true
    }
  ]
}
```

### 4.4 Parts & Stages

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /parts | Список деталей |
| GET | /parts/{id} | Деталь с прогрессом |
| POST | /parts | Создать деталь |
| PUT | /parts/{id} | Обновить деталь |
| PATCH | /parts/{id}/drawing | Обновить чертёж |
| GET | /parts/{id}/stages | Этапы детали |
| PATCH | /parts/{id}/stages/{stage} | Обновить статус этапа |

**GET /parts/{id}**
```json
// Response
{
  "id": "uuid",
  "code": "01488.900.725",
  "name": "Корпус основной",
  "qty_plan": 2450,
  "qty_done": 1220,
  "priority": "high",
  "deadline": "2026-02-15",
  "status": "in_progress",
  "is_cooperation": false,
  "machine_id": "uuid",
  "machine": {
    "id": "uuid",
    "name": "Станок #1"
  },
  "progress": {
    "overall_percent": 25,
    "overall_qty_done": 612,
    "qty_scrap": 15
  },
  "forecast": {
    "days_remaining": 12,
    "shifts_remaining": 24,
    "qty_remaining": 1230,
    "avg_per_shift": 407,
    "will_finish_on_time": true,
    "estimated_finish_date": "2026-02-10",
    "shifts_needed": 4
  },
  "stage_statuses": [
    {
      "stage": "machining",
      "status": "in_progress",
      "percent": 50,
      "qty_good": 1220,
      "qty_scrap": 15,
      "operator_id": "uuid",
      "started_at": "2026-01-15T09:00:00Z"
    },
    {
      "stage": "fitting",
      "status": "pending",
      "percent": 0,
      "qty_good": 0
    }
  ],
  "created_at": "2026-01-01T00:00:00Z"
}
```

**GET /parts?filters**
```
GET /parts?status=in_progress&is_cooperation=false&machine_id=xxx&limit=20
```

### 4.5 Stage Facts

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /parts/{id}/facts | Создать факт |
| GET | /parts/{id}/facts | Журнал фактов |
| GET | /parts/{id}/facts/summary | Сводка по этапам |

**POST /parts/{id}/facts**
```json
// Request
{
  "stage": "machining",
  "date": "2026-02-03",
  "shift_type": "day",
  "machine_id": "uuid",
  "operator_id": "uuid",
  "qty_good": 420,
  "qty_scrap": 5,
  "comment": "Всё штатно",
  "deviation_reason": null,
  "attachments": [
    {
      "name": "photo.jpg",
      "url": "https://storage.example.com/photo.jpg",
      "type": "image"
    }
  ]
}

// Response 201
{
  "id": "uuid",
  "stage": "machining",
  "date": "2026-02-03",
  "shift_type": "day",
  "qty_good": 420,
  "qty_scrap": 5,
  "qty_expected": 400,
  "operator": {
    "id": "uuid",
    "initials": "Колчин А.А."
  },
  "created_at": "2026-02-03T18:30:00Z"
}

// Response 400 (валидация)
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "operator_id is required for machining stage"
  }
}

// Response 409 (уже есть факт за эту смену)
{
  "error": {
    "code": "DUPLICATE_FACT",
    "message": "Fact for this date/shift/stage already exists",
    "details": {
      "existing_fact_id": "uuid"
    }
  }
}
```

**Валидации:**
- `stage = machining`: обязательны `operator_id`, `shift_type` in `['day', 'night']`
- `stage != machining`: `shift_type` автоматически = `'none'`, `operator_id` опционален
- `qty_good >= 0`, `qty_scrap >= 0`
- `qty_good + qty_scrap <= qty_plan` (мягкое предупреждение)

### 4.6 Tasks

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /tasks | Список задач |
| GET | /tasks/{id} | Задача с комментариями |
| POST | /tasks | Создать задачу |
| PUT | /tasks/{id} | Обновить задачу |
| POST | /tasks/{id}/accept | Принять задачу |
| POST | /tasks/{id}/start | Начать работу |
| POST | /tasks/{id}/send-to-review | На проверку |
| POST | /tasks/{id}/review | Проверить (approve/return) |
| POST | /tasks/{id}/comments | Добавить комментарий |
| POST | /tasks/{id}/read | Отметить прочитанной |

**GET /tasks?filters**
```
GET /tasks?status=open,in_progress&assigned_to_me=true&is_blocker=true&part_id=xxx
GET /tasks?created_by_me=true
GET /tasks?unread=true
```

**GET /tasks/{id}**
```json
// Response
{
  "id": "uuid",
  "title": "Доставить оснастку для детали 725",
  "description": "Нужна оснастка ...",
  "creator": {
    "id": "uuid",
    "initials": "Иванов И.И."
  },
  "assignee_type": "role",
  "assignee_role": "supply",
  "accepted_by": {
    "id": "uuid",
    "initials": "Петров П.П."
  },
  "accepted_at": "2026-02-01T10:00:00Z",
  "status": "in_progress",
  "is_blocker": true,
  "due_date": "2026-02-05",
  "category": "tooling",
  "stage": "machining",
  "part": {
    "id": "uuid",
    "code": "01488.900.725"
  },
  "is_read": true,
  "comments": [
    {
      "id": "uuid",
      "user": {
        "id": "uuid",
        "initials": "Петров П.П."
      },
      "message": "Заказал, ждём поставку",
      "attachments": [],
      "created_at": "2026-02-02T14:00:00Z"
    }
  ],
  "created_at": "2026-02-01T09:00:00Z"
}
```

**POST /tasks**
```json
// Request
{
  "title": "Проверить качество партии",
  "description": "После термообработки",
  "part_id": "uuid",
  "stage": "qc",
  "assignee_type": "role",
  "assignee_role": "operator",
  "is_blocker": false,
  "due_date": "2026-02-10",
  "category": "quality"
}

// Response 201
{
  "id": "uuid",
  "title": "Проверить качество партии",
  "status": "open",
  "created_at": "..."
}
```

**POST /tasks/{id}/accept**
```json
// Response 200
{
  "id": "uuid",
  "status": "accepted",
  "accepted_by": {
    "id": "uuid",
    "initials": "Колчин А.А."
  },
  "accepted_at": "2026-02-03T10:00:00Z"
}
```

**POST /tasks/{id}/review**
```json
// Request
{
  "approved": false,
  "comment": "Нужно доработать документацию"
}

// Response 200
{
  "id": "uuid",
  "status": "in_progress",
  "review_comment": "Нужно доработать документацию",
  "reviewed_by": { ... }
}
```

**POST /tasks/{id}/comments**
```json
// Request
{
  "message": "Готово, проверьте",
  "attachments": [
    {
      "name": "result.pdf",
      "url": "https://storage.example.com/result.pdf",
      "type": "file"
    }
  ]
}

// Response 201
{
  "id": "uuid",
  "message": "Готово, проверьте",
  "user": { ... },
  "attachments": [...],
  "created_at": "..."
}
```

### 4.7 Attachments

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /attachments/upload | Загрузить файл |
| GET | /attachments/{id} | Получить метаданные |

**Вариант A: Presigned URL (S3/MinIO)**
```json
// POST /attachments/presigned-url
// Request
{
  "filename": "photo.jpg",
  "content_type": "image/jpeg"
}

// Response
{
  "upload_url": "https://s3.example.com/bucket/xxx?signature=...",
  "attachment_id": "uuid",
  "expires_at": "2026-02-03T19:00:00Z"
}
```

**Вариант B: Direct upload (dev)**
```json
// POST /attachments/upload (multipart/form-data)
// Response
{
  "id": "uuid",
  "name": "photo.jpg",
  "url": "/uploads/xxx/photo.jpg",
  "type": "image",
  "size": 1234567
}
```

### 4.8 Audit / Events

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /parts/{id}/events | События по детали |
| GET | /tasks/{id}/events | События по задаче |
| GET | /events | Общий журнал |

**GET /parts/{id}/events**
```
GET /parts/{id}/events?action=fact_added,task_created&from=2026-01-01&limit=50
```

```json
// Response
{
  "data": [
    {
      "id": "uuid",
      "action": "fact_added",
      "entity_type": "fact",
      "entity_id": "uuid",
      "user": {
        "id": "uuid",
        "initials": "Колчин А.А."
      },
      "details": {
        "stage": "machining",
        "shift": "day",
        "qty_good": 420
      },
      "created_at": "2026-02-03T18:30:00Z"
    }
  ],
  "pagination": { ... }
}
```

### 4.9 Notifications

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /notifications | Уведомления пользователя |
| GET | /notifications/outbox | Outbox (для отладки) |
| POST | /notifications/test | Тестовое уведомление |

### 4.10 System

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /system/current-shift | Текущая смена |
| GET | /system/health | Health check |

**GET /system/current-shift**
```json
{
  "shift": "day",
  "started_at": "09:00",
  "ends_at": "21:00",
  "server_time": "2026-02-03T14:30:00Z"
}
```

---

## 5. Real-time (WebSocket/SSE)

### 5.1 Подключение

```
WS: wss://api.example.com/ws?token=xxx
SSE: https://api.example.com/events/stream?token=xxx
```

### 5.2 Подписка

```json
// WS Message
{
  "action": "subscribe",
  "channels": [
    "part:uuid-123",
    "task:uuid-456",
    "user:uuid-789"
  ]
}
```

### 5.3 События

```json
// task_updated
{
  "event": "task_updated",
  "data": {
    "task_id": "uuid",
    "status": "review",
    "updated_by": "uuid"
  },
  "timestamp": "2026-02-03T14:30:00Z"
}

// new_comment
{
  "event": "new_comment",
  "data": {
    "task_id": "uuid",
    "comment_id": "uuid",
    "user_initials": "Колчин А.А.",
    "message_preview": "Готово, проверьте..."
  }
}

// fact_added
{
  "event": "fact_added",
  "data": {
    "part_id": "uuid",
    "stage": "machining",
    "qty_good": 420,
    "new_progress": 55
  }
}

// progress_updated
{
  "event": "progress_updated",
  "data": {
    "part_id": "uuid",
    "overall_percent": 55,
    "stage_updates": [
      {"stage": "machining", "percent": 60}
    ]
  }
}
```

---

## 6. Совместимость с фронтом

### 6.1 Обязательные поля в ответах

| Фронт ожидает | API должен возвращать |
|---------------|----------------------|
| `user.id` | string (UUID) |
| `user.initials` | string, формат "Фамилия И.О." |
| `task.status` | string: open/accepted/in_progress/review/done |
| `task.read_by` | → заменить на `is_read: boolean` |
| `task.comments` | array (может быть пустой) |
| `part.stage_statuses` | array с обязательными полями |
| `stageFact.shift_type` | day/night для machining, none для остальных |
| `stageFact.created_at` | ISO 8601 timestamp |

### 6.2 Новые поля (добавить во фронт)

```typescript
// Опциональные поля, которые бэкенд может добавить
interface Part {
  // existing...
  org_id?: string
}

interface StageFact {
  // existing...
  created_by_id?: string // кто создал запись (может отличаться от operator)
}
```

---

## 7. Миграции, сиды, тесты

### 7.1 Порядок миграций

1. `001_create_organizations.sql`
2. `002_create_users.sql`
3. `003_create_machines.sql`
4. `004_create_parts.sql`
5. `005_create_part_stage_statuses.sql`
6. `006_create_stage_facts.sql`
7. `007_create_stage_fact_attachments.sql`
8. `008_create_machine_norms.sql`
9. `009_create_tasks.sql`
10. `010_create_task_read_status.sql`
11. `011_create_task_comments.sql`
12. `012_create_task_attachments.sql`
13. `013_create_audit_events.sql`
14. `014_create_notification_outbox.sql`
15. `015_create_logistics_entries.sql`

### 7.2 Seed данные

```sql
-- Organization
INSERT INTO organizations (id, name, code) VALUES 
  ('org_default', 'Демо завод', 'DEMO');

-- Users (с хэшированными паролями)
INSERT INTO users (org_id, username, password_hash, name, initials, role) VALUES
  ('org_default', 'admin', '$2b$...', 'Администратор', 'Админ', 'admin'),
  ('org_default', 'kolchin', '$2b$...', 'Колчин Андрей Александрович', 'Колчин А.А.', 'master'),
  ('org_default', 'petrov', '$2b$...', 'Петров Пётр Петрович', 'Петров П.П.', 'operator'),
  ('org_default', 'sidorov', '$2b$...', 'Сидоров Сергей Сергеевич', 'Сидоров С.С.', 'supply');

-- Machines
INSERT INTO machines (org_id, name, department, rate_per_shift) VALUES
  ('org_default', 'Станок #1 (ЧПУ)', 'machining', 400),
  ('org_default', 'Станок #2 (Токарный)', 'machining', 350);

-- Parts
INSERT INTO parts (org_id, code, name, qty_plan, deadline, required_stages, machine_id) VALUES
  ('org_default', '01488.900.725', 'Корпус основной', 2450, '2026-02-15', 
   '["machining", "fitting", "galvanic", "qc"]', (SELECT id FROM machines LIMIT 1));

-- Part stage statuses
INSERT INTO part_stage_statuses (part_id, stage, status) 
SELECT p.id, stage, 'pending'
FROM parts p, unnest(ARRAY['machining', 'fitting', 'galvanic', 'qc']) AS stage
WHERE p.code = '01488.900.725';

-- Stage facts (несколько примеров)
INSERT INTO stage_facts (org_id, part_id, stage, date, shift_type, qty_good, operator_id)
SELECT 'org_default', p.id, 'machining', '2026-02-01', 'day', 380, 
       (SELECT id FROM users WHERE username = 'petrov')
FROM parts p WHERE p.code = '01488.900.725';

-- Tasks
INSERT INTO tasks (org_id, part_id, title, creator_id, assignee_type, assignee_role, status, due_date, category)
SELECT 'org_default', p.id, 'Доставить оснастку', 
       (SELECT id FROM users WHERE username = 'kolchin'),
       'role', 'supply', 'open', '2026-02-10', 'tooling'
FROM parts p WHERE p.code = '01488.900.725';
```

### 7.3 Интеграционные тесты (сценарии)

**Тест 1: Полный цикл задачи**
```
1. POST /tasks → status = open
2. POST /tasks/{id}/accept (supply user) → status = accepted
3. POST /tasks/{id}/start → status = in_progress
4. POST /tasks/{id}/comments → добавлен комментарий
5. POST /tasks/{id}/send-to-review → status = review
6. POST /tasks/{id}/review {approved: false} → status = in_progress
7. POST /tasks/{id}/send-to-review → status = review
8. POST /tasks/{id}/review {approved: true} → status = done
9. GET /tasks/{id}/events → все переходы в журнале
```

**Тест 2: Комментарий с вложением**
```
1. POST /attachments/upload → получить attachment_id
2. POST /tasks/{id}/comments {attachments: [...]}
3. GET /tasks/{id} → комментарий с вложением
```

**Тест 3: Факт machining day/night**
```
1. POST /parts/{id}/facts {stage: machining, shift_type: day, operator_id: xxx}
   → 201 Created
2. POST /parts/{id}/facts {stage: machining, shift_type: day, operator_id: xxx}
   → 409 Conflict (уже есть)
3. POST /parts/{id}/facts {stage: machining, shift_type: night, operator_id: xxx}
   → 201 Created
4. GET /parts/{id} → progress обновлён
```

**Тест 4: Факт для не-machining этапа**
```
1. POST /parts/{id}/facts {stage: fitting, shift_type: day}
   → 400 (shift_type должен быть none для fitting)
2. POST /parts/{id}/facts {stage: fitting}
   → 201 (shift_type автоматически = none)
3. Проверить что operator_id не обязателен
```

**Тест 5: Прогресс детали**
```
1. GET /parts/{id} → initial progress
2. POST /parts/{id}/facts (machining, 500 шт)
3. GET /parts/{id} → machining stage percent увеличился
4. POST /parts/{id}/facts (fitting, 200 шт)
5. GET /parts/{id} → overall_percent пересчитан как среднее
```

**Тест 6: Журнал событий**
```
1. Выполнить несколько действий (создать задачу, добавить факт, комментарий)
2. GET /parts/{id}/events
3. Проверить: все события в правильном хронологическом порядке
4. Проверить фильтры: ?action=fact_added, ?from=..., ?user_id=...
```

---

## 8. Итоговый артефакт

### 8.1 Список сущностей

1. Organization
2. User
3. Machine
4. Part
5. PartStageStatus
6. StageFact
7. StageFactAttachment
8. MachineNorm
9. Task
10. TaskReadStatus
11. TaskComment
12. TaskAttachment
13. AuditEvent
14. NotificationOutbox
15. LogisticsEntry

### 8.2 Полный список эндпоинтов

```
Auth:
  POST   /auth/login
  POST   /auth/refresh
  POST   /auth/logout
  GET    /auth/me

Users:
  GET    /users
  GET    /users/{id}
  GET    /users/operators
  GET    /users/by-role/{role}

Parts:
  GET    /parts
  GET    /parts/{id}
  POST   /parts
  PUT    /parts/{id}
  PATCH  /parts/{id}/drawing
  GET    /parts/{id}/stages
  PATCH  /parts/{id}/stages/{stage}

Stage Facts:
  POST   /parts/{id}/facts
  GET    /parts/{id}/facts
  GET    /parts/{id}/facts/summary

Tasks:
  GET    /tasks
  GET    /tasks/{id}
  POST   /tasks
  PUT    /tasks/{id}
  POST   /tasks/{id}/accept
  POST   /tasks/{id}/start
  POST   /tasks/{id}/send-to-review
  POST   /tasks/{id}/review
  POST   /tasks/{id}/comments
  POST   /tasks/{id}/read

Attachments:
  POST   /attachments/upload
  POST   /attachments/presigned-url
  GET    /attachments/{id}

Events:
  GET    /parts/{id}/events
  GET    /tasks/{id}/events
  GET    /events

Notifications:
  GET    /notifications
  GET    /notifications/outbox

System:
  GET    /system/current-shift
  GET    /system/health
```

### 8.3 Примеры JSON (ключевые операции)

**1. Login**
```json
// POST /auth/login
{"username": "kolchin", "password": "secret"}
// → {"access_token": "...", "user": {"id": "...", "initials": "Колчин А.А.", "role": "master"}}
```

**2. Get Part with Progress**
```json
// GET /parts/uuid-123
{
  "id": "uuid-123",
  "code": "01488.900.725",
  "progress": {"overall_percent": 45, "overall_qty_done": 1102},
  "stage_statuses": [
    {"stage": "machining", "status": "in_progress", "percent": 50, "qty_good": 1220}
  ]
}
```

**3. Create Stage Fact (machining)**
```json
// POST /parts/uuid-123/facts
{"stage": "machining", "date": "2026-02-03", "shift_type": "day", "operator_id": "uuid", "qty_good": 420}
// → 201 {"id": "...", "qty_expected": 400, ...}
```

**4. Create Stage Fact (fitting - no shift)**
```json
// POST /parts/uuid-123/facts
{"stage": "fitting", "qty_good": 300}
// → 201 {"id": "...", "shift_type": "none", ...}
```

**5. Create Task**
```json
// POST /tasks
{"title": "Доставить оснастку", "assignee_type": "role", "assignee_role": "supply", "due_date": "2026-02-10"}
// → 201 {"id": "...", "status": "open", ...}
```

**6. Accept Task**
```json
// POST /tasks/uuid-456/accept
// → 200 {"status": "accepted", "accepted_by": {"initials": "Сидоров С.С."}}
```

**7. Add Comment with Attachment**
```json
// POST /tasks/uuid-456/comments
{"message": "Готово", "attachments": [{"name": "photo.jpg", "url": "...", "type": "image"}]}
// → 201 {"id": "...", "message": "Готово", ...}
```

**8. Review Task (return)**
```json
// POST /tasks/uuid-456/review
{"approved": false, "comment": "Доработать"}
// → 200 {"status": "in_progress", "review_comment": "Доработать"}
```

**9. Get Events**
```json
// GET /parts/uuid-123/events?limit=10
{"data": [{"action": "fact_added", "details": {"qty_good": 420}, ...}], "pagination": {...}}
```

**10. WebSocket Event**
```json
{"event": "task_updated", "data": {"task_id": "uuid", "status": "review"}}
```

### 8.4 Опасные места

| # | Проблема | Решение |
|---|----------|---------|
| 1 | **Конкурентность при создании фактов** | Unique constraint на (part_id, stage, date, shift_type) для machining; для других — проверка на уровне приложения |
| 2 | **Идемпотентность accept/send-to-review** | Если задача уже в нужном статусе — 200 OK без изменений |
| 3 | **Права доступа к задачам** | Middleware проверяет: assignee_type=user → только assignee_id; role → только пользователи с этой ролью |
| 4 | **Загрузка файлов** | Presigned URL с коротким TTL (5 мин); лимит размера (10MB); проверка content-type |
| 5 | **SQL injection** | Параметризованные запросы везде; Prisma/TypeORM с валидацией |
| 6 | **Race condition при обновлении qty_done** | Транзакция: INSERT fact + UPDATE part.qty_done в одной транзакции |
| 7 | **Переполнение audit_events** | Автоматическая ротация (30 дней или 100k записей) |
| 8 | **Notification outbox** | Background job для retry; exponential backoff; max 3 retries |
| 9 | **JWT expiration** | Access token: 1 час; Refresh token: 7 дней; проверка blacklist при logout |
| 10 | **Многопоточность WebSocket** | Redis pub/sub для синхронизации между инстансами |

---

*Документ готов к использованию для разработки бэкенда.*
