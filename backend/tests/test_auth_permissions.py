from __future__ import annotations

import pytest

from app.auth import ROLE_PERMISSIONS, UI_PERMISSION_KEYS, get_role_ui_permissions


@pytest.mark.parametrize(
    ("role", "expected"),
    [
        (
            "admin",
            {
                "canViewCooperation": True,
                "canEditFacts": True,
                "canRollbackFacts": True,
                "canCreateTasks": True,
                "canManageUsers": True,
                "canCreateParts": True,
                "canCreateOwnParts": True,
                "canCreateCoopParts": True,
                "canEditParts": True,
                "canViewInventory": True,
                "canManageInventory": True,
                "canViewSpecifications": True,
                "canManageSpecifications": True,
                "canGrantSpecificationAccess": True,
                "canViewAudit": True,
            },
        ),
        (
            "director",
            {
                "canViewCooperation": True,
                "canEditFacts": True,
                "canRollbackFacts": True,
                "canCreateTasks": True,
                "canManageUsers": False,
                "canCreateParts": True,
                "canCreateOwnParts": True,
                "canCreateCoopParts": True,
                "canEditParts": True,
                "canViewInventory": True,
                "canManageInventory": True,
                "canViewSpecifications": True,
                "canManageSpecifications": True,
                "canGrantSpecificationAccess": True,
                "canViewAudit": True,
            },
        ),
        (
            "chief_engineer",
            {
                "canViewCooperation": True,
                "canEditFacts": False,
                "canRollbackFacts": False,
                "canCreateTasks": True,
                "canManageUsers": False,
                "canCreateParts": True,
                "canCreateOwnParts": True,
                "canCreateCoopParts": True,
                "canEditParts": True,
                "canViewInventory": True,
                "canManageInventory": False,
                "canViewSpecifications": True,
                "canManageSpecifications": False,
                "canGrantSpecificationAccess": False,
                "canViewAudit": True,
            },
        ),
        (
            "shop_head",
            {
                "canViewCooperation": True,
                "canEditFacts": True,
                "canRollbackFacts": True,
                "canCreateTasks": True,
                "canManageUsers": False,
                "canCreateParts": True,
                "canCreateOwnParts": True,
                "canCreateCoopParts": True,
                "canEditParts": True,
                "canViewInventory": True,
                "canManageInventory": True,
                "canViewSpecifications": True,
                "canManageSpecifications": True,
                "canGrantSpecificationAccess": True,
                "canViewAudit": True,
            },
        ),
        (
            "supply",
            {
                "canViewCooperation": True,
                "canEditFacts": False,
                "canRollbackFacts": False,
                "canCreateTasks": True,
                "canManageUsers": False,
                "canCreateParts": True,
                "canCreateOwnParts": False,
                "canCreateCoopParts": True,
                "canEditParts": True,
                "canViewInventory": True,
                "canManageInventory": True,
                "canViewSpecifications": True,
                "canManageSpecifications": False,
                "canGrantSpecificationAccess": False,
                "canViewAudit": True,
            },
        ),
        (
            "master",
            {
                "canViewCooperation": False,
                "canEditFacts": True,
                "canRollbackFacts": True,
                "canCreateTasks": True,
                "canManageUsers": False,
                "canCreateParts": True,
                "canCreateOwnParts": True,
                "canCreateCoopParts": False,
                "canEditParts": True,
                "canViewInventory": True,
                "canManageInventory": False,
                "canViewSpecifications": True,
                "canManageSpecifications": False,
                "canGrantSpecificationAccess": True,
                "canViewAudit": True,
            },
        ),
        (
            "operator",
            {
                "canViewCooperation": False,
                "canEditFacts": True,
                "canRollbackFacts": False,
                "canCreateTasks": False,
                "canManageUsers": False,
                "canCreateParts": False,
                "canCreateOwnParts": False,
                "canCreateCoopParts": False,
                "canEditParts": False,
                "canViewInventory": False,
                "canManageInventory": False,
                "canViewSpecifications": True,
                "canManageSpecifications": False,
                "canGrantSpecificationAccess": False,
                "canViewAudit": False,
            },
        ),
    ],
)
def test_role_ui_permissions_matrix_is_stable(role: str, expected: dict[str, bool]) -> None:
    assert get_role_ui_permissions(role) == expected


def test_role_ui_permissions_has_exact_ui_keyset_for_each_role() -> None:
    expected_keys = set(UI_PERMISSION_KEYS)
    for role in ROLE_PERMISSIONS:
        assert set(get_role_ui_permissions(role).keys()) == expected_keys


def test_unknown_role_denies_all_ui_permissions() -> None:
    permissions = get_role_ui_permissions("unknown-role")
    assert set(permissions.keys()) == set(UI_PERMISSION_KEYS)
    assert all(value is False for value in permissions.values())
