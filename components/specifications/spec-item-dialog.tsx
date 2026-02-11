"use client"

import { useMemo, useState } from "react"
import { useApp } from "@/lib/app-context"
import type { SpecItemType, WorkOrderPriority, ProductionStage, StageStatus } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

interface SpecItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  specificationId: string
  defaultCustomer?: string
}

const PRIORITY_OPTIONS: Array<{ value: WorkOrderPriority; label: string }> = [
  { value: "low", label: "Низкий" },
  { value: "normal", label: "Обычный" },
  { value: "high", label: "Высокий" },
]

function createStageStatuses(stages: ProductionStage[]): StageStatus[] {
  return stages.map((stage) => ({ stage, status: "pending" }))
}

function normalizeParams(raw: string): Record<string, string> {
  const params: Record<string, string> = {}
  raw
    .split(",")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .forEach((chunk) => {
      const [key, value] = chunk.split("=").map((part) => part.trim())
      if (!key || !value) return
      params[key] = value
    })
  return params
}

function composeItemDescription(base: string, comment: string): string {
  const normalizedBase = base.trim()
  const normalizedComment = comment.trim()
  if (!normalizedComment) return normalizedBase
  return `${normalizedBase} — ${normalizedComment}`
}

export function SpecItemDialog({ open, onOpenChange, specificationId, defaultCustomer }: SpecItemDialogProps) {
  const { currentUser, demoDate, parts, createPart, createSpecItem } = useApp()

  const [itemType, setItemType] = useState<SpecItemType>("make")
  const [mode, setMode] = useState<"existing" | "new">("existing")
  const [selectedPartId, setSelectedPartId] = useState("")
  const [createVariant, setCreateVariant] = useState(false)
  const [variantSuffix, setVariantSuffix] = useState("")
  const [variantParamsRaw, setVariantParamsRaw] = useState("")

  const [newCode, setNewCode] = useState("")
  const [newName, setNewName] = useState("")
  const [newBaseCode, setNewBaseCode] = useState("")
  const [newVariantSuffix, setNewVariantSuffix] = useState("")
  const [newVariantParamsRaw, setNewVariantParamsRaw] = useState("")

  const [description, setDescription] = useState("")
  const [qty, setQty] = useState("1")
  const [uom, setUom] = useState("шт")
  const [priority, setPriority] = useState<WorkOrderPriority>("normal")
  const [comment, setComment] = useState("")
  const [formError, setFormError] = useState("")
  const [busy, setBusy] = useState(false)

  const productionParts = useMemo(() => parts.filter((part) => !part.is_cooperation), [parts])

  const resetForm = () => {
    setItemType("make")
    setMode("existing")
    setSelectedPartId("")
    setCreateVariant(false)
    setVariantSuffix("")
    setVariantParamsRaw("")
    setNewCode("")
    setNewName("")
    setNewBaseCode("")
    setNewVariantSuffix("")
    setNewVariantParamsRaw("")
    setDescription("")
    setQty("1")
    setUom("шт")
    setPriority("normal")
    setComment("")
    setFormError("")
  }

  const resolvePartIdForMake = async (): Promise<string> => {
    if (!currentUser) {
      throw new Error("Нет активного пользователя")
    }

    if (mode === "existing") {
      const selectedPart = productionParts.find((part) => part.id === selectedPartId)
      if (!selectedPart) {
        throw new Error("Выберите деталь")
      }

      if (!createVariant) {
        return selectedPart.id
      }

      const suffix = variantSuffix.trim()
      if (!suffix) {
        throw new Error("Укажите исполнение (суффикс)")
      }

      const code = selectedPart.base_code
        ? `${selectedPart.base_code}-${suffix}`
        : `${selectedPart.code}-${suffix}`

      const createdVariant = await createPart({
        code,
        base_code: selectedPart.base_code ?? selectedPart.code,
        variant_suffix: suffix,
        variant_params: normalizeParams(variantParamsRaw),
        name: selectedPart.name,
        qty_plan: Number(qty) || 0,
        qty_done: 0,
        deadline: "2099-12-31",
        status: "not_started",
        description: selectedPart.description,
        is_cooperation: false,
        required_stages: selectedPart.required_stages,
        stage_statuses: createStageStatuses(selectedPart.required_stages),
        machine_id: selectedPart.machine_id,
        customer: defaultCustomer || selectedPart.customer,
        source_specification_id: specificationId,
      })

      return createdVariant.id
    }

    if (!newCode.trim() || !newName.trim()) {
      throw new Error("Для новой детали заполните код и название")
    }

    const createdPart = await createPart({
      code: newCode.trim(),
      base_code: newBaseCode.trim() || undefined,
      variant_suffix: newVariantSuffix.trim() || undefined,
      variant_params: normalizeParams(newVariantParamsRaw),
      name: newName.trim(),
      qty_plan: Number(qty) || 0,
      qty_done: 0,
      deadline: "2099-12-31",
      status: "not_started",
      description: comment.trim() || undefined,
      is_cooperation: false,
      required_stages: ["machining", "qc"],
      stage_statuses: createStageStatuses(["machining", "qc"]),
      machine_id: undefined,
      customer: defaultCustomer || undefined,
      source_specification_id: specificationId,
    })

    return createdPart.id
  }

  const handleSubmit = async () => {
    setFormError("")

    const quantity = Number(qty)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setFormError("Количество должно быть больше 0")
      return
    }

    setBusy(true)
    try {
      if (itemType === "make") {
        const partId = await resolvePartIdForMake()
        const part = productionParts.find((candidate) => candidate.id === partId)
        const fallbackDescription = part ? `${part.code} ${part.name}` : "Деталь"

        await createSpecItem(specificationId, {
          item_type: "make",
          part_id: partId,
          description: composeItemDescription(fallbackDescription, comment),
          qty_required: quantity,
          uom,
          priority,
          comment: comment.trim() || undefined,
        })
      } else {
        if (!description.trim()) {
          throw new Error("Заполните описание позиции")
        }

        await createSpecItem(specificationId, {
          item_type: itemType,
          description: composeItemDescription(description, comment),
          qty_required: quantity,
          uom,
          priority,
          comment: comment.trim() || undefined,
        })
      }

      resetForm()
      onOpenChange(false)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Не удалось добавить позицию")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) resetForm()
      }}
    >
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Добавить позицию спецификации</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <Tabs value={itemType} onValueChange={(value) => setItemType(value as SpecItemType)}>
            <TabsList className="grid grid-cols-3">
              <TabsTrigger value="make">Деталь</TabsTrigger>
              <TabsTrigger value="coop">Кооперация</TabsTrigger>
              <TabsTrigger value="buy">Покупное</TabsTrigger>
            </TabsList>

            <TabsContent value="make" className="space-y-4 mt-4">
              <div className="rounded-lg border p-3 space-y-3">
                <div className="text-sm font-medium">Шаг 1. Деталь</div>
                <Tabs value={mode} onValueChange={(value) => setMode(value as "existing" | "new")}> 
                  <TabsList className="grid grid-cols-2">
                    <TabsTrigger value="existing">Выбрать Part</TabsTrigger>
                    <TabsTrigger value="new">Создать Part</TabsTrigger>
                  </TabsList>
                  <TabsContent value="existing" className="space-y-3 mt-3">
                    <div className="space-y-2">
                      <Label>Деталь</Label>
                      <Select value={selectedPartId} onValueChange={setSelectedPartId}>
                        <SelectTrigger className="h-11 w-full">
                          <SelectValue placeholder="Выберите деталь" />
                        </SelectTrigger>
                        <SelectContent>
                          {productionParts.map((part) => (
                            <SelectItem key={part.id} value={part.id}>
                              {part.code} • {part.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        id="create-variant"
                        type="checkbox"
                        checked={createVariant}
                        onChange={(event) => setCreateVariant(event.target.checked)}
                        className="h-4 w-4"
                      />
                      <Label htmlFor="create-variant">Создать Variant (исполнение)</Label>
                    </div>

                    {createVariant && (
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Суффикс исполнения</Label>
                          <Input
                            className="h-11"
                            placeholder="01"
                            value={variantSuffix}
                            onChange={(event) => setVariantSuffix(event.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Параметры</Label>
                          <Input
                            className="h-11"
                            placeholder="L=120,S=8"
                            value={variantParamsRaw}
                            onChange={(event) => setVariantParamsRaw(event.target.value)}
                          />
                        </div>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="new" className="space-y-3 mt-3">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Код детали</Label>
                        <Input className="h-11" value={newCode} onChange={(event) => setNewCode(event.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Название</Label>
                        <Input className="h-11" value={newName} onChange={(event) => setNewName(event.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Базовый код</Label>
                        <Input
                          className="h-11"
                          placeholder="01488.900.725"
                          value={newBaseCode}
                          onChange={(event) => setNewBaseCode(event.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Суффикс исполнения</Label>
                        <Input
                          className="h-11"
                          placeholder="01"
                          value={newVariantSuffix}
                          onChange={(event) => setNewVariantSuffix(event.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Параметры исполнения</Label>
                      <Input
                        className="h-11"
                        placeholder="L=120,S=8,D=16"
                        value={newVariantParamsRaw}
                        onChange={(event) => setNewVariantParamsRaw(event.target.value)}
                      />
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </TabsContent>

            <TabsContent value="coop" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Описание кооперации</Label>
                <Input
                  className="h-11"
                  placeholder="Операция/деталь от кооператора"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>
            </TabsContent>

            <TabsContent value="buy" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Описание покупной позиции</Label>
                <Input
                  className="h-11"
                  placeholder="Материал/оснастка/комплектующие"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>
            </TabsContent>
          </Tabs>

          <div className="rounded-lg border p-3 space-y-3">
            <div className="text-sm font-medium">Шаг 2. Количество и приоритет</div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Кол-во</Label>
                <Input
                  className="h-11"
                  type="number"
                  min={1}
                  value={qty}
                  onChange={(event) => setQty(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Ед. изм.</Label>
                <Input className="h-11" value={uom} onChange={(event) => setUom(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Приоритет</Label>
                <Select value={priority} onValueChange={(value) => setPriority(value as WorkOrderPriority)}>
                  <SelectTrigger className="h-11 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Комментарий</Label>
              <Textarea
                rows={2}
                placeholder="Например: сначала исполнение с L=120"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
              />
            </div>
          </div>

          {formError && (
            <div className="rounded-md border border-[color:var(--status-danger-border)] bg-[color:var(--status-danger-bg)] px-3 py-2 text-sm text-[color:var(--status-danger-fg)]">
              {formError}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button className="h-11" onClick={() => void handleSubmit()} disabled={busy}>
            Добавить позицию
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
