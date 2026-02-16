"use client"

import React from "react"

import { useApp } from "@/lib/app-context"
import type { Part } from "@/lib/types"
import { STAGE_LABELS } from "@/lib/types"
import { STAGE_ICONS } from "@/lib/stage-icons"
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
} from "lucide-react"
import { cn } from "@/lib/utils"

interface PartCardProps {
  part: Part
  onClick: () => void
  isSelected?: boolean
}

export function PartCard({ part, onClick, isSelected }: PartCardProps) {
  const { getPartProgress, getPartForecast, getBlockersForPart, demoDate, getMachineById, getCurrentStage, getStageFactsForPart, getLogisticsForPart } = useApp()
  
  const progress = getPartProgress(part.id)
  const forecast = getPartForecast(part.id)
  const blockers = getBlockersForPart(part.id)
  const machine = part.machine_id ? getMachineById(part.machine_id) : null
  const currentStage = getCurrentStage(part.id)
  const hasFacts = getStageFactsForPart(part.id).length > 0
  const hasForecastInput = hasFacts || forecast.shiftsNeeded > 0
  const internalDeadlineDate = new Date(forecast.estimatedFinishDate)
  const hasInternalDeadline = hasForecastInput && !Number.isNaN(internalDeadlineDate.getTime())
  const internalDeltaDays = hasInternalDeadline
    ? Math.ceil((new Date(part.deadline).getTime() - internalDeadlineDate.getTime()) / (1000 * 60 * 60 * 24))
    : null
  
  const isOverdue = new Date(part.deadline) < new Date(demoDate) && part.status !== "done"
  const isAtRisk = hasForecastInput && !forecast.willFinishOnTime && part.status !== "done"

  // Calculate stages progress with null safety
  const stageStatuses = part.stage_statuses || []
  const stagesTotal = stageStatuses.filter(s => s.status !== "skipped").length
  const stagesDone = stageStatuses.filter(s => s.status === "done").length
  const partDeadlineDate = new Date(part.deadline)
  const daysToDeadline = Math.ceil((partDeadlineDate.getTime() - new Date(demoDate).getTime()) / (1000 * 60 * 60 * 24))
  const partMovements = getLogisticsForPart(part.id)
  const lastMovement = [...partMovements].sort((a, b) => {
    const aTs = new Date(a.updated_at || a.created_at || a.sent_at || a.date || 0).getTime()
    const bTs = new Date(b.updated_at || b.created_at || b.sent_at || b.date || 0).getTime()
    return bTs - aTs
  })[0]
  const etaValue = lastMovement?.planned_eta
  const etaDate = etaValue ? new Date(etaValue) : null
  const hasEta = Boolean(etaDate && !Number.isNaN(etaDate.getTime()))
  const etaDeltaDays =
    hasEta && etaDate
      ? Math.ceil((partDeadlineDate.getTime() - etaDate.getTime()) / (1000 * 60 * 60 * 24))
      : null
  const coopStatus: "missing" | "on_time" | "risk" | "late" = !hasEta
    ? "missing"
    : (etaDeltaDays ?? 0) < 0
      ? "late"
      : (etaDeltaDays ?? 0) <= 2
        ? "risk"
        : "on_time"

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Открыть деталь ${part.code}`}
      className={cn(
        "w-full text-left transition-all hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 rounded-lg border border-border",
        "bg-background",
        isSelected && "ring-2 ring-primary",
        (isOverdue || blockers.length > 0) && "border border-destructive/50",
        isAtRisk && !isOverdue && blockers.length === 0 && "border border-amber-500/50"
      )}
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

        {part.is_cooperation && (
          <div className="rounded-md border bg-muted/30 p-2">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">Кооперация</span>
              <Badge
                variant="outline"
                className={cn(
                  "h-5 px-2 text-[11px]",
                  coopStatus === "on_time" && "border-green-600 text-green-700",
                  coopStatus === "risk" && "border-amber-600 text-amber-700",
                  coopStatus === "late" && "border-destructive text-destructive",
                  coopStatus === "missing" && "border-muted-foreground/40 text-muted-foreground"
                )}
              >
                {coopStatus === "on_time" && "В срок"}
                {coopStatus === "risk" && "Риск"}
                {coopStatus === "late" && "Просрочено"}
                {coopStatus === "missing" && "Срок не задан"}
              </Badge>
            </div>
            <div className="mt-1 flex items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">
                Срок от кооператора: {hasEta && etaDate ? etaDate.toLocaleDateString("ru-RU") : "—"}
              </span>
              <span className="text-muted-foreground">
                {hasEta && etaDeltaDays !== null
                  ? etaDeltaDays > 0
                    ? `запас ${etaDeltaDays} дн.`
                    : etaDeltaDays < 0
                      ? `отставание ${Math.abs(etaDeltaDays)} дн.`
                      : "в срок"
                  : `до дедлайна ${daysToDeadline} дн.`}
              </span>
            </div>
          </div>
        )}
        
        {!part.is_cooperation && (
          <>
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
          </>
        )}
        
        {/* Forecast - only for non-done parts */}
        {!part.is_cooperation && part.status !== "done" && (
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
            {hasInternalDeadline && (
              <div className="mt-1 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  Внутренний дедлайн: {internalDeadlineDate.toLocaleDateString("ru-RU")}
                </span>
                <span
                  className={cn(
                    internalDeltaDays === null
                      ? "text-muted-foreground"
                      : internalDeltaDays >= 0
                        ? "text-green-700"
                        : "text-amber-700"
                  )}
                >
                  {internalDeltaDays === null
                    ? "—"
                    : internalDeltaDays > 0
                      ? `Запас ${internalDeltaDays} дн.`
                      : internalDeltaDays < 0
                        ? `Опоздание ${Math.abs(internalDeltaDays)} дн.`
                        : "В срок"}
                </span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </button>
  )
}
