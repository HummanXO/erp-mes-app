# Auth: Temporary Password Onboarding & Reset (No Links)

This project uses **admin-issued temporary passwords only** for onboarding and password reset.

Not supported (by design):
- invite links
- email reset links
- token links

## Feature 1: User Onboarding (Temporary Password Only)

### 1) Admin creates a user
Endpoint (admin only, requires `canManageUsers`):
- `POST /api/v1/auth/admin/users`

Request body:
```json
{
  "username": "jdoe",
  "name": "John Doe",
  "initials": "J.D.",
  "role": "operator",
  "email": "jdoe@example.com"
}
```

Response includes `temporary_password` **only once**.
Security warning: do not store it in logs, tickets, or chat history.

### 2) User logs in with the temporary password
Endpoint:
- `POST /api/v1/auth/login`

The response includes:
- `access_token` (JWT, short-lived)
- `must_change_password: true`

Refresh token handling (production model):
- refresh token is stored **only** in an `HttpOnly + Secure` cookie (not returned in JSON)
- access token is stored **only** in memory on the frontend
- after page reload, the frontend restores the access token via `POST /api/v1/auth/refresh`

### 3) First-login gate (forced password change)
While `must_change_password` is true:
- allowed:
  - `GET /api/v1/auth/me`
  - `POST /api/v1/auth/change-password`
- denied (403) for all other protected endpoints

### 4) User changes password
Endpoint:
- `POST /api/v1/auth/change-password`

Request body:
```json
{
  "old_password": "TEMP_PASSWORD",
  "new_password": "a-long-unique-passphrase"
}
```

Password policy (server-side):
- length: 12..256
- must not match username

On success:
- `must_change_password` becomes false
- `password_changed_at` set
- `token_version` incremented
- old access tokens become invalid (token_version)
- all refresh sessions are revoked and replaced
- a new refresh cookie is issued and a new access token is returned

## Feature 2: "Forgot Password" = Admin Reset (Temporary Password Only)

Endpoint (admin only, requires `canManageUsers`):
- `POST /api/v1/auth/admin/reset-password`

Request body (either `user_id` or `username`):
```json
{ "username": "jdoe" }
```

Behavior:
- generates a new temporary password server-side
- sets `must_change_password = true`
- increments `token_version` (revokes old tokens)
- returns `temporary_password` only once
- revokes all refresh sessions for the user

## Feature 3: Token/Session Invalidation

This project uses a `token_version` strategy:
- JWT access/refresh tokens include claim `ver`
- authenticated requests verify `ver` matches the DB `users.token_version`

Refresh token replay protection:
- refresh tokens include `jti`
- server stores refresh sessions in DB (`refresh_sessions`)
- `POST /api/v1/auth/refresh` rotates refresh tokens (one-time use)
- reuse of a revoked refresh token triggers session revocation and token_version bump

Revocation events (token continuity eliminated):
- password change
- admin password reset
- logout (global logout via `token_version` bump)

## Feature 4: Brute-Force and Password Spraying Protections

Rate limits / lockouts are enforced via Redis:
- `POST /auth/login`: per-IP rate limit + per-username lockout (for existing users)
- `POST /auth/refresh`: per-IP rate limit
- admin reset/create endpoints: per-IP rate limit

Config (backend env vars):
- `AUTH_LOGIN_IP_LIMIT_PER_MINUTE`
- `AUTH_LOGIN_USER_FAIL_THRESHOLD`
- `AUTH_LOGIN_USER_LOCK_SECONDS`
- `AUTH_REFRESH_IP_LIMIT_PER_MINUTE`
- `AUTH_ADMIN_RESET_IP_LIMIT_PER_MINUTE`

Operational note: if Redis is unavailable, auth continues (fail-open), but protections are reduced.

## CSRF Notes (Cookie-Based Refresh)

Because refresh tokens are cookies, `POST /api/v1/auth/refresh` enforces Origin/Referer checks in production.
Configure:
- `ALLOWED_ORIGINS` (CORS)
- `CSRF_TRUSTED_ORIGINS` (CSRF allowlist, defaults to `ALLOWED_ORIGINS`)

## Production Security Warnings

- Ensure HTTPS is enforced at the edge (reverse proxy / load balancer).
- Ensure request/response bodies are not logged for auth endpoints.
- Never persist temporary passwords anywhere. Treat them as secrets.

## Frontend Configuration (Fail Closed)

- In production, `NEXT_PUBLIC_API_BASE_URL` is required. The app refuses to start without backend API auth.
- Demo mode is allowed only in development with `NEXT_PUBLIC_DEMO_MODE=true` and shows a destructive warning banner.
