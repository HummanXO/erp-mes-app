"use client"

import React from "react"

import { useApp } from "@/lib/app-context"
import type { Part, ProductionStage } from "@/lib/types"
import { STAGE_LABELS } from "@/lib/types"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  TrendingUp, 
  TrendingDown,
  FileImage,
  ChevronRight,
  Building2,
  Cog,
  Wrench,
  Zap,
  Flame,
  CircleDot,
  CheckSquare,
  Truck
} from "lucide-react"
import { cn } from "@/lib/utils"

const STAGE_ICONS: Record<ProductionStage, React.ReactNode> = {
  machining: <Cog className="h-3 w-3" />,
  fitting: <Wrench className="h-3 w-3" />,
  galvanic: <Zap className="h-3 w-3" />,
  heat_treatment: <Flame className="h-3 w-3" />,
  grinding: <CircleDot className="h-3 w-3" />,
  qc: <CheckSquare className="h-3 w-3" />,
  logistics: <Truck className="h-3 w-3" />,
}

interface PartCardProps {
  part: Part
  onClick: () => void
  isSelected?: boolean
}

export function PartCard({ part, onClick, isSelected }: PartCardProps) {
  const { getPartProgress, getPartForecast, getBlockersForPart, demoDate, getMachineById, getCurrentStage, getStageFactsForPart } = useApp()
  
  const progress = getPartProgress(part.id)
  const forecast = getPartForecast(part.id)
  const blockers = getBlockersForPart(part.id)
  const machine = part.machine_id ? getMachineById(part.machine_id) : null
  const currentStage = getCurrentStage(part.id)
  const hasFacts = getStageFactsForPart(part.id).length > 0
  const hasForecastInput = hasFacts || forecast.shiftsNeeded > 0
  
  const isOverdue = new Date(part.deadline) < new Date(demoDate) && part.status !== "done"
  const isAtRisk = hasForecastInput && !forecast.willFinishOnTime && part.status !== "done"

  // Calculate stages progress with null safety
  const stageStatuses = part.stage_statuses || []
  const stagesTotal = stageStatuses.filter(s => s.status !== "skipped").length
  const stagesDone = stageStatuses.filter(s => s.status === "done").length

  return (
    <Card 
      className={cn(
        "cursor-pointer transition-all hover:shadow-md",
        isSelected && "ring-2 ring-primary",
        (isOverdue || blockers.length > 0) && "border-destructive/50",
        isAtRisk && !isOverdue && blockers.length === 0 && "border-amber-500/50"
      )}
      onClick={onClick}
    >
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono font-medium truncate">{part.code}</span>
              {part.is_cooperation && (
                <Building2 className="h-4 w-4 text-blue-500 flex-shrink-0" />
              )}
              {part.drawing_url && (
                <FileImage className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              )}
            </div>
            <div className="text-sm text-muted-foreground truncate">{part.name}</div>
            {part.customer && (
              <div className="text-xs text-muted-foreground truncate">{part.customer}</div>
            )}
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
        </div>
        
        {/* Badges */}
        <div className="flex flex-wrap gap-1">
          {part.is_cooperation && (
            <Badge variant="outline" className="gap-1 text-blue-600 border-blue-600">
              <Building2 className="h-3 w-3" />
              {part.cooperation_partner || "Кооперация"}
            </Badge>
          )}
          {machine && (
            <Badge variant="outline" className="gap-1">
              <Cog className="h-3 w-3" />
              {machine.name}
            </Badge>
          )}
          {blockers.length > 0 && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              Блокер
            </Badge>
          )}
          {isOverdue && (
            <Badge variant="destructive" className="gap-1">
              <Clock className="h-3 w-3" />
              Просрочено
            </Badge>
          )}
          {part.status === "done" && (
            <Badge variant="outline" className="gap-1 text-green-600 border-green-600">
              <CheckCircle className="h-3 w-3" />
              Готово
            </Badge>
          )}
        </div>
        
        {/* Stages progress with percentages */}
        <div className="flex items-center gap-1 flex-wrap">
          {stageStatuses.filter(s => s.status !== "skipped").map((stageStatus, idx) => {
            const stageData = progress.stageProgress?.find(sp => sp.stage === stageStatus.stage)
            const stagePercent = stageData?.percent || 0
            return (
              <div
                key={`${stageStatus.stage}-${idx}`}
                className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded text-xs",
                  stageStatus.status === "done" && "bg-green-500/10 text-green-700",
                  stageStatus.status === "in_progress" && "bg-blue-500/10 text-blue-700",
                  stageStatus.status === "pending" && "bg-muted text-muted-foreground",
                )}
                title={`${STAGE_LABELS[stageStatus.stage]}: ${stagePercent}%`}
              >
                {STAGE_ICONS[stageStatus.stage]}
                <span className="tabular-nums">{stagePercent}%</span>
              </div>
            )
          })}
        </div>
        
        {/* Progress */}
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Готовность</span>
            <span className="font-medium">
              {progress.percent}%
            </span>
          </div>
          <Progress 
            value={progress.percent} 
            className={cn(
              "h-2",
              part.status === "done" && "[&>div]:bg-green-500"
            )} 
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>План: {part.qty_plan.toLocaleString()} шт</span>
            {progress.qtyScrap > 0 && (
              <span className="text-destructive">Брак: {progress.qtyScrap} шт</span>
            )}
          </div>
        </div>
        
        {/* Forecast - only for non-done parts */}
        {part.status !== "done" && (
          <div className={cn(
            "p-2 rounded-md text-sm",
            !hasForecastInput ? "bg-muted/50" : forecast.willFinishOnTime ? "bg-green-500/10" : "bg-amber-500/10"
          )}>
            <div className="flex items-center gap-2">
              {!hasForecastInput ? (
                <>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Прогноз появится после 1-го факта или установки нормы</span>
                </>
              ) : forecast.willFinishOnTime ? (
                <>
                  <TrendingUp className="h-4 w-4 text-green-600" />
                  <span className="text-green-700">Успеваем</span>
                </>
              ) : (
                <>
                  <TrendingDown className="h-4 w-4 text-amber-600" />
                  <span className="text-amber-700">Риск срыва</span>
                </>
              )}
              <span className="ml-auto text-xs text-muted-foreground">
                {forecast.daysRemaining} дн. до дедлайна
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
