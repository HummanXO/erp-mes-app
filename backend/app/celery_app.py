"""
Celery worker with SELECT FOR UPDATE SKIP LOCKED for outbox processing (requirement A).
"""
from celery import Celery
from sqlalchemy import text
from datetime import datetime, timedelta
import requests
import logging
from .config import settings
from .database import SessionLocal
from .models import NotificationOutbox, User

logger = logging.getLogger(__name__)

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


def send_telegram_message(chat_id: str, message: str) -> tuple[bool, str | None]:
    """Send message via Telegram Bot API."""
    if not settings.TELEGRAM_BOT_TOKEN:
        [REDACTED]
    
    url = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage"
    
    try:
        response = requests.post(
            url,
            json={"chat_id": chat_id, "text": message, "parse_mode": "HTML"},
            timeout=10
        )
        
        if response.status_code == 200:
            return True, None
        elif response.status_code == 429:
            # Rate limit - extract retry_after
            data = response.json()
            retry_after = data.get('parameters', {}).get('retry_after', 60)
            return False, f"RATE_LIMIT:{retry_after}"
        elif response.status_code == 403:
            # Bot blocked by user
            return False, "BOT_BLOCKED"
        else:
            return False, f"HTTP_{response.status_code}: {response.text[:200]}"
    
    except Exception as e:
        return False, f"EXCEPTION: {str(e)}"


@celery_app.task(name="process_notification_outbox")
def process_notification_outbox(batch_size: int = 100):
    """
    Process pending notifications using SELECT FOR UPDATE SKIP LOCKED (requirement A).
    
    This ensures concurrent workers don't process the same row.
    """
    db = SessionLocal()
    processed_count = 0
    
    try:
        # SELECT FOR UPDATE SKIP LOCKED - critical for concurrent processing
        query = text("""
            SELECT id 
            FROM notification_outbox
            WHERE status = 'pending'
              AND (next_retry_at IS NULL OR next_retry_at <= NOW())
            ORDER BY created_at
            LIMIT :batch_size
            FOR UPDATE SKIP LOCKED
        """)
        
        result = db.execute(query, {"batch_size": batch_size})
        notification_ids = [row[0] for row in result.fetchall()]
        
        logger.info(f"📨 Locked {len(notification_ids)} notifications for processing")
        
        for notif_id in notification_ids:
            # Fetch full notification
            notification = db.query(NotificationOutbox).filter(
                NotificationOutbox.id == notif_id
            ).first()
            
            if not notification or notification.recipient_chat_id is None:
                # Skip if no chat_id (user hasn't linked Telegram)
                if notification:
                    notification.status = 'skipped'
                    notification.last_error = "No telegram_chat_id"
                continue
            
            # Attempt send
            success, error = send_telegram_message(
                notification.recipient_chat_id,
                notification.message
            )
            
            if success:
                # Success
                notification.status = 'sent'
                notification.sent_at = datetime.utcnow()
                notification.last_error = None
                processed_count += 1
                logger.info(f"✅ Sent notification {notif_id}")
                
            else:
                # Handle errors according to requirement A
                notification.attempts += 1
                notification.last_error = error
                
                if error and error.startswith("RATE_LIMIT:"):
                    # 429 - apply backoff
                    retry_after = int(error.split(":")[1])
                    notification.next_retry_at = datetime.utcnow() + timedelta(seconds=retry_after)
                    logger.warning(f"⏳ Rate limited for {retry_after}s: {notif_id}")
                
                elif error == "BOT_BLOCKED":
                    # 403 - user blocked bot, unlink chat_id
                    notification.status = 'failed'
                    notification.failed_at = datetime.utcnow()
                    
                    # Unlink user's telegram_chat_id (requirement A)
                    user = db.query(User).filter(
                        User.id == notification.recipient_user_id
                    ).first()
                    if user:
                        user.telegram_chat_id = None
                        logger.warning(f"🚫 User {user.id} blocked bot, unlinked chat_id")
                
                elif notification.attempts >= 3:
                    # Max retries reached
                    notification.status = 'failed'
                    notification.failed_at = datetime.utcnow()
                    logger.error(f"❌ Failed after 3 attempts: {notif_id}, error: {error}")
                
                else:
                    # Retry with exponential backoff
                    backoff_seconds = 2 ** notification.attempts * 60  # 2min, 4min, 8min
                    notification.next_retry_at = datetime.utcnow() + timedelta(seconds=backoff_seconds)
                    logger.warning(f"🔄 Retry {notification.attempts}/3 in {backoff_seconds}s: {notif_id}")
        
        db.commit()
        logger.info(f"✅ Processed {processed_count}/{len(notification_ids)} notifications")
        
    except Exception as e:
        db.rollback()
        logger.error(f"❌ Error processing outbox: {e}", exc_info=True)
        raise
    
    finally:
        db.close()
    
    return {"processed": processed_count, "total_locked": len(notification_ids) if 'notification_ids' in locals() else 0}


@celery_app.task(name="create_notification_for_task")
def create_notification_for_task(task_id: str, notification_type: str, target_user_ids: list[str], message: str):
    """
    Create notification outbox entries (1 per recipient, requirement A).
    """
    db = SessionLocal()
    
    try:
        from .models import Task
        task = db.query(Task).filter(Task.id == task_id).first()
        
        for user_id in target_user_ids:
            # Fetch user to get current chat_id
            user = db.query(User).filter(User.id == user_id).first()
            if not user:
                continue
            
            # Generate idempotency key (requirement A)
            idempotency_key = f"{notification_type}:{task_id}:{user_id}"
            
            # Check if already exists
            existing = db.query(NotificationOutbox).filter(
                NotificationOutbox.idempotency_key == idempotency_key
            ).first()
            
            if existing:
                logger.info(f"⏭️ Skipping duplicate notification: {idempotency_key}")
                continue
            
            # Create new notification (1 row per recipient)
            notification = NotificationOutbox(
                org_id=task.org_id if task else None,
                type=notification_type,
                task_id=task_id,
                task_title=task.title if task else None,
                recipient_user_id=user_id,
                recipient_chat_id=user.telegram_chat_id,  # Snapshot at creation time
                message=message,
                idempotency_key=idempotency_key,
                status='pending',
                attempts=0
            )
            db.add(notification)
        
        db.commit()
        logger.info(f"✅ Created {len(target_user_ids)} notification outbox entries for task {task_id}")
        
    except Exception as e:
        db.rollback()
        logger.error(f"❌ Error creating notifications: {e}", exc_info=True)
        raise
    
    finally:
        db.close()


# Schedule periodic processing
celery_app.conf.beat_schedule = {
    'process-outbox-every-30s': {
        'task': 'process_notification_outbox',
        'schedule': 30.0,  # Every 30 seconds
    },
}


if __name__ == "__main__":
    # Test: show SQL with FOR UPDATE SKIP LOCKED
    print("=" * 80)
    print("SQL Query with SELECT FOR UPDATE SKIP LOCKED:")
    print("=" * 80)
    print("""
        SELECT id 
        FROM notification_outbox
        WHERE status = 'pending'
          AND (next_retry_at IS NULL OR next_retry_at <= NOW())
        ORDER BY created_at
        LIMIT 100
        FOR UPDATE SKIP LOCKED
    """)
    print("=" * 80)
    print("\nThis query:")
    print("1. Locks only available rows (SKIP LOCKED)")
    print("2. Other workers skip locked rows automatically")
    print("3. Prevents duplicate processing in concurrent environment")
    print("=" * 80)
