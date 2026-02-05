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
