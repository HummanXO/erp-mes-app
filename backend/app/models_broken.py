"""Add TelegramLinkToken model after User model."""

# Add after User class, before Machine class

class TelegramLinkToken(Base):
    """Telegram link token for /start flow."""
    __tablename__ = "telegram_link_tokens"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    token = Column(String(64), unique=True, nullable=False, index=True)  # Random secure token
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    user = relationship("User")
    
    __table_args__ = (
        Index('idx_telegram_tokens_valid', 'token', 'expires_at', postgresql_where=(used_at == None)),
    )
