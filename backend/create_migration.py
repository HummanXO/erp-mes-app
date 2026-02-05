"""
Script to create initial Alembic migration.
Run this after setting up the database.
"""
import subprocess
import sys

def main():
    print("Creating initial database migration...")
    print("=" * 60)
    
    # Create migration
    result = subprocess.run(
        ["alembic", "revision", "--autogenerate", "-m", "initial_schema"],
        capture_output=True,
        text=True
    )
    
    if result.returncode != 0:
        print("❌ Error creating migration:")
        print(result.stderr)
        sys.exit(1)
    
    print(result.stdout)
    print("=" * 60)
    print("✅ Migration created successfully!")
    print("\nNext steps:")
    print("1. Review the generated migration in alembic/versions/")
    print("2. Run: alembic upgrade head")
    print("3. Run: python seed_data.py")

if __name__ == "__main__":
    main()
