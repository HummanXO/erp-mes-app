"use client"

import type { KeyboardEvent } from "react"
import type { Specification, SpecificationStatus } from "@/lib/types"
import { SPEC_STATUS_LABELS } from "@/lib/types"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusBadge } from "@/components/inventory/status-badge"
import { Search } from "lucide-react"
import { cn } from "@/lib/utils"

const STATUS_TONES: Record<SpecificationStatus, "info" | "success" | "warning" | "danger"> = {
  draft: "info",
  active: "success",
  closed: "warning",
}

interface SpecListPaneProps {
  specifications: Specification[]
  selectedId: string | null
  onSelect: (id: string) => void
  showFilters?: boolean
  searchQuery: string
  onSearchQueryChange: (value: string) => void
  statusFilter: SpecificationStatus | "all"
  onStatusFilterChange: (value: SpecificationStatus | "all") => void
  isLoading: boolean
  error?: string | null
}

export function SpecListPane({
  specifications,
  selectedId,
  onSelect,
  showFilters = true,
  searchQuery,
  onSearchQueryChange,
  statusFilter,
  onStatusFilterChange,
  isLoading,
  error,
}: SpecListPaneProps) {
  const handleRowKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End", "Enter"].includes(event.key)) return

    event.preventDefault()

    if (event.key === "Enter") {
      const selected = specifications[index]
      if (selected) onSelect(selected.id)
      return
    }

    const maxIndex = specifications.length - 1
    let nextIndex = index
    if (event.key === "ArrowDown") nextIndex = Math.min(maxIndex, index + 1)
    if (event.key === "ArrowUp") nextIndex = Math.max(0, index - 1)
    if (event.key === "Home") nextIndex = 0
    if (event.key === "End") nextIndex = maxIndex

    const next = specifications[nextIndex]
    if (!next) return
    onSelect(next.id)
    document.getElementById(`spec-row-${next.id}`)?.focus()
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        {showFilters && (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                className="h-11 pl-9"
                placeholder="Поиск по номеру, клиенту, примечанию"
                value={searchQuery}
                onChange={(event) => onSearchQueryChange(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Статус</Label>
              <Select value={statusFilter} onValueChange={(value) => onStatusFilterChange(value as SpecificationStatus | "all")}> 
                <SelectTrigger className="h-11 w-full">
                  <SelectValue placeholder="Все статусы" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все</SelectItem>
                  <SelectItem value="draft">{SPEC_STATUS_LABELS.draft}</SelectItem>
                  <SelectItem value="active">{SPEC_STATUS_LABELS.active}</SelectItem>
                  <SelectItem value="closed">{SPEC_STATUS_LABELS.closed}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Separator />
          </>
        )}
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Список ({specifications.length})
        </div>
        <div className="space-y-2">
          {error ? (
            <div className="rounded-md border border-[color:var(--status-danger-border)] bg-[color:var(--status-danger-bg)] px-3 py-2 text-sm text-[color:var(--status-danger-fg)]">
              Ошибка загрузки: {error}
            </div>
          ) : isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-16 w-full" />
              ))}
            </div>
          ) : specifications.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Спецификации не найдены
            </div>
          ) : (
            specifications.map((specification, index) => (
              <button
                key={specification.id}
                id={`spec-row-${specification.id}`}
                type="button"
                onClick={() => onSelect(specification.id)}
                onFocus={() => onSelect(specification.id)}
                onKeyDown={(event) => handleRowKeyDown(event, index)}
                className={cn(
                  "w-full min-h-[44px] rounded-lg border px-3 py-2 text-left transition",
                  selectedId === specification.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                )}
                aria-selected={selectedId === specification.id}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{specification.number}</div>
                    <div className="text-xs text-muted-foreground">
                      {specification.customer ?? "Без клиента"}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge tone={STATUS_TONES[specification.status]}>
                      {SPEC_STATUS_LABELS[specification.status]}
                    </StatusBadge>
                    {specification.published_to_operators && (
                      <StatusBadge tone="success">Опубликована</StatusBadge>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}
