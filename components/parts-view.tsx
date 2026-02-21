"use client"

import React from "react"

import { useCallback, useState } from "react"
import { useApp } from "@/lib/app-context"
import type { ProductionStage } from "@/lib/types"
import { STAGE_LABELS } from "@/lib/types"
import { STAGE_ICONS } from "@/lib/stage-icons"
import { PartCard } from "./part-card"
import { PartDetails } from "./part-details"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, Filter, Building2 } from "lucide-react"

interface PartsViewProps {
  selectedPartId?: string | null
  onSelectPart?: (partId: string) => void
  onBack?: () => void
  detailTab?: string
  onDetailTabChange?: (tab: string) => void
  selectedTaskId?: string | null
  onSelectTask?: (taskId: string) => void
  onTaskBack?: () => void
}

export function PartsView({
  selectedPartId: controlledSelectedPartId,
  onSelectPart,
  onBack,
  detailTab,
  onDetailTabChange,
  selectedTaskId,
  onSelectTask,
  onTaskBack,
}: PartsViewProps = {}) {
  const { parts, machines, permissions } = useApp()

  const [internalSelectedPartId, setInternalSelectedPartId] = useState<string | null>(null)
  const isControlled = controlledSelectedPartId !== undefined
  const selectedPartId = isControlled ? controlledSelectedPartId : internalSelectedPartId
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "in_progress" | "not_started" | "done">("all")
  const [typeFilter, setTypeFilter] = useState<"all" | "own" | "cooperation">("all")
  const [machineFilter, setMachineFilter] = useState<string>("all")
  const [stageFilter, setStageFilter] = useState<ProductionStage | "all">("all")

  const handleSelectPart = useCallback(
    (partId: string) => {
      if (onSelectPart) {
        onSelectPart(partId)
        return
      }
      setInternalSelectedPartId(partId)
    },
    [onSelectPart, isControlled]
  )

  const handleBack = useCallback(() => {
    if (onBack) {
      onBack()
      return
    }
    if (!isControlled) {
      setInternalSelectedPartId(null)
    }
  }, [onBack, isControlled])
  
  const selectedPart = selectedPartId ? parts.find((part) => part.id === selectedPartId) || null : null

  // If viewing a specific part
  if (selectedPart) {
    return (
      <PartDetails 
        part={selectedPart} 
        onBack={handleBack}
        initialTab={detailTab}
        onTabChange={onDetailTabChange}
        selectedTaskId={selectedTaskId}
        onTaskSelect={onSelectTask}
        onTaskBack={onTaskBack}
      />
    )
  }
  
  // Filter parts based on permissions
  // Users who can't view cooperation should not see cooperation parts
  let visibleParts = [...parts]
  if (!permissions.canViewCooperation) {
    visibleParts = visibleParts.filter(p => !p.is_cooperation)
  }
  
  // Filter parts
  let filteredParts = [...visibleParts]
  
  // Search filter
  if (searchQuery) {
    const query = searchQuery.toLowerCase()
    filteredParts = filteredParts.filter(p => 
      p.code.toLowerCase().includes(query) || 
      p.name.toLowerCase().includes(query) ||
      p.customer?.toLowerCase().includes(query)
    )
  }
  
  // Status filter
  if (statusFilter !== "all") {
    filteredParts = filteredParts.filter(p => p.status === statusFilter)
  }
  
  // Type filter (own vs cooperation)
  if (typeFilter === "own") {
    filteredParts = filteredParts.filter(p => !p.is_cooperation)
  } else if (typeFilter === "cooperation") {
    filteredParts = filteredParts.filter(p => p.is_cooperation)
  }
  
  // Machine filter
  if (machineFilter !== "all") {
    filteredParts = filteredParts.filter(p => p.machine_id === machineFilter)
  }
  
  // Stage filter
  if (stageFilter !== "all") {
    filteredParts = filteredParts.filter(p => {
      const stageStatuses = p.stage_statuses || []
      const stageStatus = stageStatuses.find(s => s.stage === stageFilter)
      return stageStatus && (stageStatus.status === "in_progress" || stageStatus.status === "pending")
    })
  }
  
  // Sort by deadline
  filteredParts.sort((a, b) => {
    return new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
  })

  const cooperationCount = visibleParts.filter(p => p.is_cooperation).length
  const ownCount = visibleParts.filter(p => !p.is_cooperation).length
  
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Детали</h1>
          <p className="text-sm text-muted-foreground">
            {visibleParts.length} деталей
            {permissions.canViewCooperation && `: ${ownCount} своих, ${cooperationCount} кооперация`}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Создание новых деталей выполняется только из спецификаций
          </p>
        </div>
      </div>
      
      {/* Search and Filters */}
      <div className="space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по коду, названию или заказчику..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        
        {/* Filter tabs */}
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {/* Type filter - only show if user can view cooperation */}
          {permissions.canViewCooperation && (
            <Tabs value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
              <div className="overflow-x-auto overflow-y-hidden py-1">
                <TabsList className="h-10 md:h-9 w-max min-w-full justify-start">
                <TabsTrigger value="all" className="flex-none shrink-0">Все</TabsTrigger>
                <TabsTrigger value="own" className="flex-none shrink-0">
                  Своё ({ownCount})
                </TabsTrigger>
                <TabsTrigger value="cooperation" className="flex-none shrink-0 gap-1">
                  <Building2 className="h-3 w-3" />
                  Кооперация ({cooperationCount})
                </TabsTrigger>
              </TabsList>
              </div>
            </Tabs>
          )}
          
          {/* Status filter */}
          <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <div className="overflow-x-auto overflow-y-hidden py-1">
              <TabsList className="h-10 md:h-9 w-max min-w-full justify-start">
                <TabsTrigger value="all" className="flex-none shrink-0">Все</TabsTrigger>
                <TabsTrigger value="in_progress" className="flex-none shrink-0">В работе</TabsTrigger>
                <TabsTrigger value="not_started" className="flex-none shrink-0">Ожидают</TabsTrigger>
                <TabsTrigger value="done" className="flex-none shrink-0">Готовы</TabsTrigger>
              </TabsList>
            </div>
          </Tabs>
        </div>
        
        {/* Additional filters */}
        <div className="flex flex-wrap gap-3">
          {/* Machine filter */}
          <Select value={machineFilter} onValueChange={setMachineFilter}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Станок" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все станки</SelectItem>
              {machines.map(m => (
                <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          {/* Stage filter */}
          <Select value={stageFilter} onValueChange={(v) => setStageFilter(v as ProductionStage | "all")}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Этап" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все этапы</SelectItem>
              {(Object.keys(STAGE_LABELS) as ProductionStage[]).map(stage => (
                <SelectItem key={stage} value={stage}>
                  <div className="flex items-center gap-2">
                    {STAGE_ICONS[stage]}
                    {STAGE_LABELS[stage]}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      
      {/* Parts list */}
      <div className="space-y-3">
        {filteredParts.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              Нет деталей по заданным фильтрам
            </CardContent>
          </Card>
        ) : (
          filteredParts.map(part => (
            <PartCard
              key={part.id}
              part={part}
              onClick={() => handleSelectPart(part.id)}
            />
          ))
        )}
      </div>
      
    </div>
  )
}
