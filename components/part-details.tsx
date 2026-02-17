"use client"

import React from "react"

import { useEffect, useMemo, useRef, useState } from "react"
import { useApp } from "@/lib/app-context"
import type { MovementStatus, Part } from "@/lib/types"
import { PART_STATUS_LABELS, STAGE_LABELS } from "@/lib/types"
import { apiClient } from "@/lib/api-client"
import { AuditLogView } from "@/components/audit-log-view"
import { LogisticsList } from "@/components/logistics-list"
import { TasksList } from "@/components/tasks-list"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { KPIStrip } from "@/components/ui/kpi-strip"
import { Separator } from "@/components/ui/separator"
import { StatusInsetStrip } from "@/components/ui/status-inset-strip"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
  Building2,
  CheckCircle2,
  ExternalLink,
  FileImage,
  FileText,
  Link,
  Loader2,
  MoreHorizontal,
  Trash2,
  Upload,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface PartDetailsProps {
  part: Part
  onBack: () => void
}

type HeaderStatusTone = "success" | "warning" | "info"
type TabKey = "overview" | "logistics" | "tasks" | "events" | "drawing"
type QualityDraft = "pending" | "accepted" | "rejected"

const ACTIVE_MOVEMENT_STATUSES = new Set<MovementStatus>(["sent", "in_transit"])

function formatDate(value?: string): string {
  if (!value) return "—"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return "—"
  return parsed.toLocaleDateString("ru-RU")
}

function formatDateTime(value?: string): string {
  if (!value) return "—"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return "—"
  return parsed.toLocaleString("ru-RU")
}

function getHeaderStatus(
  part: Part,
  internalDeltaDays: number | null,
  cooperationDeltaDays: number | null
): { label: string; tone: HeaderStatusTone } {
  if (part.cooperation_qc_status === "accepted" || part.status === "done") {
    return { label: "Accepted", tone: "success" }
  }

  if ((internalDeltaDays !== null && internalDeltaDays < 0) || (cooperationDeltaDays !== null && cooperationDeltaDays < 0)) {
    return { label: "Delayed", tone: "warning" }
  }

  if (part.status === "not_started") {
    return { label: "Waiting", tone: "info" }
  }

  return { label: "On track", tone: "success" }
}

