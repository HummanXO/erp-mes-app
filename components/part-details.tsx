"use client"

import React from "react"

import { useState } from "react"
import { useApp } from "@/lib/app-context"
import type { Part, ProductionStage } from "@/lib/types"
import { PRIORITY_LABELS, STAGE_LABELS, DEVIATION_REASON_LABELS, SHIFT_LABELS, LOGISTICS_TYPE_LABELS } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { 
  ArrowLeft, 
  TrendingUp, 
  TrendingDown, 
  Trash2,
  Sun, 
  Moon,
  FileImage,
  ExternalLink,
  Building2,
  CheckCircle,
  Clock,
  Cog,
  Wrench,
  Zap,
  Flame,
  CircleDot,
  CheckSquare,
  Truck,
  Package
} from "lucide-react"
import { cn } from "@/lib/utils"
import { StageFactForm } from "./stage-fact-form"
import { TasksList } from "./tasks-list"
import { LogisticsList } from "./logistics-list"
import { FactJournal } from "./fact-journal"
import { StageProgressSummary } from "./stage-progress-summary"
import { AuditLogView } from "./audit-log-view"

const STAGE_ICONS: Record<ProductionStage, React.ReactNode> = {
  machining: <Cog className="h-4 w-4" />,
  fitting: <Wrench className="h-4 w-4" />,
  galvanic: <Zap className="h-4 w-4" />,
  heat_treatment: <Flame className="h-4 w-4" />,
  grinding: <CircleDot className="h-4 w-4" />,
  qc: <CheckSquare className="h-4 w-4" />,
  logistics: <Truck className="h-4 w-4" />,
}

interface PartDetailsProps {
  part: Part
  onBack: () => void
}

