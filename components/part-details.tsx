"use client"

import React from "react"

import { useEffect, useRef, useState } from "react"
import { useApp } from "@/lib/app-context"
import type { Part, ProductionStage } from "@/lib/types"
import { STAGE_LABELS, DEVIATION_REASON_LABELS, SHIFT_LABELS } from "@/lib/types"
import { STAGE_ICONS } from "@/lib/stage-icons"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { 
  ArrowLeft, 
  TrendingUp, 
  TrendingDown, 
  Trash2,
  Sun, 
  Moon,
  FileImage,
  FileText,
  ExternalLink,
  Building2,
  CheckCircle,
  Clock,
  Package,
  Upload,
  Link,
  Loader2
} from "lucide-react"
import { cn } from "@/lib/utils"
import { StageFactForm } from "./stage-fact-form"
import { TasksList } from "./tasks-list"
import { LogisticsList } from "./logistics-list"
import { FactJournal } from "./fact-journal"
import { StageProgressSummary } from "./stage-progress-summary"
import { AuditLogView } from "./audit-log-view"
import { apiClient } from "@/lib/api-client"

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
    getJourneyForPart,
    getUserById,
    demoDate,
    permissions,
    updatePart,
    updatePartDrawing,
    uploadAttachment,
    deletePart
  } = useApp()
  
  const [activeTab, setActiveTab] = useState("overview")
  const [drawingUrl, setDrawingUrl] = useState(part.drawing_url || "")
  const [isDeleting, setIsDeleting] = useState(false)
  const [actionError, setActionError] = useState("")
  const [drawingError, setDrawingError] = useState(false)
  const [drawingBlobUrl, setDrawingBlobUrl] = useState<string | null>(null)
  const [isLoadingDrawingBlob, setIsLoadingDrawingBlob] = useState(false)
  const [drawingActionError, setDrawingActionError] = useState("")
  const [isUploadingDrawing, setIsUploadingDrawing] = useState(false)
  const [isSavingDrawing, setIsSavingDrawing] = useState(false)
  const [showLinkInput, setShowLinkInput] = useState(false)
  const [journeySummary, setJourneySummary] = useState<Awaited<ReturnType<typeof getJourneyForPart>>>(null)
  const [cooperationDueDateDraft, setCooperationDueDateDraft] = useState("")
  const [isEditingCooperationDueDate, setIsEditingCooperationDueDate] = useState(false)
  const [isSavingCooperationDueDate, setIsSavingCooperationDueDate] = useState(false)
  const [cooperationDueDateError, setCooperationDueDateError] = useState("")
  const [isSavingCooperationQc, setIsSavingCooperationQc] = useState(false)
  const [cooperationQcError, setCooperationQcError] = useState("")
  const drawingInputRef = useRef<HTMLInputElement | null>(null)
  const isCooperationRouteOnly = part.is_cooperation

  const drawingUrlValue = drawingUrl.trim()
  const drawingUrlLower = drawingUrlValue.toLowerCase()
  const isPdfDrawing =
    drawingUrlLower.includes(".pdf") || drawingUrlLower.startsWith("data:application/pdf")
  const isImageDrawing =
    drawingUrlLower.startsWith("data:image/") ||
    /\.(png|jpe?g|gif|webp|svg)(\?|$)/.test(drawingUrlLower)
  const isKnownDrawingType = isPdfDrawing || isImageDrawing

  const isValidDrawingPath = (value: string) => {
    const candidate = value.trim()
    if (!candidate) return false
    if (
      candidate.startsWith("data:image/") ||
      candidate.startsWith("data:application/pdf") ||
      candidate.startsWith("/uploads/") ||
      candidate.startsWith("/api/v1/attachments/serve/")
    ) {
      return true
    }
    try {
      const parsed = new URL(candidate)
      return parsed.protocol === "http:" || parsed.protocol === "https:"
    } catch {
      return false
    }
  }

  useEffect(() => {
    setDrawingUrl(part.drawing_url || "")
  }, [part.id, part.drawing_url])

  useEffect(() => {
    setDrawingError(false)
  }, [drawingUrl])

  useEffect(() => {
    if (isEditingCooperationDueDate) return
    const fromPart = part.cooperation_due_date || ""
    if (fromPart) {
      setCooperationDueDateDraft(fromPart)
      return
    }
    const fromJourney = journeySummary?.eta ? new Date(journeySummary.eta).toISOString().slice(0, 10) : ""
    setCooperationDueDateDraft(fromJourney)
  }, [part.cooperation_due_date, part.id, journeySummary?.eta, isEditingCooperationDueDate])

  const isProtectedAttachmentUrl = (value: string) => {
    const candidate = value.trim()
    if (!candidate) return false
    if (candidate.startsWith("/uploads/") || candidate.startsWith("/api/v1/attachments/serve/")) return true
    if (candidate.startsWith("http://") || candidate.startsWith("https://")) {
      try {
        const u = new URL(candidate)
        return u.pathname.startsWith("/uploads/") || u.pathname.startsWith("/api/v1/attachments/serve/")
      } catch {
        return false
      }
    }
    return false
  }

  useEffect(() => {
    let cancelled = false

    if (drawingBlobUrl) {
      URL.revokeObjectURL(drawingBlobUrl)
      setDrawingBlobUrl(null)
    }

    const value = drawingUrlValue
    if (!value) return

    if (!isImageDrawing) return
    if (value.startsWith("data:") || value.startsWith("blob:")) return
    if (!isProtectedAttachmentUrl(value)) return

    setIsLoadingDrawingBlob(true)
    void (async () => {
      try {
        const blob = await apiClient.fetchBlob(value)
        if (cancelled) return
        const blobUrl = URL.createObjectURL(blob)
        setDrawingBlobUrl(blobUrl)
        setDrawingError(false)
      } catch {
        if (cancelled) return
        setDrawingError(true)
      } finally {
        if (cancelled) return
        setIsLoadingDrawingBlob(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [drawingUrlValue, isImageDrawing])
  
  const machine = part.machine_id ? getMachineById(part.machine_id) : null
  const progress = getPartProgress(part.id)
  const forecast = getPartForecast(part.id)
  const stageFacts = getStageFactsForPart(part.id)
  const logistics = getLogisticsForPart(part.id)

  useEffect(() => {
    let isCancelled = false
    void (async () => {
      try {
        const journey = await getJourneyForPart(part.id)
        if (!isCancelled) setJourneySummary(journey)
      } catch {
        if (!isCancelled) setJourneySummary(null)
      }
    })()
    return () => {
      isCancelled = true
    }
  }, [getJourneyForPart, part.id, logistics.length, stageFacts.length])

  useEffect(() => {
    if (!isCooperationRouteOnly) return
    if (activeTab === "facts" || activeTab === "journal") {
      setActiveTab("overview")
    }
  }, [activeTab, isCooperationRouteOnly])
  
  // Calculate stages progress with null safety
  const stageStatuses = part.stage_statuses || []

  // Work progress (average across production stages). Ready quantity is tracked separately in backend via part.qty_done.
  const overallProgressPercent = progress.percent
  const overallQtyDone = progress.qtyDone
  
  // Sort facts by date descending
  const sortedFacts = [...stageFacts].sort((a, b) => {
    const dateCompare = b.date.localeCompare(a.date)
    if (dateCompare !== 0) return dateCompare
    return a.shift_type === "night" ? -1 : 1
  })
  const hasFacts = stageFacts.length > 0
  const hasForecastInput = hasFacts || forecast.shiftsNeeded > 0
  const partDeadlineDate = new Date(part.deadline)
  const hasPartDeadline = !Number.isNaN(partDeadlineDate.getTime())
  const internalDeadlineDate = new Date(forecast.estimatedFinishDate)
  const hasInternalDeadline = hasForecastInput && !Number.isNaN(internalDeadlineDate.getTime())
  const internalDeltaDays = hasInternalDeadline
    ? Math.ceil((partDeadlineDate.getTime() - internalDeadlineDate.getTime()) / (1000 * 60 * 60 * 24))
    : null
  const cooperationEtaRaw = journeySummary?.eta || (part.cooperation_due_date ? `${part.cooperation_due_date}T00:00:00` : null)
  const cooperationEtaDate = cooperationEtaRaw ? new Date(cooperationEtaRaw) : null
  const hasCooperationEta = Boolean(cooperationEtaDate && !Number.isNaN(cooperationEtaDate.getTime()))
  const shouldShowCooperationControl = Boolean(
    part.is_cooperation ||
    journeySummary?.eta ||
    part.cooperation_due_date ||
    journeySummary?.last_movement?.tracking_number ||
    journeySummary?.last_movement?.to_holder
  )
  const cooperationDeltaDays =
    hasPartDeadline && hasCooperationEta && cooperationEtaDate
      ? Math.ceil((partDeadlineDate.getTime() - cooperationEtaDate.getTime()) / (1000 * 60 * 60 * 24))
      : null
  const cooperationControlTone = !hasCooperationEta
    ? "neutral"
    : cooperationDeltaDays !== null && cooperationDeltaDays < 0
      ? "risk"
      : "ok"
  const canDeletePart = permissions.canCreateParts && (
    (part.is_cooperation && permissions.canCreateCoopParts) ||
    (!part.is_cooperation && permissions.canCreateOwnParts)
  )
  const canEditCooperationDueDate = part.is_cooperation && permissions.canEditParts
  const routeCurrentLocation = journeySummary?.current_location || (part.is_cooperation ? "У кооператора" : "Не задано")
  const routeCurrentHolder = journeySummary?.current_holder || (part.is_cooperation ? part.cooperation_partner || "Партнёр не указан" : "Не задано")
  const routeLastEventDescription = journeySummary?.last_event?.description || "Деталь создана"
  const routeLastEventAt = journeySummary?.last_event?.occurred_at
  const routeNextStageTitle = part.is_cooperation ? "Плановый следующий шаг" : "Следующий этап"
  const routeNextStageLabel = journeySummary?.next_required_stage
    ? STAGE_LABELS[journeySummary.next_required_stage]
    : part.is_cooperation
      ? "ОТК после поступления"
      : "Не требуется"
  const routeStatusTitle = part.is_cooperation ? "Статус кооперации" : "Последнее событие"
  const routeStatusDescription = (() => {
    const lastMovement = journeySummary?.last_movement
    if (!part.is_cooperation) return routeLastEventDescription
    if (!lastMovement) return "Кооперация запланирована, отправка ещё не отмечена"
    const destination = lastMovement.to_holder || lastMovement.to_location
    if (lastMovement.status === "pending") return "Черновик отправки (ещё не отправлено)"
    if (lastMovement.status === "sent") return destination ? `Отправлено: ${destination}` : "Отправлено кооператору"
    if (lastMovement.status === "in_transit") return destination ? `В пути: ${destination}` : "В пути к кооператору"
    if (lastMovement.status === "received" || lastMovement.status === "completed") return "Получено от кооператора"
    if (lastMovement.status === "returned") return "Возврат от кооператора"
    if (lastMovement.status === "cancelled") return "Отправка отменена"
    return routeLastEventDescription
  })()
  const routeStatusAt = part.is_cooperation
    ? (
        journeySummary?.last_movement?.received_at ||
        journeySummary?.last_movement?.returned_at ||
        journeySummary?.last_movement?.cancelled_at ||
        journeySummary?.last_movement?.sent_at ||
        journeySummary?.last_movement?.updated_at ||
        routeLastEventAt
      )
    : routeLastEventAt
  const cooperationRouteStages = part.required_stages
    .filter((stage) => stage === "galvanic" || stage === "heat_treatment")
    .map((stage) => STAGE_LABELS[stage])
  const cooperationRouteText = cooperationRouteStages.length > 0
    ? [...cooperationRouteStages, "ОТК"].join(" -> ")
    : "ОТК"
  const cooperationQcStatus = part.cooperation_qc_status || "pending"
  const cooperationQcCheckedAt = part.cooperation_qc_checked_at
    ? new Date(part.cooperation_qc_checked_at).toLocaleString("ru-RU")
    : null
  const cooperationQcLabel =
    cooperationQcStatus === "accepted"
      ? "Принято"
      : cooperationQcStatus === "rejected"
        ? "Не принято"
        : "Не проведён"
  const cooperationQcTone =
    cooperationQcStatus === "accepted"
      ? "ok"
      : cooperationQcStatus === "rejected"
        ? "risk"
        : "neutral"
  const canRunCooperationQcDecision = canEditCooperationDueDate && (
    journeySummary?.last_movement?.status === "received" ||
    journeySummary?.last_movement?.status === "completed"
  )

  const handleSaveCooperationDueDate = async () => {
    if (!canEditCooperationDueDate) return
    setCooperationDueDateError("")
    setIsSavingCooperationDueDate(true)
    try {
      await updatePart({
        ...part,
        cooperation_due_date: cooperationDueDateDraft || null,
      })
      setIsEditingCooperationDueDate(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось сохранить срок от кооператора"
      setCooperationDueDateError(message)
    } finally {
      setIsSavingCooperationDueDate(false)
    }
  }

  const handleSetCooperationQc = async (nextStatus: "accepted" | "rejected") => {
    if (!canEditCooperationDueDate) return
    setCooperationQcError("")
    setIsSavingCooperationQc(true)
    try {
      await updatePart({
        ...part,
        cooperation_qc_status: nextStatus,
        cooperation_qc_checked_at: new Date().toISOString(),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось сохранить входной контроль"
      setCooperationQcError(message)
    } finally {
      setIsSavingCooperationQc(false)
    }
  }

  const handleSaveDrawing = async () => {
    const trimmed = drawingUrl.trim()
    if (!trimmed) return
    if (!isValidDrawingPath(trimmed)) {
      setDrawingActionError("Некорректный путь: используйте http(s)-ссылку или путь к загруженному файлу")
      return
    }
    setDrawingActionError("")
    setIsSavingDrawing(true)
    try {
      await updatePartDrawing(part.id, trimmed)
      setDrawingUrl(trimmed)
      setDrawingError(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось сохранить ссылку"
      setDrawingActionError(message)
    } finally {
      setIsSavingDrawing(false)
    }
  }

  const handleUploadDrawing = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setDrawingActionError("")
    setIsUploadingDrawing(true)
    try {
      const uploaded = await uploadAttachment(file)
      setDrawingUrl(uploaded.url)
      setShowLinkInput(false)
      await updatePartDrawing(part.id, uploaded.url)
      setDrawingError(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось загрузить файл"
      setDrawingActionError(message)
    } finally {
      setIsUploadingDrawing(false)
      event.target.value = ""
    }
  }

  const handleOpenDrawing = async () => {
    if (!drawingUrlValue) return
    const value = drawingUrlValue
    if (value.startsWith("data:") || value.startsWith("blob:")) {
      window.open(value, "_blank", "noopener,noreferrer")
      return
    }
    if (!isProtectedAttachmentUrl(value)) {
      window.open(value, "_blank", "noopener,noreferrer")
      return
    }
    try {
      const blob = await apiClient.fetchBlob(value)
      const blobUrl = URL.createObjectURL(blob)
      window.open(blobUrl, "_blank", "noopener,noreferrer")
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
    } catch {
      setDrawingActionError("Не удалось открыть файл")
    }
  }

  const handleDeleteDrawing = async () => {
    setDrawingActionError("")
    setIsSavingDrawing(true)
    try {
      await updatePartDrawing(part.id, "")
      setDrawingUrl("")
      setDrawingError(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось удалить чертёж"
      setDrawingActionError(message)
    } finally {
      setIsSavingDrawing(false)
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
        <Button
          variant="ghost"
          size="icon"
          aria-label="Назад"
          className="h-11 w-11"
          onClick={onBack}
        >
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
        {canDeletePart && (
          <Button variant="destructive" onClick={handleDeletePart} disabled={isDeleting}>
            <Trash2 className="h-4 w-4 mr-2" />
            {isDeleting ? "Удаляем..." : "Удалить"}
          </Button>
        )}
      </div>
      {actionError && (
        <div className="text-sm text-destructive" role="status" aria-live="polite">{actionError}</div>
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
      {!part.is_cooperation ? (
        <>
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
                  !hasForecastInput ? "bg-muted/50" : forecast.willFinishOnTime ? "bg-green-500/10" : "bg-amber-500/10"
                )}>
                  <div className="flex items-center gap-2 mb-1">
                    {!hasForecastInput ? (
                      <>
                        <Clock className="h-5 w-5 text-muted-foreground" />
                        <span className="font-medium text-foreground">Прогноз появится после 1-го факта или установки нормы</span>
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
                  {hasForecastInput && (
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
              <div className="mt-2 flex justify-between text-sm">
                <span className="text-muted-foreground">Внутренний дедлайн</span>
                {!hasInternalDeadline ? (
                  <span className="text-muted-foreground">Появится после нормы или факта</span>
                ) : (
                  <span className={cn("font-medium", internalDeltaDays !== null && internalDeltaDays < 0 ? "text-amber-700" : "text-green-700")}>
                    {internalDeadlineDate.toLocaleDateString("ru-RU")}
                    {internalDeltaDays !== null && (
                      <span className="ml-2 text-xs font-normal">
                        {internalDeltaDays > 0
                          ? `(запас ${internalDeltaDays} дн.)`
                          : internalDeltaDays < 0
                            ? `(опоздание ${Math.abs(internalDeltaDays)} дн.)`
                            : "(в срок)"}
                      </span>
                    )}
                  </span>
                )}
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
        </>
      ) : (
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-md bg-muted/50 p-3">
                <div className="text-xs text-muted-foreground">Дедлайн детали</div>
                <div className="text-sm font-medium mt-1">{partDeadlineDate.toLocaleDateString("ru-RU")}</div>
              </div>
              <div className="rounded-md bg-muted/50 p-3">
                <div className="text-xs text-muted-foreground">Срок от кооператора</div>
                <div className="text-sm font-medium mt-1">
                  {hasCooperationEta ? cooperationEtaDate?.toLocaleDateString("ru-RU") : "Не задан"}
                </div>
              </div>
              <div className="rounded-md bg-muted/50 p-3">
                <div className="text-xs text-muted-foreground">Отклонение по сроку</div>
                <div className="text-sm font-medium mt-1">
                  {cooperationDeltaDays !== null
                    ? cooperationDeltaDays > 0
                      ? `Запас ${cooperationDeltaDays} дн.`
                      : cooperationDeltaDays < 0
                        ? `Отставание ${Math.abs(cooperationDeltaDays)} дн.`
                        : "В срок"
                    : `До дедлайна ${Math.ceil((partDeadlineDate.getTime() - new Date(demoDate).getTime()) / (1000 * 60 * 60 * 24))} дн.`}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="overflow-x-auto overflow-y-hidden py-1">
          <TabsList className="h-10 md:h-9 w-max min-w-full justify-start">
            <TabsTrigger value="overview" className="flex-none shrink-0">Обзор</TabsTrigger>
            {!isCooperationRouteOnly && (
              <TabsTrigger value="facts" className="flex-none shrink-0">Факт</TabsTrigger>
            )}
            {!isCooperationRouteOnly && (
              <TabsTrigger value="journal" className="flex-none shrink-0">Журнал</TabsTrigger>
            )}
            <TabsTrigger value="logistics" className="flex-none shrink-0">Логистика</TabsTrigger>
            <TabsTrigger value="tasks" className="flex-none shrink-0">Задачи</TabsTrigger>
            {permissions.canViewAudit ? <TabsTrigger value="audit" className="flex-none shrink-0">События</TabsTrigger> : null}
            <TabsTrigger value="drawing" className="flex-none shrink-0">Чертёж</TabsTrigger>
          </TabsList>
        </div>
        
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

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Маршрут</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-md bg-muted/50 p-3">
                  <div className="text-xs text-muted-foreground">Текущее местоположение / держатель</div>
                  <div className="text-sm font-medium mt-1">
                    {routeCurrentLocation} / {routeCurrentHolder}
                  </div>
                </div>
                <div className="rounded-md bg-muted/50 p-3">
                  <div className="text-xs text-muted-foreground">{routeNextStageTitle}</div>
                  <div className="text-sm font-medium mt-1">
                    {routeNextStageLabel}
                  </div>
                </div>
                <div className="rounded-md bg-muted/50 p-3">
                  <div className="text-xs text-muted-foreground">{routeStatusTitle}</div>
                  <div className="text-sm font-medium mt-1">
                    {routeStatusDescription}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {routeStatusAt ? new Date(routeStatusAt).toLocaleString("ru-RU") : "Дата события пока не отмечена"}
                  </div>
                </div>
                <div className="rounded-md bg-muted/50 p-3">
                  <div className="text-xs text-muted-foreground">Ориентир поступления</div>
                  <div className="text-sm font-medium mt-1">
                    {hasCooperationEta ? cooperationEtaDate?.toLocaleDateString("ru-RU") : "Не задан"}
                  </div>
                </div>
                {shouldShowCooperationControl && (
                  <div
                    className={cn(
                      "rounded-md border p-3 md:col-span-2",
                      cooperationControlTone === "ok" && "border-green-200 bg-green-50/60",
                      cooperationControlTone === "risk" && "border-amber-200 bg-amber-50/60",
                      cooperationControlTone === "neutral" && "border-muted bg-muted/40"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs text-muted-foreground">Кооперация</div>
                      <Badge
                        variant="outline"
                        className={cn(
                          cooperationControlTone === "ok" && "border-green-600 text-green-700",
                          cooperationControlTone === "risk" && "border-amber-600 text-amber-700",
                          cooperationControlTone === "neutral" && "border-muted-foreground/40 text-muted-foreground"
                        )}
                      >
                        {!hasCooperationEta
                          ? "Срок не задан"
                          : cooperationControlTone === "risk"
                            ? "Риск"
                            : "В срок"}
                      </Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span>Срок от кооператора: {hasCooperationEta ? cooperationEtaDate?.toLocaleDateString("ru-RU") : "—"}</span>
                      <span>Дедлайн: {partDeadlineDate.toLocaleDateString("ru-RU")}</span>
                      <span>
                        {cooperationDeltaDays !== null
                          ? cooperationDeltaDays > 0
                            ? `запас ${cooperationDeltaDays} дн.`
                            : cooperationDeltaDays < 0
                              ? `отставание ${Math.abs(cooperationDeltaDays)} дн.`
                              : "в срок"
                          : `до дедлайна ${Math.ceil((partDeadlineDate.getTime() - new Date(demoDate).getTime()) / (1000 * 60 * 60 * 24))} дн.`}
                      </span>
                      {journeySummary?.last_movement?.tracking_number && (
                        <span>
                          Трекинг: {journeySummary.last_movement.tracking_number}
                          {journeySummary.last_movement.last_tracking_status
                            ? ` (${journeySummary.last_movement.last_tracking_status})`
                            : ""}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">
                      План после кооперации: {cooperationRouteText}
                    </div>
                    <div className="mt-3 rounded-md border bg-background/70 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs text-muted-foreground">Входной контроль после поступления</div>
                        <Badge
                          variant="outline"
                          className={cn(
                            cooperationQcTone === "ok" && "border-green-600 text-green-700",
                            cooperationQcTone === "risk" && "border-destructive text-destructive",
                            cooperationQcTone === "neutral" && "border-muted-foreground/40 text-muted-foreground"
                          )}
                        >
                          {cooperationQcLabel}
                        </Badge>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {cooperationQcCheckedAt ? `Проверено: ${cooperationQcCheckedAt}` : "Проверка пока не отмечена"}
                      </div>
                      {canEditCooperationDueDate && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            className="h-8"
                            onClick={() => void handleSetCooperationQc("accepted")}
                            disabled={isSavingCooperationQc || !canRunCooperationQcDecision}
                          >
                            Принято
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            className="h-8"
                            onClick={() => void handleSetCooperationQc("rejected")}
                            disabled={isSavingCooperationQc || !canRunCooperationQcDecision}
                          >
                            Не принято
                          </Button>
                        </div>
                      )}
                      {canEditCooperationDueDate && !canRunCooperationQcDecision && (
                        <div className="mt-2 text-xs text-muted-foreground">
                          Сначала отметьте в логистике статус «Получено», затем фиксируйте входной контроль.
                        </div>
                      )}
                      {cooperationQcError && (
                        <div className="mt-2 text-xs text-destructive">{cooperationQcError}</div>
                      )}
                    </div>
                    {canEditCooperationDueDate && !isEditingCooperationDueDate && (
                      <div className="mt-3">
                        <Button
                          type="button"
                          variant="outline"
                          className="h-9"
                          onClick={() => {
                            setCooperationDueDateError("")
                            setIsEditingCooperationDueDate(true)
                          }}
                        >
                          Изменить срок кооператора
                        </Button>
                      </div>
                    )}
                    {canEditCooperationDueDate && isEditingCooperationDueDate && (
                      <div className="mt-3 flex flex-wrap items-end gap-2">
                        <div className="space-y-1">
                          <Label htmlFor="cooperation-due-date" className="text-xs text-muted-foreground">
                            Срок от кооператора (ориентир)
                          </Label>
                          <Input
                            id="cooperation-due-date"
                            type="date"
                            className="h-9 w-[220px]"
                            value={cooperationDueDateDraft}
                            onChange={(event) => setCooperationDueDateDraft(event.target.value)}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-9"
                          onClick={() => void handleSaveCooperationDueDate()}
                          disabled={isSavingCooperationDueDate}
                        >
                          {isSavingCooperationDueDate ? "Сохраняем..." : "Сохранить"}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-9"
                          onClick={() => {
                            setCooperationDueDateError("")
                            setIsEditingCooperationDueDate(false)
                          }}
                          disabled={isSavingCooperationDueDate}
                        >
                          Отмена
                        </Button>
                        {cooperationDueDateError && (
                          <div className="w-full text-xs text-destructive">{cooperationDueDateError}</div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
          
          {!isCooperationRouteOnly && (
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
          )}
        </TabsContent>
        
        {!isCooperationRouteOnly && (
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
        )}
        
        {!isCooperationRouteOnly && (
          <TabsContent value="journal">
            <FactJournal part={part} />
          </TabsContent>
        )}
        
        <TabsContent value="logistics">
          <LogisticsList part={part} />
        </TabsContent>
        
        <TabsContent value="tasks">
          <TasksList partId={part.id} machineId={part.machine_id} />
        </TabsContent>
        
        <TabsContent value="audit">
          {permissions.canViewAudit ? <AuditLogView partId={part.id} /> : null}
        </TabsContent>
        
        <TabsContent value="drawing" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Чертёж детали</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {drawingUrlValue ? (
                <div className="space-y-3">
                  <div className="aspect-video bg-muted rounded-lg flex items-center justify-center overflow-hidden">
                    {isImageDrawing && !drawingError ? (
                      isLoadingDrawingBlob ? (
                        <div className="text-center text-muted-foreground p-6">
                          <Loader2 className="h-10 w-10 mx-auto mb-2 animate-spin opacity-60" />
                          <p>Загружаем файл...</p>
                        </div>
                      ) : (
                        <img
                          src={drawingBlobUrl || drawingUrlValue || "/placeholder.svg"}
                          alt={`Чертёж ${part.code}`}
                          className="max-w-full max-h-full object-contain"
                          onError={() => setDrawingError(true)}
                        />
                      )
                    ) : (
                      <div className="text-center text-muted-foreground p-6">
                        {isPdfDrawing ? (
                          <FileText className="h-10 w-10 mx-auto mb-2 opacity-60" />
                        ) : (
                          <FileImage className="h-10 w-10 mx-auto mb-2 opacity-60" />
                        )}
                        <p>
                          {isPdfDrawing
                            ? "PDF-чертёж"
                            : drawingError
                            ? "Не удалось загрузить изображение"
                            : "Неподдерживаемый формат или некорректный путь"}
                        </p>
                        {!isKnownDrawingType && !drawingError && (
                          <p className="text-xs mt-1">Поддерживаются PDF и изображения</p>
                        )}
                        {drawingError && (
                          <p className="text-xs mt-1 break-all">Путь: {drawingUrlValue}</p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button variant="outline" className="w-full bg-transparent" onClick={() => void handleOpenDrawing()}>
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Открыть в новой вкладке
                    </Button>
                    {permissions.canEditFacts && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" className="w-full" disabled={isSavingDrawing}>
                            Удалить чертёж
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Удалить чертёж?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Ссылка и файл будут отвязаны от детали. Это действие можно отменить, загрузив новый файл.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Отмена</AlertDialogCancel>
                            <AlertDialogAction onClick={handleDeleteDrawing}>
                              Удалить
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
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
                  <div className="flex items-center justify-between">
                    <Label htmlFor="drawing-file" className="text-sm">
                      Загрузка файла
                    </Label>
                    {isUploadingDrawing && (
                      <span className="text-xs text-muted-foreground">Загрузка...</span>
                    )}
                  </div>
                  <Input
                    id="drawing-file"
                    ref={drawingInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    className="sr-only"
                    onChange={handleUploadDrawing}
                  />
                  <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                    <Button
                      type="button"
                      onClick={() => drawingInputRef.current?.click()}
                      disabled={isUploadingDrawing}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      {isUploadingDrawing ? "Загрузка..." : "Загрузить файл"}
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      PDF или изображение (PNG, JPG, WebP).
                    </span>
                  </div>

                  {drawingActionError && (
                    <div className="text-sm text-destructive" role="status" aria-live="polite">
                      {drawingActionError}
                    </div>
                  )}

                  <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-auto px-2 py-1 text-sm"
                      onClick={() => setShowLinkInput((prev) => !prev)}
                    >
                      <Link className="h-4 w-4 mr-2" />
                      {showLinkInput ? "Скрыть ссылку" : "Ссылка (резервный вариант)"}
                    </Button>
                    {showLinkInput && (
                      <div className="space-y-2">
                        <Label htmlFor="drawing-url">Ссылка на чертёж</Label>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <Input
                            id="drawing-url"
                            placeholder="https://example.com/drawing.pdf"
                            value={drawingUrl}
                            onChange={(e) => setDrawingUrl(e.target.value)}
                          />
                          <Button onClick={handleSaveDrawing} disabled={!drawingUrl || isSavingDrawing}>
                            {isSavingDrawing ? "Сохраняем..." : "Сохранить"}
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Вставьте ссылку на изображение или PDF-файл чертежа.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