function statusBadgeTone(tone: HeaderStatusTone): string {
  if (tone === "success") return "border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-fg)]"
  if (tone === "warning") return "border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]"
  return "border-[var(--status-info-border)] bg-[var(--status-info-bg)] text-[var(--status-info-fg)]"
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
    updatePartStageStatus,
    uploadAttachment,
    updateLogisticsEntry,
    deletePart,
  } = useApp()

  const [activeTab, setActiveTab] = useState<TabKey>("overview")
  const [isDeleting, setIsDeleting] = useState(false)
  const [actionError, setActionError] = useState("")

  const [drawingUrl, setDrawingUrl] = useState(part.drawing_url || "")
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

  const [qcDialogOpen, setQcDialogOpen] = useState(false)
  const [qcDraft, setQcDraft] = useState<QualityDraft>("pending")
  const [isSavingQc, setIsSavingQc] = useState(false)
  const [qcError, setQcError] = useState("")

  const drawingInputRef = useRef<HTMLInputElement | null>(null)
  const MAX_DRAWING_FILE_SIZE_BYTES = 9 * 1024 * 1024

  const drawingUrlValue = drawingUrl.trim()
  const drawingUrlLower = drawingUrlValue.toLowerCase()

  const isPdfDrawing =
    drawingUrlLower.includes(".pdf") || drawingUrlLower.startsWith("data:application/pdf")
  const isImageDrawing =
    drawingUrlLower.startsWith("data:image/") ||
    /\.(png|jpe?g|gif|webp|svg)(\?|$)/.test(drawingUrlLower)
  const isKnownDrawingType = isPdfDrawing || isImageDrawing

  const isProtectedAttachmentUrl = (value: string) => {
    const candidate = value.trim()
    if (!candidate) return false
    if (candidate.startsWith("/uploads/") || candidate.startsWith("/api/v1/attachments/serve/")) return true
    if (candidate.startsWith("http://") || candidate.startsWith("https://")) {
      try {
        const url = new URL(candidate)
        return url.pathname.startsWith("/uploads/") || url.pathname.startsWith("/api/v1/attachments/serve/")
      } catch {
        return false
      }
    }
    return false
  }

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

  useEffect(() => {
    let cancelled = false

    if (drawingBlobUrl) {
      URL.revokeObjectURL(drawingBlobUrl)
      setDrawingBlobUrl(null)
    }

    if (!drawingUrlValue || !isImageDrawing) return
    if (drawingUrlValue.startsWith("data:") || drawingUrlValue.startsWith("blob:")) return
    if (!isProtectedAttachmentUrl(drawingUrlValue)) return

    setIsLoadingDrawingBlob(true)
    void (async () => {
      try {
        const blob = await apiClient.fetchBlob(drawingUrlValue)
        if (cancelled) return
        const blobUrl = URL.createObjectURL(blob)
        setDrawingBlobUrl(blobUrl)
        setDrawingError(false)
      } catch {
        if (!cancelled) setDrawingError(true)
      } finally {
        if (!cancelled) setIsLoadingDrawingBlob(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [drawingBlobUrl, drawingUrlValue, isImageDrawing])

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
  }, [getJourneyForPart, logistics.length, part.id, stageFacts.length])

  const sortedFacts = useMemo(
    () =>
      [...stageFacts].sort((a, b) => {
        const dateCompare = b.date.localeCompare(a.date)
        if (dateCompare !== 0) return dateCompare
        return b.created_at.localeCompare(a.created_at)
      }),
    [stageFacts]
  )

  const qcFacts = sortedFacts.filter((fact) => fact.stage === "qc")

  const stageStatuses = part.stage_statuses || []
  const overallProgressPercent = progress.percent

  const hasForecastInput = stageFacts.length > 0 || forecast.shiftsNeeded > 0
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

  const cooperationDeltaDays =
    hasPartDeadline && hasCooperationEta && cooperationEtaDate
      ? Math.ceil((partDeadlineDate.getTime() - cooperationEtaDate.getTime()) / (1000 * 60 * 60 * 24))
      : null

  const routeCurrentLocation = journeySummary?.current_location || (part.is_cooperation ? "У кооператора" : "Не задано")
  const routeCurrentHolder = journeySummary?.current_holder || (part.is_cooperation ? part.cooperation_partner || "Партнёр не указан" : "Не задано")
  const routeLastEventDescription = journeySummary?.last_event?.description || "Деталь создана"
  const routeLastEventAt = journeySummary?.last_event?.occurred_at

  const routeNextStageLabel = journeySummary?.next_required_stage
    ? STAGE_LABELS[journeySummary.next_required_stage]
    : part.is_cooperation
      ? "ОТК после поступления"
      : "Не требуется"

  const routeStatusDescription = (() => {
    const lastMovement = journeySummary?.last_movement
    if (!part.is_cooperation) return routeLastEventDescription
    if (!lastMovement) return "Кооперация запланирована, отправка ещё не отмечена"

    const destination = lastMovement.to_holder || lastMovement.to_location
    if (lastMovement.status === "pending") return "Черновик отправки"
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

  const cooperationControlTone = !hasCooperationEta
    ? "neutral"
    : cooperationDeltaDays !== null && cooperationDeltaDays < 0
      ? "warning"
      : "success"

  const canDeletePart = permissions.canCreateParts && (
    (part.is_cooperation && permissions.canCreateCoopParts) ||
    (!part.is_cooperation && permissions.canCreateOwnParts)
  )

  const canEditCooperationDueDate = part.is_cooperation && permissions.canEditParts

  const stageStatusMap = new Map(stageStatuses.map((status) => [status.stage, status.status] as const))
  const cooperationExternalStages = part.required_stages.filter(
    (stage) => stage === "heat_treatment" || stage === "galvanic" || stage === "grinding"
  )
  const cooperationExternalStagesDone = cooperationExternalStages.every(
    (stage) => stageStatusMap.get(stage) === "done"
  )

  const cooperationMovements = logistics.filter((entry) => !entry.stage_id)
  const cooperationReceivedQty = cooperationMovements
    .filter((entry) => entry.status === "received" || entry.status === "completed")
    .reduce((sum, entry) => sum + (entry.qty_received ?? entry.qty_sent ?? entry.quantity ?? 0), 0)
  const cooperationHasActiveShipment = cooperationMovements.some(
    (entry) => entry.status === "sent" || entry.status === "in_transit"
  )
  const cooperationFullyReceived = cooperationReceivedQty >= part.qty_plan

  const cooperationQcStatus = part.cooperation_qc_status || "pending"
  const cooperationQcCheckedAt = part.cooperation_qc_checked_at
    ? new Date(part.cooperation_qc_checked_at).toLocaleString("ru-RU")
    : null

  const canRunCooperationQcDecision =
    canEditCooperationDueDate &&
    cooperationFullyReceived &&
    !cooperationHasActiveShipment &&
    cooperationExternalStagesDone

  const qcStageStatus = stageStatuses.find((status) => status.stage === "qc")

  const qualityState = useMemo(() => {
    if (part.is_cooperation) {
      if (cooperationQcStatus === "accepted") return { key: "accepted" as QualityDraft, label: "Passed", tone: "success" as const }
      if (cooperationQcStatus === "rejected") return { key: "rejected" as QualityDraft, label: "Failed", tone: "danger" as const }
      return { key: "pending" as QualityDraft, label: "Not performed", tone: "neutral" as const }
    }

    if (qcStageStatus?.status === "done" && progress.qtyScrap === 0) {
      return { key: "accepted" as QualityDraft, label: "Passed", tone: "success" as const }
    }

    if (qcStageStatus?.status === "done" && progress.qtyScrap > 0) {
      return { key: "rejected" as QualityDraft, label: "Failed", tone: "danger" as const }
    }

    return { key: "pending" as QualityDraft, label: "Not performed", tone: "neutral" as const }
  }, [cooperationQcStatus, part.is_cooperation, progress.qtyScrap, qcStageStatus?.status])

  const movementToAccept = logistics.find((entry) => ACTIVE_MOVEMENT_STATUSES.has((entry.status || "pending") as MovementStatus))

  const headerStatus = getHeaderStatus(part, internalDeltaDays, cooperationDeltaDays)

  const kpiItems = useMemo(
    () => [
      {
        key: "progress",
        label: "Готовность",
        value: `${overallProgressPercent}%`,
        hint: `${progress.qtyDone.toLocaleString("ru-RU")} из ${part.qty_plan.toLocaleString("ru-RU")} шт`,
      },
      {
        key: "deadline",
        label: "Дедлайн",
        value: formatDate(part.deadline),
        hint: PART_STATUS_LABELS[part.status],
      },
      {
        key: "forecast",
        label: part.is_cooperation ? "Срок от кооператора" : "Внутренний дедлайн",
        value: part.is_cooperation
          ? (hasCooperationEta ? formatDate(cooperationEtaDate?.toISOString()) : "Не задан")
          : (hasInternalDeadline ? formatDate(internalDeadlineDate.toISOString()) : "Ожидает данных"),
        hint: part.is_cooperation
          ? cooperationDeltaDays !== null
            ? cooperationDeltaDays < 0
              ? `Отставание ${Math.abs(cooperationDeltaDays)} дн.`
              : cooperationDeltaDays > 0
                ? `Запас ${cooperationDeltaDays} дн.`
                : "В срок"
            : "Оценка недоступна"
          : internalDeltaDays !== null
            ? internalDeltaDays < 0
              ? `Отставание ${Math.abs(internalDeltaDays)} дн.`
              : internalDeltaDays > 0
                ? `Запас ${internalDeltaDays} дн.`
                : "В срок"
            : "Оценка недоступна",
      },
      {
        key: "quality",
        label: "Quality Control",
        value: qualityState.label,
        hint: qcFacts.length > 0 ? `Записей ОТК: ${qcFacts.length}` : "Пока без записей",
      },
    ],
    [
      cooperationDeltaDays,
      hasCooperationEta,
      hasInternalDeadline,
      internalDeadlineDate,
      internalDeltaDays,
      overallProgressPercent,
      part.deadline,
      part.is_cooperation,
      part.qty_plan,
      part.status,
      progress.qtyDone,
      qualityState.label,
      qcFacts.length,
      cooperationEtaDate,
    ]
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

  const handleSaveQc = async () => {
    setQcError("")
    setIsSavingQc(true)

    try {
      if (part.is_cooperation) {
        if (!canEditCooperationDueDate) return
        await updatePart({
          ...part,
          cooperation_qc_status: qcDraft,
          cooperation_qc_checked_at: qcDraft === "pending" ? null : new Date().toISOString(),
        })
      } else {
        const nextStatus = qcDraft === "accepted" ? "done" : qcDraft === "rejected" ? "in_progress" : "pending"
        updatePartStageStatus(part.id, "qc", nextStatus)
      }
      setQcDialogOpen(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось сохранить результат контроля"
      setQcError(message)
    } finally {
      setIsSavingQc(false)
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

    if (drawingUrlValue.startsWith("data:") || drawingUrlValue.startsWith("blob:")) {
      window.open(drawingUrlValue, "_blank", "noopener,noreferrer")
      return
    }

    if (!isProtectedAttachmentUrl(drawingUrlValue)) {
      window.open(drawingUrlValue, "_blank", "noopener,noreferrer")
      return
    }

    try {
      const blob = await apiClient.fetchBlob(drawingUrlValue)
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

  const handleAcceptDeliveryFromHeader = async () => {
    if (!movementToAccept) return

    setActionError("")

    const now = new Date().toISOString()
    const qtyReceived = movementToAccept.qty_received ?? movementToAccept.qty_sent ?? movementToAccept.quantity ?? 0

    try {
      await updateLogisticsEntry({
        ...movementToAccept,
        status: "received",
        received_at: now,
        qty_received: qtyReceived,
        updated_at: now,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось принять поставку"
      setActionError(message)
    }
  }

  const triggerCreateTask = () => {
    setActiveTab("tasks")
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("pc-part-tasks-create", { detail: { partId: part.id } }))
    }, 0)
  }

  const primaryAction = (() => {
    if (activeTab === "logistics" && permissions.canManageLogistics && movementToAccept) {
      return {
        label: "Принять поставку",
        onClick: () => void handleAcceptDeliveryFromHeader(),
      }
    }

    if (activeTab === "drawing" && permissions.canEditFacts) {
      return {
        label: "Загрузить чертёж",
        onClick: () => drawingInputRef.current?.click(),
      }
    }

    if (permissions.canCreateTasks) {
      return {
        label: "Создать задачу",
        onClick: triggerCreateTask,
      }
    }

    return null
  })()

  const canEditQuality = part.is_cooperation ? canEditCooperationDueDate : permissions.canEditFacts

  return (
    <div className="space-y-4">
      <header className="space-y-3">
        <div className="flex items-start gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0"
            aria-label="Назад"
            onClick={onBack}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-mono text-xl font-semibold">{part.code}</h1>
              {part.is_cooperation ? <Building2 className="h-4 w-4 text-muted-foreground" /> : null}
              <Badge variant="outline" className={cn("bg-transparent", statusBadgeTone(headerStatus.tone))}>
                {headerStatus.label}
              </Badge>
            </div>

            <div className="mt-1 text-sm text-muted-foreground">
              {part.name}
              {machine ? ` • ${machine.name}` : ""}
              {part.customer ? ` • ${part.customer}` : ""}
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span>Партнёр/держатель: {routeCurrentHolder}</span>
              <span>Next step: {routeNextStageLabel}</span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {primaryAction ? (
              <Button onClick={primaryAction.onClick}>{primaryAction.label}</Button>
            ) : null}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Дополнительные действия">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setActiveTab("drawing")}>Открыть вкладку «Чертёж»</DropdownMenuItem>
                <DropdownMenuItem onClick={triggerCreateTask}>Создать задачу</DropdownMenuItem>
                {drawingUrlValue ? (
                  <DropdownMenuItem onClick={() => void handleOpenDrawing()}>
                    Открыть чертёж в новой вкладке
                  </DropdownMenuItem>
                ) : null}
                {canDeletePart ? (
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => void handleDeletePart()}
                  >
                    Удалить деталь
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {actionError ? (
          <div className="text-sm text-destructive" role="status" aria-live="polite">
            {actionError}
          </div>
        ) : null}
      </header>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabKey)}>
        <div className="overflow-x-auto overflow-y-hidden">
          <TabsList className="h-auto w-max min-w-full justify-start rounded-none border-b bg-transparent p-0">
            <TabsTrigger
              value="overview"
              className="h-10 flex-none rounded-none border-b-2 border-transparent px-3 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              Overview
            </TabsTrigger>
            <TabsTrigger
              value="logistics"
              className="h-10 flex-none rounded-none border-b-2 border-transparent px-3 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              Logistics
            </TabsTrigger>
            <TabsTrigger
              value="tasks"
              className="h-10 flex-none rounded-none border-b-2 border-transparent px-3 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              Tasks
            </TabsTrigger>
            <TabsTrigger
              value="events"
              className="h-10 flex-none rounded-none border-b-2 border-transparent px-3 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              Events
            </TabsTrigger>
            <TabsTrigger
              value="drawing"
              className="h-10 flex-none rounded-none border-b-2 border-transparent px-3 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              Drawing
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="space-y-4 pt-1">
          <KPIStrip items={kpiItems} />

          <Card className="gap-0 border shadow-none py-0">
            <CardHeader className="px-4 py-4 sm:px-6 sm:py-5">
              <CardTitle className="text-sm font-semibold">Route / Workflow</CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <div className="divide-y">
                <div className="grid gap-2 px-4 py-4 text-sm sm:grid-cols-2 sm:px-6">
                  <div>
                    <div className="text-xs text-muted-foreground">Текущее местоположение / держатель</div>
                    <div className="mt-1 font-medium">{routeCurrentLocation} / {routeCurrentHolder}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Следующий шаг</div>
                    <div className="mt-1 font-medium">{routeNextStageLabel}</div>
                  </div>
                </div>

                <div className="grid gap-2 px-4 py-4 text-sm sm:grid-cols-2 sm:px-6">
                  <div>
                    <div className="text-xs text-muted-foreground">Последний статус</div>
                    <div className="mt-1 font-medium">{routeStatusDescription}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Отметка времени</div>
                    <div className="mt-1 font-medium">{formatDateTime(routeStatusAt || undefined)}</div>
                  </div>
                </div>

                <div className="grid gap-2 px-4 py-4 text-sm sm:grid-cols-2 sm:px-6">
                  <div>
                    <div className="text-xs text-muted-foreground">Ориентир поступления</div>
                    <div className="mt-1 font-medium">{hasCooperationEta ? formatDate(cooperationEtaDate?.toISOString()) : "Не задан"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Дедлайн</div>
                    <div className="mt-1 font-medium">{formatDate(part.deadline)}</div>
                  </div>
                </div>
              </div>

              <div className="px-4 pb-4 pt-4 sm:px-6 sm:pb-5">
                <StatusInsetStrip tone={cooperationControlTone} title="Статус кооперации">
                  {cooperationDeltaDays !== null
                    ? cooperationDeltaDays < 0
                      ? `Отставание ${Math.abs(cooperationDeltaDays)} дн.`
                      : cooperationDeltaDays > 0
                        ? `Запас ${cooperationDeltaDays} дн.`
                        : "В срок"
                    : "Оценка по сроку появится после фиксации ETA"}
                </StatusInsetStrip>
              </div>

              {canEditCooperationDueDate ? (
                <div className="border-t px-4 py-4 sm:px-6 sm:py-5">
                  {!isEditingCooperationDueDate ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="bg-transparent"
                      onClick={() => {
                        setCooperationDueDateError("")
                        setIsEditingCooperationDueDate(true)
                      }}
                    >
                      Изменить срок кооператора
                    </Button>
                  ) : (
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="space-y-1">
                        <Label htmlFor="cooperation-due-date" className="text-xs text-muted-foreground">
                          Срок от кооператора
                        </Label>
                        <Input
                          id="cooperation-due-date"
                          type="date"
                          className="w-[220px]"
                          value={cooperationDueDateDraft}
                          onChange={(event) => setCooperationDueDateDraft(event.target.value)}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="bg-transparent"
                        disabled={isSavingCooperationDueDate}
                        onClick={() => void handleSaveCooperationDueDate()}
                      >
                        {isSavingCooperationDueDate ? "Сохраняем..." : "Сохранить"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setIsEditingCooperationDueDate(false)
                          setCooperationDueDateError("")
                        }}
                      >
                        Отмена
                      </Button>
                    </div>
                  )}

                  {cooperationDueDateError ? (
                    <div className="mt-2 text-xs text-destructive">{cooperationDueDateError}</div>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="gap-0 border shadow-none py-0">
            <CardHeader className="px-4 py-4 sm:px-6 sm:py-5">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm font-semibold">Quality Control</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={cn(
                    "bg-transparent",
                    qualityState.tone === "success" && "border-[var(--status-success-border)] text-[var(--status-success-fg)]",
                    qualityState.tone === "danger" && "border-[var(--status-danger-border)] text-[var(--status-danger-fg)]",
                    qualityState.tone === "neutral" && "border-border text-muted-foreground"
                  )}>
                    {qualityState.label}
                  </Badge>
                  {canEditQuality ? (
                    <Button type="button" size="sm" onClick={() => {
                      setQcDraft(qualityState.key)
                      setQcError("")
                      setQcDialogOpen(true)
                    }}>
                      Записать результат
                    </Button>
                  ) : null}
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <div className="divide-y">
                <div className="grid gap-2 px-4 py-4 text-sm sm:grid-cols-3 sm:px-6">
                  <div>
                    <div className="text-xs text-muted-foreground">Текущее состояние</div>
                    <div className="mt-1 font-medium">{qualityState.label}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Последняя проверка</div>
                    <div className="mt-1 font-medium">{cooperationQcCheckedAt || formatDateTime(qcFacts[0]?.created_at || qcFacts[0]?.date)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Записей контроля</div>
                    <div className="mt-1 font-medium">{qcFacts.length}</div>
                  </div>
                </div>

                <div className="px-4 py-4 sm:px-6">
                  {qcFacts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">История ОТК пока пуста.</p>
                  ) : (
                    <div className="divide-y">
                      {qcFacts.slice(0, 5).map((fact) => {
                        const operator = getUserById(fact.operator_id)
                        return (
                          <div key={fact.id} className="grid gap-2 py-3 text-sm sm:grid-cols-4">
                            <span className="font-medium">{formatDate(fact.date)}</span>
                            <span className="text-muted-foreground">{operator?.initials || "—"}</span>
                            <span className="text-muted-foreground">Годные: {fact.qty_good}</span>
                            <span className={cn("text-right", fact.qty_scrap > 0 && "text-destructive")}>Брак: {fact.qty_scrap}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              {qualityState.tone === "danger" ? (
                <div className="px-4 pb-4 sm:px-6 sm:pb-5">
                  <StatusInsetStrip tone="danger" title="Требуется действие">
                    Контроль качества зафиксировал отклонение. Проверьте задачи и запустите корректирующие действия.
                  </StatusInsetStrip>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="gap-0 border shadow-none py-0">
            <CardHeader className="px-4 py-4 sm:px-6 sm:py-5">
              <CardTitle className="text-sm font-semibold">Notes / Attachments</CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <div className="divide-y">
                <div className="px-4 py-4 sm:px-6">
                  <div className="text-xs text-muted-foreground">Комментарий к партии</div>
                  <p className="mt-1 text-sm">{part.description || "Комментарий не добавлен"}</p>
                </div>
                <div className="px-4 py-4 sm:px-6">
                  <div className="text-xs text-muted-foreground">Вложения</div>
                  {drawingUrlValue ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-sm">Чертёж привязан к партии</span>
                      <Button variant="outline" className="bg-transparent" size="sm" onClick={() => setActiveTab("drawing")}>Открыть вкладку</Button>
                    </div>
                  ) : (
                    <div className="mt-2 text-sm text-muted-foreground">Вложения пока не добавлены.</div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logistics" className="pt-1">
          <LogisticsList part={part} />
        </TabsContent>

        <TabsContent value="tasks" className="pt-1">
          <TasksList partId={part.id} machineId={part.machine_id} />
        </TabsContent>

        <TabsContent value="events" className="pt-1">
          {permissions.canViewAudit ? (
            <AuditLogView partId={part.id} />
          ) : (
            <Card className="gap-0 border shadow-none py-0">
              <CardContent className="px-4 py-6 text-sm text-muted-foreground sm:px-6">
                Недостаточно прав для просмотра журнала событий.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="drawing" className="space-y-4 pt-1">
          <Card className="gap-0 border shadow-none py-0">
            <CardHeader className="px-4 py-4 sm:px-6 sm:py-5">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm font-semibold">Drawing</CardTitle>
                {drawingUrlValue ? (
                  <Button variant="outline" className="bg-transparent" onClick={() => void handleOpenDrawing()}>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Открыть в новой вкладке
                  </Button>
                ) : null}
              </div>
            </CardHeader>

            <CardContent className="space-y-4 px-4 pb-5 sm:px-6">
              {drawingUrlValue ? (
                <div className="min-h-[420px] rounded-md bg-muted/40">
                  <div className="flex min-h-[420px] items-center justify-center overflow-hidden p-4">
                    {isImageDrawing && !drawingError ? (
                      isLoadingDrawingBlob ? (
                        <div className="text-center text-muted-foreground">
                          <Loader2 className="mx-auto mb-2 h-10 w-10 animate-spin opacity-60" />
                          <p>Загружаем файл...</p>
                        </div>
                      ) : (
                        <img
                          src={drawingBlobUrl || drawingUrlValue || "/placeholder.svg"}
                          alt={`Чертёж ${part.code}`}
                          className="max-h-[560px] w-full object-contain"
                          onError={() => setDrawingError(true)}
                        />
                      )
                    ) : (
                      <div className="text-center text-muted-foreground">
                        {isPdfDrawing ? (
                          <FileText className="mx-auto mb-2 h-10 w-10 opacity-60" />
                        ) : (
                          <FileImage className="mx-auto mb-2 h-10 w-10 opacity-60" />
                        )}
                        <p>
                          {isPdfDrawing
                            ? "PDF-чертёж"
                            : drawingError
                              ? "Не удалось загрузить изображение"
                              : "Неподдерживаемый формат"}
                        </p>
                        {!isKnownDrawingType && !drawingError ? (
                          <p className="mt-1 text-xs">Поддерживаются PDF и изображения</p>
                        ) : null}
                        {drawingError ? <p className="mt-1 text-xs break-all">Путь: {drawingUrlValue}</p> : null}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex min-h-[420px] items-center justify-center rounded-md bg-muted/40">
                  <div className="text-center text-muted-foreground">
                    <FileImage className="mx-auto mb-2 h-12 w-12 opacity-50" />
                    <p>Чертёж не добавлен</p>
                  </div>
                </div>
              )}

              {permissions.canEditFacts ? (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <Input
                      id="drawing-file"
                      ref={drawingInputRef}
                      type="file"
                      accept="image/*,application/pdf"
                      className="sr-only"
                      onChange={handleUploadDrawing}
                    />

                    <div className="flex flex-wrap items-center gap-2">
                      <Button type="button" onClick={() => drawingInputRef.current?.click()} disabled={isUploadingDrawing}>
                        <Upload className="mr-2 h-4 w-4" />
                        {isUploadingDrawing ? "Загрузка..." : "Загрузить файл"}
                      </Button>

                      {drawingUrlValue ? (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" disabled={isSavingDrawing}>Удалить чертёж</Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Удалить чертёж?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Ссылка и файл будут отвязаны от детали. Позже можно загрузить новый файл.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Отмена</AlertDialogCancel>
                              <AlertDialogAction onClick={handleDeleteDrawing}>Удалить</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      ) : null}

                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setShowLinkInput((prev) => !prev)}
                      >
                        <Link className="mr-2 h-4 w-4" />
                        {showLinkInput ? "Скрыть ссылку" : "Ссылка (резервный вариант)"}
                      </Button>
                    </div>

                    {showLinkInput ? (
                      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                        <Input
                          id="drawing-url"
                          placeholder="https://example.com/drawing.pdf"
                          value={drawingUrl}
                          onChange={(event) => setDrawingUrl(event.target.value)}
                        />
                        <Button onClick={() => void handleSaveDrawing()} disabled={!drawingUrl || isSavingDrawing}>
                          {isSavingDrawing ? "Сохраняем..." : "Сохранить"}
                        </Button>
                      </div>
                    ) : null}

                    {drawingActionError ? (
                      <div className="text-sm text-destructive" role="status" aria-live="polite">
                        {drawingActionError}
                      </div>
                    ) : null}
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={qcDialogOpen} onOpenChange={setQcDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Записать результат контроля</DialogTitle>
            <DialogDescription>
              Выберите статус контроля качества для текущей партии.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Button
              type="button"
              variant={qcDraft === "accepted" ? "default" : "outline"}
              className={cn("w-full justify-start", qcDraft !== "accepted" && "bg-transparent")}
              onClick={() => setQcDraft("accepted")}
            >
              Passed
            </Button>
            <Button
              type="button"
              variant={qcDraft === "rejected" ? "default" : "outline"}
              className={cn("w-full justify-start", qcDraft !== "rejected" && "bg-transparent")}
              onClick={() => setQcDraft("rejected")}
            >
              Failed
            </Button>
            <Button
              type="button"
              variant={qcDraft === "pending" ? "default" : "outline"}
              className={cn("w-full justify-start", qcDraft !== "pending" && "bg-transparent")}
              onClick={() => setQcDraft("pending")}
            >
              Not performed
            </Button>

            {part.is_cooperation && !canRunCooperationQcDecision ? (
              <StatusInsetStrip tone="warning" title="Ограничение">
                Входной контроль доступен только после полного поступления партии и завершения внешних этапов.
              </StatusInsetStrip>
            ) : null}

            {qcError ? <div className="text-sm text-destructive">{qcError}</div> : null}
          </div>

          <DialogFooter>
            <Button variant="outline" className="bg-transparent" onClick={() => setQcDialogOpen(false)}>
              Отмена
            </Button>
            <Button
              onClick={() => void handleSaveQc()}
              disabled={isSavingQc || (part.is_cooperation && !canRunCooperationQcDecision)}
            >
              {isSavingQc ? "Сохраняем..." : "Сохранить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
