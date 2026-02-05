"""Celery application for background tasks."""
from celery import Celery
from .config import settings

celery_app = Celery(
    "erp_mes",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND
)

celery_app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
)


@celery_app.task(name="send_telegram_notification")
def send_telegram_notification(chat_id: str, message: str):
    """Send Telegram notification."""
    # TODO: Implement Telegram bot integration
    print(f"📱 Telegram notification to {chat_id}: {message}")
    return {"status": "sent", "chat_id": chat_id}


@celery_app.task(name="process_notification_outbox")
def process_notification_outbox():
    """Process pending notifications from outbox."""
    from .database import SessionLocal
    from .models import NotificationOutbox, User
    from datetime import datetime
    
    db = SessionLocal()
    try:
        # Get pending notifications
        notifications = db.query(NotificationOutbox).filter(
            NotificationOutbox.status == 'pending',
            NotificationOutbox.retries < 3
        ).limit(100).all()
        
        for notification in notifications:
            try:
                # Get target users
                users = db.query(User).filter(
                    User.id.in_(notification.target_user_ids)
                ).all()
                
                # Send to each user with telegram_chat_id
                for user in users:
                    if user.telegram_chat_id:
                        send_telegram_notification.delay(
                            user.telegram_chat_id,
                            notification.message
                        )
                
                # Mark as sent
                notification.status = 'sent'
                notification.sent_at = datetime.utcnow()
                
            except Exception as e:
                print(f"Failed to send notification {notification.id}: {e}")
                notification.retries += 1
                if notification.retries >= 3:
                    notification.status = 'failed'
        
        db.commit()
        
    finally:
        db.close()


# Schedule periodic tasks
celery_app.conf.beat_schedule = {
    'process-notifications-every-minute': {
        'task': 'process_notification_outbox',
        'schedule': 60.0,  # Every 60 seconds
    },
}
