"use client"

import { useState, useMemo } from "react"
import { useApp } from "@/lib/app-context"
import type { Part, ProductionStage, ShiftType } from "@/lib/types"
import { STAGE_LABELS, SHIFT_LABELS, DEVIATION_REASON_LABELS } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Progress } from "@/components/ui/progress"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { 
  Sun, 
  Moon, 
  Calendar,
  User,
  TrendingUp,
  TrendingDown,
  Minus,
  Filter,
  BarChart3,
  FileText,
  Clock
} from "lucide-react"
import { cn } from "@/lib/utils"

interface FactJournalProps {
  part: Part
}

export function FactJournal({ part }: FactJournalProps) {
  const { 
    getStageFactsForPart, 
    getUserById, 
    getMachineById,
    getMachineNorm
  } = useApp()
  
  const [selectedStage, setSelectedStage] = useState<ProductionStage | "all">("all")
  const [viewMode, setViewMode] = useState<"list" | "table" | "summary">("list")
  
  const allFacts = getStageFactsForPart(part.id)
  
  // Filter facts by stage
  const filteredFacts = useMemo(() => {
    if (selectedStage === "all") return allFacts
    return allFacts.filter(f => f.stage === selectedStage)
  }, [allFacts, selectedStage])
  
  // Sort by date descending, then by created_at time descending
  const sortedFacts = useMemo(() => {
    return [...filteredFacts].sort((a, b) => {
      const dateCompare = b.date.localeCompare(a.date)
      if (dateCompare !== 0) return dateCompare
      // Sort by created_at time (newer first)
      return b.created_at.localeCompare(a.created_at)
    })
  }, [filteredFacts])
  
  // Group facts by date
  const factsByDate = useMemo(() => {
    const groups: Record<string, typeof sortedFacts> = {}
    for (const fact of sortedFacts) {
      if (!groups[fact.date]) groups[fact.date] = []
      groups[fact.date].push(fact)
    }
    return groups
  }, [sortedFacts])
  
  // Calculate summary stats per stage
  const stageSummary = useMemo(() => {
    const summary: Record<ProductionStage, {
      totalGood: number
      totalScrap: number
      shiftCount: number
      avgPerShift: number
      operators: Set<string>
    }> = {} as typeof summary
    
    for (const fact of allFacts) {
      if (!summary[fact.stage]) {
        summary[fact.stage] = {
          totalGood: 0,
          totalScrap: 0,
          shiftCount: 0,
          avgPerShift: 0,
          operators: new Set()
        }
      }
      summary[fact.stage].totalGood += fact.qty_good
      summary[fact.stage].totalScrap += fact.qty_scrap
      summary[fact.stage].shiftCount++
      summary[fact.stage].operators.add(fact.operator_id)
    }
    
    // Calculate averages
    for (const stage in summary) {
      const s = summary[stage as ProductionStage]
      s.avgPerShift = s.shiftCount > 0 ? Math.round(s.totalGood / s.shiftCount) : 0
    }
    
    return summary
  }, [allFacts])
  
  // Get unique stages from facts
  const usedStages = useMemo(() => {
    const stages = new Set<ProductionStage>()
    for (const fact of allFacts) {
      stages.add(fact.stage)
    }
    return Array.from(stages)
  }, [allFacts])
  
  // Overall totals
  const totals = useMemo(() => {
    return {
      good: allFacts.reduce((sum, f) => sum + f.qty_good, 0),
      scrap: allFacts.reduce((sum, f) => sum + f.qty_scrap, 0),
      shifts: allFacts.length
    }
  }, [allFacts])
  
  const getPerformanceColor = (actual: number, expected: number) => {
    if (expected === 0) return "text-muted-foreground"
    const percent = (actual / expected) * 100
    if (percent >= 95) return "text-green-600"
    if (percent >= 80) return "text-amber-600"
    return "text-red-600"
  }
  
  const getPerformanceIcon = (actual: number, expected: number) => {
    if (expected === 0) return <Minus className="h-4 w-4" />
    const percent = (actual / expected) * 100
    if (percent >= 95) return <TrendingUp className="h-4 w-4 text-green-600" />
    if (percent >= 80) return <Minus className="h-4 w-4 text-amber-600" />
    return <TrendingDown className="h-4 w-4 text-red-600" />
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Всего годных</div>
            <div className="text-2xl font-bold text-green-600">{totals.good.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Всего брака</div>
            <div className="text-2xl font-bold text-destructive">{totals.scrap}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Записей</div>
            <div className="text-2xl font-bold">{totals.shifts}</div>
          </CardContent>
        </Card>
      </div>
      
      {/* Filters and View Toggle */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={selectedStage} onValueChange={(v) => setSelectedStage(v as ProductionStage | "all")}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все этапы</SelectItem>
              {usedStages.map(stage => (
                <SelectItem key={stage} value={stage}>
                  {STAGE_LABELS[stage]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex-1" />
        
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as typeof viewMode)}>
          <TabsList className="h-8">
            <TabsTrigger value="list" className="px-2 h-6">
              <FileText className="h-3 w-3 mr-1" />
              Список
            </TabsTrigger>
            <TabsTrigger value="table" className="px-2 h-6">
              <BarChart3 className="h-3 w-3 mr-1" />
              Таблица
            </TabsTrigger>
            <TabsTrigger value="summary" className="px-2 h-6">
              <TrendingUp className="h-3 w-3 mr-1" />
              Сводка
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      
      {/* List View */}
      {viewMode === "list" && (
        <ScrollArea className="h-[400px]">
          <div className="space-y-4">
            {Object.entries(factsByDate).map(([date, facts]) => (
              <div key={date}>
                <div className="sticky top-0 bg-background py-1 mb-2 flex items-center gap-2 border-b">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium text-sm">
                    {new Date(date).toLocaleDateString("ru-RU", { 
                      weekday: "short", 
                      day: "numeric", 
                      month: "short" 
                    })}
                  </span>
                </div>
                
                <div className="space-y-2 pl-6">
                  {facts.map(fact => {
                    const operator = getUserById(fact.operator_id)
                    const machine = fact.machine_id ? getMachineById(fact.machine_id) : null
                    const norm = fact.machine_id 
                      ? getMachineNorm(fact.machine_id, part.id, fact.stage) 
                      : undefined
                    const expected = norm?.qty_per_shift || fact.qty_expected || 0
                    
                    return (
                      <Card key={fact.id} className="overflow-hidden">
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 space-y-2">
                              {/* Header */}
                              <div className="flex items-center gap-2 flex-wrap">
                                {/* Show shift only for machining stage */}
                                {fact.stage === "machining" && (
                                  fact.shift_type === "day" ? (
                                    <Badge variant="outline" className="gap-1 text-amber-600 border-amber-300">
                                      <Sun className="h-3 w-3" />
                                      Дневная
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="gap-1 text-indigo-600 border-indigo-300">
                                      <Moon className="h-3 w-3" />
                                      Ночная
                                    </Badge>
                                  )
                                )}
                                <Badge variant="secondary" className="text-xs">
                                  {STAGE_LABELS[fact.stage]}
                                </Badge>
                                {machine && (
                                  <span className="text-xs text-muted-foreground">{machine.name}</span>
                                )}
                              </div>
                              
                              {/* Quantities */}
                              <div className="flex items-center gap-4">
                                <div className={cn("font-bold text-lg", getPerformanceColor(fact.qty_good, expected))}>
                                  {fact.qty_good} шт
                                  {getPerformanceIcon(fact.qty_good, expected)}
                                </div>
                                {fact.qty_scrap > 0 && (
                                  <div className="text-destructive text-sm">
                                    Брак: {fact.qty_scrap}
                                  </div>
                                )}
                                {expected > 0 && (
                                  <div className="text-xs text-muted-foreground">
                                    из {expected} ({Math.round((fact.qty_good / expected) * 100)}%)
                                  </div>
                                )}
                              </div>
                              
                              {/* Operator and time */}
                              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                <div className="flex items-center gap-1">
                                  <User className="h-3 w-3" />
                                  {operator?.initials || "Неизвестно"}
                                </div>
                                <div className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {new Date(fact.created_at).toLocaleTimeString("ru-RU", {
                                    hour: "2-digit",
                                    minute: "2-digit"
                                  })}
                                </div>
                              </div>
                              
                              {/* Deviation and comment */}
                              {(fact.deviation_reason || fact.comment) && (
                                <div className="pt-2 border-t space-y-1">
                                  {fact.deviation_reason && (
                                    <Badge variant="outline" className="text-amber-600 border-amber-300">
                                      {DEVIATION_REASON_LABELS[fact.deviation_reason]}
                                    </Badge>
                                  )}
                                  {fact.comment && (
                                    <p className="text-sm text-muted-foreground">{fact.comment}</p>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              </div>
            ))}
            
            {sortedFacts.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                Нет записей {selectedStage !== "all" && `для этапа "${STAGE_LABELS[selectedStage]}"`}
              </div>
            )}
          </div>
        </ScrollArea>
      )}
      
      {/* Table View */}
      {viewMode === "table" && (
        <Card>
          <ScrollArea className="h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Дата</TableHead>
                  <TableHead>Смена</TableHead>
                  <TableHead>Этап</TableHead>
                  <TableHead>Оператор</TableHead>
                  <TableHead className="text-right">Годных</TableHead>
                  <TableHead className="text-right">Брак</TableHead>
                  <TableHead>Отклонение</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedFacts.map(fact => {
                  const operator = getUserById(fact.operator_id)
                  const norm = fact.machine_id 
                    ? getMachineNorm(fact.machine_id, part.id, fact.stage) 
                    : undefined
                  const expected = norm?.qty_per_shift || fact.qty_expected || 0
                  
                  return (
                    <TableRow key={fact.id}>
                      <TableCell className="font-medium">
                        {new Date(fact.date).toLocaleDateString("ru-RU")}
                      </TableCell>
                      <TableCell>
                        {/* Show shift only for machining */}
                        {fact.stage === "machining" ? (
                          fact.shift_type === "day" ? (
                            <span className="flex items-center gap-1 text-amber-600">
                              <Sun className="h-3 w-3" /> Дн
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-indigo-600">
                              <Moon className="h-3 w-3" /> Нч
                            </span>
                          )
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>{STAGE_LABELS[fact.stage]}</TableCell>
                      <TableCell>{operator?.initials}</TableCell>
                      <TableCell className={cn("text-right font-medium", getPerformanceColor(fact.qty_good, expected))}>
                        {fact.qty_good}
                      </TableCell>
                      <TableCell className="text-right text-destructive">
                        {fact.qty_scrap > 0 ? fact.qty_scrap : "—"}
                      </TableCell>
                      <TableCell>
                        {fact.deviation_reason 
                          ? <Badge variant="outline" className="text-xs">{DEVIATION_REASON_LABELS[fact.deviation_reason]}</Badge>
                          : "—"
                        }
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        </Card>
      )}
      
      {/* Summary View */}
      {viewMode === "summary" && (
        <div className="space-y-4">
          {Object.entries(stageSummary).map(([stage, stats]) => {
            const norm = part.machine_id 
              ? getMachineNorm(part.machine_id, part.id, stage as ProductionStage)
              : undefined
            const expected = norm?.qty_per_shift || 0
            const performance = expected > 0 ? Math.round((stats.avgPerShift / expected) * 100) : 0
            
            return (
              <Card key={stage}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span>{STAGE_LABELS[stage as ProductionStage]}</span>
                    <Badge variant="outline" className="font-normal">
                      {stats.shiftCount} смен
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <div className="text-xs text-muted-foreground">Всего годных</div>
                      <div className="text-xl font-bold text-green-600">{stats.totalGood.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Всего брака</div>
                      <div className="text-xl font-bold text-destructive">{stats.totalScrap}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Среднее/смена</div>
                      <div className={cn("text-xl font-bold", getPerformanceColor(stats.avgPerShift, expected))}>
                        {stats.avgPerShift}
                      </div>
                    </div>
                  </div>
                  
                  {expected > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Выполнение нормы</span>
                        <span className={getPerformanceColor(stats.avgPerShift, expected)}>
                          {performance}%
                        </span>
                      </div>
                      <Progress 
                        value={Math.min(performance, 100)} 
                        className={cn(
                          "h-2",
                          performance >= 95 && "[&>div]:bg-green-500",
                          performance >= 80 && performance < 95 && "[&>div]:bg-amber-500",
                          performance < 80 && "[&>div]:bg-red-500"
                        )}
                      />
                    </div>
                  )}
                  
                  <div className="text-xs text-muted-foreground">
                    Операторы: {Array.from(stats.operators).map(id => {
                      const op = getUserById(id)
                      return op?.initials
                    }).filter(Boolean).join(", ")}
                  </div>
                </CardContent>
              </Card>
            )
          })}
          
          {Object.keys(stageSummary).length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              Нет записей для построения сводки
            </div>
          )}
        </div>
      )}
    </div>
  )
}
