#!/bin/bash

# Create initial migration
echo "Creating initial migration..."
alembic revision --autogenerate -m "initial schema"

echo "✅ Migration created! Now run:"
echo "   alembic upgrade head"
