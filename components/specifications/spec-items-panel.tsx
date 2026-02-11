"use client"

import type { SpecItem, WorkOrder } from "@/lib/types"
import { PART_STATUS_LABELS, SPEC_ITEM_STATUS_LABELS, SPEC_ITEM_TYPE_LABELS } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { StatusBadge } from "@/components/inventory/status-badge"
import { PartCard } from "@/components/part-card"
import { EmptyStateCard } from "@/components/specifications/empty-state-card"
import { useApp } from "@/lib/app-context"
import { PackagePlus } from "lucide-react"

const ITEM_STATUS_TONES = {
  open: "info",
  partial: "warning",
  fulfilled: "success",
  blocked: "danger",
  canceled: "warning",
} as const

const PART_STATUS_TONES = {
  not_started: "info",
  in_progress: "warning",
  done: "success",
} as const

interface SpecItemsPanelProps {
  items: SpecItem[]
  workOrders: WorkOrder[]
  onAddItem: () => void
  onHelp: () => void
  onOpenPart: (partId: string) => void
}

export function SpecItemsPanel({ items, workOrders, onAddItem, onHelp, onOpenPart }: SpecItemsPanelProps) {
  const { getPartById, getPartProgress } = useApp()

  if (items.length === 0) {
    return (
      <EmptyStateCard
        title="Позиции ещё не добавлены"
        description="Позиции описывают, что нужно изготовить, купить или отдать в кооперацию. Начните с первой позиции."
        actionLabel="Добавить позицию"
        onAction={onAddItem}
        onHelp={onHelp}
        icon={<PackagePlus className="h-5 w-5" aria-hidden="true" />}
      />
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Позиции спецификации ({items.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item) => {
          const part = item.part_id ? getPartById(item.part_id) : undefined
          const partProgress = part && item.item_type === "make" ? getPartProgress(part.id) : null
          const effectiveDone = partProgress ? partProgress.qtyDone : item.qty_done
          const effectivePlan = partProgress && part ? part.qty_plan : item.qty_required
          const progress = effectivePlan > 0 ? Math.min(100, Math.round((effectiveDone / effectivePlan) * 100)) : 0
          const hasOrder = workOrders.some((order) => order.spec_item_id === item.id && order.status !== "canceled")

          return (
            <div key={item.id} className="rounded-lg border p-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-medium">#{item.line_no} {item.description}</div>
                  <div className="text-xs text-muted-foreground">
                    {part ? `${part.code} • ${part.name}` : "Без связанной детали"}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={ITEM_STATUS_TONES[item.status]}>
                    {SPEC_ITEM_STATUS_LABELS[item.status]}
                  </StatusBadge>
                  {part && item.item_type === "make" && (
                    <StatusBadge tone={PART_STATUS_TONES[part.status]}>
                      Деталь: {PART_STATUS_LABELS[part.status]}
                    </StatusBadge>
                  )}
                  <StatusBadge tone="info">{SPEC_ITEM_TYPE_LABELS[item.item_type]}</StatusBadge>
                  {hasOrder && <StatusBadge tone="success">Есть задание</StatusBadge>}
                </div>
              </div>

              {part && (
                <div className="space-y-2">
                  <PartCard part={part} onClick={() => onOpenPart(part.id)} />
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div>
                  Выполнено: <span className="font-medium">{effectiveDone} / {effectivePlan} {item.uom}</span>
                </div>
                <div className="text-muted-foreground">{progress}%</div>
              </div>
              <Progress value={progress} />
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
