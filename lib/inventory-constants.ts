import type { MovementType, StockStatus, ToolingCategory, ToolingCondition } from "./inventory-types"

export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  available: "Доступно",
  reserved: "В резерве",
  in_use: "В работе",
}

export const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  receipt: "Приход",
  issue: "Расход",
  transfer: "Перемещение",
  adjustment: "Корректировка",
  inventory: "Инвентаризация",
}

export const TOOLING_CATEGORY_LABELS: Record<ToolingCategory, string> = {
  cutting: "Режущий инструмент",
  machine_tooling: "Станочная оснастка",
}

export const TOOLING_CONDITION_LABELS: Record<ToolingCondition, string> = {
  new: "Новый",
  good: "Хорошее",
  needs_service: "Нуждается в сервисе",
  scrap: "Списано",
}

export const STOCK_STATUS_TONES: Record<StockStatus, "info" | "success" | "warning" | "danger"> = {
  available: "success",
  reserved: "info",
  in_use: "warning",
}

export const CONDITION_TONES: Record<ToolingCondition, "info" | "success" | "warning" | "danger"> = {
  new: "success",
  good: "info",
  needs_service: "warning",
  scrap: "danger",
}

export const MOVEMENT_TONES: Record<MovementType, "info" | "success" | "warning" | "danger"> = {
  receipt: "success",
  issue: "danger",
  transfer: "info",
  adjustment: "warning",
  inventory: "info",
}
