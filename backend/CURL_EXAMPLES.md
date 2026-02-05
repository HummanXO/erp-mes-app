# cURL API Examples

Complete examples for testing the API.

## Setup

```bash
# Start services
docker-compose up -d

# Get base URL
export API_URL="http://localhost:8000/api/v1"
```

## 1. Authentication

### Login

```bash
curl -X POST $API_URL/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "kolchin",
    "password": "kolchin123"
  }'
```

Response:
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "expires_in": 3600,
  "user": {
    "id": "...",
    "username": "kolchin",
    "name": "Колчин Андрей Александрович",
    "initials": "Колчин А.А.",
    "role": "master"
  }
}
```

**Save token:**
```bash
export TOKEN="your-access-token-here"
```

### Get Current User

```bash
curl $API_URL/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

### Logout

```bash
curl -X POST $API_URL/auth/logout \
  -H "Authorization: Bearer $TOKEN"
```

## 2. Users

### List All Users

```bash
curl $API_URL/users \
  -H "Authorization: Bearer $TOKEN"
```

### Get Operators Only

```bash
curl $API_URL/users/operators \
  -H "Authorization: Bearer $TOKEN"
```

### Get Users by Role

```bash
curl $API_URL/users/by-role/supply \
  -H "Authorization: Bearer $TOKEN"
```

## 3. Parts

### List Parts

```bash
# All parts
curl "$API_URL/parts" \
  -H "Authorization: Bearer $TOKEN"

# With filters
curl "$API_URL/parts?status=in_progress&is_cooperation=false&limit=10" \
  -H "Authorization: Bearer $TOKEN"
```

### Get Part by ID

```bash
export PART_ID="00000000-0000-0000-0000-000000000301"

curl "$API_URL/parts/$PART_ID" \
  -H "Authorization: Bearer $TOKEN"
```

Response includes:
- Part details
- Progress (overall_percent, qty_done, qty_scrap)
- Forecast (days_remaining, will_finish_on_time)
- Stage statuses with progress per stage

### Create Part

```bash
curl -X POST $API_URL/parts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "TEST.123.456",
    "name": "Test Part",
    "qty_plan": 1000,
    "priority": "medium",
    "deadline": "2026-03-01",
    "is_cooperation": false,
    "required_stages": ["machining", "fitting", "qc"]
  }'
```

### Update Part

```bash
curl -X PUT $API_URL/parts/$PART_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "qty_plan": 1200,
    "priority": "high"
  }'
```

## 4. Stage Facts

### Create Fact - Machining (with shift)

```bash
export OPERATOR_ID="00000000-0000-0000-0000-000000000103"

curl -X POST $API_URL/parts/$PART_ID/facts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "stage": "machining",
    "date": "2026-02-05",
    "shift_type": "day",
    "operator_id": "'$OPERATOR_ID'",
    "qty_good": 420,
    "qty_scrap": 5,
    "comment": "Normal production day"
  }'
```

**Validation:**
- ✅ `shift_type` must be "day" or "night"
- ✅ `operator_id` is required
- ✅ Returns 409 if fact already exists for this date/shift

### Create Fact - Fitting (no shift)

```bash
curl -X POST $API_URL/parts/$PART_ID/facts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "stage": "fitting",
    "date": "2026-02-05",
    "qty_good": 300,
    "comment": "Fitting work completed"
  }'
```

**Note:** `shift_type` is auto-set to "none" for non-machining stages.

### List Facts for Part

```bash
curl "$API_URL/parts/$PART_ID/facts" \
  -H "Authorization: Bearer $TOKEN"
```

## 5. Tasks

### List Tasks

```bash
# All active tasks
curl "$API_URL/tasks?status=open,in_progress" \
  -H "Authorization: Bearer $TOKEN"

# Tasks assigned to me
curl "$API_URL/tasks?assigned_to_me=true" \
  -H "Authorization: Bearer $TOKEN"

# Unread tasks
curl "$API_URL/tasks?unread=true&assigned_to_me=true" \
  -H "Authorization: Bearer $TOKEN"

# Blockers
curl "$API_URL/tasks?is_blocker=true" \
  -H "Authorization: Bearer $TOKEN"
```

### Get Task by ID

```bash
export TASK_ID="your-task-id"

curl "$API_URL/tasks/$TASK_ID" \
  -H "Authorization: Bearer $TOKEN"
```

### Create Task

```bash
# Assign to specific user
curl -X POST $API_URL/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Deliver special tooling",
    "description": "Need tooling for operation 2",
    "part_id": "'$PART_ID'",
    "assignee_type": "user",
    "assignee_id": "'$OPERATOR_ID'",
    "is_blocker": true,
    "due_date": "2026-02-10",
    "category": "tooling",
    "stage": "machining"
  }'

# Assign to role (group)
curl -X POST $API_URL/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Check material quality",
    "assignee_type": "role",
    "assignee_role": "supply",
    "is_blocker": false,
    "due_date": "2026-02-15",
    "category": "material"
  }'

# Assign to all
curl -X POST $API_URL/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Safety meeting at 2pm",
    "assignee_type": "all",
    "due_date": "2026-02-05",
    "category": "general"
  }'
```

