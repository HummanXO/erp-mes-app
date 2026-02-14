"use client"

import { useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useApp } from "@/lib/app-context"
import type { InventoryMetalItem, InventoryMovement, InventoryToolingItem, InventoryItemType, MovementType } from "@/lib/inventory-types"
import { MOVEMENT_TYPE_LABELS } from "@/lib/inventory-constants"
import { formatQty } from "@/lib/inventory-utils"

interface MovementDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultType?: MovementType
  item?: InventoryMetalItem | InventoryToolingItem | null
  items?: {
    metal: InventoryMetalItem[]
    tooling: InventoryToolingItem[]
  }
  onCreated?: (movement: InventoryMovement) => void
}

function isMetal(item: InventoryMetalItem | InventoryToolingItem | null | undefined): item is InventoryMetalItem {
  return !!item && "material_grade" in item
}

export function MovementDialog({
  open,
  onOpenChange,
  defaultType,
  item,
  items,
  onCreated,
}: MovementDialogProps) {
  const { currentUser, createInventoryMovement, permissions } = useApp()
  const fixedType = Boolean(defaultType)
  const [movementType, setMovementType] = useState<MovementType>(defaultType ?? "receipt")
  const [itemType, setItemType] = useState<InventoryItemType>(item ? (isMetal(item) ? "metal" : "tooling") : "metal")
  const [itemId, setItemId] = useState<string>(item?.id ?? items?.metal?.[0]?.id ?? "")
  const [qtyPcs, setQtyPcs] = useState("")
  const [qtyKg, setQtyKg] = useState("")
  const [fromLocation, setFromLocation] = useState("")
  const [toLocation, setToLocation] = useState("")
  const [reason, setReason] = useState("")
  const [linkToTask, setLinkToTask] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const currentItem = useMemo(() => {
    if (item) return item
    if (!items) return null
    return itemType === "metal"
      ? items.metal.find((it) => it.id === itemId) ?? null
      : items.tooling.find((it) => it.id === itemId) ?? null
  }, [item, itemId, itemType, items])

  useEffect(() => {
    if (!open) return
    setError(null)
    setMovementType(defaultType ?? "receipt")
    const resolvedItemType = item ? (isMetal(item) ? "metal" : "tooling") : itemType
    setItemType(resolvedItemType)
    const defaultItemId = item?.id ?? (resolvedItemType === "metal" ? items?.metal?.[0]?.id : items?.tooling?.[0]?.id) ?? ""
    setItemId(defaultItemId)
    setQtyPcs("")
    setQtyKg("")
    const location = currentItem ? currentItem.location : ""
    if (defaultType === "receipt") {
      setFromLocation("Поставщик")
      setToLocation(location)
    } else if (defaultType === "issue") {
      setFromLocation(location)
      setToLocation("Производство")
    } else if (defaultType === "transfer") {
      setFromLocation(location)
      setToLocation("")
    } else {
      setFromLocation(location)
      setToLocation(location)
    }
    setReason("")
    setLinkToTask("")
  }, [open, defaultType, item, items, currentItem, itemType])

  useEffect(() => {
    if (item || !items) return
    const nextId = itemType === "metal" ? items.metal[0]?.id : items.tooling[0]?.id
    if (nextId) {
      setItemId(nextId)
    }
  }, [itemType, items, item])

  useEffect(() => {
    if (!open || !currentItem) return
    const location = currentItem.location
    if (movementType === "receipt") {
      setFromLocation("Поставщик")
      setToLocation(location)
    } else if (movementType === "issue") {
      setFromLocation(location)
      setToLocation("Производство")
    } else if (movementType === "transfer") {
      setFromLocation(location)
      setToLocation("")
    } else {
      setFromLocation(location)
      setToLocation(location)
    }
  }, [movementType, currentItem, open])

  const handleSubmit = async () => {
    setError(null)
    if (!permissions.canManageInventory) {
      setError("Недостаточно прав для создания движения")
      return
    }
    if (!currentItem) {
      setError("Выберите позицию")
      return
    }
    const pcs = qtyPcs ? Number(qtyPcs) : undefined
    const kg = qtyKg ? Number(qtyKg) : undefined
    if ((pcs === undefined || Number.isNaN(pcs)) && (kg === undefined || Number.isNaN(kg))) {
      setError("Укажите количество")
      return
    }

    const movement: Omit<InventoryMovement, "id"> = {
      type: movementType,
      datetime: new Date().toISOString(),
      item_ref: {
        type: isMetal(currentItem) ? "metal" : "tooling",
        id: currentItem.id,
        label: isMetal(currentItem)
          ? `${currentItem.material_grade} ${currentItem.size}`
          : `${currentItem.name}${currentItem.params ? ` ${currentItem.params}` : ""}`,
      },
      qty: {
        pcs,
        kg,
      },
      from_location: fromLocation || undefined,
      to_location: toLocation || undefined,
      reason: reason || undefined,
      user_id: currentUser?.id ?? "system",
      link_to_task: linkToTask || undefined,
    }

    try {
      setIsSubmitting(true)
      const created = await createInventoryMovement(movement)
      onCreated?.(created)
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось создать движение")
    } finally {
      setIsSubmitting(false)
    }
  }

  const isMetalItem = isMetal(currentItem)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Новое движение</DialogTitle>
          <DialogDescription>
            {currentItem
              ? `Позиция: ${isMetalItem ? `${currentItem.material_grade} ${currentItem.size}` : currentItem.name}`
              : "Выберите позицию и заполните параметры"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
	          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Тип движения</Label>
              <Select
                value={movementType}
                onValueChange={(value) => setMovementType(value as MovementType)}
                disabled={fixedType}
              >
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(MOVEMENT_TYPE_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!item && (
              <div className="space-y-2">
                <Label>Тип позиции</Label>
              <Select value={itemType} onValueChange={(value) => setItemType(value as InventoryItemType)}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="metal">Металл</SelectItem>
                    <SelectItem value="tooling">Оснастка</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {!item && (
            <div className="space-y-2">
              <Label>Позиция</Label>
              <Select value={itemId} onValueChange={setItemId}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Выберите позицию" />
                </SelectTrigger>
                <SelectContent>
                  {(itemType === "metal" ? items?.metal : items?.tooling)?.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {"material_grade" in option
                        ? `${option.material_grade} ${option.size} (${formatQty(option.qty)})`
                        : `${option.name}${option.params ? ` ${option.params}` : ""} (${option.qty} шт)`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

	          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Количество (шт)</Label>
              <Input
                type="number"
                inputMode="decimal"
                placeholder="0"
                value={qtyPcs}
                onChange={(e) => setQtyPcs(e.target.value)}
                className="h-11"
              />
            </div>
            {isMetalItem && (
              <div className="space-y-2">
                <Label>Количество (кг)</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder="0"
                  value={qtyKg}
                  onChange={(e) => setQtyKg(e.target.value)}
                  className="h-11"
                />
              </div>
            )}
          </div>

	          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Откуда</Label>
              <Input
                placeholder="Локация/поставщик"
                value={fromLocation}
                onChange={(e) => setFromLocation(e.target.value)}
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label>Куда</Label>
              <Input
                placeholder="Локация/получатель"
                value={toLocation}
                onChange={(e) => setToLocation(e.target.value)}
                className="h-11"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Причина</Label>
            <Textarea
              placeholder="Комментарий или причина"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Ссылка на задачу (опционально)</Label>
            <Input
              placeholder="ID задачи"
              value={linkToTask}
              onChange={(e) => setLinkToTask(e.target.value)}
              className="h-11"
            />
          </div>

          {error && (
            <div className="rounded-md border border-[color:var(--status-danger-border)] bg-[color:var(--status-danger-bg)] px-3 py-2 text-sm text-[color:var(--status-danger-fg)]">
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button className="h-11" onClick={handleSubmit} disabled={isSubmitting || !permissions.canManageInventory}>
            Создать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
