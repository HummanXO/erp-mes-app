"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useApp } from "@/lib/app-context"
import type { InventoryMetalItem, StockStatus } from "@/lib/inventory-types"
import { STOCK_STATUS_LABELS } from "@/lib/inventory-constants"

interface MetalItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item?: InventoryMetalItem | null
}

export function MetalItemDialog({ open, onOpenChange, item }: MetalItemDialogProps) {
  const { createInventoryMetal, updateInventoryMetal } = useApp()
  const isEdit = Boolean(item)

  const [materialGrade, setMaterialGrade] = useState("")
  const [shape, setShape] = useState("")
  const [size, setSize] = useState("")
  const [length, setLength] = useState("")
  const [qtyPcs, setQtyPcs] = useState("")
  const [qtyKg, setQtyKg] = useState("")
  const [location, setLocation] = useState("")
  const [status, setStatus] = useState<StockStatus>("available")
  const [minPcs, setMinPcs] = useState("")
  const [minKg, setMinKg] = useState("")
  const [lot, setLot] = useState("")
  const [supplier, setSupplier] = useState("")
  const [certificateRef, setCertificateRef] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setError(null)
    setMaterialGrade(item?.material_grade ?? "")
    setShape(item?.shape ?? "")
    setSize(item?.size ?? "")
    setLength(item?.length ? String(item.length) : "")
    setQtyPcs(item?.qty.pcs !== undefined ? String(item.qty.pcs) : "")
    setQtyKg(item?.qty.kg !== undefined ? String(item.qty.kg) : "")
    setLocation(item?.location ?? "")
    setStatus(item?.status ?? "available")
    setMinPcs(item?.min_level?.pcs !== undefined ? String(item.min_level.pcs) : "")
    setMinKg(item?.min_level?.kg !== undefined ? String(item.min_level.kg) : "")
    setLot(item?.lot ?? "")
    setSupplier(item?.supplier ?? "")
    setCertificateRef(item?.certificate_ref ?? "")
  }, [open, item])

  const handleSubmit = async () => {
    setError(null)
    if (!materialGrade.trim() || !shape.trim() || !size.trim() || !length.trim() || !location.trim()) {
      setError("Заполните обязательные поля")
      return
    }

    const lengthValue = Number(length)
    if (Number.isNaN(lengthValue) || lengthValue <= 0) {
      setError("Длина должна быть больше 0")
      return
    }

    const pcs = qtyPcs ? Number(qtyPcs) : undefined
    const kg = qtyKg ? Number(qtyKg) : undefined
    if ((pcs === undefined || Number.isNaN(pcs)) && (kg === undefined || Number.isNaN(kg))) {
      setError("Укажите количество")
      return
    }

    const minPcsVal = minPcs ? Number(minPcs) : undefined
    const minKgVal = minKg ? Number(minKg) : undefined

    const payload = {
      material_grade: materialGrade.trim(),
      shape: shape.trim(),
      size: size.trim(),
      length: lengthValue,
      qty: {
        pcs: pcs !== undefined && !Number.isNaN(pcs) ? pcs : undefined,
        kg: kg !== undefined && !Number.isNaN(kg) ? kg : undefined,
      },
      location: location.trim(),
      status,
      min_level: (minPcsVal !== undefined && !Number.isNaN(minPcsVal)) || (minKgVal !== undefined && !Number.isNaN(minKgVal))
        ? {
            pcs: minPcsVal,
            kg: minKgVal,
          }
        : undefined,
      lot: lot.trim() || undefined,
      supplier: supplier.trim() || undefined,
      certificate_ref: certificateRef.trim() || undefined,
    }

    try {
      setIsSubmitting(true)
      if (item) {
        await updateInventoryMetal({
          ...item,
          ...payload,
        })
      } else {
        await createInventoryMetal(payload)
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
          <DialogTitle>{isEdit ? "Редактировать металл" : "Новая позиция металла"}</DialogTitle>
          <DialogDescription>Заполните основные параметры партии и остатка.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Марка материала *</Label>
              <Input className="h-11" value={materialGrade} onChange={(e) => setMaterialGrade(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Форма *</Label>
              <Input className="h-11" value={shape} onChange={(e) => setShape(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Размер *</Label>
              <Input className="h-11" value={size} onChange={(e) => setSize(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Длина, мм *</Label>
              <Input className="h-11" type="number" value={length} onChange={(e) => setLength(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Количество, шт *</Label>
              <Input className="h-11" type="number" value={qtyPcs} onChange={(e) => setQtyPcs(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Количество, кг</Label>
              <Input className="h-11" type="number" value={qtyKg} onChange={(e) => setQtyKg(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Локация *</Label>
              <Input className="h-11" value={location} onChange={(e) => setLocation(e.target.value)} />
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

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Мин. остаток, шт</Label>
              <Input className="h-11" type="number" value={minPcs} onChange={(e) => setMinPcs(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Мин. остаток, кг</Label>
              <Input className="h-11" type="number" value={minKg} onChange={(e) => setMinKg(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Партия / Лот</Label>
              <Input className="h-11" value={lot} onChange={(e) => setLot(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Поставщик</Label>
              <Input className="h-11" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Сертификат</Label>
            <Input className="h-11" value={certificateRef} onChange={(e) => setCertificateRef(e.target.value)} />
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
          <Button className="h-11" onClick={handleSubmit} disabled={isSubmitting}>
            {isEdit ? "Сохранить" : "Создать"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
