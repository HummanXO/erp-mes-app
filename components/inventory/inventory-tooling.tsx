"use client"

import { useEffect, useMemo, useState } from "react"
import { useApp } from "@/lib/app-context"
import type { MovementType, StockStatus, ToolingCategory, ToolingCondition } from "@/lib/inventory-types"
import { CONDITION_TONES, STOCK_STATUS_LABELS, STOCK_STATUS_TONES, TOOLING_CATEGORY_LABELS, TOOLING_CONDITION_LABELS } from "@/lib/inventory-constants"
import { StatusBadge } from "@/components/inventory/status-badge"
import { MovementDialog } from "@/components/inventory/movement-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { ArrowDownToLine, ArrowUpFromLine, MoveRight, Search } from "lucide-react"
import { cn } from "@/lib/utils"

const movementButtons: Array<{ type: MovementType; label: string; icon: React.ReactNode; variant?: "default" | "secondary" | "outline" }> = [
  { type: "receipt", label: "Приход", icon: <ArrowDownToLine className="h-4 w-4" /> },
  { type: "issue", label: "Расход", icon: <ArrowUpFromLine className="h-4 w-4" />, variant: "secondary" },
  { type: "transfer", label: "Перемещение", icon: <MoveRight className="h-4 w-4" />, variant: "outline" },
]

