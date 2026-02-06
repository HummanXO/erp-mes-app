# Deployment Guide - Oracle Cloud

## Текущий статус:
- ✅ Backend API работает: http://152.67.72.212/api/v1/
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
# http://152.67.72.212/
```

## Логин:
- **admin** / admin123
- **kolchin** / kolchin123 (Master)
- **petrov** / petrov123 (Operator)
- **sidorov** / sidorov123 (Supply)

## Проверка работы:
- Главная: http://152.67.72.212/
- API Docs: http://152.67.72.212/docs
- API: http://152.67.72.212/api/v1/

## Если фронтенд не запускается:
```bash
# Проверьте логи
docker-compose -f docker-compose.prod.yml logs frontend --tail 50

# Проверьте переменные окружения
docker-compose -f docker-compose.prod.yml exec frontend env | grep VITE
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