### Task Workflow

#### 1. Accept Task

```bash
curl -X POST $API_URL/tasks/$TASK_ID/accept \
  -H "Authorization: Bearer $TOKEN"
```

Status: `open` → `accepted`

#### 2. Start Work

```bash
curl -X POST $API_URL/tasks/$TASK_ID/start \
  -H "Authorization: Bearer $TOKEN"
```

Status: `accepted` → `in_progress`

#### 3. Send for Review

```bash
curl -X POST $API_URL/tasks/$TASK_ID/send-to-review \
  -H "Authorization: Bearer $TOKEN"
```

Status: `in_progress` → `review`

#### 4. Review (Approve)

```bash
curl -X POST $API_URL/tasks/$TASK_ID/review \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "approved": true,
    "comment": "Looks good, approved!"
  }'
```

Status: `review` → `done`

#### 5. Review (Return)

```bash
curl -X POST $API_URL/tasks/$TASK_ID/review \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "approved": false,
    "comment": "Please add more photos"
  }'
```

Status: `review` → `in_progress`

### Add Comment

```bash
curl -X POST $API_URL/tasks/$TASK_ID/comments \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Work is progressing well",
    "attachments": []
  }'
```

### Mark as Read

```bash
curl -X POST $API_URL/tasks/$TASK_ID/read \
  -H "Authorization: Bearer $TOKEN"
```

## 6. System

### Health Check

```bash
curl $API_URL/system/health
```

### Current Shift

```bash
curl $API_URL/system/current-shift
```

Response:
```json
{
  "shift": "day",
  "started_at": "09:00",
  "ends_at": "21:00",
  "server_time": "2026-02-05T14:30:00Z"
}
```

## Error Handling

### 401 Unauthorized

```json
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid username or password"
  }
}
```

### 400 Bad Request

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "operator_id is required for machining stage"
  }
}
```

### 409 Conflict

```json
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

## Testing Script

Save as `test_api.sh`:

```bash
#!/bin/bash

API_URL="http://localhost:8000/api/v1"

# Login
echo "1. Login..."
LOGIN_RESPONSE=$(curl -s -X POST $API_URL/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"kolchin","password":"kolchin123"}')

TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.access_token')
echo "✅ Logged in, token: ${TOKEN:0:20}..."

# Get parts
echo "2. Get parts..."
curl -s $API_URL/parts -H "Authorization: Bearer $TOKEN" | jq '.[] | .code'

# Get tasks
echo "3. Get tasks..."
curl -s "$API_URL/tasks?assigned_to_me=true" -H "Authorization: Bearer $TOKEN" | jq '.[] | .title'

# Health check
echo "4. Health check..."
curl -s $API_URL/system/health | jq '.'

echo "✅ All tests passed!"
```

Run:
```bash
chmod +x test_api.sh
./test_api.sh
```

## Common Workflows

### Complete Task Workflow

```bash
# 1. Create task
TASK=$(curl -s -X POST $API_URL/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test workflow",
    "assignee_type": "role",
    "assignee_role": "operator",
    "due_date": "2026-02-10",
    "category": "general"
  }')

TASK_ID=$(echo $TASK | jq -r '.id')

# 2. Accept
curl -s -X POST $API_URL/tasks/$TASK_ID/accept -H "Authorization: Bearer $TOKEN"

# 3. Start
curl -s -X POST $API_URL/tasks/$TASK_ID/start -H "Authorization: Bearer $TOKEN"

# 4. Add comment
curl -s -X POST $API_URL/tasks/$TASK_ID/comments \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"Done!"}'

# 5. Send for review
curl -s -X POST $API_URL/tasks/$TASK_ID/send-to-review -H "Authorization: Bearer $TOKEN"

# 6. Approve
curl -s -X POST $API_URL/tasks/$TASK_ID/review \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"approved":true}'

echo "✅ Task workflow complete: $TASK_ID"
```

### Daily Production Recording

```bash
# Record day shift
curl -X POST $API_URL/parts/$PART_ID/facts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "stage": "machining",
    "date": "2026-02-05",
    "shift_type": "day",
    "operator_id": "'$OPERATOR_ID'",
    "qty_good": 420,
    "qty_scrap": 5
  }'

# Record night shift
curl -X POST $API_URL/parts/$PART_ID/facts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "stage": "machining",
    "date": "2026-02-05",
    "shift_type": "night",
    "operator_id": "'$OPERATOR_ID'",
    "qty_good": 390,
    "qty_scrap": 8
  }'

# Check progress
curl -s $API_URL/parts/$PART_ID -H "Authorization: Bearer $TOKEN" | jq '.progress'
```

---

**Pro Tips:**
- Use `jq` to format JSON responses
- Save TOKEN in environment variable
- Use `-s` flag for silent mode
- Use `-v` flag for verbose debugging
