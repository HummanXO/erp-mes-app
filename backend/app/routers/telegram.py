"""
Telegram integration routes (requirement B).
- Link token generation for /start flow
- Webhook handler for bot updates
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime, timedelta
import secrets
import hashlib
import hmac
import logging

from ..database import get_db
from ..auth import PermissionChecker, get_current_user
from ..models import User, TelegramLinkToken
from ..config import settings

router = APIRouter(prefix="/telegram", tags=["telegram"])
logger = logging.getLogger(__name__)


class LinkTokenResponse(BaseModel):
    """Response for link token generation."""
    token: str
    bot_url: str
    expires_at: datetime


class WebhookUpdate(BaseModel):
    """Telegram webhook update payload."""
    update_id: int
    message: dict | None = None


@router.post("/link-token", response_model=LinkTokenResponse)
def generate_link_token(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Generate a one-time link token for Telegram /start flow (requirement B).
    
    User flow:
    1. Frontend calls POST /users/me/telegram/link-token
    2. Frontend shows deep link: https://t.me/YOUR_BOT?start=TOKEN
    3. User clicks link, bot receives /start TOKEN
    4. Bot webhook validates token and links chat_id to user
    
    Token TTL: 10 minutes (requirement B).
    """
    # Generate secure random token
    token = secrets.token_urlsafe(32)  # 43 chars base64url
    
    # Expires in 10 minutes (requirement B)
    expires_at = datetime.utcnow() + timedelta(minutes=10)
    
    # Invalidate previous unused tokens for this user (optional cleanup)
    db.query(TelegramLinkToken).filter(
        TelegramLinkToken.user_id == current_user.id,
        TelegramLinkToken.used_at == None
    ).update({"used_at": datetime.utcnow()})
    
    # Create new token
    link_token = TelegramLinkToken(
        user_id=current_user.id,
        token=token,
        expires_at=expires_at
    )
    db.add(link_token)
    db.commit()
    
    bot_username = settings.TELEGRAM_BOT_USERNAME or "YOUR_BOT"
    bot_url = f"https://t.me/{bot_username}?start={token}"
    
    logger.info(f"✅ Generated link token for user {current_user.id}, expires at {expires_at}")
    
    return LinkTokenResponse(
        token=token,
        bot_url=bot_url,
        expires_at=expires_at
    )


@router.post("/webhook")
async def telegram_webhook(
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Telegram bot webhook handler (requirement B).
    
    Handles /start <token> command to link user's Telegram chat_id.
    
    Security:
    - Validates webhook secret token (optional but recommended)
    - Token is one-time use only
    - Token expires after 10 minutes
    
    Must respond 200 quickly (Telegram retries on non-2xx).
    """
    try:
        # Parse webhook payload
        body = await request.json()
        
        # Optional: Validate webhook secret
        if settings.TELEGRAM_WEBHOOK_SECRET:
            [REDACTED]
            if expected_token != settings.TELEGRAM_WEBHOOK_SECRET:
                [REDACTED]
                return {"ok": False, "error": "Invalid secret"}
        
        # Extract message
        message = body.get("message")
        if not message:
            # Not a message update (could be edited_message, callback_query, etc.)
            return {"ok": True}
        
        text = message.get("text", "")
        chat_id = str(message["chat"]["id"])
        
        # Check if it's /start command with token
        if not text.startswith("/start "):
            # Not our command, ignore
            return {"ok": True}
        
        # Extract token from "/start TOKEN"
        parts = text.split(maxsplit=1)
        if len(parts) < 2:
            return {"ok": True}
        
        token = parts[1].strip()
        
        # Validate token (requirement B)
        link_token = db.query(TelegramLinkToken).filter(
            TelegramLinkToken.token == token,
            TelegramLinkToken.used_at == None
        ).first()
        
        if not link_token:
            logger.warning(f"❌ Invalid or already used token: {token[:10]}...")
            return {
                "ok": True,
                "method": "sendMessage",
                "chat_id": chat_id,
                "text": "❌ Неверный или уже использованный токен. Пожалуйста, сгенерируйте новый в приложении."
            }
        
        # Check expiration (requirement B: 10 minutes TTL)
        if link_token.expires_at < datetime.utcnow():
            logger.warning(f"❌ Expired token: {token[:10]}...")
            link_token.used_at = datetime.utcnow()  # Mark as used
            db.commit()
            return {
                "ok": True,
                "method": "sendMessage",
                "chat_id": chat_id,
                "text": "❌ Токен истёк (TTL 10 минут). Пожалуйста, сгенерируйте новый в приложении."
            }
        
        # Link chat_id to user (requirement B)
        user = db.query(User).filter(User.id == link_token.user_id).first()
        if not user:
            logger.error(f"❌ User not found for token: {link_token.user_id}")
            return {"ok": True}
        
        user.telegram_chat_id = chat_id
        link_token.used_at = datetime.utcnow()
        db.commit()
        
        logger.info(f"✅ Linked Telegram chat_id {chat_id} to user {user.id} ({user.name})")
        
        # Send confirmation to user
        return {
            "ok": True,
            "method": "sendMessage",
            "chat_id": chat_id,
            "text": f"✅ Привет, {user.name}!\n\nВаш Telegram успешно привязан. Теперь вы будете получать уведомления о задачах."
        }
    
    except Exception as e:
        logger.error(f"❌ Webhook error: {e}", exc_info=True)
        # Always return 200 to avoid Telegram retries on our bugs
        return {"ok": False, "error": str(e)}


@router.get("/webhook/info")
def webhook_info(
    current_user: User = Depends(PermissionChecker("canManageUsers")),
):
    """Info about webhook configuration for local testing (no secrets)."""
    if settings.ENV.lower() == "production":
        # Do not expose operational details in production.
        raise HTTPException(status_code=404, detail="Not found")

    secret_configured = bool(settings.TELEGRAM_WEBHOOK_SECRET)
    return {
        "bot_username": settings.TELEGRAM_BOT_USERNAME,
        "webhook_url": f"{settings.API_BASE_URL}/api/v1/telegram/webhook",
        "local_testing": "Use ngrok/cloudflare tunnel: ngrok http 8000, then set webhook via Telegram Bot API",
        "webhook_secret_configured": secret_configured,
        "set_webhook_note": (
            "For security, do NOT paste secrets here. If you use a webhook secret, "
            "set it via Telegram setWebhook secret_token and validate X-Telegram-Bot-Api-Secret-Token."
        ),
        "example_payload": {
            "update_id": 123456789,
            "message": {
                "message_id": 1,
                "from": {"id": 123456789, "first_name": "John"},
                "chat": {"id": 123456789, "type": "private"},
                "date": 1234567890,
                "text": "/start abc123def456..."
            }
        }
    }


@router.delete("/unlink")
def unlink_telegram(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Unlink Telegram from current user."""
    current_user.telegram_chat_id = None
    db.commit()
    logger.info(f"✅ Unlinked Telegram for user {current_user.id}")
    return {"ok": True, "message": "Telegram unlinked"}
