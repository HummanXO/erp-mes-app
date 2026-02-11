"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useApp } from "@/lib/app-context"
import type { InventoryToolingItem, StockStatus, ToolingCategory, ToolingCondition } from "@/lib/inventory-types"
import { STOCK_STATUS_LABELS, TOOLING_CATEGORY_LABELS, TOOLING_CONDITION_LABELS } from "@/lib/inventory-constants"

interface ToolingItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item?: InventoryToolingItem | null
}

export function ToolingItemDialog({ open, onOpenChange, item }: ToolingItemDialogProps) {
  const { createInventoryTooling, updateInventoryTooling, permissions } = useApp()
  const isEdit = Boolean(item)

  const [category, setCategory] = useState<ToolingCategory>("cutting")
  const [name, setName] = useState("")
  const [params, setParams] = useState("")
  const [compatibleMachines, setCompatibleMachines] = useState("")
  const [qty, setQty] = useState("")
  const [location, setLocation] = useState("")
  const [condition, setCondition] = useState<ToolingCondition>("good")
  const [minLevel, setMinLevel] = useState("")
  const [status, setStatus] = useState<StockStatus>("available")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setError(null)
    setCategory(item?.category ?? "cutting")
    setName(item?.name ?? "")
    setParams(item?.params ?? "")
    setCompatibleMachines(item?.compatible_machines?.join(", ") ?? "")
    setQty(item?.qty !== undefined ? String(item.qty) : "")
    setLocation(item?.location ?? "")
    setCondition(item?.condition ?? "good")
    setMinLevel(item?.min_level !== undefined ? String(item.min_level) : "")
    setStatus(item?.status ?? "available")
  }, [open, item])

  const handleSubmit = async () => {
    setError(null)
    if (!permissions.canManageInventory) {
      setError("Недостаточно прав для изменения склада")
      return
    }
    if (!name.trim() || !location.trim() || !qty.trim()) {
      setError("Заполните обязательные поля")
      return
    }

    const qtyValue = Number(qty)
    if (Number.isNaN(qtyValue) || qtyValue < 0) {
      setError("Количество должно быть 0 или больше")
      return
    }

    const minValue = minLevel ? Number(minLevel) : undefined

    const payload = {
      category,
      name: name.trim(),
      params: params.trim() || undefined,
      compatible_machines: compatibleMachines
        .split(",")
        .map((machine) => machine.trim())
        .filter(Boolean),
      qty: qtyValue,
      location: location.trim(),
      condition,
      min_level: minValue !== undefined && !Number.isNaN(minValue) ? minValue : undefined,
      status,
    }

    try {
      setIsSubmitting(true)
      if (item) {
        await updateInventoryTooling({
          ...item,
          ...payload,
        })
      } else {
        await createInventoryTooling(payload)
      }
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить позицию")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Редактировать оснастку" : "Новая позиция оснастки"}</DialogTitle>
          <DialogDescription>Добавьте инструмент или станочную оснастку.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Категория</Label>
              <Select value={category} onValueChange={(value) => setCategory(value as ToolingCategory)}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TOOLING_CATEGORY_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Состояние</Label>
              <Select value={condition} onValueChange={(value) => setCondition(value as ToolingCondition)}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TOOLING_CONDITION_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Название *</Label>
              <Input className="h-11" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Параметры</Label>
              <Input className="h-11" value={params} onChange={(e) => setParams(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Совместимые станки</Label>
            <Input
              className="h-11"
              placeholder="Tsugami S205A, NextTurn SA12B"
              value={compatibleMachines}
              onChange={(e) => setCompatibleMachines(e.target.value)}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Количество *</Label>
              <Input className="h-11" type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Мин. остаток</Label>
              <Input className="h-11" type="number" value={minLevel} onChange={(e) => setMinLevel(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Статус</Label>
              <Select value={status} onValueChange={(value) => setStatus(value as StockStatus)}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STOCK_STATUS_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Локация *</Label>
            <Input className="h-11" value={location} onChange={(e) => setLocation(e.target.value)} />
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
            {isEdit ? "Сохранить" : "Создать"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
