"""Inventory API vertical slice endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import PermissionChecker, get_current_user, get_role_ui_permissions
from ..database import get_db
from ..models import User
from ..schemas import (
    ApiCapabilitiesResponse,
    InventoryMetalOut,
    InventoryMovementCreate,
    InventoryMovementOut,
)
from ..use_cases.inventory_slice import (
    create_inventory_movement_use_case,
    list_inventory_metal_use_case,
    list_inventory_movements_use_case,
)
from .movements import MOVEMENT_USE_CASE_HOOKS

router = APIRouter(tags=["inventory"])


def _ensure_inventory_view_access(current_user: User) -> None:
    permissions = get_role_ui_permissions(current_user.role)
    if not permissions.get("canViewInventory", False):
        raise HTTPException(status_code=403, detail="Access denied")


@router.get("/inventory/capabilities", response_model=ApiCapabilitiesResponse)
def get_inventory_capabilities(
    current_user: User = Depends(get_current_user),
):
    # Explicit backend signal for frontend runtime capabilities in API mode.
    _ensure_inventory_view_access(current_user)
    return ApiCapabilitiesResponse(
        inventory=True,
        workOrders=False,
    )


@router.get("/inventory/metal", response_model=list[InventoryMetalOut])
def get_inventory_metal(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_inventory_view_access(current_user)
    return list_inventory_metal_use_case(db=db, current_user=current_user)


@router.get("/inventory/movements", response_model=list[InventoryMovementOut])
def get_inventory_movements(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_inventory_view_access(current_user)
    return list_inventory_movements_use_case(db=db, current_user=current_user)


@router.post(
    "/inventory/movements",
    response_model=InventoryMovementOut,
    dependencies=[Depends(PermissionChecker("canManageLogistics"))],
)
def create_inventory_movement(
    payload: InventoryMovementCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_inventory_view_access(current_user)
    return create_inventory_movement_use_case(
        db=db,
        current_user=current_user,
        payload=payload,
        hooks=MOVEMENT_USE_CASE_HOOKS,
    )
