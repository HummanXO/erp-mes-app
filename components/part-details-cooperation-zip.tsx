"use client"

import React from "react"

import { useEffect, useMemo, useState } from "react"
import { useApp } from "@/lib/app-context"
import type { LogisticsEntry, MovementStatus, Part, ProductionStage, Task } from "@/lib/types"
import { STAGE_LABELS, TASK_STATUS_LABELS } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { apiClient } from "@/lib/api-client"
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarIcon,
  CheckSquare,
  ClipboardCheck,
  Clock,
  FileImage,
  FileText,
  Flame,
  Maximize2,
  PackageCheck,
  Plus,
  Send,
  Sparkles,
  Truck,
} from "lucide-react"

interface PartDetailsCooperationZipProps {
  part: Part
  onBack: () => void
}

type ZipJournalFilter = "all" | "movements" | "inspection" | "production" | "tasks"
type ZipEventType = "movement" | "inspection" | "production" | "task"
type ExternalStageKey = "heat_treatment" | "galvanic"
type StageUiStatus = "waiting" | "in_progress" | "ready" | "in_transit" | "received"

type ZipEvent = {
  id: string
  type: ZipEventType
  timestamp: string
  description: string
  user: string
}

type ShipmentListItem = {
  id: string
  from: string
  to: string
  quantity: number
  daysInTransit: number
  status: MovementStatus
  entry: LogisticsEntry
  canConfirm: boolean
  disabledReason?: string
}

type ExternalStageCard = {
  key: ExternalStageKey
  title: string
  icon: React.ComponentType<{ className?: string }>
  tone: "orange" | "purple"
  status: Exclude<StageUiStatus, "received">
  completed: number
  total: number
}

const ACTIVE_SHIPMENT_STATUSES = new Set<MovementStatus>(["sent", "in_transit", "pending"])
const RECEIVED_SHIPMENT_STATUSES = new Set<MovementStatus>(["received", "completed"])

function movementStatus(entry: LogisticsEntry): MovementStatus {
  return (entry.status || "pending") as MovementStatus
}

function movementEffectiveQty(entry: LogisticsEntry): number {
  const status = movementStatus(entry)
  const sentQty = entry.qty_sent ?? entry.quantity ?? 0
  if (RECEIVED_SHIPMENT_STATUSES.has(status)) {
    return entry.qty_received ?? sentQty
  }
  return sentQty
}

function sortByEventDate(entries: LogisticsEntry[]): LogisticsEntry[] {
  return [...entries].sort((a, b) => {
    const aTs = new Date(
      a.received_at ||
        a.returned_at ||
        a.cancelled_at ||
        a.sent_at ||
        a.updated_at ||
        a.created_at ||
        a.date ||
        0
    ).getTime()
    const bTs = new Date(
      b.received_at ||
        b.returned_at ||
        b.cancelled_at ||
        b.sent_at ||
        b.updated_at ||
        b.created_at ||
        b.date ||
        0
    ).getTime()
    return bTs - aTs
  })
}

function formatDate(value?: string | null): string {
  if (!value) return "Нет данных"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return "Нет данных"
  return parsed.toLocaleDateString("ru-RU")
}

function formatDateTime(value?: string | null): string {
  if (!value) return "Нет данных"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return "Нет данных"
  return parsed.toLocaleString("ru-RU")
}