export function PartDetails({ part, onBack }: PartDetailsProps) {
  const { 
    getPartProgress, 
    getPartForecast, 
    getMachineById,
    getStageFactsForPart,
    getLogisticsForPart,
    getUserById,
    demoDate,
    permissions,
    updatePartDrawing,
    deletePart
  } = useApp()
  
  const [activeTab, setActiveTab] = useState("overview")
  const [drawingUrl, setDrawingUrl] = useState(part.drawing_url || "")
  const [isDeleting, setIsDeleting] = useState(false)
  const [actionError, setActionError] = useState("")
  
  const machine = part.machine_id ? getMachineById(part.machine_id) : null
  const progress = getPartProgress(part.id)
  const forecast = getPartForecast(part.id)
  const stageFacts = getStageFactsForPart(part.id)
  const logistics = getLogisticsForPart(part.id)
  
  // Calculate stages progress with null safety
  const stageStatuses = part.stage_statuses || []
  const stagesTotal = stageStatuses.filter(s => s.status !== "skipped").length
  const stagesDone = stageStatuses.filter(s => s.status === "done").length

  // Calculate overall progress based on stage completion (consistent with StageProgressSummary)
  const activeStages = stageStatuses.filter(s => s.status !== "skipped")
  
  // Calculate progress for each active stage
  const stageProgressData = activeStages.map(stageStatus => {
    const facts = stageFacts.filter(f => f.stage === stageStatus.stage)
    const totalGood = facts.reduce((sum, f) => sum + f.qty_good, 0)
    const percent = part.qty_plan > 0 
      ? Math.round((totalGood / part.qty_plan) * 100)
      : 0
    return {
      stage: stageStatus.stage,
      status: stageStatus.status,
      totalGood,
      percent: Math.min(percent, 100)
    }
  })
  
  // Overall progress - weighted average across all stages
  const overallProgressPercent = stageProgressData.length > 0
    ? Math.round(stageProgressData.reduce((sum, stage) => {
        if (stage.status === "done") return sum + 100
        return sum + stage.percent
      }, 0) / stageProgressData.length)
    : 0
    
  // Calculate "ready" quantity based on overall progress
  const overallQtyDone = Math.round((overallProgressPercent / 100) * part.qty_plan)
  
  // Sort facts by date descending
  const sortedFacts = [...stageFacts].sort((a, b) => {
    const dateCompare = b.date.localeCompare(a.date)
    if (dateCompare !== 0) return dateCompare
    return a.shift_type === "night" ? -1 : 1
  })
  const hasFacts = stageFacts.length > 0
  const canDeletePart = permissions.canCreateParts && (
    (part.is_cooperation && permissions.canCreateCoopParts) ||
    (!part.is_cooperation && permissions.canCreateOwnParts)
  )

  const handleSaveDrawing = () => {
    if (drawingUrl) {
      updatePartDrawing(part.id, drawingUrl)
    }
  }

  const handleDeletePart = async () => {
    const confirmed = window.confirm(`Удалить деталь ${part.code}? Это действие необратимо.`)
    if (!confirmed) return

    setActionError("")
    setIsDeleting(true)
    try {
      await deletePart(part.id)
      onBack()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось удалить деталь"
      setActionError(message)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold font-mono">{part.code}</h1>
            {part.is_cooperation && (
              <Building2 className="h-5 w-5 text-blue-500" />
            )}
          </div>
          <div className="text-sm text-muted-foreground">
            {part.name}
            {machine && ` | ${machine.name}`}
            {part.customer && ` | ${part.customer}`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canDeletePart && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeletePart}
              disabled={isDeleting}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {isDeleting ? "Удаляем..." : "Удалить"}
            </Button>
          )}
          <Badge variant={part.priority === "high" ? "destructive" : part.priority === "medium" ? "default" : "secondary"}>
            {PRIORITY_LABELS[part.priority]}
          </Badge>
        </div>
      </div>
      {actionError && (
        <div className="text-sm text-destructive">{actionError}</div>
      )}
      
      {/* Cooperation info */}
      {part.is_cooperation && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-blue-700">
              <Building2 className="h-5 w-5" />
              <span className="font-medium">Кооперация</span>
            </div>
            <p className="text-sm text-blue-600 mt-1">
              Партнёр: {part.cooperation_partner || "Не указан"}
            </p>
            <p className="text-xs text-blue-500 mt-1">
              Деталь изготавливается внешним партнёром
            </p>
          </CardContent>
        </Card>
      )}
      
      {/* Progress Summary */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-muted-foreground mb-1">Общая готовность</div>
              <div className="text-2xl font-bold">
                {overallProgressPercent}%
              </div>
              <Progress value={overallProgressPercent} className="h-2 mt-2" />
              <div className="text-xs text-muted-foreground mt-1">
                План: {part.qty_plan.toLocaleString()} шт
              </div>
            </div>
            <div className={cn(
              "p-3 rounded-lg",
              !hasFacts ? "bg-muted/50" : forecast.willFinishOnTime ? "bg-green-500/10" : "bg-amber-500/10"
            )}>
              <div className="flex items-center gap-2 mb-1">
                {!hasFacts ? (
                  <>
                    <Clock className="h-5 w-5 text-muted-foreground" />
                    <span className="font-medium text-foreground">Прогноз появится после 1-го факта</span>
                  </>
                ) : forecast.willFinishOnTime ? (
                  <>
                    <TrendingUp className="h-5 w-5 text-green-600" />
                    <span className="font-medium text-green-700">Успеваем</span>
                  </>
                ) : (
                  <>
                    <TrendingDown className="h-5 w-5 text-amber-600" />
                    <span className="font-medium text-amber-700">Риск срыва</span>
                  </>
                )}
              </div>
              {hasFacts && (
                <div className="text-sm text-muted-foreground space-y-0.5">
                  <div>Нужно смен (все этапы): {forecast.shiftsNeeded}</div>
                  <div>Есть смен до дедлайна: {forecast.shiftsRemaining}</div>
                  {forecast.stageForecasts && forecast.stageForecasts.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-dashed">
                      {forecast.stageForecasts.filter(sf => sf.qtyRemaining > 0).map(sf => (
                        <div key={sf.stage} className="flex justify-between text-xs">
                          <span>{STAGE_LABELS[sf.stage]}:</span>
                          <span className={sf.willFinishOnTime ? "text-green-600" : "text-amber-600"}>
                            {sf.qtyRemaining.toLocaleString()} шт ({sf.shiftsNeeded} смен)
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="mt-3 pt-3 border-t flex justify-between text-sm">
            <span className="text-muted-foreground">Дедлайн</span>
            <span className="font-medium">{new Date(part.deadline).toLocaleDateString("ru-RU")}</span>
          </div>
          {progress.qtyScrap > 0 && (
            <div className="mt-2 flex justify-between text-sm">
              <span className="text-muted-foreground">Брак всего</span>
              <span className="text-destructive font-medium">{progress.qtyScrap} шт</span>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Stages Progress */}
      <StageProgressSummary part={part} />
      
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="overview">Обзор</TabsTrigger>
          <TabsTrigger value="facts">Факт</TabsTrigger>
          <TabsTrigger value="journal">Журнал</TabsTrigger>
          <TabsTrigger value="logistics">Логистика</TabsTrigger>
          <TabsTrigger value="tasks">Задачи</TabsTrigger>
          <TabsTrigger value="audit">События</TabsTrigger>
          <TabsTrigger value="drawing">Чертёж</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="space-y-4">
          {/* Description */}
          {part.description && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Описание</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{part.description}</p>
              </CardContent>
            </Card>
          )}
          
          {/* Recent facts */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Последние записи</CardTitle>
            </CardHeader>
            <CardContent>
              {sortedFacts.length === 0 ? (
                <p className="text-sm text-muted-foreground">Нет записей</p>
              ) : (
                <div className="space-y-2">
                  {sortedFacts.slice(0, 5).map(fact => (
                    <div key={fact.id} className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                      <div className="flex items-center gap-2">
                        {fact.shift_type === "day" ? (
                          <Sun className="h-4 w-4 text-amber-500" />
                        ) : (
                          <Moon className="h-4 w-4 text-indigo-500" />
                        )}
                        <div>
                          <span className="text-sm">{new Date(fact.date).toLocaleDateString("ru-RU")}</span>
                          <span className="text-xs text-muted-foreground ml-2">{STAGE_LABELS[fact.stage]}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        <span className="text-green-600">+{fact.qty_good}</span>
                        {fact.qty_scrap > 0 && (
                          <span className="text-destructive">-{fact.qty_scrap}</span>
                        )}
                        {fact.deviation_reason && (
                          <Badge variant="outline" className="text-xs">
                            {DEVIATION_REASON_LABELS[fact.deviation_reason]}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="facts" className="space-y-4">
          {permissions.canEditFacts && (
            <StageFactForm part={part} />
          )}
          
          {/* History */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">История по сменам</CardTitle>
            </CardHeader>
            <CardContent>
              {sortedFacts.length === 0 ? (
                <p className="text-sm text-muted-foreground">Нет записей</p>
              ) : (
                <div className="space-y-2">
                  {sortedFacts.map(fact => {
                    const operator = getUserById(fact.operator_id)
                    return (
                      <div key={fact.id} className="p-3 rounded-md border">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {/* Show shift icon only for machining */}
                            {fact.stage === "machining" && (
                              fact.shift_type === "day" ? (
                                <Sun className="h-4 w-4 text-amber-500" />
                              ) : (
                                <Moon className="h-4 w-4 text-indigo-500" />
                              )
                            )}
                            <span className="font-medium">
                              {new Date(fact.date).toLocaleDateString("ru-RU")}
                              {fact.stage === "machining" && ` — ${SHIFT_LABELS[fact.shift_type]}`}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {STAGE_LABELS[fact.stage]}
                            </Badge>
                          </div>
                          {fact.deviation_reason && (
                            <Badge variant="outline">
                              {DEVIATION_REASON_LABELS[fact.deviation_reason]}
                            </Badge>
                          )}
                        </div>
                        <div className="flex gap-4 text-sm">
                          <span className="text-green-600">Годные: {fact.qty_good}</span>
                          <span className="text-destructive">Брак: {fact.qty_scrap}</span>
                          {operator && (
                            <span className="text-muted-foreground">{operator.initials}</span>
                          )}
                        </div>
                        {fact.comment && (
                          <p className="mt-2 text-sm text-muted-foreground">{fact.comment}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="journal">
          <FactJournal part={part} />
        </TabsContent>
        
        <TabsContent value="logistics">
          <LogisticsList part={part} />
        </TabsContent>
        
        <TabsContent value="tasks">
          <TasksList partId={part.id} machineId={part.machine_id} />
        </TabsContent>
        
        <TabsContent value="audit">
          <AuditLogView partId={part.id} />
        </TabsContent>
        
        <TabsContent value="drawing" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Чертёж детали</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {part.drawing_url ? (
                <div className="space-y-3">
                  <div className="aspect-video bg-muted rounded-lg flex items-center justify-center overflow-hidden">
                    <img 
                      src={part.drawing_url || "/placeholder.svg"} 
                      alt={`Чертёж ${part.code}`}
                      className="max-w-full max-h-full object-contain"
                      onError={(e) => {
                        e.currentTarget.style.display = "none"
                        if (e.currentTarget.parentElement) {
                          e.currentTarget.parentElement.innerHTML = `<div class="text-center text-muted-foreground"><p>Не удалось загрузить изображение</p></div>`
                        }
                      }}
                    />
                  </div>
                  <Button variant="outline" className="w-full bg-transparent" asChild>
                    <a href={part.drawing_url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Открыть в новой вкладке
                    </a>
                  </Button>
                </div>
              ) : (
                <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
                  <div className="text-center text-muted-foreground">
                    <FileImage className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>Чертёж не добавлен</p>
                  </div>
                </div>
              )}
              
              {permissions.canEditFacts && (
                <div className="space-y-3 pt-3 border-t">
                  <Label>Ссылка на чертёж</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="https://example.com/drawing.pdf"
                      value={drawingUrl}
                      onChange={(e) => setDrawingUrl(e.target.value)}
                    />
                    <Button onClick={handleSaveDrawing} disabled={!drawingUrl}>
                      Сохранить
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Вставьте ссылку на изображение или PDF-файл чертежа
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
