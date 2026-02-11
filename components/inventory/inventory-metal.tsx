"use client"

import { useEffect, useMemo, useState } from "react"
import { useApp } from "@/lib/app-context"
import type { MovementType, StockStatus } from "@/lib/inventory-types"
import { STOCK_STATUS_LABELS, STOCK_STATUS_TONES } from "@/lib/inventory-constants"
import { formatQty, isBelowMin } from "@/lib/inventory-utils"
import { StatusBadge } from "@/components/inventory/status-badge"
import { MovementDialog } from "@/components/inventory/movement-dialog"
import { MetalItemDialog } from "@/components/inventory/metal-item-dialog"
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

export function InventoryMetal() {
  const { inventoryMetal, permissions, dataError } = useApp()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<StockStatus | "all">("all")
  const [locationFilter, setLocationFilter] = useState<string>("all")
  const [onlyBelowMin, setOnlyBelowMin] = useState(false)
  const [movementDialogOpen, setMovementDialogOpen] = useState(false)
  const [movementType, setMovementType] = useState<MovementType>("receipt")
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 200)
    return () => clearTimeout(timer)
  }, [])

  const locations = useMemo(() => {
    return Array.from(new Set(inventoryMetal.map((item) => item.location))).sort()
  }, [inventoryMetal])

  const filteredItems = useMemo(() => {
    let items = [...inventoryMetal]
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      items = items.filter((item) =>
        [
          item.material_grade,
          item.shape,
          item.size,
          item.lot,
          item.supplier,
          item.certificate_ref,
          item.location,
        ]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(q))
      )
    }
    if (statusFilter !== "all") {
      items = items.filter((item) => item.status === statusFilter)
    }
    if (locationFilter !== "all") {
      items = items.filter((item) => item.location === locationFilter)
    }
    if (onlyBelowMin) {
      items = items.filter((item) => isBelowMin(item.qty, item.min_level))
    }
    return items
  }, [inventoryMetal, searchQuery, statusFilter, locationFilter, onlyBelowMin])

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
    const nextRow = document.getElementById(`metal-row-${nextId}`)
    nextRow?.focus()
  }

  const openMovementDialog = (type: MovementType) => {
    setMovementType(type)
    setMovementDialogOpen(true)
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Металл</h2>
            <p className="text-xs text-muted-foreground">{inventoryMetal.length} позиций</p>
          </div>
          {permissions.canManageInventory && (
            <Button className="h-11" onClick={() => setCreateDialogOpen(true)}>
              Новая позиция
            </Button>
          )}
        </div>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Фильтры</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                placeholder="Поиск по марке, размеру, партии, складу..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="pl-9 h-11"
              />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
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
              <div className="space-y-2">
                <Label>Локация</Label>
                <Select value={locationFilter} onValueChange={setLocationFilter}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Все локации" />
                </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все</SelectItem>
                    {locations.map((location) => (
                      <SelectItem key={location} value={location}>
                        {location}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Switch id="metal-below-min" checked={onlyBelowMin} onCheckedChange={setOnlyBelowMin} />
                <Label htmlFor="metal-below-min" className="text-sm">
                  Ниже минимума
                </Label>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Список металла ({filteredItems.length})</CardTitle>
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
                  id={`metal-row-${item.id}`}
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
                      <div className="font-medium">
                        {item.material_grade} • {item.shape} {item.size}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {item.location} • {formatQty(item.qty)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isBelowMin(item.qty, item.min_level) && (
                        <StatusBadge tone="warning">Ниже минимума</StatusBadge>
                      )}
                      <StatusBadge tone={STOCK_STATUS_TONES[item.status]}>
                        {STOCK_STATUS_LABELS[item.status]}
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
            <CardTitle className="text-sm">Карточка позиции</CardTitle>
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
                    <div className="text-lg font-semibold">{selectedItem.material_grade}</div>
                    <div className="text-sm text-muted-foreground">
                      {selectedItem.shape} • {selectedItem.size} • {selectedItem.length} мм
                    </div>
                  </div>
                  <StatusBadge tone={STOCK_STATUS_TONES[selectedItem.status]}>
                    {STOCK_STATUS_LABELS[selectedItem.status]}
                  </StatusBadge>
                </div>

                <div className="grid gap-3 text-sm md:grid-cols-2">
                  <div>
                    <div className="text-xs text-muted-foreground">Остаток</div>
                    <div className="font-medium">{formatQty(selectedItem.qty)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Минимум</div>
                    <div className="font-medium">{formatQty(selectedItem.min_level)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Партия / Лот</div>
                    <div className="font-medium">{selectedItem.lot ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Поставщик</div>
                    <div className="font-medium">{selectedItem.supplier ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Сертификат</div>
                    <div className="font-medium">{selectedItem.certificate_ref ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Локация</div>
                    <div className="font-medium">{selectedItem.location}</div>
                  </div>
                </div>

                {permissions.canManageInventory && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="lg"
                      className="h-11"
                      onClick={() => setEditDialogOpen(true)}
                    >
                      Редактировать
                    </Button>
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

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Резервы и использование</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm md:grid-cols-2">
            <div>
              <div className="text-xs text-muted-foreground">В резерве</div>
              <div className="font-medium">{formatQty(selectedItem?.reserved_qty)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">В работе</div>
              <div className="font-medium">{formatQty(selectedItem?.in_use_qty)}</div>
            </div>
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

      <MetalItemDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />
      {selectedItem && (
        <MetalItemDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          item={selectedItem}
        />
      )}
    </div>
  )
}
