"use client"

import React from "react"

import { useEffect, useRef, useState } from "react"
import { useApp } from "@/lib/app-context"
import type { DeviationReason, Part, PartStatus, ProductionStage, ShiftType } from "@/lib/types"
import { STAGE_LABELS, DEVIATION_REASON_LABELS, SHIFT_LABELS } from "@/lib/types"
import { STAGE_ICONS } from "@/lib/stage-icons"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
  Loader2,
  ListChecks,
  History,
  CircleDot,
  PlayCircle,
  AlertCircle,
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

type OperatorDetailUiState = "waiting" | "in_work" | "done"

const OPERATOR_UI_STATE_BY_PART_STATUS: Record<PartStatus, OperatorDetailUiState> = {
  not_started: "waiting",
  in_progress: "in_work",
  done: "done",
}

export function PartDetails({ part, onBack }: PartDetailsProps) {
  const { 
    getPartProgress, 
    getPartForecast, 
    getMachineById,
    getMachineNorm,
    machines,
    getStageFactsForPart,
    getLogisticsForPart,
    getJourneyForPart,
    getTasksForPart,
    createStageFact,
    updateStageFact,
    startTask,
    isTaskAssignedToUser,
    getUserById,
    demoDate,
    currentUser,
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
  const [machineDraftId, setMachineDraftId] = useState("")
  const [isSavingMachine, setIsSavingMachine] = useState(false)
  const [machineAssignError, setMachineAssignError] = useState("")
  const [cooperationQcOptimistic, setCooperationQcOptimistic] = useState<{
    status: "pending" | "accepted" | "rejected"
    checkedAt: string | null
  } | null>(null)
  const [operatorQtyGood, setOperatorQtyGood] = useState("0")
  const [operatorQtyScrap, setOperatorQtyScrap] = useState("0")
  const [operatorDeviationReason, setOperatorDeviationReason] = useState<DeviationReason>(null)
  const [operatorComment, setOperatorComment] = useState("")
  const [operatorFactError, setOperatorFactError] = useState("")
  const [operatorFactHint, setOperatorFactHint] = useState("")
  const [isSavingOperatorFact, setIsSavingOperatorFact] = useState(false)
  const [operatorEditMode, setOperatorEditMode] = useState(true)
  const [operatorStartError, setOperatorStartError] = useState("")
  const [isStartingOperatorTask, setIsStartingOperatorTask] = useState(false)
  const [operatorNow, setOperatorNow] = useState(() => new Date())
  const drawingInputRef = useRef<HTMLInputElement | null>(null)
  const isCooperationRouteOnly = part.is_cooperation
  const MAX_DRAWING_FILE_SIZE_BYTES = 9 * 1024 * 1024

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
    setMachineDraftId(part.machine_id || "")
    setMachineAssignError("")
  }, [part.id, part.machine_id])

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

  useEffect(() => {
    setCooperationQcOptimistic(null)
  }, [part.id, part.cooperation_qc_status, part.cooperation_qc_checked_at])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setOperatorNow(new Date())
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

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
  const machiningMachines = machines.filter((m) => m.department === "machining")
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
  }, [
    getJourneyForPart,
    part.id,
    part.status,
    part.cooperation_qc_status,
    part.cooperation_qc_checked_at,
    part.cooperation_due_date,
    logistics.length,
    stageFacts.length,
  ])

  useEffect(() => {
    if (!isCooperationRouteOnly) return
    if (activeTab === "facts" || activeTab === "journal") {
      setActiveTab("overview")
    }
  }, [activeTab, isCooperationRouteOnly])
  
  // Calculate stages progress with null safety
  const stageStatuses = part.stage_statuses || []
  const stageStatusMap = new Map(stageStatuses.map((status) => [status.stage, status.status] as const))

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
  const isOperatorDetail = currentUser?.role === "operator"
  const operatorUiState = OPERATOR_UI_STATE_BY_PART_STATUS[part.status]
  const operatorIsWaiting = operatorUiState === "waiting"
  const operatorIsDone = operatorUiState === "done"
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
  const cooperationRouteStages = part.required_stages
    .filter((stage) => stage === "galvanic" || stage === "heat_treatment")
    .map((stage) => STAGE_LABELS[stage])
  const cooperationRouteText = cooperationRouteStages.length > 0
    ? [...cooperationRouteStages, "ОТК"].join(" -> ")
    : "ОТК"
  const cooperationMovements = logistics.filter((entry) => !entry.stage_id)
  const cooperationReceivedQty = cooperationMovements
    .filter((entry) => entry.status === "received" || entry.status === "completed")
    .reduce((sum, entry) => sum + (entry.qty_received ?? entry.qty_sent ?? entry.quantity ?? 0), 0)
  const operatorProducedQty = part.is_cooperation ? cooperationReceivedQty : overallQtyDone
  const operatorProgressPercent = part.qty_plan > 0
    ? Math.min(100, Math.round((operatorProducedQty / part.qty_plan) * 100))
    : 0
  const operatorDaysToDeadline = hasPartDeadline
    ? Math.ceil((partDeadlineDate.getTime() - new Date(demoDate).getTime()) / (1000 * 60 * 60 * 24))
    : null
  const operatorStatusLabel = operatorIsWaiting
    ? "В ожидании"
    : operatorIsDone
      ? "Готово"
      : "В работе"
  const operatorStatusHint = operatorIsWaiting
    ? "Ожидает первого факта по смене"
    : operatorIsDone
      ? "Все этапы закрыты и деталь завершена"
      : "Есть активное производство"
  const operatorProgressHint = operatorIsWaiting
    ? "Нет активного факта"
    : operatorIsDone
      ? "Финальный результат по детали"
      : `${operatorProducedQty.toLocaleString()} из ${part.qty_plan.toLocaleString()}`
  const cooperationHasActiveShipment = cooperationMovements.some(
    (entry) => entry.status === "sent" || entry.status === "in_transit"
  )
  const cooperationExternalStages = part.required_stages.filter(
    (stage) => stage === "heat_treatment" || stage === "galvanic" || stage === "grinding"
  )
  const cooperationExternalStagesDone = cooperationExternalStages.every(
    (stage) => stageStatusMap.get(stage) === "done"
  )
  const cooperationFullyReceived = cooperationReceivedQty >= part.qty_plan
  const cooperationQcStatus = cooperationQcOptimistic?.status || part.cooperation_qc_status || "pending"
  const cooperationQcCheckedAtRaw = cooperationQcOptimistic?.checkedAt ?? part.cooperation_qc_checked_at ?? null
  const cooperationQcCheckedAt = cooperationQcCheckedAtRaw
    ? new Date(cooperationQcCheckedAtRaw).toLocaleString("ru-RU")
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
  const canRunCooperationQcDecision =
    canEditCooperationDueDate &&
    cooperationFullyReceived &&
    !cooperationHasActiveShipment &&
    cooperationExternalStagesDone
  const isCooperationReadyToClose =
    cooperationQcStatus === "accepted" &&
    cooperationFullyReceived &&
    !cooperationHasActiveShipment &&
    cooperationExternalStagesDone
  const routeNextStageTitle = part.is_cooperation ? "Следующее действие" : "Следующий этап"
  const routeNextStageLabel = (() => {
    if (!part.is_cooperation) {
      return journeySummary?.next_required_stage
        ? STAGE_LABELS[journeySummary.next_required_stage]
        : "Не требуется"
    }
    if (isCooperationReadyToClose || (cooperationQcStatus === "accepted" && part.status === "done")) {
      return "Маршрут завершён"
    }
    if (!cooperationFullyReceived) {
      return "Ожидаем поступление от кооператора"
    }
    const pendingExternalStage = cooperationExternalStages.find((stage) => stageStatusMap.get(stage) !== "done")
    if (pendingExternalStage) {
      return STAGE_LABELS[pendingExternalStage]
    }
    if (cooperationQcStatus === "pending") {
      return "Входной контроль (ОТК)"
    }
    return "Ожидаем закрытие детали"
  })()
  const routeStatusTitle = part.is_cooperation ? "Статус кооперации" : "Последнее событие"
  const routeStatusDescription = (() => {
    const lastMovement = journeySummary?.last_movement
    if (!part.is_cooperation) return routeLastEventDescription
    if (cooperationQcStatus === "accepted") {
      return isCooperationReadyToClose || part.status === "done"
        ? "Входной контроль принят, деталь закрыта"
        : "Входной контроль принят"
    }
    if (cooperationQcStatus === "rejected") return "Входной контроль не принят"
    if (!lastMovement) return "Кооперация запланирована, отправка ещё не отмечена"
    const destination = lastMovement.to_holder || lastMovement.to_location
    if (lastMovement.status === "pending") return "Черновик отправки (ещё не отправлено)"
    if (lastMovement.status === "sent") return destination ? `Отправлено: ${destination}` : "Отправлено кооператору"
    if (lastMovement.status === "in_transit") return destination ? `В пути: ${destination}` : "В пути к кооператору"
    if (lastMovement.status === "received" || lastMovement.status === "completed") {
      if (routeCurrentLocation === "Кооператор + Цех" && routeCurrentHolder) {
        return `Частично получено: ${routeCurrentHolder}`
      }
      return "Получено от кооператора"
    }
    if (lastMovement.status === "returned") return "Возврат от кооператора"
    if (lastMovement.status === "cancelled") return "Отправка отменена"
    return routeLastEventDescription
  })()
  const routeStatusAt = part.is_cooperation
    ? (
        (cooperationQcStatus !== "pending" ? cooperationQcCheckedAtRaw : null) ||
        journeySummary?.last_movement?.received_at ||
        journeySummary?.last_movement?.returned_at ||
        journeySummary?.last_movement?.cancelled_at ||
        journeySummary?.last_movement?.sent_at ||
        journeySummary?.last_movement?.updated_at ||
        routeLastEventAt
      )
    : routeLastEventAt
  const machineNorm = part.machine_id ? getMachineNorm(part.machine_id, part.id, "machining") : undefined
  const operatorNormQty = machineNorm?.qty_per_shift ?? 0
  const partTasks = getTasksForPart(part.id)
  const operatorTaskPool = currentUser ? partTasks.filter((task) => isTaskAssignedToUser(task, currentUser)) : partTasks
  const activePartTasks = [...operatorTaskPool]
    .filter((task) => task.status !== "done")
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
  const recentShiftFacts = sortedFacts.slice(0, 4)
  const operatorCurrentShift: ShiftType = (() => {
    const hour = operatorNow.getHours()
    return hour >= 9 && hour < 21 ? "day" : "night"
  })()
  const operatorShiftStart = new Date(operatorNow)
  const operatorShiftEnd = new Date(operatorNow)
  if (operatorCurrentShift === "day") {
    operatorShiftStart.setHours(9, 0, 0, 0)
    operatorShiftEnd.setHours(21, 0, 0, 0)
  } else if (operatorNow.getHours() < 9) {
    operatorShiftStart.setDate(operatorShiftStart.getDate() - 1)
    operatorShiftStart.setHours(21, 0, 0, 0)
    operatorShiftEnd.setHours(9, 0, 0, 0)
  } else {
    operatorShiftStart.setHours(21, 0, 0, 0)
    operatorShiftEnd.setDate(operatorShiftEnd.getDate() + 1)
    operatorShiftEnd.setHours(9, 0, 0, 0)
  }
  const operatorShiftRemainingMs = Math.max(0, operatorShiftEnd.getTime() - operatorNow.getTime())
  const operatorShiftHours = Math.floor(operatorShiftRemainingMs / 3_600_000)
  const operatorShiftMinutes = Math.floor((operatorShiftRemainingMs % 3_600_000) / 60_000)
  const operatorShiftSeconds = Math.floor((operatorShiftRemainingMs % 60_000) / 1_000)
  const operatorShiftCountdown = `${String(operatorShiftHours).padStart(2, "0")}:${String(operatorShiftMinutes).padStart(2, "0")}:${String(operatorShiftSeconds).padStart(2, "0")}`
  const operatorShiftRangeLabel = operatorCurrentShift === "day" ? "09:00 - 21:00" : "21:00 - 09:00"
  const operatorCurrentFact = stageFacts.find(
    (fact) =>
      fact.date === demoDate &&
      fact.stage === "machining" &&
      fact.shift_type === operatorCurrentShift
  )
  const operatorInputDisabled = operatorIsWaiting || operatorIsDone
  const operatorFormLockedByState = operatorInputDisabled
  const operatorFormReadOnly = operatorFormLockedByState || (Boolean(operatorCurrentFact) && !operatorEditMode)
  const canEditExistingFact = Boolean(operatorCurrentFact) && !operatorFormLockedByState
  const operatorInputDisabledReason = operatorIsWaiting
    ? "Ввод данных станет доступен после перехода детали в работу."
    : operatorIsDone
      ? "Деталь завершена. Ввод факта закрыт."
      : null
  const startableTask =
    operatorTaskPool.find((task) => task.status === "accepted") ||
    operatorTaskPool.find((task) => task.status === "open")
  const canShowStartButton = operatorIsWaiting

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
    const checkedAt = new Date().toISOString()
    setCooperationQcOptimistic({ status: nextStatus, checkedAt })
    try {
      await updatePart({
        ...part,
        cooperation_qc_status: nextStatus,
        cooperation_qc_checked_at: checkedAt,
      })
      try {
        const journey = await getJourneyForPart(part.id)
        setJourneySummary(journey)
      } catch {
        // Do not block successful QC update on journey refetch failure.
      }
    } catch (error) {
      setCooperationQcOptimistic(null)
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
    if (file.size > MAX_DRAWING_FILE_SIZE_BYTES) {
      setDrawingActionError("Файл слишком большой. Загрузите файл до 9 МБ.")
      event.target.value = ""
      return
    }
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

  useEffect(() => {
    if (!isOperatorDetail) return
    if (operatorCurrentFact) {
      setOperatorQtyGood(String(operatorCurrentFact.qty_good ?? 0))
      setOperatorQtyScrap(String(operatorCurrentFact.qty_scrap ?? 0))
      setOperatorDeviationReason(operatorCurrentFact.deviation_reason ?? null)
      setOperatorComment(operatorCurrentFact.comment || "")
      setOperatorEditMode(false)
    } else {
      setOperatorQtyGood("0")
      setOperatorQtyScrap("0")
      setOperatorDeviationReason(null)
      setOperatorComment("")
      setOperatorEditMode(true)
    }
    setOperatorFactError("")
    setOperatorFactHint("")
  }, [isOperatorDetail, operatorCurrentFact?.id, demoDate, operatorCurrentShift])

  const handleOperatorStart = async () => {
    if (!startableTask) {
      setOperatorStartError("Нет задачи для запуска. Выберите или создайте задачу справа.")
      return
    }
    setOperatorStartError("")
    setIsStartingOperatorTask(true)
    try {
      await startTask(startableTask.id)
    } catch (error) {
      setOperatorStartError(error instanceof Error ? error.message : "Не удалось запустить задачу")
    } finally {
      setIsStartingOperatorTask(false)
    }
  }

  const handleOperatorFactSave = async () => {
    if (!currentUser?.id) {
      setOperatorFactError("Оператор не определён")
      return
    }
    if (!part.machine_id) {
      setOperatorFactError("Станок не назначен в карточке детали")
      return
    }
    if (operatorFormLockedByState) {
      setOperatorFactError("Ввод данных недоступен в текущем статусе")
      return
    }
    const qtyGoodNumber = Number.parseInt(operatorQtyGood, 10)
    const qtyScrapNumber = Number.parseInt(operatorQtyScrap, 10) || 0
    if (!Number.isFinite(qtyGoodNumber) || qtyGoodNumber < 0) {
      setOperatorFactError("Укажите корректное количество годных")
      return
    }
    if (!Number.isFinite(qtyScrapNumber) || qtyScrapNumber < 0) {
      setOperatorFactError("Укажите корректное количество брака")
      return
    }
    if (qtyGoodNumber === 0 && qtyScrapNumber === 0) {
      setOperatorFactError("Укажите количество годных или брака")
      return
    }

    setOperatorFactError("")
    setOperatorFactHint("")
    setIsSavingOperatorFact(true)
    try {
      if (operatorCurrentFact) {
        await updateStageFact(operatorCurrentFact.id, {
          operator_id: currentUser.id,
          machine_id: part.machine_id,
          qty_good: qtyGoodNumber,
          qty_scrap: qtyScrapNumber,
          qty_expected: operatorNormQty || 0,
          comment: operatorComment,
          deviation_reason: operatorDeviationReason,
          attachments: operatorCurrentFact.attachments || [],
        })
      } else {
        await createStageFact({
          date: demoDate,
          shift_type: operatorCurrentShift,
          part_id: part.id,
          stage: "machining",
          operator_id: currentUser.id,
          machine_id: part.machine_id,
          qty_good: qtyGoodNumber,
          qty_scrap: qtyScrapNumber,
          qty_expected: operatorNormQty || 0,
          comment: operatorComment,
          deviation_reason: operatorDeviationReason,
          attachments: [],
        })
      }
      setOperatorFactHint("Данные по смене сохранены")
      setOperatorEditMode(false)
    } catch (error) {
      setOperatorFactError(error instanceof Error ? error.message : "Не удалось сохранить данные")
    } finally {
      setIsSavingOperatorFact(false)
    }
  }

  const handleSaveMachineAssignment = async () => {
    if (part.is_cooperation || !permissions.canEditParts) return
    setMachineAssignError("")
    setIsSavingMachine(true)
    try {
      await updatePart({
        ...part,
        machine_id: machineDraftId || undefined,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось сохранить станок"
      setMachineAssignError(message)
    } finally {
      setIsSavingMachine(false)
    }
  }

  if (isOperatorDetail) {
    const operatorStatusTitle = operatorIsWaiting ? "В ожидании" : operatorIsDone ? "Готово" : "В работе"
    const operatorStatusTone = operatorIsWaiting
      ? "text-blue-600"
      : operatorIsDone
        ? "text-emerald-600"
        : "text-emerald-600"
    const operatorStatusBadgeTone = operatorIsWaiting
      ? "bg-blue-500 ring-blue-50"
      : operatorIsDone
        ? "bg-emerald-600 ring-emerald-50"
        : "bg-emerald-500 ring-emerald-50"
    const operatorDetailDeadlineLabel = hasPartDeadline ? partDeadlineDate.toLocaleDateString("ru-RU") : "Не задан"
    const operatorDetailDeadlineTone =
      operatorDaysToDeadline === null
        ? "text-muted-foreground"
        : operatorDaysToDeadline < 0
          ? "text-destructive"
          : operatorDaysToDeadline <= 2
            ? "text-amber-600"
            : "text-emerald-600"
    const progressCardPercent = operatorIsWaiting ? "--%" : `${operatorProgressPercent}%`
    const operatorElapsedMs = Math.max(0, operatorNow.getTime() - operatorShiftStart.getTime())
    const operatorElapsedHours = Math.floor(operatorElapsedMs / 3_600_000)
    const operatorElapsedMinutes = Math.floor((operatorElapsedMs % 3_600_000) / 60_000)
    const operatorElapsedSeconds = Math.floor((operatorElapsedMs % 60_000) / 1_000)
    const operatorElapsedLabel = `${String(operatorElapsedHours).padStart(2, "0")}:${String(operatorElapsedMinutes).padStart(2, "0")}:${String(operatorElapsedSeconds).padStart(2, "0")}`
    const operatorShiftEndLabel = operatorCurrentShift === "day" ? "Окончание смены в 21:00" : "Окончание смены в 09:00"
    const planNormQty = operatorNormQty > 0 ? operatorNormQty : null
    const planDeviationPercent = planNormQty
      ? Math.round((operatorProducedQty / planNormQty) * 100) - 100
      : null
    const planDeviationLabel = operatorIsWaiting
      ? "Ожидание запуска"
      : planDeviationPercent === null
        ? "Норма не задана"
        : planDeviationPercent >= 0
          ? `+${planDeviationPercent}% от нормы`
          : `${planDeviationPercent}% от нормы`
    const drawingPreviewTitle = drawingUrlValue ? part.code : "--"

    return (
      <div className="space-y-5 rounded-xl bg-white p-1">
        <div className="flex items-center gap-3 rounded-xl border border-[#e5e7eb] bg-white px-3 py-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Назад"
            className="h-10 w-10 rounded-lg"
            onClick={onBack}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="font-mono text-xl font-bold tracking-tight">{part.code}</h1>
            <div className="text-sm text-muted-foreground">
              {part.name}
              {machine && ` | ${machine.name}`}
              {part.customer && ` | ${part.customer}`}
            </div>
          </div>
        </div>

        {actionError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-destructive" role="status" aria-live="polite">
            {actionError}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-[#e5e7eb] bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-emerald-50 p-1.5 text-emerald-600">
                  <CircleDot className="h-4 w-4" />
                </div>
                <span className="text-sm font-medium text-muted-foreground">Статус</span>
              </div>
              <span className={cn("h-2.5 w-2.5 rounded-full ring-4", operatorStatusBadgeTone)} />
            </div>
            <div className={cn("mt-4 text-4xl font-bold leading-none", operatorStatusTone)}>
              {operatorStatusTitle}
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
              <Clock className="h-3.5 w-3.5" />
              {operatorIsWaiting ? "Ожидание запуска" : `Время работы: ${operatorElapsedLabel}`}
            </div>
          </div>

          <div className={cn("rounded-xl border border-[#e5e7eb] bg-white p-5 shadow-sm", operatorIsWaiting && "opacity-70")}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-blue-50 p-1.5 text-blue-600">
                  <TrendingUp className="h-4 w-4" />
                </div>
                <span className="text-sm font-medium text-muted-foreground">Прогресс</span>
              </div>
              <span className="text-2xl font-bold text-blue-600">{progressCardPercent}</span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-100">
              <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${operatorIsWaiting ? 0 : operatorProgressPercent}%` }} />
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              {operatorIsWaiting
                ? "Нет активной задачи"
                : `Выполнено ${operatorProducedQty.toLocaleString()} из ${part.qty_plan.toLocaleString()}`}
            </div>
          </div>

          <div className={cn("rounded-xl border border-[#e5e7eb] bg-white p-5 shadow-sm", operatorIsWaiting && "opacity-70")}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-amber-50 p-1.5 text-amber-600">
                  <ListChecks className="h-4 w-4" />
                </div>
                <span className="text-sm font-medium text-muted-foreground">План (норма) / Факт</span>
              </div>
            </div>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-4xl font-bold leading-none">{operatorIsWaiting ? 0 : operatorProducedQty.toLocaleString()}</span>
              <span className="text-xl text-muted-foreground">/ {planNormQty?.toLocaleString() || "—"} шт.</span>
            </div>
            <div className={cn(
              "mt-2 text-xs font-semibold",
              operatorIsWaiting || planDeviationPercent === null
                ? "text-muted-foreground"
                : planDeviationPercent < 0
                  ? "text-amber-600"
                  : "text-emerald-600"
            )}>
              {planDeviationLabel}
              {operatorNormQty > 0 && !operatorIsWaiting ? ` · Пусконаладочная норма ${operatorNormQty.toLocaleString()} / смена` : ""}
            </div>
          </div>

          <div className="rounded-xl border border-[#e5e7eb] bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-violet-50 p-1.5 text-violet-600">
                  <Clock className="h-4 w-4" />
                </div>
                <span className="text-sm font-medium text-muted-foreground">До конца смены</span>
              </div>
            </div>
            <div className="mt-4 font-mono text-4xl font-bold leading-none">{operatorShiftCountdown}</div>
            <div className="mt-2 text-xs text-muted-foreground">{operatorShiftEndLabel}</div>
            <div className={cn("mt-1 text-xs font-semibold", operatorDetailDeadlineTone)}>
              Дедлайн детали: {operatorDetailDeadlineLabel}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          <section className="xl:col-span-8">
            <div className="overflow-hidden rounded-xl border border-[#dfe3e8] bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5e7eb] bg-gray-50/70 px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
                    <FileText className="h-5 w-5" />
                  </div>
                  <h2 className="text-3xl font-bold tracking-tight">
                    {operatorInputDisabled ? "Ввод данных (Отключено)" : "Ввод данных"}
                  </h2>
                </div>
                <div className="inline-flex rounded-lg bg-gray-200 p-1">
                  <button
                    type="button"
                    className={cn(
                      "rounded-md px-4 py-1.5 text-xs font-bold",
                      operatorCurrentShift === "day" ? "bg-white text-primary shadow-sm ring-1 ring-black/5" : "text-muted-foreground"
                    )}
                  >
                    Смена 1 (Д)
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "rounded-md px-4 py-1.5 text-xs font-bold",
                      operatorCurrentShift === "night" ? "bg-white text-primary shadow-sm ring-1 ring-black/5" : "text-muted-foreground"
                    )}
                  >
                    Смена 2 (Н)
                  </button>
                </div>
              </div>

              <div className="p-5">
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <div className="space-y-4">
                    <div>
                      <Label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Оператор</Label>
                      <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                          {currentUser?.initials?.slice(0, 2) || "ОП"}
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-semibold text-foreground">{currentUser?.name || currentUser?.initials || "Оператор"}</div>
                          <div className="text-xs text-muted-foreground">ID: {currentUser?.id?.slice(0, 8) || "не задан"}</div>
                        </div>
                        <CheckCircle className="h-5 w-5 text-emerald-500" />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <Label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Станок</Label>
                        <Input value={machine?.name || "Не выбран"} readOnly className="h-11 bg-gray-100" />
                      </div>
                      <div>
                        <Label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Код детали</Label>
                        <Input value={part.code} readOnly className="h-11 bg-gray-50 font-mono" />
                      </div>
                    </div>

                    {canShowStartButton && (
                      <Button
                        type="button"
                        className="h-14 w-full rounded-xl bg-primary text-base font-bold uppercase tracking-wide hover:bg-primary/90"
                        onClick={() => void handleOperatorStart()}
                        disabled={isStartingOperatorTask}
                      >
                        <PlayCircle className="mr-2 h-5 w-5" />
                        {isStartingOperatorTask ? "Запуск..." : "Начать работу"}
                      </Button>
                    )}
                    {operatorStartError && <div className="text-xs text-destructive">{operatorStartError}</div>}

                    <div className="grid grid-cols-1 gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3 sm:grid-cols-2">
                      <div>
                        <Label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-emerald-600">Годные (шт)</Label>
                        <Input
                          type="number"
                          min={0}
                          value={operatorQtyGood}
                          onChange={(event) => setOperatorQtyGood(event.target.value)}
                          disabled={operatorFormReadOnly}
                          className={cn(
                            "h-11 bg-white text-center text-2xl font-bold",
                            operatorFormReadOnly && "border-zinc-300 bg-zinc-200 text-zinc-900"
                          )}
                        />
                      </div>
                      <div>
                        <Label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-red-600">Брак (шт)</Label>
                        <Input
                          type="number"
                          min={0}
                          value={operatorQtyScrap}
                          onChange={(event) => setOperatorQtyScrap(event.target.value)}
                          disabled={operatorFormReadOnly}
                          className={cn(
                            "h-11 bg-white text-center text-2xl font-bold",
                            operatorFormReadOnly && "border-zinc-300 bg-zinc-200 text-zinc-900"
                          )}
                        />
                      </div>
                    </div>

                    <div>
                      <Label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Причина брака</Label>
                      <Select
                        value={operatorDeviationReason || "none"}
                        onValueChange={(value) => setOperatorDeviationReason(value === "none" ? null : value as DeviationReason)}
                        disabled={operatorFormReadOnly}
                      >
                        <SelectTrigger className="h-11 w-full bg-white">
                          <SelectValue placeholder="-- Не выбрано --" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">-- Не выбрано --</SelectItem>
                          {Object.entries(DEVIATION_REASON_LABELS).map(([key, label]) => (
                            <SelectItem key={key} value={key}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Примечание</Label>
                      <textarea
                        value={operatorComment}
                        onChange={(event) => setOperatorComment(event.target.value)}
                        disabled={operatorFormReadOnly}
                        placeholder="Доп. информация..."
                        rows={2}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-foreground outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </div>

                    {canEditExistingFact && !operatorEditMode ? (
                      <Button
                        type="button"
                        className="h-14 w-full rounded-xl bg-zinc-900 text-base font-bold uppercase tracking-wide hover:bg-zinc-800"
                        onClick={() => setOperatorEditMode(true)}
                      >
                        Редактировать
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        className="h-14 w-full rounded-xl bg-primary text-base font-bold uppercase tracking-wide hover:bg-primary/90"
                        onClick={() => void handleOperatorFactSave()}
                        disabled={operatorFormLockedByState || isSavingOperatorFact}
                      >
                        {isSavingOperatorFact ? "Сохраняем..." : operatorCurrentFact ? "Сохранить изменения" : "Сохранить данные"}
                      </Button>
                    )}

                    {operatorFactError && (
                      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-destructive">{operatorFactError}</div>
                    )}
                    {operatorFactHint && (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{operatorFactHint}</div>
                    )}
                    {operatorInputDisabledReason && (
                      <div className="text-xs text-muted-foreground">{operatorInputDisabledReason}</div>
                    )}
                  </div>

                  <div className="flex h-full flex-col overflow-hidden rounded-xl border border-[#dfe3e8] bg-white">
                    <div className="flex items-center justify-between border-b border-[#e5e7eb] bg-gray-50 px-4 py-2.5">
                      <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
                        <FileImage className="h-4 w-4 text-primary" />
                        Чертеж: {drawingPreviewTitle}
                      </h3>
                      {drawingUrlValue ? (
                        <Button variant="ghost" size="sm" className="text-xs text-primary hover:text-primary" onClick={() => void handleOpenDrawing()}>
                          <ExternalLink className="mr-1 h-3.5 w-3.5" />
                          На весь экран
                        </Button>
                      ) : null}
                    </div>
                    <div
                      className="relative flex min-h-[480px] flex-1 items-center justify-center bg-white p-4"
                      style={{
                        backgroundImage:
                          "linear-gradient(#e5e7eb 1px, transparent 1px), linear-gradient(90deg, #e5e7eb 1px, transparent 1px)",
                        backgroundSize: "20px 20px",
                      }}
                    >
                      {drawingUrlValue && isImageDrawing && !drawingError ? (
                        <img
                          src={drawingBlobUrl || drawingUrlValue || "/placeholder.svg"}
                          alt={`Чертёж ${part.code}`}
                          className="h-full max-h-[430px] w-full object-contain drop-shadow-sm"
                          onError={() => setDrawingError(true)}
                        />
                      ) : (
                        <div className="rounded-lg border border-dashed border-gray-300 bg-white/80 px-6 py-8 text-center text-muted-foreground backdrop-blur-sm">
                          <AlertCircle className="mx-auto mb-2 h-10 w-10 opacity-60" />
                          <p className="text-sm">
                            {drawingUrlValue
                              ? "Не удалось открыть чертеж"
                              : "Чертеж не загружен"}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <aside className="space-y-6 xl:col-span-4">
            <div className="overflow-hidden rounded-xl border border-[#dfe3e8] bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-[#e5e7eb] bg-gray-50/60 px-4 py-3">
                <h2 className="text-sm font-bold uppercase tracking-wide">Задачи на смену</h2>
                <Badge className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary hover:bg-primary/10">
                  {activePartTasks.length}
                </Badge>
              </div>
              <div className="divide-y divide-gray-100">
                {activePartTasks.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-muted-foreground">Нет активных задач</div>
                ) : (
                  activePartTasks.slice(0, 4).map((task) => {
                    const isCurrent = task.status === "in_progress"
                    const isPriority = task.status === "accepted"
                    return (
                      <div
                        key={task.id}
                        className={cn(
                          "px-4 py-3",
                          isCurrent && "border-l-4 border-blue-500",
                          isPriority && !isCurrent && "border-l-4 border-amber-500 bg-amber-50/30",
                          !isCurrent && !isPriority && "border-l-4 border-gray-300 opacity-80"
                        )}
                      >
                        <div className="mb-1 flex items-start justify-between gap-2">
                          <div className={cn(
                            "text-xs font-bold uppercase",
                            isCurrent ? "text-blue-600" : isPriority ? "text-amber-600" : "text-muted-foreground"
                          )}>
                            {isCurrent ? "В процессе" : isPriority ? "Высокий приоритет" : "Ожидание"}
                          </div>
                          <div className="text-xs text-muted-foreground">{new Date(task.due_date).toLocaleDateString("ru-RU")}</div>
                        </div>
                        <div className="text-2xl font-semibold leading-tight">{task.title}</div>
                        <div className="mt-1 text-sm text-muted-foreground">{task.description || "Без описания"}</div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-[#dfe3e8] bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-[#e5e7eb] bg-gray-50/60 px-4 py-3">
                <h2 className="text-sm font-bold uppercase tracking-wide">История смен</h2>
                <span className="text-xs font-medium text-primary">См. все</span>
              </div>
              <div className="max-h-[430px] divide-y divide-gray-100 overflow-y-auto">
                {recentShiftFacts.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-muted-foreground">Записей пока нет</div>
                ) : (
                  recentShiftFacts.map((fact) => {
                    const factEfficiency = fact.qty_expected && fact.qty_expected > 0
                      ? Math.min(100, Math.round((fact.qty_good / fact.qty_expected) * 100))
                      : 100
                    const factRangeLabel = fact.shift_type === "day" ? "09:00 - 21:00" : "21:00 - 09:00"
                    return (
                      <div key={fact.id} className="px-4 py-3">
                        <div className="mb-2 flex items-center justify-between">
                          <div className="text-xl font-semibold">
                            {new Date(fact.date).toLocaleDateString("ru-RU")}, {fact.shift_type === "day" ? "Смена 1" : "Смена 2"}
                          </div>
                          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            {factRangeLabel}
                          </span>
                        </div>
                        <div className="mb-1 grid grid-cols-2 gap-3">
                          <div>
                            <div className="text-xs text-muted-foreground">Годные</div>
                            <div className="text-2xl font-bold text-emerald-600">{fact.qty_good.toLocaleString()} шт</div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-muted-foreground">Брак</div>
                            <div className="text-2xl font-bold text-red-600">{fact.qty_scrap.toLocaleString()} шт</div>
                          </div>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                          <div
                            className={cn("h-full rounded-full", factEfficiency >= 95 ? "bg-emerald-500" : factEfficiency >= 85 ? "bg-amber-500" : "bg-red-500")}
                            style={{ width: `${factEfficiency}%` }}
                          />
                        </div>
                        <div className="mt-1 text-[11px] text-muted-foreground">Эффективность: {factEfficiency}%</div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    )
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

      {!part.is_cooperation && permissions.canEditParts && (
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto] md:items-end">
              <div className="space-y-2">
                <Label>Станок для детали</Label>
                <Select
                  value={machineDraftId || "__none__"}
                  onValueChange={(value) => setMachineDraftId(value === "__none__" ? "" : value)}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Можно выбрать позже" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Без станка (назначу позже)</SelectItem>
                    {machiningMachines.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="text-xs text-muted-foreground">
                  Пока станок не назначен, ввод фактов недоступен.
                </div>
                {machineAssignError && (
                  <div className="text-xs text-destructive">{machineAssignError}</div>
                )}
              </div>
              <Button
                type="button"
                className="h-10"
                variant="outline"
                onClick={() => void handleSaveMachineAssignment()}
                disabled={isSavingMachine || machineDraftId === (part.machine_id || "")}
              >
                {isSavingMachine ? "Сохраняем..." : "Сохранить станок"}
              </Button>
            </div>
          </CardContent>
        </Card>
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
      {isOperatorDetail ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card className={cn(
            "border",
            operatorIsWaiting && "border-blue-200 bg-blue-50/50",
            operatorIsDone && "border-green-200 bg-green-50/50",
            !operatorIsWaiting && !operatorIsDone && "border-emerald-200 bg-emerald-50/40"
          )}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <CircleDot className={cn(
                    "h-4 w-4",
                    operatorIsWaiting && "text-blue-500",
                    operatorIsDone && "text-green-600",
                    !operatorIsWaiting && !operatorIsDone && "text-emerald-600"
                  )} />
                  <span className="text-sm">Статус</span>
                </div>
                <div className={cn(
                  "h-2.5 w-2.5 rounded-full",
                  operatorIsWaiting && "bg-blue-500",
                  operatorIsDone && "bg-green-600",
                  !operatorIsWaiting && !operatorIsDone && "bg-emerald-500"
                )} />
              </div>
              <div className="mt-3 text-3xl font-semibold leading-none">{operatorStatusLabel}</div>
              <div className="mt-2 text-xs text-muted-foreground">{operatorStatusHint}</div>
            </CardContent>
          </Card>

          <Card className={cn(operatorIsWaiting && "opacity-70 grayscale")}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">Прогресс</div>
                <div className="text-xl font-semibold">{operatorIsWaiting ? "--%" : `${operatorProgressPercent}%`}</div>
              </div>
              <Progress value={operatorIsWaiting ? 0 : operatorProgressPercent} className="mt-4 h-2" />
              <div className="mt-2 text-sm text-muted-foreground">{operatorProgressHint}</div>
            </CardContent>
          </Card>

          <Card className={cn(operatorIsWaiting && "opacity-70 grayscale")}>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">План / Факт</div>
              <div className="mt-3 text-4xl font-semibold leading-none">
                {operatorIsWaiting ? 0 : operatorProducedQty.toLocaleString()}
                <span className="text-2xl text-muted-foreground font-medium"> / {part.qty_plan.toLocaleString()} шт.</span>
              </div>
              <div className={cn(
                "mt-2 text-sm font-medium",
                operatorIsWaiting && "text-muted-foreground",
                operatorIsDone && "text-green-700",
                !operatorIsWaiting && !operatorIsDone && "text-amber-600"
              )}>
                {operatorIsWaiting
                  ? "Ожидание запуска"
                  : operatorIsDone
                    ? "Маршрут завершён"
                    : `Осталось ${Math.max(part.qty_plan - operatorProducedQty, 0).toLocaleString()} шт`}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Дедлайн смены</div>
              <div className="mt-3 text-4xl font-mono font-semibold leading-none">
                {operatorDaysToDeadline === null
                  ? "--:--"
                  : operatorDaysToDeadline >= 0
                    ? `${String(Math.max(operatorDaysToDeadline, 0)).padStart(2, "0")}:00`
                    : "00:00"}
              </div>
              <div className="mt-2 text-sm text-muted-foreground">
                {hasPartDeadline
                  ? `Дедлайн: ${partDeadlineDate.toLocaleDateString("ru-RU")}`
                  : "Окончание смены не задано"}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : !part.is_cooperation ? (
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
          {isOperatorDetail ? (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
              <Card className="xl:col-span-8 overflow-hidden">
                <CardHeader className="border-b bg-muted/20 pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-2 text-2xl font-bold">
                      <Package className="h-5 w-5 text-primary" />
                      {operatorInputDisabled ? "Ввод данных (Отключено)" : "Ввод данных"}
                    </CardTitle>
                    <div className="inline-flex items-center rounded-lg bg-muted p-1">
                      <button
                        type="button"
                        className={cn(
                          "rounded-md px-3 py-1.5 text-sm font-semibold",
                          operatorCurrentShift === "day"
                            ? "bg-background text-primary shadow-sm"
                            : "text-muted-foreground"
                        )}
                        disabled
                      >
                        Смена 1 (Д)
                      </button>
                      <button
                        type="button"
                        className={cn(
                          "rounded-md px-3 py-1.5 text-sm font-semibold",
                          operatorCurrentShift === "night"
                            ? "bg-background text-primary shadow-sm"
                            : "text-muted-foreground"
                        )}
                        disabled
                      >
                        Смена 2 (Н)
                      </button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <div className={cn(operatorInputDisabled && "opacity-60 grayscale pointer-events-none select-none")}>
                      {operatorInputDisabled ? (
                        <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
                          <div className="space-y-1">
                            <Label>Оператор</Label>
                            <Input value={currentUser?.initials || "—"} disabled />
                          </div>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="space-y-1">
                              <Label>Станок</Label>
                              <Input value={machine?.name || "Не выбран"} disabled />
                            </div>
                            <div className="space-y-1">
                              <Label>Код детали</Label>
                              <Input value={part.code} disabled />
                            </div>
                          </div>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="space-y-1">
                              <Label>Годные (шт)</Label>
                              <Input value="0" disabled />
                            </div>
                            <div className="space-y-1">
                              <Label>Брак (шт)</Label>
                              <Input value="0" disabled />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label>Причина брака</Label>
                            <Input value="-- Не выбрано --" disabled />
                          </div>
                          <div className="space-y-1">
                            <Label>Примечание</Label>
                            <Input value="Нет активной задачи..." disabled />
                          </div>
                          <Button disabled className="h-11 w-full">
                            Сохранить данные
                          </Button>
                          {operatorInputDisabledReason && (
                            <div className="text-xs text-muted-foreground">{operatorInputDisabledReason}</div>
                          )}
                        </div>
                      ) : (
                        <StageFactForm part={part} />
                      )}
                    </div>

                    <div className={cn("rounded-xl border", operatorInputDisabled && "opacity-70 grayscale")}>
                      <div className="flex items-center justify-between border-b bg-muted/20 px-3 py-2">
                        <div className="font-medium">
                          Чертёж: {drawingUrlValue ? part.code : "--"}
                        </div>
                        {drawingUrlValue && (
                          <Button variant="ghost" size="sm" onClick={() => void handleOpenDrawing()}>
                            На весь экран
                          </Button>
                        )}
                      </div>
                      <div className="min-h-[420px] bg-muted/30 p-4">
                        {drawingUrlValue && isImageDrawing && !drawingError ? (
                          <div className="h-full w-full rounded-md border bg-background p-3">
                            <img
                              src={drawingBlobUrl || drawingUrlValue || "/placeholder.svg"}
                              alt={`Чертёж ${part.code}`}
                              className="h-full max-h-[380px] w-full object-contain"
                              onError={() => setDrawingError(true)}
                            />
                          </div>
                        ) : drawingUrlValue && isPdfDrawing ? (
                          <div className="flex h-full min-h-[380px] items-center justify-center rounded-md border bg-background">
                            <div className="text-center text-muted-foreground">
                              <FileText className="mx-auto mb-2 h-10 w-10" />
                              <p>PDF-чертёж</p>
                              <p className="text-xs mt-1">Откройте «На весь экран»</p>
                            </div>
                          </div>
                        ) : (
                          <div className="flex h-full min-h-[380px] items-center justify-center rounded-md border bg-background">
                            <div className="text-center text-muted-foreground">
                              <FileImage className="mx-auto mb-2 h-12 w-12 opacity-50" />
                              <p>Чертёж не загружен</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-4 xl:col-span-4">
                <Card>
                  <CardHeader className="border-b bg-muted/20 py-3">
                    <CardTitle className="flex items-center justify-between text-lg">
                      <span className="flex items-center gap-2">
                        <ListChecks className="h-5 w-5 text-primary" />
                        Задачи на смену
                      </span>
                      <Badge variant="secondary">{activePartTasks.length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {activePartTasks.length === 0 ? (
                      <div className="px-4 py-6 text-sm text-muted-foreground">Нет активных задач</div>
                    ) : (
                      <div className="divide-y">
                        {activePartTasks.slice(0, 4).map((task) => (
                          <div key={task.id} className="px-4 py-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                {task.status === "in_progress" ? "В процессе" : task.status === "accepted" ? "Текущее" : "Ожидание"}
                              </div>
                              <div className="text-xs text-muted-foreground">{new Date(task.due_date).toLocaleDateString("ru-RU")}</div>
                            </div>
                            <div className="mt-1 text-xl font-semibold">{task.title}</div>
                            <div className="mt-1 text-sm text-muted-foreground">{task.description || "Без описания"}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="border-b bg-muted/20 py-3">
                    <CardTitle className="flex items-center justify-between text-lg">
                      <span className="flex items-center gap-2">
                        <History className="h-5 w-5 text-primary" />
                        История смен
                      </span>
                      <span className="text-sm font-medium text-primary">{recentShiftFacts.length > 0 ? "См. все" : ""}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 p-4">
                    {recentShiftFacts.length === 0 ? (
                      <div className="text-sm text-muted-foreground">Записей пока нет</div>
                    ) : (
                      recentShiftFacts.map((fact) => (
                        <div key={fact.id} className="rounded-lg border p-3">
                          <div className="flex items-center justify-between">
                            <div className="font-medium">
                              {new Date(fact.date).toLocaleDateString("ru-RU")}, {fact.shift_type === "day" ? "Смена 1" : fact.shift_type === "night" ? "Смена 2" : "Без смены"}
                            </div>
                            <div className="text-xs text-muted-foreground">{STAGE_LABELS[fact.stage]}</div>
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <div className="text-muted-foreground">Годные</div>
                              <div className="font-semibold text-green-600">{fact.qty_good.toLocaleString()} шт</div>
                            </div>
                            <div className="text-right">
                              <div className="text-muted-foreground">Брак</div>
                              <div className="font-semibold text-destructive">{fact.qty_scrap.toLocaleString()} шт</div>
                            </div>
                          </div>
                          <Progress
                            className="mt-2 h-2"
                            value={fact.qty_expected && fact.qty_expected > 0 ? Math.min(100, Math.round((fact.qty_good / fact.qty_expected) * 100)) : 100}
                          />
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : (
          <>
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
                      <div className="mt-1 text-xs text-muted-foreground">
                        {cooperationQcStatus === "accepted"
                          ? isCooperationReadyToClose || part.status === "done"
                            ? "ОТК принят. Деталь закрыта."
                            : "ОТК принят. Ожидается финализация карточки."
                          : cooperationQcStatus === "rejected"
                            ? "ОТК не принят. Деталь остаётся в работе."
                            : "После полного поступления нажмите «Принято» или «Не принято»."}
                      </div>
                      {canEditCooperationDueDate && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant={cooperationQcStatus === "accepted" ? "default" : "outline"}
                            className={cn(
                              "h-8",
                              cooperationQcStatus === "accepted" && "border-green-600 bg-green-600 text-white hover:bg-green-600"
                            )}
                            onClick={() => void handleSetCooperationQc("accepted")}
                            disabled={isSavingCooperationQc || !canRunCooperationQcDecision}
                          >
                            Принято
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            className={cn(
                              "h-8",
                              cooperationQcStatus === "rejected" && "ring-2 ring-destructive/30"
                            )}
                            onClick={() => void handleSetCooperationQc("rejected")}
                            disabled={isSavingCooperationQc || !canRunCooperationQcDecision}
                          >
                            Не принято
                          </Button>
                        </div>
                      )}
                      {canEditCooperationDueDate && !canRunCooperationQcDecision && (
                        <div className="mt-2 text-xs text-muted-foreground">
                          Входной контроль доступен после полного поступления и завершения внешних этапов.
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
          </>
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
