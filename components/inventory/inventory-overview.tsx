"use client"

import { useMemo } from "react"
import { useApp } from "@/lib/app-context"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/inventory/status-badge"
import { formatQty, isBelowMin } from "@/lib/inventory-utils"
import { MOVEMENT_TYPE_LABELS, MOVEMENT_TONES } from "@/lib/inventory-constants"
import { FileText, TrendingDown, Boxes, CalendarClock } from "lucide-react"

export function InventoryOverview() {
  const { inventoryMetal, inventoryTooling, inventoryMovements, getUserById } = useApp()

  const summary = useMemo(() => {
    const lowMetal = inventoryMetal.filter((item) => isBelowMin(item.qty, item.min_level)).length
    const lowTooling = inventoryTooling.filter((item) => item.min_level !== undefined && item.qty < item.min_level).length
    const reserved = inventoryMetal.filter((item) => item.status === "reserved").length
    const inUse = inventoryMetal.filter((item) => item.status === "in_use").length
    return {
      totalMetal: inventoryMetal.length,
      totalTooling: inventoryTooling.length,
      lowStock: lowMetal + lowTooling,
      reserved,
      inUse,
    }
  }, [inventoryMetal, inventoryTooling])

  const recentMovements = useMemo(() => {
    return [...inventoryMovements]
      .sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime())
      .slice(0, 6)
  }, [inventoryMovements])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Boxes className="h-4 w-4" />
              Позиции
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{summary.totalMetal + summary.totalTooling}</div>
            <div className="text-xs text-muted-foreground">{summary.totalMetal} металл • {summary.totalTooling} оснастка</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingDown className="h-4 w-4" />
              Ниже минимума
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{summary.lowStock}</div>
            <div className="text-xs text-muted-foreground">Требуется пополнение</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Резервы / В работе
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{summary.reserved + summary.inUse}</div>
            <div className="text-xs text-muted-foreground">{summary.reserved} резерв • {summary.inUse} в работе</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <CalendarClock className="h-4 w-4" />
              Последние движения
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{inventoryMovements.length}</div>
            <div className="text-xs text-muted-foreground">Записей в журнале</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Последние движения</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {recentMovements.length === 0 ? (
            <div className="text-sm text-muted-foreground">Нет движений</div>
          ) : (
            recentMovements.map((movement) => {
              const user = getUserById(movement.user_id)
              return (
                <div key={movement.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="flex items-center gap-3">
                    <StatusBadge tone={MOVEMENT_TONES[movement.type]}>
                      {MOVEMENT_TYPE_LABELS[movement.type]}
                    </StatusBadge>
                    <div>
                      <div className="text-sm font-medium">
                        {movement.item_ref.label ?? movement.item_ref.id}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {movement.from_location ?? "—"} → {movement.to_location ?? "—"}
                      </div>
                    </div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <div>{formatQty(movement.qty)}</div>
                    <div>{new Date(movement.datetime).toLocaleString()}</div>
                    <div>{user?.initials ?? "Система"}</div>
                  </div>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>
    </div>
  )
}
