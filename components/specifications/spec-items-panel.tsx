"use client"

import { useMemo, useState } from "react"
import type { Part, SpecItem } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { EmptyStateCard } from "@/components/specifications/empty-state-card"
import { StatusBadge } from "@/components/inventory/status-badge"
import { useApp } from "@/lib/app-context"
import { Building2, ChevronRight, PackagePlus, Search, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"

type StatusTab = "all" | "working" | "waiting" | "ready"
type TypeTab = "all" | "own" | "cooperation"

interface SpecItemsPanelProps {
  items: SpecItem[]
  canManageSpecifications: boolean
  showFilters?: boolean
  onAddItem: () => void
  onHelp: () => void
  onOpenPart: (partId: string) => void
  onDeleteItem?: (specItemId: string, partCode: string) => void
}

function mapPartStatusToTab(status: Part["status"]): Exclude<StatusTab, "all"> {
  if (status === "in_progress") return "working"
  if (status === "done") return "ready"
  return "waiting"
}

function toneForPartStatus(status: Part["status"]): "info" | "success" | "warning" | "danger" {
  if (status === "done") return "success"
  if (status === "in_progress") return "warning"
  return "info"
}

function labelForPartStatus(status: Part["status"]): string {
  if (status === "done") return "Готово"
  if (status === "in_progress") return "В работе"
  return "Ожидают"
}

function getDeadlineView(part: Part, demoDate: string, bufferDays: number | null): { tone: "success" | "warning" | "danger"; text: string; buffer: string } {
  const deadline = new Date(part.deadline)
  const now = new Date(demoDate)
  const deltaDays = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  const tone = deltaDays < 0 ? "danger" : deltaDays <= 2 ? "warning" : "success"
  const text = Number.isNaN(deadline.getTime()) ? "Не задан" : deadline.toLocaleDateString("ru-RU")

  if (bufferDays === null) return { tone, text, buffer: "Нет прогноза" }
  if (bufferDays > 0) return { tone, text, buffer: `Запас: ${bufferDays} дн.` }
  if (bufferDays < 0) return { tone, text, buffer: `Риск: ${Math.abs(bufferDays)} дн.` }
  return { tone, text, buffer: "В срок" }
}

export function SpecItemsPanel({
  items,
  canManageSpecifications,
  showFilters = true,
  onAddItem,
  onHelp,
  onOpenPart,
  onDeleteItem,
}: SpecItemsPanelProps) {
  const { getPartById, getPartForecast, getMachineById, permissions, demoDate } = useApp()
  const [searchValue, setSearchValue] = useState("")
  const [activeStatusTab, setActiveStatusTab] = useState<StatusTab>("all")
  const [activeTypeTab, setActiveTypeTab] = useState<TypeTab>("all")

  const linkedRows = useMemo(() => {
    const rows: Array<{ item: SpecItem; part: Part }> = []
    for (const item of items) {
      if (!item.part_id) continue
      const part = getPartById(item.part_id)
      if (!part) continue
      if (!permissions.canViewCooperation && part.is_cooperation) continue
      rows.push({ item, part })
    }
    return rows
  }, [getPartById, items, permissions.canViewCooperation])

  if (items.length === 0) {
    return (
      <EmptyStateCard
        title="Позиции ещё не добавлены"
        description={
          canManageSpecifications
            ? "Позиции описывают, что нужно изготовить у себя или отдать в кооперацию. Начните с первой позиции."
            : "Позиции ещё не заведены. Для вашей роли доступен только просмотр."
        }
        actionLabel={canManageSpecifications ? "Добавить позицию" : "Только чтение"}
        onAction={() => {
          if (!canManageSpecifications) return
          onAddItem()
        }}
        onHelp={onHelp}
        icon={<PackagePlus className="h-5 w-5" aria-hidden="true" />}
        disabled={!canManageSpecifications}
      />
    )
  }

  const filteredRows = linkedRows
    .filter((row) => {
      const part = row.part
      if (activeStatusTab !== "all" && mapPartStatusToTab(part.status) !== activeStatusTab) return false
      if (activeTypeTab === "own" && part.is_cooperation) return false
      if (activeTypeTab === "cooperation" && !part.is_cooperation) return false

      const query = searchValue.trim().toLowerCase()
      if (!query) return true
      return (
        part.code.toLowerCase().includes(query)
        || part.name.toLowerCase().includes(query)
        || part.customer?.toLowerCase().includes(query)
      )
    })
    .sort((a, b) => new Date(a.part.deadline).getTime() - new Date(b.part.deadline).getTime())

  const ownCount = linkedRows.filter(({ part }) => !part.is_cooperation).length
  const cooperationCount = linkedRows.filter(({ part }) => part.is_cooperation).length

  return (
    <Card className="border-gray-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold text-gray-900">Позиции спецификации ({linkedRows.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {showFilters && (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
              <Input
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="Поиск по коду, названию или заказчику..."
                className="h-10 border-gray-300 pl-9"
              />
            </div>

            {permissions.canViewCooperation && (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={activeTypeTab === "all" ? "default" : "outline"}
                  className="h-9"
                  onClick={() => setActiveTypeTab("all")}
                >
                  Все
                </Button>
                <Button
                  variant={activeTypeTab === "own" ? "default" : "outline"}
                  className="h-9"
                  onClick={() => setActiveTypeTab("own")}
                >
                  Своё ({ownCount})
                </Button>
                <Button
                  variant={activeTypeTab === "cooperation" ? "default" : "outline"}
                  className="h-9 gap-1"
                  onClick={() => setActiveTypeTab("cooperation")}
                >
                  <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Кооперация ({cooperationCount})
                </Button>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button variant={activeStatusTab === "all" ? "default" : "outline"} className="h-9" onClick={() => setActiveStatusTab("all")}>
                Все
              </Button>
              <Button
                variant={activeStatusTab === "working" ? "default" : "outline"}
                className="h-9"
                onClick={() => setActiveStatusTab("working")}
              >
                В работе
              </Button>
              <Button
                variant={activeStatusTab === "waiting" ? "default" : "outline"}
                className="h-9"
                onClick={() => setActiveStatusTab("waiting")}
              >
                Ожидают
              </Button>
              <Button variant={activeStatusTab === "ready" ? "default" : "outline"} className="h-9" onClick={() => setActiveStatusTab("ready")}>
                Готовы
              </Button>
            </div>
          </>
        )}

        {filteredRows.length === 0 ? (
          <div className="rounded-md border border-dashed border-gray-300 p-8 text-center">
            <p className="text-sm font-medium text-gray-900">Ничего не найдено</p>
            <p className="text-sm text-gray-500">Попробуйте изменить параметры поиска</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 rounded-lg border border-gray-200">
            {filteredRows.map(({ item, part }) => {
              const forecast = getPartForecast(part.id)
              const machine = part.machine_id ? getMachineById(part.machine_id) : null
              const progress = part.qty_plan > 0 ? Math.min(100, Math.round((part.qty_done / part.qty_plan) * 100)) : 0
              const deadlineView = getDeadlineView(part, demoDate, typeof forecast.bufferDays === "number" ? forecast.bufferDays : null)

              return (
                <div key={item.id} className="group relative">
                  <button
                    type="button"
                    className="w-full px-4 py-4 text-left transition-colors hover:bg-gray-50"
                    onClick={() => onOpenPart(part.id)}
                    aria-label={`Открыть деталь ${part.code}`}
                  >
                    <div className="flex items-start gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-gray-900">{part.code}</span>
                          {part.is_cooperation && <StatusBadge tone="info">Кооперация</StatusBadge>}
                          <StatusBadge tone={toneForPartStatus(part.status)}>{labelForPartStatus(part.status)}</StatusBadge>
                        </div>

                        <p className="text-sm text-gray-700">{part.name}</p>
                        <div className="mt-1 text-xs text-gray-500">
                          {part.is_cooperation ? "Внешний поставщик" : machine?.name || "Станок не назначен"}
                        </div>

                        <div className="mt-3">
                          <div className="mb-1 flex items-center justify-between text-xs text-gray-600">
                            <span>Прогресс</span>
                            <span className="font-medium text-gray-900">{progress}%</span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-gray-200">
                            <div className="h-full bg-gray-900 transition-all duration-300" style={{ width: `${progress}%` }} />
                          </div>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5",
                              deadlineView.tone === "danger" && "bg-red-100 text-red-700",
                              deadlineView.tone === "warning" && "bg-amber-100 text-amber-700",
                              deadlineView.tone === "success" && "bg-green-100 text-green-700"
                            )}
                          >
                            Дедлайн: {deadlineView.text}
                          </span>
                          <span className="text-gray-500">{deadlineView.buffer}</span>
                        </div>
                      </div>

                      <div className="mt-1 flex flex-col items-end gap-2">
                        <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-gray-600" aria-hidden="true" />
                      </div>
                    </div>
                  </button>

                  {canManageSpecifications && onDeleteItem && (
                    <button
                      type="button"
                      className="absolute right-4 top-4 rounded-lg p-2 text-red-600 opacity-0 transition-opacity hover:bg-red-50 group-hover:opacity-100"
                      onClick={(event) => {
                        event.stopPropagation()
                        onDeleteItem(item.id, part.code)
                      }}
                      aria-label={`Удалить позицию ${part.code}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
