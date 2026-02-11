"use client"

import { useEffect, useMemo, useState } from "react"
import { useApp } from "@/lib/app-context"
import type { InventoryMovement, MovementType, InventoryItemType } from "@/lib/inventory-types"
import { MOVEMENT_TYPE_LABELS, MOVEMENT_TONES } from "@/lib/inventory-constants"
import { formatQty } from "@/lib/inventory-utils"
import { StatusBadge } from "@/components/inventory/status-badge"
import { MovementDialog } from "@/components/inventory/movement-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Plus, Search } from "lucide-react"

export function InventoryMovements() {
  const { inventoryMovements, inventoryMetal, inventoryTooling, getUserById, dataError, permissions } = useApp()
  const [searchQuery, setSearchQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState<MovementType | "all">("all")
  const [itemTypeFilter, setItemTypeFilter] = useState<InventoryItemType | "all">("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 200)
    return () => clearTimeout(timer)
  }, [])

  const resolveItemLabel = (movement: InventoryMovement): string => {
    if (movement.item_ref.label) return movement.item_ref.label
    if (movement.item_ref.type === "metal") {
      const item = inventoryMetal.find((i) => i.id === movement.item_ref.id)
      return item ? `${item.material_grade} ${item.size}` : movement.item_ref.id
    }
    const item = inventoryTooling.find((i) => i.id === movement.item_ref.id)
    return item ? `${item.name}${item.params ? ` ${item.params}` : ""}` : movement.item_ref.id
  }

  const filteredMovements = useMemo(() => {
    let items = [...inventoryMovements]
    if (typeFilter !== "all") {
      items = items.filter((movement) => movement.type === typeFilter)
    }
    if (itemTypeFilter !== "all") {
      items = items.filter((movement) => movement.item_ref.type === itemTypeFilter)
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      items = items.filter((movement) => {
        const label = resolveItemLabel(movement).toLowerCase()
        return [label, movement.from_location, movement.to_location, movement.reason]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(q))
      })
    }
    return items.sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime())
  }, [inventoryMovements, typeFilter, itemTypeFilter, searchQuery, inventoryMetal, inventoryTooling])

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Фильтры</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                placeholder="Поиск по позиции, причине, локации"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="pl-9 h-11"
              />
            </div>
            <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as MovementType | "all")}>
              <SelectTrigger className="w-[200px] h-11">
                <SelectValue placeholder="Тип" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все типы</SelectItem>
                {Object.entries(MOVEMENT_TYPE_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={itemTypeFilter} onValueChange={(value) => setItemTypeFilter(value as InventoryItemType | "all")}>
              <SelectTrigger className="w-[200px] h-11">
                <SelectValue placeholder="Тип позиции" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все позиции</SelectItem>
                <SelectItem value="metal">Металл</SelectItem>
                <SelectItem value="tooling">Оснастка</SelectItem>
              </SelectContent>
            </Select>
            {permissions.canManageInventory && (
              <Button className="h-11" onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4" />
                Новое движение
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Журнал движений ({filteredMovements.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {dataError ? (
            <div className="rounded-lg border border-[color:var(--status-danger-border)] bg-[color:var(--status-danger-bg)] p-4 text-sm text-[color:var(--status-danger-fg)]">
              Ошибка загрузки: {dataError}
            </div>
          ) : isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : filteredMovements.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Нет записей по выбранным фильтрам
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Тип</TableHead>
                  <TableHead>Позиция</TableHead>
                  <TableHead>Количество</TableHead>
                  <TableHead>Откуда → Куда</TableHead>
                  <TableHead>Пользователь</TableHead>
                  <TableHead>Дата</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMovements.map((movement) => {
                  const user = getUserById(movement.user_id)
                  return (
                    <TableRow key={movement.id}>
                      <TableCell>
                        <StatusBadge tone={MOVEMENT_TONES[movement.type]}>
                          {MOVEMENT_TYPE_LABELS[movement.type]}
                        </StatusBadge>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{resolveItemLabel(movement)}</div>
                        <div className="text-xs text-muted-foreground">{movement.reason ?? "—"}</div>
                      </TableCell>
                      <TableCell>{formatQty(movement.qty)}</TableCell>
                      <TableCell>
                        <div className="text-xs text-muted-foreground">
                          {movement.from_location ?? "—"}
                        </div>
                        <div className="text-xs text-muted-foreground">{movement.to_location ?? "—"}</div>
                      </TableCell>
                      <TableCell>{user?.initials ?? "Система"}</TableCell>
                      <TableCell>{new Date(movement.datetime).toLocaleString()}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {permissions.canManageInventory && (
        <MovementDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          items={{ metal: inventoryMetal, tooling: inventoryTooling }}
        />
      )}
    </div>
  )
}
