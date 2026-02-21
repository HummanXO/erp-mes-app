"use client"

import type { Specification } from "@/lib/types"
import { SPEC_STATUS_LABELS } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { StatusBadge } from "@/components/inventory/status-badge"
import { Edit, Plus, Trash2 } from "lucide-react"

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
    <Card className="border-gray-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-gray-900">Спецификация</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold text-gray-900 md:text-2xl">{specification.number}</h2>
              <StatusBadge tone={specification.status === "active" ? "success" : specification.status === "closed" ? "warning" : "info"}>
                {SPEC_STATUS_LABELS[specification.status]}
              </StatusBadge>
              {specification.published_to_operators && <StatusBadge tone="success">Опубликована</StatusBadge>}
            </div>
            <p className="text-sm text-gray-600">{specification.customer ?? "Клиент не указан"}</p>
          </div>

          {canManageSpecifications && (
            <div className="flex flex-wrap items-center gap-2">
              <Button className="h-9" onClick={onAddItem} disabled={actionBusy}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Добавить позицию</span>
                <span className="sm:hidden">Позиция</span>
              </Button>
              <Button variant="outline" className="h-9" disabled>
                <Edit className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Редактировать</span>
              </Button>
              <Button variant="outline" className="h-9 text-red-700 hover:text-red-700" onClick={onDelete} disabled={actionBusy}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Удалить</span>
              </Button>
            </div>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <div className="text-xs text-gray-500">Позиции</div>
            <div className="text-base font-semibold text-gray-900">{itemCount}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Дедлайн</div>
            <div className="text-sm font-medium text-gray-900">{specification.deadline ?? "Не задан"}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Создана</div>
            <div className="text-sm font-medium text-gray-900">{formatDateTime(specification.created_at)}</div>
          </div>
        </div>

        {canManageSpecifications && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 p-3">
            <div className="flex items-center gap-2">
              <Switch
                checked={specification.published_to_operators}
                onCheckedChange={onTogglePublished}
                disabled={actionBusy}
              />
              <Label className="text-sm">Опубликовать операторам</Label>
            </div>
          </div>
        )}

        {!canManageSpecifications && (
          <div className="rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-600">
            Только чтение. Изменение спецификаций недоступно для этой роли.
          </div>
        )}
      </CardContent>
    </Card>
  )
}
