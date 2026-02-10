"use client"

import React from "react"

import { useMemo } from "react"
import { useApp } from "@/lib/app-context"
import type { Part, ProductionStage } from "@/lib/types"
import { STAGE_LABELS } from "@/lib/types"
import { STAGE_ICONS } from "@/lib/stage-icons"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { 
  CheckCircle, 
  Clock, 
  Pause,
  TrendingUp,
  TrendingDown,
  Minus,
  Users
} from "lucide-react"
import { cn } from "@/lib/utils"

// Fixed order of stages for consistent display
const STAGE_ORDER: ProductionStage[] = [
  "machining",
  "fitting", 
  "heat_treatment",
  "grinding",
  "galvanic",
  "qc",
  "logistics",
]

interface StageProgressSummaryProps {
  part: Part
  showDetails?: boolean
}

export function StageProgressSummary({ part, showDetails = true }: StageProgressSummaryProps) {
  const { 
    getStageFactsForPartAndStage,
    getUserById,
    getMachineNorm
  } = useApp()
  
  const stageStatuses = part.stage_statuses || []
  // Sort stages by fixed order and filter out skipped
  const activeStages = stageStatuses
    .filter(s => s.status !== "skipped")
    .sort((a, b) => {
      const aIndex = STAGE_ORDER.indexOf(a.stage)
      const bIndex = STAGE_ORDER.indexOf(b.stage)
      // If stage not in order list, put it at end
      const aOrder = aIndex === -1 ? 999 : aIndex
      const bOrder = bIndex === -1 ? 999 : bIndex
      return aOrder - bOrder
    })
  
  // Calculate progress for each stage
  const stageProgress = useMemo(() => {
    return activeStages.map(stageStatus => {
      const facts = getStageFactsForPartAndStage(part.id, stageStatus.stage)
      const totalGood = facts.reduce((sum, f) => sum + f.qty_good, 0)
      const totalScrap = facts.reduce((sum, f) => sum + f.qty_scrap, 0)
      
      // Get norm if available
      const norm = part.machine_id 
        ? getMachineNorm(part.machine_id, part.id, stageStatus.stage) 
        : undefined
      
      // Calculate progress percentage (based on part plan)
      // For stages, we consider progress relative to total plan
      const percent = part.qty_plan > 0 
        ? Math.round((totalGood / part.qty_plan) * 100)
        : 0
      
      // Unique operators
      const operators = [...new Set(facts.map(f => f.operator_id))]
      
      return {
        ...stageStatus,
        totalGood,
        totalScrap,
        percent: Math.min(percent, 100),
        operators,
        norm,
        shiftCount: facts.length
      }
    })
  }, [activeStages, getStageFactsForPartAndStage, getMachineNorm, part.id, part.machine_id, part.qty_plan])
  
  // Overall progress - weighted average of all stage progress percentages
  // Each stage contributes equally to the overall progress
  const overallProgress = useMemo(() => {
    if (stageProgress.length === 0) return 0
    
    // Calculate average progress across all stages
    // Each stage's progress (0-100%) contributes equally
    const totalProgress = stageProgress.reduce((sum, stage) => {
      // For done stages, count as 100%
      if (stage.status === "done") return sum + 100
      // For in_progress/pending, use actual percent based on qty
      return sum + stage.percent
    }, 0)
    
    return Math.round(totalProgress / stageProgress.length)
  }, [stageProgress])
  
  // Calculate overall qty done based on overall progress
  const overallQtyDone = useMemo(() => {
    return Math.round((overallProgress / 100) * part.qty_plan)
  }, [overallProgress, part.qty_plan])
  
  // Check if stages can run in parallel (simplified - check if multiple in_progress)
  const parallelStages = stageProgress.filter(s => s.status === "in_progress")
  const hasParallelWork = parallelStages.length > 1
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case "done": return "bg-green-500"
      case "in_progress": return "bg-blue-500"
      default: return "bg-muted"
    }
  }
  
  const getStatusBgColor = (status: string) => {
    switch (status) {
      case "done": return "bg-green-500/10 border-green-200"
      case "in_progress": return "bg-blue-500/10 border-blue-200"
      default: return "bg-muted/50"
    }
  }
  
  const getPerformanceIndicator = (actual: number, expected: number) => {
    if (expected === 0 || actual === 0) return null
    const percent = (actual / expected) * 100
    if (percent >= 95) return { icon: <TrendingUp className="h-3 w-3" />, color: "text-green-600", label: "Норма" }
    if (percent >= 80) return { icon: <Minus className="h-3 w-3" />, color: "text-amber-600", label: "Ниже нормы" }
    return { icon: <TrendingDown className="h-3 w-3" />, color: "text-red-600", label: "Плохо" }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            Прогресс производства
            {hasParallelWork && (
              <Badge variant="outline" className="text-xs text-blue-600 border-blue-300">
                Параллельные этапы
              </Badge>
            )}
          </CardTitle>
          <div className="text-sm">
            <span className="text-muted-foreground">Общий прогресс:</span>
            <span className="font-bold ml-2">{overallProgress}%</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall progress bar */}
        <div className="space-y-1">
          <Progress value={overallProgress} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{stageProgress.filter(s => s.status === "done").length} из {stageProgress.length} этапов</span>
            <span>{overallQtyDone.toLocaleString()} / {part.qty_plan.toLocaleString()} шт</span>
          </div>
        </div>
        
        {/* Stage progress cards */}
        <div className="space-y-2">
          <TooltipProvider>
            {stageProgress.map((stage, idx) => {
              const operator = stage.operator_id ? getUserById(stage.operator_id) : null
              const perf = stage.norm 
                ? getPerformanceIndicator(
                    stage.shiftCount > 0 ? stage.totalGood / stage.shiftCount : 0,
                    stage.norm.qty_per_shift
                  )
                : null
              
              return (
                <div 
                  key={`${stage.stage}-${idx}`}
                  className={cn(
                    "rounded-lg border p-3 transition-all",
                    getStatusBgColor(stage.status)
                  )}
                >
                  <div className="flex items-center gap-3">
                    {/* Stage icon */}
                    <div className={cn(
                      "p-2 rounded-lg",
                      stage.status === "done" && "bg-green-500/20 text-green-700",
                      stage.status === "in_progress" && "bg-blue-500/20 text-blue-700",
                      stage.status === "pending" && "bg-muted text-muted-foreground",
                    )}>
                      {STAGE_ICONS[stage.stage]}
                    </div>
                    
                    {/* Stage info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{STAGE_LABELS[stage.stage]}</span>
                        {stage.status === "done" && (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        )}
                        {stage.status === "in_progress" && (
                          <Clock className="h-4 w-4 text-blue-600 animate-pulse" />
                        )}
                        {stage.status === "pending" && (
                          <Pause className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      
                      {showDetails && (stage.status === "done" || stage.status === "in_progress") && (
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          {stage.totalGood > 0 && (
                            <span className="text-green-600 font-medium">
                              {stage.totalGood.toLocaleString()} шт
                            </span>
                          )}
                          {stage.totalScrap > 0 && (
                            <span className="text-destructive">
                              Брак: {stage.totalScrap}
                            </span>
                          )}
                          {stage.shiftCount > 0 && (
                            <span>{stage.shiftCount} смен</span>
                          )}
                          {operator && (
                            <span className="flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {operator.initials}
                              {stage.operators.length > 1 && ` +${stage.operators.length - 1}`}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    
                    {/* Progress and performance */}
                    <div className="flex items-center gap-3">
                      {perf && (
                        <Tooltip>
                          <TooltipTrigger>
                            <div className={cn("flex items-center gap-1", perf.color)}>
                              {perf.icon}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{perf.label}</p>
                            {stage.norm && (
                              <p className="text-xs">
                                Средняя: {Math.round(stage.totalGood / stage.shiftCount)} / Норма: {stage.norm.qty_per_shift}
                              </p>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      )}
                      
                      {/* Stage progress bar */}
                      <div className="w-20">
                        <Progress 
                          value={stage.percent} 
                          className={cn(
                            "h-1.5",
                            stage.status === "done" && "[&>div]:bg-green-500",
                            stage.status === "in_progress" && "[&>div]:bg-blue-500",
                          )}
                        />
                        <span className="text-xs text-muted-foreground">{stage.percent}%</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Notes */}
                  {stage.notes && (
                    <p className="text-xs text-muted-foreground mt-2 pl-11">{stage.notes}</p>
                  )}
                </div>
              )
            })}
          </TooltipProvider>
        </div>
        
        {/* Parallel work indicator */}
        {hasParallelWork && (
          <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm">
            <div className="flex items-center gap-2 text-blue-700 font-medium">
              <Clock className="h-4 w-4" />
              Параллельная работа
            </div>
            <p className="text-blue-600 text-xs mt-1">
              Сейчас выполняются одновременно: {parallelStages.map(s => STAGE_LABELS[s.stage]).join(", ")}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
