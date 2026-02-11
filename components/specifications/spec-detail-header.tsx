"use client"

import type { Specification } from "@/lib/types"
import { SPEC_STATUS_LABELS } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { StatusBadge } from "@/components/inventory/status-badge"
import { Plus, Trash2 } from "lucide-react"

interface SpecDetailHeaderProps {
  specification: Specification
  itemCount: number
  canManageSpecifications: boolean
  actionBusy: boolean
  onTogglePublished: (published: boolean) => void
  onAddItem: () => void
  onDelete: () => void
}

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleString("ru-RU")
}

export function SpecDetailHeader({
  specification,
  itemCount,
  canManageSpecifications,
  actionBusy,
  onTogglePublished,
  onAddItem,
  onDelete,
}: SpecDetailHeaderProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Спецификация</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">{specification.number}</div>
            <div className="text-sm text-muted-foreground">
              {specification.customer ?? "Клиент не указан"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge tone={specification.status === "active" ? "success" : specification.status === "closed" ? "warning" : "info"}>
              {SPEC_STATUS_LABELS[specification.status]}
            </StatusBadge>
            {specification.published_to_operators && (
              <StatusBadge tone="success">Опубликована</StatusBadge>
            )}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <div className="text-xs text-muted-foreground">Позиции</div>
            <div className="text-xl font-semibold">{itemCount}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Дедлайн</div>
            <div className="text-sm">{specification.deadline ?? "Не задан"}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Создана</div>
            <div className="text-sm">{formatDateTime(specification.created_at)}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button className="h-11" onClick={onAddItem} disabled={actionBusy}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Добавить позицию
          </Button>
        </div>

        {canManageSpecifications && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <Switch
                checked={specification.published_to_operators}
                onCheckedChange={onTogglePublished}
                disabled={actionBusy}
              />
              <Label>Опубликовать операторам</Label>
            </div>
            <Button variant="outline" className="ml-auto h-11" onClick={onDelete} disabled={actionBusy}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Удалить спецификацию
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
