#!/usr/bin/env python3
"""Alembic bootstrap for create_all-era databases.

If business tables already exist but alembic_version is missing, stamp
the explicit baseline revision before normal upgrades.
"""

from __future__ import annotations

import os
import subprocess

from sqlalchemy import inspect

from app.database import engine


BASELINE_REVISION = os.getenv("ALEMBIC_BASELINE_REVISION", "006a_baseline_createall")
BUSINESS_TABLES = ("organizations", "users", "parts")


def main() -> int:
    inspector = inspect(engine)
    has_alembic_version = inspector.has_table("alembic_version")
    has_business_schema = any(inspector.has_table(table) for table in BUSINESS_TABLES)

    if not has_alembic_version and has_business_schema:
        print(
            "Existing schema detected without alembic_version. "
            f"Stamping baseline: {BASELINE_REVISION}"
        )
        subprocess.run(["alembic", "stamp", BASELINE_REVISION], check=True)
    else:
        print("Alembic bootstrap check: no baseline stamp required")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
