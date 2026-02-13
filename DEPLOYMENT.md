# Deployment Guide - Oracle Cloud

## Текущий статус:
- ✅ Backend API работает: `https://docalliance.info/api/v1/` (HTTP должен редиректить на HTTPS)
- ✅ База данных PostgreSQL с тестовыми данными
- ✅ Redis + Celery worker для уведомлений
- ✅ Nginx настроен

## Команды для деплоя фронтенда:

```bash
# 1. На сервере: обновите код
cd ~/erp-mes-app
git pull origin main

# 2. Обновите Nginx конфиг
sudo cp nginx.conf /etc/nginx/sites-available/erp-mes
sudo systemctl reload nginx

# 3. Запустите фронтенд (займёт 5-7 минут на сборку)
docker-compose -f docker-compose.prod.yml up -d --build frontend

# 4. Проверьте статус
docker-compose -f docker-compose.prod.yml ps

# 5. Следите за логами сборки
docker-compose -f docker-compose.prod.yml logs frontend -f

# После успешной сборки откройте в браузере:
# https://docalliance.info/
```

## Аутентификация (prod)

В продакшене не храните пароли в документации/тикетах/чатах.

Система онбординга и сброса пароля реализована **только** через временный пароль (temporary password),
который выдаёт администратор, после чего пользователь обязан сразу сменить пароль при первом входе.

См. документ: `docs/auth-temp-password.md`.

## HTTPS / Cookies / Proxy (обязательно)

Система аутентификации использует:
- `refresh` токен только в `HttpOnly + Secure` cookie
- `access` токен только в памяти (восстанавливается через `POST /api/v1/auth/refresh`)

Это требует корректного HTTPS на edge (nginx / LB) и корректных proxy headers.

### Nginx

Файл `nginx.conf` настроен на:
- редирект `80 -> 443`
- HSTS
- передачу `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto=https`
- без публичного `/uploads` (файлы обслуживаются только через `/api/v1/attachments/serve/{filename}` с authz)

Перед включением HTTPS убедитесь, что сертификаты существуют:
- `/etc/nginx/ssl/fullchain.pem`
- `/etc/nginx/ssl/privkey.pem`

### Backend env (prod)

Минимально необходимое:
- `ENV=production`
- `AUTH_REFRESH_COOKIE_SECURE=true`
- `TRUST_PROXY_HEADERS=true` (если backend за nginx)
- `ALLOWED_ORIGINS=https://docalliance.info` (явный origin, без `*`, только `scheme://host[:port]`)
- `CSRF_TRUSTED_ORIGINS=https://docalliance.info` (если отличается от `ALLOWED_ORIGINS`)

Важно: значение origin должно совпадать 1-в-1 с заголовком браузера `Origin`.
Частая ошибка: сайт открыт как `https://www.docalliance.info`, а в allowlist указан только `https://docalliance.info`.
В этом случае login/refresh/logout/change-password будут получать `403 {"detail":"CSRF origin denied"}`.

Пример для двух возможных доменов (если реально используете оба):
- `ALLOWED_ORIGINS=https://docalliance.info,https://www.docalliance.info`
- `CSRF_TRUSTED_ORIGINS=https://docalliance.info,https://www.docalliance.info`

## Проверка работы:
- Главная: https://docalliance.info/
- API Docs: https://docalliance.info/docs
- API: https://docalliance.info/api/v1/

## Если фронтенд не запускается:
```bash
# Проверьте логи
docker-compose -f docker-compose.prod.yml logs frontend --tail 50

# Проверьте переменные окружения (Next.js)
docker-compose -f docker-compose.prod.yml exec frontend env | grep NEXT_PUBLIC
```

## Автодеплой через GitHub Actions (Oracle)

Добавлены файлы:
- `.github/workflows/deploy-oracle.yml`
- `scripts/deploy-prod.sh`

Что делает пайплайн:
1. Триггер на `push` в `main` (или вручную через `workflow_dispatch`)
2. SSH на Oracle
3. `git pull --ff-only`
4. `docker compose -f docker-compose.prod.yml build --pull frontend`
5. `docker compose -f docker-compose.prod.yml up -d frontend`

### 1) Подготовка сервера (один раз)

```bash
# На Oracle под пользователем деплоя
mkdir -p ~/.ssh
chmod 700 ~/.ssh
touch ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

Убедитесь, что проект лежит по пути (пример): `/opt/metrics-bug-analysis`

### 2) GitHub Secrets (Settings -> Secrets and variables -> Actions)

- `ORACLE_HOST` = IP/домен сервера
- `ORACLE_USER` = SSH user (например `ubuntu`)
- `ORACLE_SSH_KEY` = приватный ключ (весь `-----BEGIN ...`)
- `ORACLE_APP_DIR` = полный путь к репозиторию на сервере (например `/opt/metrics-bug-analysis`)

### 3) Первый запуск

```bash
git add .github/workflows/deploy-oracle.yml scripts/deploy-prod.sh DEPLOYMENT.md
git commit -m "ci: add oracle ssh deploy workflow"
git push origin main
```

После пуша откройте Actions -> `Deploy To Oracle` и проверьте лог шага `Deploy over SSH`.
