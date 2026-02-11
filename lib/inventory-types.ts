export type InventoryItemType = "metal" | "tooling"
export type StockStatus = "available" | "reserved" | "in_use"
export type MovementType = "receipt" | "issue" | "transfer" | "adjustment" | "inventory"
export type ToolingCategory = "cutting" | "machine_tooling"
export type ToolingCondition = "new" | "good" | "needs_service" | "scrap"

export interface Qty {
  pcs?: number
  kg?: number
}

export interface InventoryItemRef {
  type: InventoryItemType
  id: string
  label?: string
}

export interface InventoryMetalItem {
  id: string
  material_grade: string
  shape: string
  size: string
  length: number
  qty: Qty
  location: string
  status: StockStatus
  min_level?: Qty
  lot?: string
  supplier?: string
  certificate_ref?: string
  reserved_qty?: Qty
  in_use_qty?: Qty
  created_at?: string
  updated_at?: string
}

export interface InventoryToolingItem {
  id: string
  category: ToolingCategory
  name: string
  params?: string
  compatible_machines?: string[]
  qty: number
  location: string
  condition: ToolingCondition
  min_level?: number
  status?: StockStatus
  created_at?: string
  updated_at?: string
}

export interface InventoryMovement {
  id: string
  type: MovementType
  datetime: string
  item_ref: InventoryItemRef
  qty: Qty
  from_location?: string
  to_location?: string
  reason?: string
  user_id: string
  link_to_task?: string
}
