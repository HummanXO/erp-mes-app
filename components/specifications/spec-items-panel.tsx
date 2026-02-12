"use client"

import { useMemo, useState } from "react"
import type { Part, ProductionStage, SpecItem } from "@/lib/types"
import { STAGE_LABELS } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PartCard } from "@/components/part-card"
import { EmptyStateCard } from "@/components/specifications/empty-state-card"
import { useApp } from "@/lib/app-context"
import { STAGE_ICONS } from "@/lib/stage-icons"
import { Building2, Filter, PackagePlus, Search } from "lucide-react"

interface SpecItemsPanelProps {
  items: SpecItem[]
  onAddItem: () => void
  onHelp: () => void
  onOpenPart: (partId: string) => void
}

export function SpecItemsPanel({ items, onAddItem, onHelp, onOpenPart }: SpecItemsPanelProps) {
  const { getPartById, machines, permissions } = useApp()
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "in_progress" | "not_started" | "done">("all")
  const [typeFilter, setTypeFilter] = useState<"all" | "own" | "cooperation">("all")
  const [machineFilter, setMachineFilter] = useState<string>("all")
  const [stageFilter, setStageFilter] = useState<ProductionStage | "all">("all")

  const linkedParts = useMemo(() => {
    const result: Part[] = []
    for (const item of items) {
      if (!item.part_id) continue
      const part = getPartById(item.part_id)
      if (part) result.push(part)
    }
    return result
  }, [getPartById, items])

  if (items.length === 0) {
    return (
      <EmptyStateCard
        title="Позиции ещё не добавлены"
        description="Позиции описывают, что нужно изготовить у себя или отдать в кооперацию. Начните с первой позиции."
        actionLabel="Добавить позицию"
        onAction={onAddItem}
        onHelp={onHelp}
        icon={<PackagePlus className="h-5 w-5" aria-hidden="true" />}
      />
    )
  }

  let visibleParts = [...linkedParts]
  if (!permissions.canViewCooperation) {
    visibleParts = visibleParts.filter((part) => !part.is_cooperation)
  }

  let filteredParts = [...visibleParts]

  if (searchQuery) {
    const query = searchQuery.toLowerCase()
    filteredParts = filteredParts.filter((part) =>
      part.code.toLowerCase().includes(query)
      || part.name.toLowerCase().includes(query)
      || part.customer?.toLowerCase().includes(query)
    )
  }

  if (statusFilter !== "all") {
    filteredParts = filteredParts.filter((part) => part.status === statusFilter)
  }

  if (typeFilter === "own") {
    filteredParts = filteredParts.filter((part) => !part.is_cooperation)
  } else if (typeFilter === "cooperation") {
    filteredParts = filteredParts.filter((part) => part.is_cooperation)
  }

  if (machineFilter !== "all") {
    filteredParts = filteredParts.filter((part) => part.machine_id === machineFilter)
  }

  if (stageFilter !== "all") {
    filteredParts = filteredParts.filter((part) => {
      const stageStatuses = part.stage_statuses || []
      const stageStatus = stageStatuses.find((status) => status.stage === stageFilter)
      return Boolean(stageStatus && (stageStatus.status === "in_progress" || stageStatus.status === "pending"))
    })
  }

  filteredParts.sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())

  const cooperationCount = visibleParts.filter((part) => part.is_cooperation).length
  const ownCount = visibleParts.filter((part) => !part.is_cooperation).length

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Позиции спецификации ({visibleParts.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input
              placeholder="Поиск по коду, названию или заказчику..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="h-11 pl-10"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            {permissions.canViewCooperation && (
              <Tabs value={typeFilter} onValueChange={(value) => setTypeFilter(value as typeof typeFilter)}>
                <TabsList>
                  <TabsTrigger value="all">Все</TabsTrigger>
                  <TabsTrigger value="own">Своё ({ownCount})</TabsTrigger>
                  <TabsTrigger value="cooperation" className="gap-1">
                    <Building2 className="h-3 w-3" aria-hidden="true" />
                    Кооперация ({cooperationCount})
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            )}

            <Tabs value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
              <TabsList>
                <TabsTrigger value="all">Все</TabsTrigger>
                <TabsTrigger value="in_progress">В работе</TabsTrigger>
                <TabsTrigger value="not_started">Ожидают</TabsTrigger>
                <TabsTrigger value="done">Готовы</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="flex flex-wrap gap-3">
            <Select value={machineFilter} onValueChange={setMachineFilter}>
              <SelectTrigger className="h-11 w-[220px]">
                <Filter className="h-4 w-4 mr-2" aria-hidden="true" />
                <SelectValue placeholder="Станок" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все станки</SelectItem>
                {machines.map((machine) => (
                  <SelectItem key={machine.id} value={machine.id}>
                    {machine.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={stageFilter} onValueChange={(value) => setStageFilter(value as ProductionStage | "all")}>
              <SelectTrigger className="h-11 w-[220px]">
                <Filter className="h-4 w-4 mr-2" aria-hidden="true" />
                <SelectValue placeholder="Этап" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все этапы</SelectItem>
                {(Object.keys(STAGE_LABELS) as ProductionStage[]).map((stage) => (
                  <SelectItem key={stage} value={stage}>
                    <span className="flex items-center gap-2">
                      {STAGE_ICONS[stage]}
                      {STAGE_LABELS[stage]}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {filteredParts.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Нет деталей по заданным фильтрам
          </div>
        ) : (
          filteredParts.map((part) => (
            <PartCard key={part.id} part={part} onClick={() => onOpenPart(part.id)} />
          ))
        )}
      </CardContent>
    </Card>
  )
}
