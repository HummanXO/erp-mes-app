"""Application configuration."""
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings."""
    
    # App
    APP_NAME: str = "ERP_MES_Production"
    ENV: str = "development"
    DEBUG: bool = True
    SECRET_KEY: [REDACTED]
    ALLOWED_ORIGINS: str = "http://localhost:3000,http://localhost:5173"
    
    # Database
    DATABASE_URL: str
    DATABASE_POOL_SIZE: int = 20
    DATABASE_MAX_OVERFLOW: int = 10
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # Proxy / client IP handling
    # Only trust X-Forwarded-* headers when running behind a trusted reverse proxy (e.g. nginx).
    TRUST_PROXY_HEADERS: bool = False
    
    # Celery
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"
    
    # JWT
    JWT_SECRET_KEY: [REDACTED]
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    JWT_LEEWAY_SECONDS: int = 30  # clock skew tolerance for exp validation

    # Password policy / onboarding
    PASSWORD_MIN_LENGTH: int = 12
    PASSWORD_MAX_LENGTH: int = 256
    TEMP_PASSWORD_LENGTH: int = 20

    # Auth hardening (rate limits / lockouts)
    # NOTE: These are enforced in the API layer using Redis.
    AUTH_LOGIN_IP_LIMIT_PER_MINUTE: int = 5
    AUTH_LOGIN_USER_FAIL_THRESHOLD: int = 5
    AUTH_LOGIN_USER_LOCK_SECONDS: int = 15 * 60  # 15 minutes
    AUTH_REFRESH_IP_LIMIT_PER_MINUTE: int = 30
    AUTH_ADMIN_RESET_IP_LIMIT_PER_MINUTE: int = 10

    # Refresh rotation hardening: tolerate benign duplicate refresh requests (multi-tab / retries)
    # shortly after a rotation, before treating it as replay/theft.
    AUTH_REFRESH_REUSE_GRACE_SECONDS: int = 10

    # Auth cookies (refresh token)
    AUTH_REFRESH_COOKIE_NAME: str = "refresh_token"
    # Keep cookie as narrow as possible; this endpoint is the only one that needs it.
    AUTH_REFRESH_COOKIE_PATH: str = "/api/v1/auth/refresh"
    AUTH_REFRESH_COOKIE_SAMESITE: str = "lax"  # "lax" or "strict"
    # In production this MUST be True (requires HTTPS). In dev you may set False for localhost HTTP.
    AUTH_REFRESH_COOKIE_SECURE: bool = False
    # CSRF origin allowlist (comma-separated). Defaults to ALLOWED_ORIGINS if unset.
    CSRF_TRUSTED_ORIGINS: str | None = None
    
    # File Upload
    UPLOAD_DIR: str = "./uploads"
    MAX_UPLOAD_SIZE: int = 10485760  # 10MB
    ALLOWED_EXTENSIONS: str = "jpg,jpeg,png,pdf,doc,docx,xls,xlsx"
    
    # Telegram (requirement B)
    TELEGRAM_BOT_TOKEN: [REDACTED]
    TELEGRAM_BOT_USERNAME: str | None = None
    TELEGRAM_WEBHOOK_SECRET: [REDACTED]
    API_BASE_URL: str = "http://localhost:8000"
    
    # Shift Times
    DAY_SHIFT_START: str = "09:00"
    DAY_SHIFT_END: str = "21:00"
    
    class Config:
        env_file = ".env"
        case_sensitive = True
    
    @property
    def cors_origins(self) -> list[str]:
        """Get CORS origins as list."""
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",")]
    
    @property
    def allowed_extensions_list(self) -> list[str]:
        """Get allowed extensions as list."""
        return [ext.strip() for ext in self.ALLOWED_EXTENSIONS.split(",")]


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


settings = get_settings()
