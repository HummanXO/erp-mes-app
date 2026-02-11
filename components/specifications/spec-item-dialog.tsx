"use client"

import { useState } from "react"
import type { Part, SpecItemType } from "@/lib/types"
import { useApp } from "@/lib/app-context"
import { CreatePartDialog } from "@/components/create-part-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

interface SpecItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  specificationId: string
  defaultCustomer?: string
}

function composeItemDescription(base: string, executionParams: string): string {
  const normalizedBase = base.trim()
  const normalizedParams = executionParams.trim()
  if (!normalizedParams) return normalizedBase
  return `${normalizedBase} • ${normalizedParams}`
}

export function SpecItemDialog({ open, onOpenChange, specificationId, defaultCustomer }: SpecItemDialogProps) {
  const { createSpecItem } = useApp()

  const [itemType, setItemType] = useState<SpecItemType | null>(null)
  const [partDialogOpen, setPartDialogOpen] = useState(false)

  const [makeExecutionParams, setMakeExecutionParams] = useState("")

  const [coopDescription, setCoopDescription] = useState("")
  const [coopExecutionParams, setCoopExecutionParams] = useState("")
  const [coopQty, setCoopQty] = useState("1")
  const [coopComment, setCoopComment] = useState("")
  const [coopUom, setCoopUom] = useState("шт")

  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState("")

  const resetForm = () => {
    setItemType(null)
    setPartDialogOpen(false)
    setMakeExecutionParams("")
    setCoopDescription("")
    setCoopExecutionParams("")
    setCoopQty("1")
    setCoopComment("")
    setCoopUom("шт")
    setFormError("")
    setBusy(false)
  }

  const handleOpenDetailFlow = () => {
    setFormError("")
    setItemType("make")
    setPartDialogOpen(true)
  }

  const handlePartCreated = async (part: Part) => {
    await createSpecItem(specificationId, {
      item_type: "make",
      part_id: part.id,
      description: composeItemDescription(`${part.code} ${part.name}`, makeExecutionParams),
      qty_required: part.qty_plan,
      uom: "шт",
      comment: makeExecutionParams.trim() || undefined,
    })

    resetForm()
    onOpenChange(false)
  }

  const handleCreateCoopItem = async () => {
    setFormError("")

    const quantity = Number(coopQty)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setFormError("Количество должно быть больше 0")
      return
    }

    if (!coopDescription.trim()) {
      setFormError("Опишите, что передаём в кооперацию")
      return
    }

    setBusy(true)
    try {
      await createSpecItem(specificationId, {
        item_type: "coop",
        description: composeItemDescription(coopDescription, coopExecutionParams),
        qty_required: quantity,
        uom: coopUom,
        comment: coopComment.trim() || undefined,
      })

      resetForm()
      onOpenChange(false)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Не удалось добавить позицию")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
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
            <div className="grid gap-2 md:grid-cols-2">
              <button
                type="button"
                className={cn(
                  "min-h-[44px] rounded-lg border px-4 py-3 text-left transition",
                  itemType === "make" ? "border-primary bg-primary/5" : "hover:bg-muted/40"
                )}
                onClick={handleOpenDetailFlow}
              >
                <div className="font-medium">Деталь (сами делаем)</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Откроется форма «Новая деталь (Цех)»
                </div>
              </button>

              <button
                type="button"
                className={cn(
                  "min-h-[44px] rounded-lg border px-4 py-3 text-left transition",
                  itemType === "coop" ? "border-primary bg-primary/5" : "hover:bg-muted/40"
                )}
                onClick={() => {
                  setFormError("")
                  setItemType("coop")
                }}
              >
                <div className="font-medium">Кооперация (делают на стороне)</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Краткое описание, количество и комментарий
                </div>
              </button>
            </div>

            {itemType === "make" && (
              <div className="rounded-lg border p-3 space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="make-execution-params">Исполнение/параметры</Label>
                  <Input
                    id="make-execution-params"
                    className="h-11"
                    placeholder="Например: L=120, S=8"
                    value={makeExecutionParams}
                    onChange={(event) => setMakeExecutionParams(event.target.value)}
                  />
                </div>
                <Button className="h-11" onClick={handleOpenDetailFlow}>
                  Открыть форму «Новая деталь (Цех)»
                </Button>
              </div>
            )}

            {itemType === "coop" && (
              <div className="rounded-lg border p-3 space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="coop-description">Что делаем на стороне</Label>
                  <Input
                    id="coop-description"
                    className="h-11"
                    placeholder="Например: токарная обработка заготовки"
                    value={coopDescription}
                    onChange={(event) => setCoopDescription(event.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="coop-execution-params">Исполнение/параметры</Label>
                  <Input
                    id="coop-execution-params"
                    className="h-11"
                    placeholder="Например: L=120"
                    value={coopExecutionParams}
                    onChange={(event) => setCoopExecutionParams(event.target.value)}
                  />
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="coop-qty">Количество</Label>
                    <Input
                      id="coop-qty"
                      className="h-11"
                      type="number"
                      min={1}
                      value={coopQty}
                      onChange={(event) => setCoopQty(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="coop-uom">Ед. изм.</Label>
                    <Input
                      id="coop-uom"
                      className="h-11"
                      value={coopUom}
                      onChange={(event) => setCoopUom(event.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="coop-comment">Комментарий</Label>
                  <Textarea
                    id="coop-comment"
                    rows={2}
                    placeholder="Примечание для кооперации"
                    value={coopComment}
                    onChange={(event) => setCoopComment(event.target.value)}
                  />
                </div>
              </div>
            )}

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
            {itemType === "coop" && (
              <Button className="h-11" onClick={() => void handleCreateCoopItem()} disabled={busy}>
                Добавить позицию
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CreatePartDialog
        open={partDialogOpen}
        onOpenChange={setPartDialogOpen}
        sourceSpecificationId={specificationId}
        defaultCustomer={defaultCustomer}
        fixedMode="shop"
        submitLabel="Создать деталь и добавить позицию"
        onPartCreated={handlePartCreated}
      />
    </>
  )
}