export function InventoryTooling() {
  const { inventoryTooling, permissions, dataError } = useApp()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<ToolingCategory | "all">("all")
  const [conditionFilter, setConditionFilter] = useState<ToolingCondition | "all">("all")
  const [statusFilter, setStatusFilter] = useState<StockStatus | "all">("all")
  const [onlyBelowMin, setOnlyBelowMin] = useState(false)
  const [movementDialogOpen, setMovementDialogOpen] = useState(false)
  const [movementType, setMovementType] = useState<MovementType>("receipt")
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 200)
    return () => clearTimeout(timer)
  }, [])

  const filteredItems = useMemo(() => {
    let items = [...inventoryTooling]
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      items = items.filter((item) =>
        [item.name, item.params, item.location, ...(item.compatible_machines ?? [])]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(q))
      )
    }
    if (categoryFilter !== "all") {
      items = items.filter((item) => item.category === categoryFilter)
    }
    if (conditionFilter !== "all") {
      items = items.filter((item) => item.condition === conditionFilter)
    }
    if (statusFilter !== "all") {
      items = items.filter((item) => item.status === statusFilter)
    }
    if (onlyBelowMin) {
      items = items.filter((item) => item.min_level !== undefined && item.qty < item.min_level)
    }
    return items
  }, [inventoryTooling, searchQuery, categoryFilter, conditionFilter, statusFilter, onlyBelowMin])

  useEffect(() => {
    if (!selectedId && filteredItems.length > 0) {
      setSelectedId(filteredItems[0].id)
      return
    }
    if (selectedId && !filteredItems.find((item) => item.id === selectedId)) {
      setSelectedId(filteredItems[0]?.id ?? null)
    }
  }, [filteredItems, selectedId])

  const selectedItem = filteredItems.find((item) => item.id === selectedId) ?? null

  const handleRowKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End" && event.key !== "Enter") {
      return
    }
    event.preventDefault()
    if (event.key === "Enter") {
      setSelectedId(filteredItems[index]?.id ?? null)
      return
    }
    const maxIndex = filteredItems.length - 1
    let nextIndex = index
    if (event.key === "ArrowDown") nextIndex = Math.min(maxIndex, index + 1)
    if (event.key === "ArrowUp") nextIndex = Math.max(0, index - 1)
    if (event.key === "Home") nextIndex = 0
    if (event.key === "End") nextIndex = maxIndex
    const nextId = filteredItems[nextIndex]?.id
    if (!nextId) return
    setSelectedId(nextId)
    const nextRow = document.getElementById(`tooling-row-${nextId}`)
    nextRow?.focus()
  }

  const openMovementDialog = (type: MovementType) => {
    setMovementType(type)
    setMovementDialogOpen(true)
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Фильтры</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                placeholder="Поиск по названию, параметрам, станку..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="pl-9 h-11"
              />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Категория</Label>
                <Select value={categoryFilter} onValueChange={(value) => setCategoryFilter(value as ToolingCategory | "all")}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Все категории" />
                </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все</SelectItem>
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
                <Select value={conditionFilter} onValueChange={(value) => setConditionFilter(value as ToolingCondition | "all")}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Все состояния" />
                </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все</SelectItem>
                    {Object.entries(TOOLING_CONDITION_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Статус</Label>
                <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StockStatus | "all")}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Все статусы" />
                </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все</SelectItem>
                    {Object.entries(STOCK_STATUS_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="tooling-below-min" checked={onlyBelowMin} onCheckedChange={setOnlyBelowMin} />
              <Label htmlFor="tooling-below-min" className="text-sm">
                Ниже минимума
              </Label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Список оснастки ({filteredItems.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {dataError ? (
              <div className="rounded-lg border border-[color:var(--status-danger-border)] bg-[color:var(--status-danger-bg)] p-4 text-sm text-[color:var(--status-danger-fg)]">
                Ошибка загрузки: {dataError}
              </div>
            ) : isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-16 w-full" />
                ))}
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                Нет позиций по выбранным фильтрам
              </div>
            ) : (
              filteredItems.map((item, index) => (
                <button
                  key={item.id}
                  id={`tooling-row-${item.id}`}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  onFocus={() => setSelectedId(item.id)}
                  onKeyDown={(event) => handleRowKeyDown(event, index)}
                  className={cn(
                    "w-full rounded-lg border px-3 py-2 text-left transition min-h-[44px]",
                    selectedId === item.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                  )}
                  aria-selected={selectedId === item.id}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-medium">{item.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.params ?? "Без параметров"} • {item.location}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {item.min_level !== undefined && item.qty < item.min_level && (
                        <StatusBadge tone="warning">Ниже минимума</StatusBadge>
                      )}
                      {item.status && (
                        <StatusBadge tone={STOCK_STATUS_TONES[item.status]}>
                          {STOCK_STATUS_LABELS[item.status]}
                        </StatusBadge>
                      )}
                      <StatusBadge tone={CONDITION_TONES[item.condition]}>
                        {TOOLING_CONDITION_LABELS[item.condition]}
                      </StatusBadge>
                    </div>
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Карточка оснастки</CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedItem ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                Выберите позицию в списке
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-lg font-semibold">{selectedItem.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {TOOLING_CATEGORY_LABELS[selectedItem.category]} • {selectedItem.params ?? "Без параметров"}
                    </div>
                  </div>
                  <StatusBadge tone={CONDITION_TONES[selectedItem.condition]}>
                    {TOOLING_CONDITION_LABELS[selectedItem.condition]}
                  </StatusBadge>
                </div>

                <div className="grid gap-3 text-sm md:grid-cols-2">
                  <div>
                    <div className="text-xs text-muted-foreground">Количество</div>
                    <div className="font-medium">{selectedItem.qty} шт</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Минимум</div>
                    <div className="font-medium">{selectedItem.min_level ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Локация</div>
                    <div className="font-medium">{selectedItem.location}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Совместимые станки</div>
                    <div className="font-medium">
                      {selectedItem.compatible_machines?.join(", ") ?? "—"}
                    </div>
                  </div>
                </div>

                {permissions.canManageLogistics && (
                  <div className="flex flex-wrap gap-2">
                    {movementButtons.map((btn) => (
                      <Button
                        key={btn.type}
                        variant={btn.variant ?? "default"}
                        size="lg"
                        className="h-11"
                        onClick={() => openMovementDialog(btn.type)}
                      >
                        {btn.icon}
                        {btn.label}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {selectedItem && (
        <MovementDialog
          open={movementDialogOpen}
          onOpenChange={setMovementDialogOpen}
          defaultType={movementType}
          item={selectedItem}
        />
      )}
    </div>
  )
}