function localIsoDate(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function parsePositiveInt(value: string): number | null {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return parsed
}

function normalizeTaskPriority(task: Task): "high" | "normal" | "low" {
  if (task.is_blocker) return "high"
  if (task.category === "quality" || task.category === "machine") return "high"
  if (task.category === "material" || task.category === "logistics") return "normal"
  return "low"
}

function stageKeyFromLocation(value?: string | null): ProductionStage | "fg" | null {
  const raw = String(value || "").trim().toLowerCase()
  if (!raw) return null
  if (raw.includes("мех")) return "machining"
  if (raw.includes("слес")) return "fitting"
  if (raw.includes("термо")) return "heat_treatment"
  if (raw.includes("гальв")) return "galvanic"
  if (raw.includes("шлиф")) return "grinding"
  if (raw.includes("отк")) return "qc"
  if (raw.includes("склад гп")) return "fg"
  return null
}

function statusPillClass(status: StageUiStatus): string {
  if (status === "received") return "bg-emerald-100 text-emerald-700"
  if (status === "ready") return "bg-emerald-100 text-emerald-700"
  if (status === "in_transit") return "bg-blue-100 text-blue-700"
  if (status === "in_progress") return "bg-amber-100 text-amber-800"
  return "bg-slate-100 text-slate-600"
}

function statusLabel(status: StageUiStatus): string {
  if (status === "received") return "Принято"
  if (status === "ready") return "Готово"
  if (status === "in_transit") return "В пути"
  if (status === "in_progress") return "В работе"
  return "Ожидаем"
}

function cooperatorLabel(part: Part): string {
  return part.cooperation_partner?.trim() || "Кооператор не указан"
}

function isCooperatorMovement(entry: LogisticsEntry, part: Part): boolean {
  const haystack = [
    entry.from_location,
    entry.from_holder,
    entry.to_location,
    entry.to_holder,
    entry.counterparty,
    entry.description,
    part.cooperation_partner,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()

  if (entry.type === "coop_out" || entry.type === "coop_in") return true
  if (!entry.stage_id) return true
  return haystack.includes("кооператор")
}

function DisabledActionButton(props: {
  disabled: boolean
  disabledReason?: string
  children: React.ReactNode
  onClick?: () => void
  className?: string
  variant?: React.ComponentProps<typeof Button>["variant"]
  size?: React.ComponentProps<typeof Button>["size"]
  type?: "button" | "submit"
}) {
  const { disabled, disabledReason, children, onClick, className, variant, size, type = "button" } = props

  if (!disabled) {
    return (
      <Button type={type} variant={variant} size={size} className={className} onClick={onClick}>
        {children}
      </Button>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex w-full sm:w-auto" tabIndex={0}>
          <Button type={type} variant={variant} size={size} className={cn("w-full sm:w-auto", className)} disabled>
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent sideOffset={8}>{disabledReason || "Действие недоступно"}</TooltipContent>
    </Tooltip>
  )
}

export function PartDetailsCooperationZip({ part, onBack }: PartDetailsCooperationZipProps) {
  const {
    currentUser,
    permissions,
    getPartForecast,
    getStageFactsForPart,
    getLogisticsForPart,
    getTasksForPart,
    getUserById,
    createLogisticsEntry,
    updateLogisticsEntry,
    updatePart,
    updatePartStageStatus,
    createTask,
  } = useApp()

  const forecast = getPartForecast(part.id)
  const stageFacts = getStageFactsForPart(part.id)
  const logistics = getLogisticsForPart(part.id)
  const tasks = getTasksForPart(part.id)

  const sortedFacts = useMemo(
    () =>
      [...stageFacts].sort((a, b) => {
        const dateCompare = b.date.localeCompare(a.date)
        if (dateCompare !== 0) return dateCompare
        return (b.created_at || "").localeCompare(a.created_at || "")
      }),
    [stageFacts]
  )

  const sortedLogistics = useMemo(() => sortByEventDate(logistics), [logistics])

  const stageStatusByStage = useMemo(
    () => new Map((part.stage_statuses || []).map((status) => [status.stage, status] as const)),
    [part.stage_statuses]
  )

  const stageByStatusId = useMemo(() => {
    const map = new Map<string, ProductionStage>()
    for (const stageStatus of part.stage_statuses || []) {
      if (stageStatus.id) map.set(String(stageStatus.id), stageStatus.stage)
    }
    return map
  }, [part.stage_statuses])

  const stageQtyByStage = useMemo(() => {
    const map = new Map<ProductionStage, number>()
    for (const fact of stageFacts) {
      map.set(fact.stage, (map.get(fact.stage) || 0) + fact.qty_good)
    }
    for (const stageStatus of part.stage_statuses || []) {
      if (!map.has(stageStatus.stage) && typeof stageStatus.qty_good === "number" && stageStatus.qty_good > 0) {
        map.set(stageStatus.stage, stageStatus.qty_good)
      }
    }
    return map
  }, [part.stage_statuses, stageFacts])

  const cooperatorMovements = useMemo(
    () => sortedLogistics.filter((entry) => isCooperatorMovement(entry, part)),
    [sortedLogistics, part]
  )

  const cooperatorReceivedQty = useMemo(
    () =>
      cooperatorMovements
        .filter((entry) => RECEIVED_SHIPMENT_STATUSES.has(movementStatus(entry)))
        .reduce((sum, entry) => sum + movementEffectiveQty(entry), 0),
    [cooperatorMovements]
  )

  const cooperatorShipmentsActive = useMemo(
    () => cooperatorMovements.filter((entry) => ACTIVE_SHIPMENT_STATUSES.has(movementStatus(entry))),
    [cooperatorMovements]
  )

  const cooperatorInboundActive = useMemo(
    () =>
      cooperatorShipmentsActive.some((entry) => {
        const from = `${entry.from_location || ""} ${entry.from_holder || ""} ${entry.counterparty || ""}`.toLowerCase()
        return from.includes("кооператор") || entry.type === "coop_in"
      }),
    [cooperatorShipmentsActive]
  )

  const cooperatorOutboundCreated = useMemo(
    () =>
      cooperatorMovements.some((entry) => {
        const status = movementStatus(entry)
        return status !== "cancelled" && (entry.type === "coop_out" || !entry.stage_id)
      }),
    [cooperatorMovements]
  )

  const cooperatorStageStatus: StageUiStatus = (() => {
    if (cooperatorReceivedQty >= part.qty_plan && part.qty_plan > 0) return "received"
    if (cooperatorInboundActive) return "in_transit"
    if (cooperatorOutboundCreated || part.cooperation_due_date) return "in_progress"
    return "waiting"
  })()

  const externalStages = useMemo<ExternalStageCard[]>(() => {
    const cards: ExternalStageCard[] = []

    const buildCard = (key: ExternalStageKey, title: string, icon: ExternalStageCard["icon"], tone: ExternalStageCard["tone"]) => {
      const stageStatus = stageStatusByStage.get(key)
      const doneQty = stageQtyByStage.get(key) || 0
      const stageStatusId = stageStatus?.id ? String(stageStatus.id) : null
      const activeMovement = sortedLogistics.some((entry) => {
        if (!ACTIVE_SHIPMENT_STATUSES.has(movementStatus(entry))) return false
        if (stageStatusId && String(entry.stage_id || "") === stageStatusId) return true
        const from = stageKeyFromLocation(entry.from_location) ?? stageKeyFromLocation(entry.from_holder)
        const to = stageKeyFromLocation(entry.to_location) ?? stageKeyFromLocation(entry.to_holder)
        return from === key || to === key
      })

      const status: Exclude<StageUiStatus, "received"> =
        stageStatus?.status === "done" || (part.qty_plan > 0 && doneQty >= part.qty_plan)
          ? "ready"
          : activeMovement
            ? "in_transit"
            : stageStatus?.status === "in_progress"
              ? "in_progress"
              : "waiting"

      cards.push({
        key,
        title,
        icon,
        tone,
        status,
        completed: doneQty,
        total: part.qty_plan,
      })
    }

    if (part.required_stages.includes("heat_treatment") || stageStatusByStage.has("heat_treatment")) {
      buildCard("heat_treatment", "Термообработка (внешн.)", Flame, "orange")
    }
    if (part.required_stages.includes("galvanic") || stageStatusByStage.has("galvanic")) {
      buildCard("galvanic", "Гальваника (внешн.)", Sparkles, "purple")
    }

    return cards
  }, [part.qty_plan, part.required_stages, sortedLogistics, stageQtyByStage, stageStatusByStage])

  const inTransitShipments = useMemo<ShipmentListItem[]>(() => {
    return sortedLogistics
      .filter((entry) => ACTIVE_SHIPMENT_STATUSES.has(movementStatus(entry)))
      .map((entry) => {
        const qty = entry.qty_sent ?? entry.quantity ?? 0
        const from = entry.from_holder || entry.from_location || "Источник"
        const to = entry.to_holder || entry.to_location || "Назначение"
        const eventAt = entry.sent_at || entry.updated_at || entry.created_at || entry.date
        const daysInTransit = eventAt
          ? Math.max(0, Math.floor((Date.now() - new Date(eventAt).getTime()) / (1000 * 60 * 60 * 24)))
          : 0
        const canConfirm = permissions.canEditFacts
        return {
          id: entry.id,
          from,
          to,
          quantity: qty,
          daysInTransit,
          status: movementStatus(entry),
          entry,
          canConfirm,
          disabledReason: canConfirm ? undefined : "Нет прав для подтверждения приёмки",
        }
      })
  }, [permissions.canEditFacts, sortedLogistics])

  const activeTasks = useMemo(
    () => [...tasks].filter((task) => task.status !== "done").sort((a, b) => a.due_date.localeCompare(b.due_date)),
    [tasks]
  )

  const topTasks = activeTasks.slice(0, 3)

  const cooperatorDeadlineRaw = part.cooperation_due_date || null
  const externalDeadlineDate = new Date(part.deadline)
  const cooperatorDeadlineDate = cooperatorDeadlineRaw ? new Date(`${cooperatorDeadlineRaw}T00:00:00`) : null
  const hasExternalDeadline = !Number.isNaN(externalDeadlineDate.getTime())
  const hasCooperatorDeadline = Boolean(cooperatorDeadlineDate && !Number.isNaN(cooperatorDeadlineDate.getTime()))
  const bufferDays =
    hasExternalDeadline && hasCooperatorDeadline && cooperatorDeadlineDate
      ? Math.ceil((externalDeadlineDate.getTime() - cooperatorDeadlineDate.getTime()) / (1000 * 60 * 60 * 24))
      : typeof forecast.bufferDays === "number"
        ? forecast.bufferDays
        : null

  const scheduleStatus: "успеваем" | "риск" | "просрочено" | "нет данных" =
    bufferDays === null
      ? "нет данных"
      : bufferDays > 0
        ? "успеваем"
        : bufferDays === 0
          ? "риск"
          : "просрочено"

  const scheduleBadgeClass =
    scheduleStatus === "успеваем"
      ? "bg-teal-50 text-teal-700"
      : scheduleStatus === "риск"
        ? "bg-amber-100 text-amber-800"
        : scheduleStatus === "просрочено"
          ? "bg-red-100 text-red-800"
          : "bg-slate-200 text-slate-700"

  const scheduleDotClass =
    scheduleStatus === "успеваем"
      ? "bg-teal-500"
      : scheduleStatus === "риск"
        ? "bg-amber-500"
        : scheduleStatus === "просрочено"
          ? "bg-red-500"
          : "bg-slate-500"

  const reserveLabel =
    bufferDays === null
      ? "Запас: Нет данных"
      : bufferDays > 0
        ? `Запас: ${bufferDays} дн.`
        : bufferDays === 0
          ? "Запас: 0 дн."
          : `Отставание: ${Math.abs(bufferDays)} дн.`

  const [journalFilter, setJournalFilter] = useState<ZipJournalFilter>("all")

  const journalEvents = useMemo<ZipEvent[]>(() => {
    const events: ZipEvent[] = []

    for (const entry of sortedLogistics) {
      const status = movementStatus(entry)
      const fromLabel = entry.from_holder || entry.from_location || "Источник"
      const toLabel = entry.to_holder || entry.to_location || "Назначение"
      const qtyLabel = entry.qty_received ?? entry.qty_sent ?? entry.quantity ?? 0
      const at =
        entry.received_at ||
        entry.returned_at ||
        entry.cancelled_at ||
        entry.sent_at ||
        entry.updated_at ||
        entry.created_at ||
        entry.date ||
        new Date().toISOString()

      if (RECEIVED_SHIPMENT_STATUSES.has(status)) {
        events.push({
          id: `receipt_${entry.id}`,
          type: "inspection",
          timestamp: formatDateTime(at),
          description: `Приняты детали (${qtyLabel.toLocaleString()} шт.): ${fromLabel} -> ${toLabel}`,
          user: "Система",
        })
        continue
      }

      events.push({
        id: `movement_${entry.id}`,
        type: "movement",
        timestamp: formatDateTime(at),
        description: `Отправка (${qtyLabel.toLocaleString()} шт.): ${fromLabel} -> ${toLabel}`,
        user: "Система",
      })
    }

    if (part.cooperation_qc_checked_at && part.cooperation_qc_status) {
      events.push({
        id: `qc_${part.id}_${part.cooperation_qc_checked_at}`,
        type: "inspection",
        timestamp: formatDateTime(part.cooperation_qc_checked_at),
        description:
          part.cooperation_qc_status === "accepted"
            ? "Входной контроль: партия принята"
            : part.cooperation_qc_status === "rejected"
              ? "Входной контроль: есть замечания"
              : "Входной контроль: не проведён",
        user: currentUser?.initials || "ОТК",
      })
    }

    for (const fact of sortedFacts) {
      const operator = getUserById(fact.operator_id)
      const at = fact.created_at || `${fact.date}T00:00:00`
      if (fact.qty_good > 0) {
        events.push({
          id: `fact_good_${fact.id}`,
          type: "production",
          timestamp: formatDateTime(at),
          description: `Факт выпуска ${STAGE_LABELS[fact.stage]}: ${fact.qty_good.toLocaleString()} шт.`,
          user: operator?.initials || "Система",
        })
      }
      if (fact.qty_scrap > 0) {
        events.push({
          id: `fact_scrap_${fact.id}`,
          type: "production",
          timestamp: formatDateTime(at),
          description: `Брак ${STAGE_LABELS[fact.stage]}: ${fact.qty_scrap.toLocaleString()} шт.`,
          user: operator?.initials || "Система",
        })
      }
    }

    for (const task of tasks) {
      events.push({
        id: `task_${task.id}`,
        type: "task",
        timestamp: formatDateTime(task.created_at || `${task.due_date}T00:00:00`),
        description: `${task.status === "done" ? "Задача выполнена" : "Задача"}: ${task.title}`,
        user: getUserById(task.creator_id)?.initials || "Система",
      })
    }

    return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  }, [currentUser?.initials, getUserById, part.cooperation_qc_checked_at, part.cooperation_qc_status, part.id, sortedFacts, sortedLogistics, tasks])

  const filteredEvents = useMemo(() => {
    if (journalFilter === "all") return journalEvents
    if (journalFilter === "movements") return journalEvents.filter((event) => event.type === "movement")
    if (journalFilter === "inspection") return journalEvents.filter((event) => event.type === "inspection")
    if (journalFilter === "production") return journalEvents.filter((event) => event.type === "production")
    return journalEvents.filter((event) => event.type === "task")
  }, [journalEvents, journalFilter])

  const [isDrawingModalOpen, setIsDrawingModalOpen] = useState(false)
  const [drawingError, setDrawingError] = useState(false)
  const [drawingObjectUrl, setDrawingObjectUrl] = useState<string | null>(null)
  const [isLoadingDrawingFile, setIsLoadingDrawingFile] = useState(false)

  const drawingOriginalUrlValue = (part.drawing_url || "").trim()
  const drawingPreviewUrlValue = (part.drawing_preview_url || "").trim()
  const drawingUrlValue = drawingPreviewUrlValue || drawingOriginalUrlValue
  const hasDrawingPreviewImage = Boolean(drawingPreviewUrlValue)
  const drawingUrlLower = drawingUrlValue.toLowerCase()
  const isPdfDrawing = !hasDrawingPreviewImage && (drawingUrlLower.includes(".pdf") || drawingUrlLower.startsWith("data:application/pdf"))
  const isImageDrawing =
    hasDrawingPreviewImage ||
    drawingUrlLower.startsWith("data:image/") || /\.(png|jpe?g|gif|webp|svg)(\?|$)/.test(drawingUrlLower)
  const isKnownDrawingType = isPdfDrawing || isImageDrawing

  const isProtectedAttachmentUrl = (value: string) => {
    if (value.startsWith("/uploads/") || value.startsWith("/api/v1/attachments/serve/")) return true
    if (value.startsWith("http://") || value.startsWith("https://")) {
      try {
        const parsed = new URL(value)
        return parsed.pathname.startsWith("/uploads/") || parsed.pathname.startsWith("/api/v1/attachments/serve/")
      } catch {
        return false
      }
    }
    return false
  }

  const isProtectedDrawing = drawingUrlValue ? isProtectedAttachmentUrl(drawingUrlValue) : false
  const resolvedDrawingUrl = isProtectedDrawing ? drawingObjectUrl : drawingUrlValue

  useEffect(() => {
    let cancelled = false

    const clearObjectUrl = () => {
      setDrawingObjectUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
    }

    if (!drawingUrlValue || !isKnownDrawingType) {
      clearObjectUrl()
      setIsLoadingDrawingFile(false)
      return
    }

    if (drawingUrlValue.startsWith("data:") || drawingUrlValue.startsWith("blob:") || !isProtectedAttachmentUrl(drawingUrlValue)) {
      clearObjectUrl()
      setIsLoadingDrawingFile(false)
      return
    }

    setIsLoadingDrawingFile(true)
    void (async () => {
      try {
        const blob = await apiClient.fetchBlob(drawingUrlValue)
        if (cancelled) return
        const nextUrl = URL.createObjectURL(blob)
        setDrawingObjectUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev)
          return nextUrl
        })
        setDrawingError(false)
      } catch {
        if (cancelled) return
        clearObjectUrl()
        setDrawingError(true)
      } finally {
        if (!cancelled) setIsLoadingDrawingFile(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [drawingUrlValue, isKnownDrawingType])

  useEffect(() => {
    return () => {
      if (drawingObjectUrl) URL.revokeObjectURL(drawingObjectUrl)
    }
  }, [drawingObjectUrl])

  const [receivingMovement, setReceivingMovement] = useState<LogisticsEntry | null>(null)
  const [receivingQty, setReceivingQty] = useState("")
  const [receivingError, setReceivingError] = useState("")
  const [isConfirmingReceive, setIsConfirmingReceive] = useState(false)

  const handleOpenReceiveDialog = (entry: LogisticsEntry) => {
    const qty = entry.qty_sent ?? entry.quantity ?? 0
    setReceivingMovement(entry)
    setReceivingQty(qty > 0 ? String(qty) : "")
    setReceivingError("")
  }

  const handleConfirmReceive = async () => {
    if (!receivingMovement) return
    if (!permissions.canEditFacts) {
      setReceivingError("Нет прав для подтверждения приёмки")
      return
    }

    const parsedQty = parsePositiveInt(receivingQty)
    if (parsedQty === null) {
      setReceivingError("Укажите корректное количество приёмки")
      return
    }

    const sentQty = receivingMovement.qty_sent ?? receivingMovement.quantity
    if (typeof sentQty === "number" && parsedQty > sentQty) {
      setReceivingError(`Нельзя принять больше отправленного (${sentQty.toLocaleString()} шт.)`)
      return
    }

    setIsConfirmingReceive(true)
    setReceivingError("")
    try {
      await updateLogisticsEntry({
        ...receivingMovement,
        status: "received",
        qty_received: parsedQty,
        received_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

      if (receivingMovement.stage_id) {
        const stage = stageByStatusId.get(String(receivingMovement.stage_id))
        if (stage) updatePartStageStatus(part.id, stage, "done", currentUser?.id)
      }

      setReceivingMovement(null)
      setReceivingQty("")
      setReceivingError("")
    } catch (error) {
      setReceivingError(error instanceof Error ? error.message : "Не удалось подтвердить приёмку")
    } finally {
      setIsConfirmingReceive(false)
    }
  }

  const [isStartModalOpen, setIsStartModalOpen] = useState(false)
  const [startPlannedDate, setStartPlannedDate] = useState(part.cooperation_due_date || "")
  const [startError, setStartError] = useState("")
  const [isStartingManufacturing, setIsStartingManufacturing] = useState(false)

  useEffect(() => {
    setStartPlannedDate(part.cooperation_due_date || "")
  }, [part.cooperation_due_date, part.id])

  const canStartManufacturing = permissions.canEditParts || permissions.canEditFacts
  const startDisabledReason = !canStartManufacturing
    ? "Нет прав для запуска кооперации"
    : undefined

  const handleStartManufacturing = async () => {
    setStartError("")
    if (!canStartManufacturing) {
      setStartError("Нет прав для запуска кооперации")
      return
    }
    if (!startPlannedDate) {
      setStartError("Укажите плановую дату возврата")
      return
    }

    setIsStartingManufacturing(true)
    try {
      if (permissions.canEditParts) {
        await updatePart({
          ...part,
          cooperation_due_date: startPlannedDate,
        })
      }

      if (permissions.canEditFacts && !cooperatorOutboundCreated) {
        await createLogisticsEntry({
          part_id: part.id,
          status: "sent",
          from_location: "Мы",
          from_holder: "Производство",
          to_location: "Кооператор",
          to_holder: cooperatorLabel(part),
          carrier: "",
          tracking_number: undefined,
          planned_eta: undefined,
          qty_sent: part.qty_plan,
          stage_id: undefined,
          description: `Старт кооперации -> ${cooperatorLabel(part)}`,
          type: "coop_out",
          counterparty: cooperatorLabel(part),
          notes: undefined,
          date: localIsoDate(),
        })
      }

      setIsStartModalOpen(false)
    } catch (error) {
      setStartError(error instanceof Error ? error.message : "Не удалось запустить кооперацию")
    } finally {
      setIsStartingManufacturing(false)
    }
  }

  const [isShipBackModalOpen, setIsShipBackModalOpen] = useState(false)
  const [shipBackQty, setShipBackQty] = useState("")
  const [shipBackTracking, setShipBackTracking] = useState("")
  const [shipBackError, setShipBackError] = useState("")
  const [isShippingBack, setIsShippingBack] = useState(false)

  const activeInboundQty = useMemo(
    () =>
      cooperatorShipmentsActive
        .filter((entry) => (entry.type === "coop_in") || `${entry.from_location || ""} ${entry.from_holder || ""}`.toLowerCase().includes("кооператор"))
        .reduce((sum, entry) => sum + movementEffectiveQty(entry), 0),
    [cooperatorShipmentsActive]
  )

  const availableShipBackQty = Math.max(part.qty_plan - cooperatorReceivedQty - activeInboundQty, 0)
  const canShipBack = permissions.canEditFacts && availableShipBackQty > 0 && cooperatorStageStatus !== "waiting"
  const shipBackDisabledReason = !permissions.canEditFacts
    ? "Нет прав для оформления отправки"
    : availableShipBackQty <= 0
      ? "Нет доступного количества для отправки"
      : cooperatorStageStatus === "waiting"
        ? "Сначала запустите кооперацию"
        : undefined

  useEffect(() => {
    if (!isShipBackModalOpen) return
    setShipBackQty(availableShipBackQty > 0 ? String(availableShipBackQty) : "")
  }, [availableShipBackQty, isShipBackModalOpen])

  const handleShipBack = async () => {
    setShipBackError("")
    if (!permissions.canEditFacts) {
      setShipBackError("Нет прав для оформления отправки")
      return
    }

    const qty = parsePositiveInt(shipBackQty)
    if (qty === null) {
      setShipBackError("Укажите корректное количество")
      return
    }
    if (qty > availableShipBackQty) {
      setShipBackError(`Максимально доступно: ${availableShipBackQty.toLocaleString()} шт.`)
      return
    }

    setIsShippingBack(true)
    try {
      await createLogisticsEntry({
        part_id: part.id,
        status: "in_transit",
        from_location: "Кооператор",
        from_holder: cooperatorLabel(part),
        to_location: "Мы",
        to_holder: "Производство",
        carrier: "",
        tracking_number: shipBackTracking.trim() || undefined,
        planned_eta: undefined,
        qty_sent: qty,
        stage_id: undefined,
        description: `Возврат от кооператора (${qty} шт.)`,
        type: "coop_in",
        counterparty: cooperatorLabel(part),
        notes: undefined,
        date: localIsoDate(),
      })

      setIsShipBackModalOpen(false)
      setShipBackQty("")
      setShipBackTracking("")
    } catch (error) {
      setShipBackError(error instanceof Error ? error.message : "Не удалось оформить отправку")
    } finally {
      setIsShippingBack(false)
    }
  }

  const incomingInspectionStatus = part.cooperation_qc_status || "pending"
  const incomingInspectionLabel =
    incomingInspectionStatus === "accepted"
      ? "Проведён"
      : incomingInspectionStatus === "rejected"
        ? "Есть замечания"
        : "Не проведён"
  const incomingInspectionBadgeClass =
    incomingInspectionStatus === "accepted"
      ? "bg-emerald-100 text-emerald-700"
      : incomingInspectionStatus === "rejected"
        ? "bg-red-100 text-red-700"
        : "bg-slate-100 text-slate-600"

  const hasAnyActiveShipment = inTransitShipments.length > 0
  const canEditIncomingInspection = permissions.canEditParts
  const canRunIncomingInspectionDecision = canEditIncomingInspection && cooperatorReceivedQty > 0 && !hasAnyActiveShipment
  const incomingInspectionDisabledReason = !permissions.canEditParts
    ? "Нет прав для входного контроля"
    : cooperatorReceivedQty <= 0
      ? "Сначала примите детали от кооператора"
      : hasAnyActiveShipment
        ? "Завершите активные отправки перед входным контролем"
        : undefined
  const [isSavingIncomingInspection, setIsSavingIncomingInspection] = useState(false)
  const [incomingInspectionError, setIncomingInspectionError] = useState("")

  const handleSetIncomingInspection = async (status: "accepted" | "rejected") => {
    if (!canRunIncomingInspectionDecision) return
    setIncomingInspectionError("")
    setIsSavingIncomingInspection(true)
    try {
      await updatePart({
        ...part,
        cooperation_qc_status: status,
        cooperation_qc_checked_at: new Date().toISOString(),
      })
    } catch (error) {
      setIncomingInspectionError(error instanceof Error ? error.message : "Не удалось сохранить входной контроль")
    } finally {
      setIsSavingIncomingInspection(false)
    }
  }

  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false)
  const [taskTitle, setTaskTitle] = useState("")
  const [taskDescription, setTaskDescription] = useState("")
  const [taskDueDate, setTaskDueDate] = useState(part.deadline || localIsoDate())
  const [taskError, setTaskError] = useState("")
  const [isCreatingTask, setIsCreatingTask] = useState(false)

  useEffect(() => {
    setTaskDueDate(part.deadline || localIsoDate())
  }, [part.deadline, part.id])

  const handleCreateTask = async () => {
    setTaskError("")
    if (!permissions.canCreateTasks) {
      setTaskError("Нет прав на создание задач")
      return
    }
    if (!currentUser?.id) {
      setTaskError("Не удалось определить текущего пользователя")
      return
    }
    if (!taskTitle.trim()) {
      setTaskError("Введите название задачи")
      return
    }
    if (!taskDueDate) {
      setTaskError("Укажите срок задачи")
      return
    }

    setIsCreatingTask(true)
    try {
      await createTask({
        part_id: part.id,
        machine_id: undefined,
        stage: undefined,
        title: taskTitle.trim(),
        description: taskDescription.trim(),
        creator_id: currentUser.id,
        assignee_type: "all",
        assignee_id: undefined,
        assignee_role: undefined,
        accepted_by_id: undefined,
        accepted_at: undefined,
        status: "open",
        is_blocker: false,
        due_date: taskDueDate,
        category: "general",
        comments: [],
        review_comment: undefined,
        reviewed_by_id: undefined,
        reviewed_at: undefined,
      })

      setIsTaskModalOpen(false)
      setTaskTitle("")
      setTaskDescription("")
      setTaskDueDate(part.deadline || localIsoDate())
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "Не удалось создать задачу")
    } finally {
      setIsCreatingTask(false)
    }
  }

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back()
      return
    }
    onBack()
  }

  const renderEvents = () => {
    if (filteredEvents.length === 0) {
      return <p className="py-8 text-center text-sm text-slate-500">События по выбранному фильтру нет</p>
    }

    return (
      <div className="space-y-4">
        {filteredEvents.map((event) => {
          const Icon =
            event.type === "movement"
              ? Truck
              : event.type === "inspection"
                ? ClipboardCheck
                : event.type === "production"
                  ? Activity
                  : CheckSquare

          return (
            <div key={event.id} className="flex gap-3 border-b border-slate-100 pb-4 last:border-0">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-100">
                <Icon className="h-4 w-4 text-slate-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-800">{event.description}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>{event.timestamp}</span>
                  <span>•</span>
                  <span>{event.user}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="h-9 px-2" onClick={handleBack}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Назад
        </Button>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 space-y-6 xl:col-span-9">
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="mb-3 flex flex-wrap items-center gap-2 sm:gap-3">
                  <h2 className="text-xl font-bold text-slate-900">Деталь: {part.code}</h2>
                  <Badge className="rounded-full bg-blue-50 px-3 py-1 text-blue-700 hover:bg-blue-50">Кооперация</Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">Клиент: {part.customer || "Нет данных"}</span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">Партия: {part.qty_plan.toLocaleString()} шт.</span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">Кооператор: {cooperatorLabel(part)}</span>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex-1 space-y-3">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex items-center gap-2">
                    <CalendarIcon className="h-5 w-5 flex-shrink-0 text-slate-400" />
                    <div>
                      <div className="mb-0.5 text-xs text-slate-500">Внешний дедлайн</div>
                      <div className="text-sm font-semibold text-slate-900">{formatDate(part.deadline)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <CalendarIcon className="h-5 w-5 flex-shrink-0 text-slate-400" />
                    <div>
                      <div className="mb-0.5 text-xs text-slate-500">Дедлайн кооператора</div>
                      <div className="text-sm font-semibold text-slate-900">{formatDate(cooperatorDeadlineRaw)}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="mb-1 text-xs text-slate-500">Запас</div>
                  <div className={cn(
                    "text-sm font-semibold",
                    scheduleStatus === "успеваем" && "text-teal-700",
                    scheduleStatus === "риск" && "text-amber-800",
                    scheduleStatus === "просрочено" && "text-red-700",
                    scheduleStatus === "нет данных" && "text-slate-600",
                  )}>
                    {reserveLabel}
                  </div>
                </div>
                <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium", scheduleBadgeClass)}>
                  <span className={cn("h-2 w-2 rounded-full", scheduleDotClass)} />
                  {scheduleStatus === "успеваем"
                    ? "Успеваем"
                    : scheduleStatus === "риск"
                      ? "Риск"
                      : scheduleStatus === "просрочено"
                        ? "Просрочено"
                        : "Нет данных"}
                </span>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-6 flex items-center gap-2">
              <Building2 className="h-5 w-5 text-slate-400" />
              <h3 className="text-xl font-semibold text-slate-900">Производственный поток</h3>
            </div>

            <div className="space-y-4">
              <Card className="gap-0 border-blue-100 bg-white py-0 shadow-none">
                <CardContent className="p-4 sm:p-5">
                  <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50">
                        <Building2 className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <h4 className="mb-1 text-lg font-semibold text-slate-900">Кооператор (изготовление)</h4>
                        <p className="text-sm text-slate-500">{cooperatorLabel(part)}</p>
                      </div>
                    </div>
                    <span className={cn("inline-flex h-fit items-center rounded-full px-3 py-1 text-sm font-medium", statusPillClass(cooperatorStageStatus))}>
                      {statusLabel(cooperatorStageStatus)}
                    </span>
                  </div>

                  <div className="space-y-4">
                    {part.cooperation_due_date ? (
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <CalendarIcon className="h-4 w-4 text-slate-400" />
                        <span>Плановая дата возврата:</span>
                        <span className="font-medium text-slate-900">{formatDate(part.cooperation_due_date)}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <CalendarIcon className="h-4 w-4 text-slate-400" />
                        <span>Плановая дата возврата: Нет данных</span>
                      </div>
                    )}

                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm text-slate-500">Прогресс</span>
                        <span className="text-sm font-medium text-slate-900">
                          {Math.min(cooperatorReceivedQty, part.qty_plan).toLocaleString()} / {part.qty_plan.toLocaleString()}
                        </span>
                      </div>
                      <Progress value={part.qty_plan > 0 ? Math.min(100, Math.round((cooperatorReceivedQty / part.qty_plan) * 100)) : 0} className="h-2" />
                    </div>

                    <div className="flex flex-col gap-2 pt-2 sm:flex-row">
                      {cooperatorStageStatus === "waiting" ? (
                        <DisabledActionButton
                          disabled={!canStartManufacturing}
                          disabledReason={startDisabledReason}
                          onClick={() => {
                            setStartError("")
                            setIsStartModalOpen(true)
                          }}
                          className="w-full sm:w-auto"
                        >
                          <Send className="h-4 w-4" />
                          Начать изготовление
                        </DisabledActionButton>
                      ) : (
                        <DisabledActionButton
                          disabled={!canShipBack}
                          disabledReason={shipBackDisabledReason}
                          onClick={() => {
                            setShipBackError("")
                            setIsShipBackModalOpen(true)
                          }}
                          className="w-full sm:w-auto"
                        >
                          <Send className="h-4 w-4" />
                          Отправить
                        </DisabledActionButton>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {externalStages.map((stage, index) => {
                const Icon = stage.icon
                return (
                  <React.Fragment key={stage.key}>
                    <div className="flex justify-center py-1">
                      <ArrowRight className="h-6 w-6 rotate-90 text-slate-300" />
                    </div>
                    <Card className="gap-0 border-slate-200 py-0 shadow-none">
                      <CardContent className="p-4 sm:p-5">
                        <div className="mb-4 flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div
                              className={cn(
                                "flex h-10 w-10 items-center justify-center rounded-lg",
                                stage.tone === "orange" ? "bg-orange-50" : "bg-purple-50"
                              )}
                            >
                              <Icon className={cn("h-5 w-5", stage.tone === "orange" ? "text-orange-600" : "text-purple-600")} />
                            </div>
                            <div>
                              <h4 className="mb-1 text-lg font-semibold text-slate-900">{stage.title}</h4>
                              <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">Внешний этап</span>
                            </div>
                          </div>
                          <span className={cn("inline-flex h-fit items-center rounded-full px-3 py-1 text-sm font-medium", statusPillClass(stage.status))}>
                            {statusLabel(stage.status)}
                          </span>
                        </div>

                        <div>
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-sm text-slate-500">Прогресс</span>
                            <span className="text-sm font-medium text-slate-900">
                              {Math.min(stage.completed, stage.total).toLocaleString()} / {stage.total.toLocaleString()}
                            </span>
                          </div>
                          <Progress value={stage.total > 0 ? Math.min(100, Math.round((stage.completed / stage.total) * 100)) : 0} className="h-2" />
                        </div>
                      </CardContent>
                    </Card>
                    {index === externalStages.length - 1 ? null : null}
                  </React.Fragment>
                )
              })}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white">
            <div className="p-5 pb-0">
              <div className="mb-4 flex items-center gap-2">
                <Clock className="h-5 w-5 text-slate-400" />
                <h3 className="text-xl font-semibold text-slate-900">Журнал событий</h3>
              </div>
            </div>

            <div className="px-5">
              <Tabs value={journalFilter} onValueChange={(value) => setJournalFilter(value as ZipJournalFilter)}>
                <TabsList className="h-auto w-full max-w-full flex-wrap justify-start gap-1 rounded-lg bg-slate-100 p-1">
                  <TabsTrigger value="all" className="flex-none">Все</TabsTrigger>
                  <TabsTrigger value="movements" className="flex-none">Перемещения</TabsTrigger>
                  <TabsTrigger value="inspection" className="flex-none">Приёмка</TabsTrigger>
                  <TabsTrigger value="production" className="flex-none">Факты</TabsTrigger>
                  <TabsTrigger value="tasks" className="flex-none">Задачи</TabsTrigger>
                </TabsList>
                <TabsContent value={journalFilter} className="mt-0" />
              </Tabs>
            </div>

            <div className="p-5">{renderEvents()}</div>
          </section>
        </div>

        <aside className="col-span-12 space-y-6 xl:col-span-3">
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <FileImage className="h-5 w-5 text-slate-400" />
                <h3 className="text-lg font-semibold text-slate-900">ЧЕРТЁЖ</h3>
              </div>
              {drawingUrlValue ? (
                <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-blue-600" onClick={() => setIsDrawingModalOpen(true)}>
                  <Maximize2 className="h-4 w-4" />
                  На весь экран
                </Button>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => drawingUrlValue && setIsDrawingModalOpen(true)}
              disabled={!drawingUrlValue}
              className={cn(
                "block w-full overflow-hidden rounded-lg border text-left",
                drawingUrlValue ? "cursor-pointer border-slate-200 bg-slate-50 hover:border-slate-300" : "cursor-default border-slate-200 bg-slate-100"
              )}
            >
              <div className="flex aspect-[4/3] items-center justify-center bg-slate-100">
                {isLoadingDrawingFile ? (
                  <p className="text-sm text-slate-500">Загрузка...</p>
                ) : drawingUrlValue && isImageDrawing && !drawingError ? (
                  <img
                    src={resolvedDrawingUrl || "/placeholder.svg"}
                    alt={`Чертёж ${part.code}`}
                    className="h-full w-full object-contain"
                    onError={() => setDrawingError(true)}
                  />
                ) : drawingUrlValue && isPdfDrawing ? (
                  <div className="text-center text-slate-500">
                    <FileText className="mx-auto mb-2 h-8 w-8 opacity-70" />
                    <p className="text-sm">PDF-чертёж</p>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Нет данных</p>
                )}
              </div>
            </button>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-4 flex items-center gap-2">
              <Truck className="h-5 w-5 text-slate-400" />
              <h3 className="text-lg font-semibold text-slate-900">Отправки в пути</h3>
            </div>

            {inTransitShipments.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-500">Активных отправок нет</p>
            ) : (
              <div className="space-y-3">
                {inTransitShipments.map((shipment) => (
                  <div key={shipment.id} className="rounded-lg border border-blue-100 bg-blue-50 p-3">
                    <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                      <span className="text-sm font-medium text-slate-900">{shipment.from}</span>
                      <ArrowRight className="hidden h-4 w-4 text-slate-400 sm:block" />
                      <span className="text-sm font-medium text-slate-900">{shipment.to}</span>
                      <span className="text-xs text-slate-500 sm:ml-auto">{shipment.quantity.toLocaleString()} шт.</span>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">В пути</span>
                        <div className="flex items-center gap-1 text-xs text-slate-500">
                          <Clock className="h-3 w-3" />
                          <span>в пути: {shipment.daysInTransit} дн.</span>
                        </div>
                      </div>

                      {shipment.canConfirm ? (
                        <DisabledActionButton
                          disabled={!shipment.canConfirm}
                          disabledReason={shipment.disabledReason}
                          size="sm"
                          variant="secondary"
                          className="w-full sm:w-auto"
                          onClick={() => handleOpenReceiveDialog(shipment.entry)}
                        >
                          <PackageCheck className="h-4 w-4" />
                          Принять
                        </DisabledActionButton>
                      ) : (
                        <DisabledActionButton
                          disabled
                          disabledReason={shipment.disabledReason}
                          size="sm"
                          variant="secondary"
                          className="w-full sm:w-auto"
                        >
                          <PackageCheck className="h-4 w-4" />
                          Принять
                        </DisabledActionButton>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-4 flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-slate-400" />
              <h3 className="text-lg font-semibold text-slate-900">Входной контроль</h3>
            </div>

            <div className="mb-4">
              <span className={cn("inline-flex rounded-full px-3 py-1 text-sm font-medium", incomingInspectionBadgeClass)}>
                {incomingInspectionLabel}
              </span>
              {part.cooperation_qc_checked_at ? (
                <p className="mt-2 text-xs text-slate-500">Проверено: {formatDateTime(part.cooperation_qc_checked_at)}</p>
              ) : null}
            </div>

            {incomingInspectionStatus === "pending" ? (
              <div className="space-y-2">
                <DisabledActionButton
                  disabled={!canRunIncomingInspectionDecision || isSavingIncomingInspection}
                  disabledReason={incomingInspectionDisabledReason}
                  size="sm"
                  className="w-full"
                  onClick={() => void handleSetIncomingInspection("accepted")}
                >
                  Отметить как проведён
                </DisabledActionButton>
                <DisabledActionButton
                  disabled={!canRunIncomingInspectionDecision || isSavingIncomingInspection}
                  disabledReason={incomingInspectionDisabledReason}
                  size="sm"
                  variant="secondary"
                  className="w-full"
                  onClick={() => void handleSetIncomingInspection("rejected")}
                >
                  Есть замечания
                </DisabledActionButton>
              </div>
            ) : null}

            {incomingInspectionError ? <p className="mt-3 text-sm text-red-600">{incomingInspectionError}</p> : null}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckSquare className="h-5 w-5 text-slate-400" />
                <h3 className="text-lg font-semibold text-slate-900">Задачи</h3>
              </div>
              <DisabledActionButton
                disabled={!permissions.canCreateTasks}
                disabledReason="Нет прав на создание задач"
                size="icon-sm"
                className="rounded-full"
                onClick={() => setIsTaskModalOpen(true)}
              >
                <Plus className="h-4 w-4" />
              </DisabledActionButton>
            </div>

            {activeTasks.length === 0 ? (
              <p className="text-sm text-slate-500">Нет активных задач</p>
            ) : (
              <div className="space-y-3">
                <p className="text-2xl font-bold text-slate-900">{activeTasks.length}</p>
                <div className="space-y-2">
                  {topTasks.map((task) => {
                    const priority = normalizeTaskPriority(task)
                    return (
                      <div key={task.id} className="rounded-lg bg-slate-50 p-3">
                        <p className="text-sm text-slate-900">{task.title}</p>
                        <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                          <span>{TASK_STATUS_LABELS[task.status]}</span>
                          <span
                            className={cn(
                              "rounded px-1.5 py-0.5",
                              priority === "high" && "bg-red-100 text-red-700",
                              priority === "normal" && "bg-slate-200 text-slate-700",
                              priority === "low" && "bg-slate-100 text-slate-500"
                            )}
                          >
                            {priority === "high" ? "Срочно" : priority === "normal" ? "Норм" : "Низкий"}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </section>
        </aside>
      </div>

      <Dialog open={isDrawingModalOpen} onOpenChange={setIsDrawingModalOpen}>
        <DialogContent className="h-[95vh] max-h-[95vh] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] overflow-hidden p-0 sm:h-[94vh] sm:w-[calc(100vw-2rem)] sm:max-w-[calc(100vw-2rem)]">
          <DialogHeader className="border-b border-slate-200 px-4 py-3">
            <DialogTitle className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <FileImage className="h-4 w-4 text-slate-500" />
              <span className="truncate">ЧЕРТЁЖ: {part.code}</span>
            </DialogTitle>
            <DialogDescription className="sr-only">Просмотр чертежа детали</DialogDescription>
          </DialogHeader>
          <div className="flex h-[calc(95vh-4.25rem)] items-center justify-center overflow-auto bg-slate-100 p-2 sm:p-4">
            {isLoadingDrawingFile ? (
              <span className="text-sm text-slate-500">Загрузка...</span>
            ) : drawingUrlValue && isImageDrawing && !drawingError ? (
              <img
                src={resolvedDrawingUrl || "/placeholder.svg"}
                alt={`Чертёж ${part.code}`}
                className="max-h-full w-full rounded bg-white object-contain"
                onError={() => setDrawingError(true)}
              />
            ) : drawingUrlValue && isPdfDrawing ? (
              <iframe
                src={resolvedDrawingUrl || drawingUrlValue || undefined}
                title={`Чертёж ${part.code}`}
                className="h-full min-h-[60vh] w-full rounded border border-slate-200 bg-white"
              />
            ) : (
              <div className="text-center text-slate-500">
                <FileImage className="mx-auto mb-2 h-10 w-10 opacity-60" />
                <p>Нет данных</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={receivingMovement !== null}
        onOpenChange={(open) => {
          if (!open) {
            setReceivingMovement(null)
            setReceivingQty("")
            setReceivingError("")
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Принять детали</DialogTitle>
            <DialogDescription>Подтвердите фактически принятое количество.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm text-slate-500">Откуда:</span>
                <span className="text-sm font-medium text-slate-900">{receivingMovement?.from_holder || receivingMovement?.from_location || "Источник"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Куда:</span>
                <span className="text-sm font-medium text-slate-900">{receivingMovement?.to_holder || receivingMovement?.to_location || "Назначение"}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="receive-qty">Принято количество</Label>
              <Input id="receive-qty" type="number" value={receivingQty} onChange={(event) => setReceivingQty(event.target.value)} />
              <p className="text-sm text-slate-500">
                Ожидается: <strong>{String(receivingMovement?.qty_sent ?? receivingMovement?.quantity ?? 0)} шт.</strong>
              </p>
            </div>

            {receivingError ? <p className="text-sm text-red-600">{receivingError}</p> : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReceivingMovement(null)}>
              Отмена
            </Button>
            <Button type="button" onClick={() => void handleConfirmReceive()} disabled={isConfirmingReceive}>
              {isConfirmingReceive ? "Сохраняем..." : "Принять"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isStartModalOpen} onOpenChange={setIsStartModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Начать изготовление</DialogTitle>
            <DialogDescription>
              Запуск кооперации у исполнителя {cooperatorLabel(part)}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="start-planned-date">Плановая дата возврата</Label>
              <Input
                id="start-planned-date"
                type="date"
                value={startPlannedDate}
                onChange={(event) => setStartPlannedDate(event.target.value)}
              />
            </div>

            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
              После запуска будет сохранён дедлайн кооператора и (при наличии прав) создана отправка кооператору.
            </div>

            {startError ? <p className="text-sm text-red-600">{startError}</p> : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsStartModalOpen(false)}>
              Отмена
            </Button>
            <Button type="button" onClick={() => void handleStartManufacturing()} disabled={isStartingManufacturing}>
              {isStartingManufacturing ? "Сохраняем..." : "Начать изготовление"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isShipBackModalOpen} onOpenChange={setIsShipBackModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Отправить детали</DialogTitle>
            <DialogDescription>Оформление обратной отправки от кооператора.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm text-slate-500">Откуда:</span>
                <span className="text-sm font-medium text-slate-900">{cooperatorLabel(part)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Куда:</span>
                <span className="text-sm font-medium text-slate-900">Мы</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ship-back-qty">Количество</Label>
              <Input
                id="ship-back-qty"
                type="number"
                value={shipBackQty}
                onChange={(event) => setShipBackQty(event.target.value)}
              />
              <p className="text-sm text-slate-500">Доступно для отправки: <strong>{availableShipBackQty.toLocaleString()} шт.</strong></p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ship-back-tracking">Трек / накладная</Label>
              <Input
                id="ship-back-tracking"
                value={shipBackTracking}
                onChange={(event) => setShipBackTracking(event.target.value)}
                placeholder="Опционально"
              />
            </div>

            {shipBackError ? <p className="text-sm text-red-600">{shipBackError}</p> : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsShipBackModalOpen(false)}>
              Отмена
            </Button>
            <Button type="button" onClick={() => void handleShipBack()} disabled={isShippingBack}>
              {isShippingBack ? "Оформляем..." : "Отправить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isTaskModalOpen} onOpenChange={setIsTaskModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новая задача</DialogTitle>
            <DialogDescription>Добавление задачи по кооперативной детали.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="task-title-zip">Название задачи</Label>
              <Input id="task-title-zip" value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-desc-zip">Описание</Label>
              <Textarea id="task-desc-zip" rows={3} value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-due-zip">Срок</Label>
              <Input id="task-due-zip" type="date" value={taskDueDate} onChange={(event) => setTaskDueDate(event.target.value)} />
            </div>
            {taskError ? <p className="text-sm text-red-600">{taskError}</p> : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsTaskModalOpen(false)}>
              Отмена
            </Button>
            <Button type="button" onClick={() => void handleCreateTask()} disabled={isCreatingTask}>
              {isCreatingTask ? "Создаём..." : "Создать"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
