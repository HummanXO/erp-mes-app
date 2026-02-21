"use client"

import React from "react"

import { useEffect, useMemo, useState } from "react"
import { useApp } from "@/lib/app-context"
import type {
  LogisticsEntry,
  MovementStatus,
  Part,
  ProductionStage,
  ShiftType,
  StageFact,
  Task,
  TaskCategory,
  TaskAssigneeType,
  UserRole,
} from "@/lib/types"
import { SHIFT_LABELS, STAGE_LABELS, TASK_STATUS_LABELS } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { apiClient } from "@/lib/api-client"
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CalendarIcon,
  Check,
  CheckCircle2,
  ClipboardList,
  Cog,
  Factory,
  FileImage,
  FileText,
  Flame,
  FlaskConical,
  Maximize2,
  Package,
  Pencil,
  Plus,
  Printer,
  Truck,
  Wrench,
} from "lucide-react"

interface PartDetailsCooperationProps {
  part: Part
  onBack: () => void
}

type JournalFilter = "all" | "movement" | "receipt" | "fact" | "task"
type FlowStageKey = "machining" | "fitting" | "heat_treatment" | "galvanic"
type FlowStageState = "unused" | "pending" | "in_progress" | "done"
type TaskPriority = "high" | "normal" | "low"
type TaskAssigneePreset = "operators" | "masters" | "logistics" | "all"

type FlowStage = {
  key: FlowStageKey
  label: string
  shortLabel: string
  external: boolean
  optional: boolean
}

type JournalEvent = {
  id: string
  type: Exclude<JournalFilter, "all">
  title: string
  subtitle?: string
  at: string
}

type FlowCard = FlowStage & {
  state: FlowStageState
  isUsed: boolean
  doneQty: number
  percent: number
  availableQty: number
  inWorkQty: number
  inTransitQty: number
  nextStage: FlowStageKey | "fg" | null
}

const ACTIVE_SHIPMENT_STATUSES = new Set<MovementStatus>(["sent", "in_transit", "pending"])
const RECEIVED_SHIPMENT_STATUSES = new Set<MovementStatus>(["received", "completed"])
const NO_MACHINE_VALUE = "__none__"
const NO_STAGE_VALUE = "__none__"

const FLOW_STAGES: FlowStage[] = [
  {
    key: "machining",
    label: "Механика",
    shortLabel: "Механика",
    external: false,
    optional: false,
  },
  {
    key: "fitting",
    label: "Слесарная",
    shortLabel: "Слесарная",
    external: false,
    optional: false,
  },
  {
    key: "heat_treatment",
    label: "Термообработка",
    shortLabel: "Термо.",
    external: true,
    optional: true,
  },
  {
    key: "galvanic",
    label: "Гальваника",
    shortLabel: "Гальваника",
    external: true,
    optional: true,
  },
]

const FLOW_STAGE_BY_KEY = new Map(FLOW_STAGES.map((stage) => [stage.key, stage] as const))

function movementStatus(entry: LogisticsEntry): MovementStatus {
  return (entry.status || "pending") as MovementStatus
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

function formatDate(value?: string): string {
  if (!value) return "--"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return "--"
  return parsed.toLocaleDateString("ru-RU")
}

function formatTime(value?: string): string {
  if (!value) return "--"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return "--"
  return parsed.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatRelativeTime(value?: string): string {
  if (!value) return ""
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ""

  const now = Date.now()
  const diffMs = now - parsed.getTime()
  if (diffMs < 0) return formatTime(value)

  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return "сейчас"
  if (minutes < 60) return `${minutes}м`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}ч`

  const days = Math.floor(hours / 24)
  if (days === 1) return "вчера"
  if (days < 7) return `${days}д`

  return formatDate(value)
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

function parseNonNegativeInt(value: string): number | null {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return parsed
}

function normalizeTaskPriority(task: Task): TaskPriority {
  if (task.is_blocker) return "high"
  if (task.category === "quality" || task.category === "machine") return "high"
  if (task.category === "material" || task.category === "logistics") return "normal"
  return "low"
}

function stageIcon(stage: FlowStageKey) {
  if (stage === "machining") return <Cog className="h-4 w-4" />
  if (stage === "fitting") return <Wrench className="h-4 w-4" />
  if (stage === "heat_treatment") return <Flame className="h-4 w-4" />
  return <FlaskConical className="h-4 w-4" />
}

function taskAssigneeFromPreset(preset: TaskAssigneePreset): {
  assignee_type: TaskAssigneeType
  assignee_role?: UserRole
} {
  if (preset === "operators") {
    return { assignee_type: "role", assignee_role: "operator" }
  }
  if (preset === "masters") {
    return { assignee_type: "role", assignee_role: "master" }
  }
  if (preset === "logistics") {
    return { assignee_type: "role", assignee_role: "supply" }
  }
  return { assignee_type: "all" }
}

function taskCategoryFromInputs(stage: ProductionStage | null, priority: TaskPriority): TaskCategory {
  if (stage === "heat_treatment" || stage === "galvanic" || stage === "logistics") return "logistics"
  if (stage === "machining") return "machine"
  if (priority === "high") return "quality"
  return "general"
}

function flowTargetLabel(target: FlowStageKey | "fg" | null): string {
  if (!target) return "—"
  if (target === "fg") return "Склад ГП"
  return STAGE_LABELS[target]
}

function flowShipButtonLabel(stage: FlowStageKey, target: FlowStageKey | "fg" | null): string {
  if (stage === "fitting" && target === "heat_treatment") return "Передать на Термообработку"
  if (stage === "heat_treatment" && target === "galvanic") return "Отправить на Гальванику"
  if (stage === "galvanic" && target === "fg") return "Отправить на Склад"

  if (target === "fg") return "Отправить на Склад"
  if (!target) return "Оформить отправку"
  return `Отправить на ${STAGE_LABELS[target]}`
}

function movementEffectiveQty(entry: LogisticsEntry): number {
  const status = movementStatus(entry)
  const sentQty = entry.qty_sent ?? entry.quantity ?? 0
  if (RECEIVED_SHIPMENT_STATUSES.has(status)) {
    return entry.qty_received ?? sentQty
  }
  return sentQty
}

function stageKeyFromLocation(value?: string | null): FlowStageKey | "fg" | null {
  const raw = String(value || "").trim().toLowerCase()
  if (!raw) return null
  if (raw.includes("мех")) return "machining"
  if (raw.includes("слес")) return "fitting"
  if (raw.includes("термо")) return "heat_treatment"
  if (raw.includes("гальв")) return "galvanic"
  if (raw.includes("склад гп")) return "fg"
  return null
}

function parseTransferredOut(notes?: string | null): number {
  if (!notes) return 0
  const match = notes.match(/(?:^|;)\s*xfer_out=(\d+)/i)
  if (!match) return 0
  const parsed = Number.parseInt(match[1], 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function mergeTransferredOut(notes: string | undefined, increment: number): string {
  const base = notes || ""
  const current = parseTransferredOut(base)
  const next = Math.max(0, current + increment)
  const cleaned = base.replace(/(?:^|;)\s*xfer_out=\d+/gi, "").trim().replace(/^;|;$/g, "").trim()
  return cleaned ? `${cleaned}; xfer_out=${next}` : `xfer_out=${next}`
}

export function PartDetailsCooperation({ part, onBack }: PartDetailsCooperationProps) {
  const {
    currentUser,
    permissions,
    users,
    machines,
    getPartProgress,
    getPartForecast,
    getMachineById,
    getMachineNorm,
    setMachineNorm,
    getStageFactsForPart,
    getLogisticsForPart,
    getTasksForPart,
    getUserById,
    createStageFact,
    updateStageFact,
    deleteStageFact,
    createTask,
    updatePart,
    updatePartStageStatus,
    createLogisticsEntry,
    updateLogisticsEntry,
  } = useApp()

  const progress = getPartProgress(part.id)
  const forecast = getPartForecast(part.id)
  const stageFacts = getStageFactsForPart(part.id)
  const logistics = getLogisticsForPart(part.id)
  const tasks = getTasksForPart(part.id)

  const sortedFacts = useMemo(
    () =>
      [...stageFacts].sort((a, b) => {
        const dateCompare = b.date.localeCompare(a.date)
        if (dateCompare !== 0) return dateCompare
        return b.created_at.localeCompare(a.created_at)
      }),
    [stageFacts]
  )

  const sortedLogistics = useMemo(() => sortByEventDate(logistics), [logistics])

  const stageOutgoingByLogistics = useMemo(() => {
    const map = new Map<FlowStageKey, number>()
    for (const entry of sortedLogistics) {
      const status = movementStatus(entry)
      if (status === "cancelled" || status === "returned") continue
      const sourceStage = stageKeyFromLocation(entry.from_location) ?? stageKeyFromLocation(entry.from_holder)
      if (!sourceStage || sourceStage === "fg") continue
      const qty = movementEffectiveQty(entry)
      if (qty <= 0) continue
      map.set(sourceStage, (map.get(sourceStage) || 0) + qty)
    }
    return map
  }, [sortedLogistics])

  const stageStatusByStage = useMemo(
    () => new Map((part.stage_statuses || []).map((status) => [status.stage, status] as const)),
    [part.stage_statuses]
  )

  const stageTransferredOutByStage = useMemo(() => {
    const map = new Map<FlowStageKey, number>()
    for (const stageStatus of part.stage_statuses || []) {
      if (!FLOW_STAGE_BY_KEY.has(stageStatus.stage as FlowStageKey)) continue
      const stageKey = stageStatus.stage as FlowStageKey
      map.set(stageKey, parseTransferredOut(stageStatus.notes))
    }
    return map
  }, [part.stage_statuses])

  const stageOutgoingQtyByStage = useMemo(() => {
    const map = new Map<FlowStageKey, number>()
    for (const stage of FLOW_STAGES) {
      const byLogistics = stageOutgoingByLogistics.get(stage.key) || 0
      const byNotes = stageTransferredOutByStage.get(stage.key) || 0
      map.set(stage.key, Math.max(byLogistics, byNotes))
    }
    return map
  }, [stageOutgoingByLogistics, stageTransferredOutByStage])

  const stageByStatusId = useMemo(() => {
    const map = new Map<string, ProductionStage>()
    for (const stageStatus of part.stage_statuses || []) {
      if (stageStatus.id) {
        map.set(String(stageStatus.id), stageStatus.stage)
      }
    }
    return map
  }, [part.stage_statuses])

  const stageQtyByStage = useMemo(() => {
    const map = new Map<ProductionStage, number>()
    for (const fact of stageFacts) {
      map.set(fact.stage, (map.get(fact.stage) || 0) + fact.qty_good)
    }
    // Fallback for legacy records where qty is persisted on stage statuses without facts.
    for (const stageStatus of part.stage_statuses || []) {
      if (!map.has(stageStatus.stage) && typeof stageStatus.qty_good === "number" && stageStatus.qty_good > 0) {
        map.set(stageStatus.stage, stageStatus.qty_good)
      }
    }
    return map
  }, [part.stage_statuses, stageFacts])

  const usedStages = useMemo(() => {
    const used = new Set<ProductionStage>()
    for (const stageStatus of part.stage_statuses || []) {
      if (stageStatus.status !== "skipped") {
        used.add(stageStatus.stage)
      }
    }
    for (const stage of part.required_stages || []) {
      used.add(stage)
    }
    return used
  }, [part.required_stages, part.stage_statuses])

  const activeChain = useMemo(() => {
    const chain: FlowStageKey[] = ["machining", "fitting"]
    if (usedStages.has("heat_treatment")) {
      chain.push("heat_treatment")
    }
    if (usedStages.has("galvanic")) {
      chain.push("galvanic")
    }
    return chain
  }, [usedStages])

  const flowCards = useMemo<FlowCard[]>(() => {
    return activeChain.reduce<FlowCard[]>((cards, stageKey) => {
      const flowStage = FLOW_STAGE_BY_KEY.get(stageKey)
      if (!flowStage) return cards
      const stageStatus = stageStatusByStage.get(flowStage.key)
      const doneQty = stageQtyByStage.get(flowStage.key) || 0
      const currentStageIndex = activeChain.indexOf(flowStage.key)
      const previousStage = currentStageIndex > 0 ? activeChain[currentStageIndex - 1] : null
      const previousDoneQty = previousStage ? stageQtyByStage.get(previousStage) || 0 : 0
      const previousStatus = previousStage ? stageStatusByStage.get(previousStage) : undefined
      const previousRecordedOutgoing = previousStage ? stageOutgoingQtyByStage.get(previousStage) || 0 : 0
      const previousOutgoingQty = previousStage
        ? previousRecordedOutgoing > 0
          ? previousRecordedOutgoing
          : previousStatus?.status === "done"
            ? previousDoneQty
            : 0
        : 0
      const recordedOutgoingQty = stageOutgoingQtyByStage.get(flowStage.key) || 0
      const currentOutgoingQty =
        recordedOutgoingQty > 0 ? recordedOutgoingQty : stageStatus?.status === "done" ? doneQty : 0
      const availableQty = Math.max(doneQty - currentOutgoingQty, 0)

      const stageId = stageStatus?.id ? String(stageStatus.id) : ""
      const inTransitQty = sortedLogistics
        .filter((entry) => {
          if (!stageId) return false
          return String(entry.stage_id || "") === stageId && ACTIVE_SHIPMENT_STATUSES.has(movementStatus(entry))
        })
        .reduce((sum, entry) => sum + movementEffectiveQty(entry), 0)

      const inWorkQty =
        flowStage.external
          ? inTransitQty
          : flowStage.key === "machining"
            ? 0
            : Math.max(previousOutgoingQty - doneQty, 0)

      const nextStage: FlowStageKey | "fg" | null =
        currentStageIndex < 0
          ? null
          : currentStageIndex < activeChain.length - 1
            ? activeChain[currentStageIndex + 1]
            : "fg"

      const state: FlowStageState =
        stageStatus?.status === "done"
          ? "done"
          : stageStatus?.status === "in_progress"
            ? "in_progress"
            : "pending"

      cards.push({
        ...flowStage,
        state,
        isUsed: true,
        doneQty,
        percent:
          part.qty_plan > 0 ? Math.max(0, Math.min(100, Math.round((doneQty / part.qty_plan) * 100))) : 0,
        availableQty,
        inWorkQty,
        inTransitQty,
        nextStage,
      })
      return cards
    }, [])
  }, [activeChain, part.qty_plan, sortedLogistics, stageOutgoingQtyByStage, stageQtyByStage, stageStatusByStage])

  const flowCardByStage = useMemo(() => {
    return new Map(flowCards.map((flowCard) => [flowCard.key, flowCard]))
  }, [flowCards])

  const inTransitShipments = useMemo(
    () => sortedLogistics.filter((entry) => ACTIVE_SHIPMENT_STATUSES.has(movementStatus(entry))),
    [sortedLogistics]
  )

  const machine = part.machine_id ? getMachineById(part.machine_id) : undefined
  const machiningMachines = machines.filter((machineCandidate) => machineCandidate.department === "machining")
  const machineNorm = part.machine_id ? getMachineNorm(part.machine_id, part.id, "machining") : undefined

  const finalQty = useMemo(() => {
    const lastStage = activeChain[activeChain.length - 1]
    if (!lastStage) return 0
    return stageOutgoingQtyByStage.get(lastStage) || 0
  }, [activeChain, stageOutgoingQtyByStage])
  const finalPercent = part.qty_plan > 0 ? Math.max(0, Math.min(100, Math.round((finalQty / part.qty_plan) * 100))) : 0

  const wipQty = useMemo(() => {
    const trackedStages: ProductionStage[] = ["machining", "fitting", "heat_treatment", "galvanic", "grinding"]
    const sumAcrossStages = trackedStages.reduce((sum, stage) => sum + (stageQtyByStage.get(stage) || 0), 0)
    return Math.max(sumAcrossStages - finalQty, 0)
  }, [stageQtyByStage, finalQty])

  const forecastStatus = forecast.status || (forecast.willFinishOnTime ? "on_track" : "risk")
  const hasForecastInput = forecastStatus !== "unknown"
  const internalDeadlineLabel = hasForecastInput ? formatDate(forecast.estimatedFinishDate) : "--"
  const bufferDays = hasForecastInput
    ? (typeof forecast.bufferDays === "number"
      ? forecast.bufferDays
      : Math.ceil((new Date(part.deadline).getTime() - new Date(forecast.estimatedFinishDate).getTime()) / (1000 * 60 * 60 * 24)))
    : null
  const forecastReason = forecast.reason

  const scheduleStatus = !hasForecastInput
    ? "нет данных"
    : forecastStatus === "overdue"
      ? "просрочено"
      : forecastStatus === "risk"
        ? "риск"
        : "успеваем"

  const shiftsReserveLabel =
    bufferDays === null
      ? (forecastReason || "Запас: --")
      : bufferDays >= 0
        ? `Запас: +${bufferDays} дн.`
        : `Отставание: ${Math.abs(bufferDays)} дн.`

  const tasksForPanel = useMemo(
    () =>
      [...tasks]
        .filter((task) => task.status !== "done")
        .sort((a, b) => {
          const priorityWeight = (task: Task) => {
            const priority = normalizeTaskPriority(task)
            if (priority === "high") return 0
            if (priority === "normal") return 1
            return 2
          }
          const byPriority = priorityWeight(a) - priorityWeight(b)
          if (byPriority !== 0) return byPriority
          return a.due_date.localeCompare(b.due_date)
        })
        .slice(0, 5),
    [tasks]
  )

  const journalEvents = useMemo<JournalEvent[]>(() => {
    const events: JournalEvent[] = []

    for (const entry of sortedLogistics) {
      const status = movementStatus(entry)
      const fromLabel = entry.from_holder || entry.from_location || "источник"
      const toLabel = entry.to_holder || entry.to_location || "назначение"
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
          type: "receipt",
          title: `Прибыла партия с ${fromLabel}`,
          subtitle: `${qtyLabel.toLocaleString()} шт.`,
          at,
        })
        continue
      }

      events.push({
        id: `movement_${entry.id}`,
        type: "movement",
        title: `Отправлено на ${toLabel}`,
        subtitle: `${qtyLabel.toLocaleString()} шт.`,
        at,
      })
    }

    for (const fact of sortedFacts) {
      const operator = getUserById(fact.operator_id)
      const baseAt = fact.created_at || `${fact.date}T00:00:00`
      if (fact.qty_good > 0) {
        events.push({
          id: `fact_good_${fact.id}`,
          type: "fact",
          title: `Зафиксирован факт выпуска ${STAGE_LABELS[fact.stage]} (${fact.qty_good.toLocaleString()} шт.)`,
          subtitle: operator ? `Мастер: ${operator.initials}` : undefined,
          at: baseAt,
        })
      }
      if (fact.qty_scrap > 0) {
        events.push({
          id: `fact_scrap_${fact.id}`,
          type: "fact",
          title: `Зафиксирован брак на этапе ${STAGE_LABELS[fact.stage]} (${fact.qty_scrap.toLocaleString()} шт.)`,
          subtitle: fact.comment ? `Комментарий: ${fact.comment}` : undefined,
          at: baseAt,
        })
      }
    }

    for (const task of tasks) {
      events.push({
        id: `task_${task.id}`,
        type: "task",
        title: task.status === "done" ? `Задача выполнена: ${task.title}` : `Задача: ${task.title}`,
        subtitle: `Статус: ${TASK_STATUS_LABELS[task.status]}`,
        at: task.created_at || `${task.due_date}T00:00:00`,
      })
    }

    return events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  }, [getUserById, sortedFacts, sortedLogistics, tasks])

  const [journalFilter, setJournalFilter] = useState<JournalFilter>("all")

  const filteredJournalEvents = useMemo(
    () => (journalFilter === "all" ? journalEvents : journalEvents.filter((event) => event.type === journalFilter)),
    [journalEvents, journalFilter]
  )

  const [receivingMovement, setReceivingMovement] = useState<LogisticsEntry | null>(null)
  const [receivingQty, setReceivingQty] = useState("")
  const [receivingError, setReceivingError] = useState("")
  const [isConfirmingReceive, setIsConfirmingReceive] = useState(false)

  const [sendStage, setSendStage] = useState<FlowStageKey | null>(null)
  const [sendQty, setSendQty] = useState("")
  const [sendPartner, setSendPartner] = useState("")
  const [sendEta, setSendEta] = useState("")
  const [sendTracking, setSendTracking] = useState("")
  const [sendError, setSendError] = useState("")
  const [isSubmittingSend, setIsSubmittingSend] = useState(false)

  const [transferStage, setTransferStage] = useState<FlowStageKey | null>(null)
  const [transferQty, setTransferQty] = useState("")
  const [transferComment, setTransferComment] = useState("")
  const [transferError, setTransferError] = useState("")
  const [isSubmittingTransfer, setIsSubmittingTransfer] = useState(false)

  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false)
  const [taskTitle, setTaskTitle] = useState("")
  const [taskDescription, setTaskDescription] = useState("")
  const [taskStage, setTaskStage] = useState<ProductionStage | typeof NO_STAGE_VALUE>(NO_STAGE_VALUE)
  const [taskPriority, setTaskPriority] = useState<TaskPriority>("normal")
  const [taskAssigneePreset, setTaskAssigneePreset] = useState<TaskAssigneePreset>("operators")
  const [taskDueDate, setTaskDueDate] = useState("")
  const [taskError, setTaskError] = useState("")
  const [isCreatingTask, setIsCreatingTask] = useState(false)

  const [isAddFactModalOpen, setIsAddFactModalOpen] = useState(false)
  const [factDate, setFactDate] = useState(localIsoDate())
  const [factShift, setFactShift] = useState<ShiftType>("day")
  const [factStage, setFactStage] = useState<ProductionStage>("machining")
  const [factOperatorId, setFactOperatorId] = useState("")
  const [factQtyGood, setFactQtyGood] = useState("")
  const [factQtyScrap, setFactQtyScrap] = useState("0")
  const [factComment, setFactComment] = useState("")
  const [factError, setFactError] = useState("")
  const [isSavingFact, setIsSavingFact] = useState(false)

  const [editingFact, setEditingFact] = useState<StageFact | null>(null)
  const [editFactOperatorId, setEditFactOperatorId] = useState("")
  const [editFactQtyGood, setEditFactQtyGood] = useState("")
  const [editFactQtyScrap, setEditFactQtyScrap] = useState("")
  const [editFactComment, setEditFactComment] = useState("")
  const [editFactError, setEditFactError] = useState("")
  const [isUpdatingFact, setIsUpdatingFact] = useState(false)
  const [isDeletingFact, setIsDeletingFact] = useState(false)

  const [isEquipmentModalOpen, setIsEquipmentModalOpen] = useState(false)
  const [machineDraftId, setMachineDraftId] = useState(part.machine_id || NO_MACHINE_VALUE)
  const [machineNormDraft, setMachineNormDraft] = useState(machineNorm?.qty_per_shift ? String(machineNorm.qty_per_shift) : "")
  const [machineError, setMachineError] = useState("")
  const [isSavingMachine, setIsSavingMachine] = useState(false)
  const [isDrawingModalOpen, setIsDrawingModalOpen] = useState(false)
  const [drawingError, setDrawingError] = useState(false)
  const [drawingObjectUrl, setDrawingObjectUrl] = useState<string | null>(null)
  const [isLoadingDrawingFile, setIsLoadingDrawingFile] = useState(false)

  const drawingUrlValue = (part.drawing_url || "").trim()
  const drawingUrlLower = drawingUrlValue.toLowerCase()
  const isPdfDrawing = drawingUrlLower.includes(".pdf") || drawingUrlLower.startsWith("data:application/pdf")
  const isImageDrawing =
    drawingUrlLower.startsWith("data:image/") ||
    /\.(png|jpe?g|gif|webp|svg)(\?|$)/.test(drawingUrlLower)
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

  const factStageOptions = useMemo<ProductionStage[]>(() => {
    const ordered: ProductionStage[] = ["machining", "fitting", "heat_treatment", "galvanic", "grinding", "qc"]
    const allowed = ordered.filter((stage) => usedStages.has(stage))
    return allowed.length > 0 ? allowed : (["machining"] as ProductionStage[])
  }, [usedStages])

  const factOperatorOptions = useMemo(
    () => users.filter((user) => user.role === "operator" || user.role === "master" || user.role === "shop_head"),
    [users]
  )

  useEffect(() => {
    setMachineDraftId(part.machine_id || NO_MACHINE_VALUE)
    setMachineNormDraft(machineNorm?.qty_per_shift ? String(machineNorm.qty_per_shift) : "")
    setMachineError("")
  }, [machineNorm?.qty_per_shift, part.id, part.machine_id])

  useEffect(() => {
    setDrawingError(false)
    setIsDrawingModalOpen(false)
  }, [part.id, drawingUrlValue])

  useEffect(() => {
    let cancelled = false

    const clearObjectUrl = () => {
      setDrawingObjectUrl((prev) => {
        if (prev) {
          URL.revokeObjectURL(prev)
        }
        return null
      })
    }

    if (!drawingUrlValue || !isKnownDrawingType) {
      clearObjectUrl()
      setIsLoadingDrawingFile(false)
      return
    }

    if (
      drawingUrlValue.startsWith("data:") ||
      drawingUrlValue.startsWith("blob:") ||
      !isProtectedAttachmentUrl(drawingUrlValue)
    ) {
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
          if (prev) {
            URL.revokeObjectURL(prev)
          }
          return nextUrl
        })
        setDrawingError(false)
      } catch {
        if (cancelled) return
        clearObjectUrl()
        setDrawingError(true)
      } finally {
        if (cancelled) return
        setIsLoadingDrawingFile(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [drawingUrlValue, isKnownDrawingType])

  useEffect(() => {
    return () => {
      if (drawingObjectUrl) {
        URL.revokeObjectURL(drawingObjectUrl)
      }
    }
  }, [drawingObjectUrl])

  useEffect(() => {
    setTaskDueDate(part.deadline || localIsoDate())
    setTaskStage(NO_STAGE_VALUE)
  }, [part.deadline, part.id])

  useEffect(() => {
    const defaultOperatorId = currentUser?.id || factOperatorOptions[0]?.id || ""
    setFactOperatorId(defaultOperatorId)
    setFactStage(factStageOptions[0])
  }, [currentUser?.id, factOperatorOptions, factStageOptions])

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back()
      return
    }
    onBack()
  }

  const handleOpenDrawingModal = () => {
    if (!drawingUrlValue) return
    setIsDrawingModalOpen(true)
  }

  const handleOpenTransferDialog = (stage: FlowStageKey) => {
    const available = flowCardByStage.get(stage)?.availableQty || 0
    setTransferStage(stage)
    setTransferQty(available > 0 ? String(available) : "")
    setTransferComment("")
    setTransferError("")
  }

  const handleConfirmTransfer = async () => {
    if (!transferStage) return
    if (!permissions.canEditFacts) {
      setTransferError("Нет прав для передачи между этапами")
      return
    }

    const available = flowCardByStage.get(transferStage)?.availableQty || 0
    const qty = parsePositiveInt(transferQty)
    if (qty === null) {
      setTransferError("Укажите корректное количество")
      return
    }
    if (qty > available) {
      setTransferError(`Нельзя передать больше доступного (${available.toLocaleString()} шт.)`)
      return
    }

    const dynamicChain: FlowStageKey[] = ["machining", "fitting"]
    if (usedStages.has("heat_treatment")) {
      dynamicChain.push("heat_treatment")
    }
    if (usedStages.has("galvanic")) {
      dynamicChain.push("galvanic")
    }

    const currentIndex = dynamicChain.indexOf(transferStage)
    const nextStage = currentIndex >= 0 ? dynamicChain[currentIndex + 1] : null

    setIsSubmittingTransfer(true)
    setTransferError("")
    try {
      const updatedStageStatuses = (part.stage_statuses || []).map((status) => {
        if (status.stage === transferStage) {
          return {
            ...status,
            status: status.status === "pending" ? "in_progress" : status.status,
            operator_id: currentUser?.id || status.operator_id,
            started_at: status.started_at || new Date().toISOString(),
            notes: mergeTransferredOut(status.notes, qty),
          }
        }

        if (nextStage && status.stage === nextStage) {
          return {
            ...status,
            status: status.status === "pending" ? "in_progress" : status.status,
            operator_id: currentUser?.id || status.operator_id,
            started_at: status.started_at || new Date().toISOString(),
          }
        }

        return status
      })

      await updatePart({
        ...part,
        stage_statuses: updatedStageStatuses,
      })

      setTransferStage(null)
      setTransferQty("")
      setTransferComment("")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось выполнить передачу"
      setTransferError(message)
    } finally {
      setIsSubmittingTransfer(false)
    }
  }

  const handleOpenSendDialog = (stage: FlowStageKey) => {
    const available = flowCardByStage.get(stage)?.availableQty || 0
    setSendStage(stage)
    setSendQty(available > 0 ? String(available) : "")
    setSendPartner(part.cooperation_partner || "")
    setSendEta("")
    setSendTracking("")
    setSendError("")
  }

  const handleSubmitSend = async () => {
    if (!sendStage) return

    if (!permissions.canEditFacts) {
      setSendError("Нет прав для оформления отправок")
      return
    }

    const available = flowCardByStage.get(sendStage)?.availableQty || 0
    const parsedQty = parsePositiveInt(sendQty)
    if (parsedQty === null) {
      setSendError("Укажите корректное количество")
      return
    }
    if (parsedQty > available) {
      setSendError(`Нельзя отправить больше доступного (${available.toLocaleString()} шт.)`)
      return
    }
    const destinationStage = flowCardByStage.get(sendStage)?.nextStage ?? null
    if (!destinationStage) {
      setSendError("Для этого этапа не задан следующий маршрут")
      return
    }
    const isToWarehouse = destinationStage === "fg"
    const normalizedPartner = sendPartner.trim()
    if (!isToWarehouse && !normalizedPartner) {
      setSendError("Укажите получателя/кооператора")
      return
    }

    const destinationStatus =
      destinationStage !== "fg" ? stageStatusByStage.get(destinationStage) : undefined
    const stageId = destinationStatus?.id ? String(destinationStatus.id) : undefined
    const fromLabel = STAGE_LABELS[sendStage]
    const toLabel = flowTargetLabel(destinationStage)
    const movementType = destinationStage === "fg" ? "shipping_out" : "coop_out"

    setIsSubmittingSend(true)
    setSendError("")
    try {
      await createLogisticsEntry({
        part_id: part.id,
        status: "sent",
        from_location: fromLabel,
        from_holder: "Производство",
        to_location: toLabel,
        to_holder: isToWarehouse ? "Склад ГП" : normalizedPartner,
        carrier: "",
        tracking_number: sendTracking.trim() || undefined,
        planned_eta: sendEta ? new Date(`${sendEta}T00:00:00`).toISOString() : undefined,
        qty_sent: parsedQty,
        stage_id: stageId,
        description: `Отправка: ${fromLabel} -> ${toLabel}`,
        type: movementType,
        counterparty: isToWarehouse ? "Склад ГП" : normalizedPartner,
        notes: undefined,
        date: localIsoDate(),
      })

      updatePartStageStatus(part.id, sendStage, "in_progress", currentUser?.id)
      if (destinationStage !== "fg") {
        updatePartStageStatus(part.id, destinationStage, "in_progress", currentUser?.id)
      }

      setSendStage(null)
      setSendQty("")
      setSendPartner("")
      setSendEta("")
      setSendTracking("")
      setSendError("")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось оформить отправку"
      setSendError(message)
    } finally {
      setIsSubmittingSend(false)
    }
  }

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
        if (stage) {
          updatePartStageStatus(part.id, stage, "done", currentUser?.id)
        }
      }

      setReceivingMovement(null)
      setReceivingQty("")
      setReceivingError("")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось подтвердить приёмку"
      setReceivingError(message)
    } finally {
      setIsConfirmingReceive(false)
    }
  }

  const openAddFactModal = () => {
    setFactDate(localIsoDate())
    setFactShift("day")
    setFactStage(factStageOptions[0])
    setFactOperatorId(currentUser?.id || factOperatorOptions[0]?.id || "")
    setFactQtyGood("")
    setFactQtyScrap("0")
    setFactComment("")
    setFactError("")
    setIsAddFactModalOpen(true)
  }

  const handleCreateFact = async () => {
    if (!permissions.canEditFacts) {
      setFactError("Нет прав для добавления фактов")
      return
    }

    const qtyGood = parseNonNegativeInt(factQtyGood)
    const qtyScrap = parseNonNegativeInt(factQtyScrap)

    if (qtyGood === null || qtyScrap === null) {
      setFactError("Проверьте количества в полях Готово/Брак")
      return
    }

    if (qtyGood === 0 && qtyScrap === 0) {
      setFactError("Укажите хотя бы одно количество больше нуля")
      return
    }

    if (!factOperatorId) {
      setFactError("Выберите оператора")
      return
    }

    setIsSavingFact(true)
    setFactError("")
    try {
      await createStageFact({
        date: factDate,
        shift_type: factShift,
        part_id: part.id,
        stage: factStage,
        machine_id: factStage === "machining" ? part.machine_id : undefined,
        operator_id: factOperatorId,
        qty_good: qtyGood,
        qty_scrap: qtyScrap,
        qty_expected:
          factStage === "machining" && part.machine_id
            ? getMachineNorm(part.machine_id, part.id, "machining")?.qty_per_shift
            : undefined,
        comment: factComment,
        deviation_reason: qtyScrap > 0 ? "quality" : null,
        attachments: [],
      })

      setIsAddFactModalOpen(false)
      setFactQtyGood("")
      setFactQtyScrap("0")
      setFactComment("")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось сохранить факт"
      setFactError(message)
    } finally {
      setIsSavingFact(false)
    }
  }

  const openEditFactModal = (fact: StageFact) => {
    setEditingFact(fact)
    setEditFactOperatorId(fact.operator_id)
    setEditFactQtyGood(String(fact.qty_good))
    setEditFactQtyScrap(String(fact.qty_scrap))
    setEditFactComment(fact.comment || "")
    setEditFactError("")
  }

  const handleUpdateFact = async () => {
    if (!editingFact) return
    if (!permissions.canEditFacts) {
      setEditFactError("Нет прав для изменения фактов")
      return
    }

    const qtyGood = parseNonNegativeInt(editFactQtyGood)
    const qtyScrap = parseNonNegativeInt(editFactQtyScrap)

    if (qtyGood === null || qtyScrap === null) {
      setEditFactError("Проверьте количества в полях Готово/Брак")
      return
    }

    if (qtyGood === 0 && qtyScrap === 0) {
      setEditFactError("Укажите хотя бы одно количество больше нуля")
      return
    }

    if (!editFactOperatorId) {
      setEditFactError("Выберите оператора")
      return
    }

    setIsUpdatingFact(true)
    setEditFactError("")
    try {
      await updateStageFact(editingFact.id, {
        machine_id: editingFact.stage === "machining" ? part.machine_id : editingFact.machine_id,
        operator_id: editFactOperatorId,
        qty_good: qtyGood,
        qty_scrap: qtyScrap,
        qty_expected: editingFact.qty_expected,
        comment: editFactComment,
        deviation_reason: qtyScrap > 0 ? editingFact.deviation_reason || "quality" : null,
        attachments: editingFact.attachments || [],
      })
      setEditingFact(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось обновить факт"
      setEditFactError(message)
    } finally {
      setIsUpdatingFact(false)
    }
  }

  const handleDeleteFact = async () => {
    if (!editingFact) return
    if (!permissions.canRollbackFacts) {
      setEditFactError("Нет прав для удаления фактов")
      return
    }

    setIsDeletingFact(true)
    setEditFactError("")
    try {
      await deleteStageFact(editingFact.id)
      setEditingFact(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось удалить факт"
      setEditFactError(message)
    } finally {
      setIsDeletingFact(false)
    }
  }

  const openTaskModal = () => {
    setTaskTitle("")
    setTaskDescription("")
    setTaskPriority("normal")
    setTaskAssigneePreset("operators")
    setTaskStage(NO_STAGE_VALUE)
    setTaskDueDate(part.deadline || localIsoDate())
    setTaskError("")
    setIsTaskModalOpen(true)
  }

  const handleCreateTask = async () => {
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

    const assignment = taskAssigneeFromPreset(taskAssigneePreset)
    const selectedStage = taskStage === NO_STAGE_VALUE ? null : taskStage

    setIsCreatingTask(true)
    setTaskError("")
    try {
      await createTask({
        part_id: part.id,
        machine_id: selectedStage === "machining" ? part.machine_id : undefined,
        stage: selectedStage || undefined,
        title: taskTitle.trim(),
        description: taskDescription.trim(),
        creator_id: currentUser.id,
        assignee_type: assignment.assignee_type,
        assignee_id: undefined,
        assignee_role: assignment.assignee_role,
        accepted_by_id: undefined,
        accepted_at: undefined,
        status: "open",
        is_blocker: taskPriority === "high",
        due_date: taskDueDate,
        category: taskCategoryFromInputs(selectedStage, taskPriority),
        comments: [],
        review_comment: undefined,
        reviewed_by_id: undefined,
        reviewed_at: undefined,
      })

      setIsTaskModalOpen(false)
      setTaskTitle("")
      setTaskDescription("")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось создать задачу"
      setTaskError(message)
    } finally {
      setIsCreatingTask(false)
    }
  }

  const handleSaveMachine = async () => {
    setMachineError("")
    setIsSavingMachine(true)
    try {
      const nextMachineId = machineDraftId === NO_MACHINE_VALUE ? undefined : machineDraftId
      const normRaw = machineNormDraft.trim()
      const parsedNorm = normRaw ? Number.parseInt(normRaw, 10) : null
      const parsedNormIsValid = parsedNorm !== null && Number.isFinite(parsedNorm) && parsedNorm > 0
      if (normRaw && !parsedNormIsValid) {
        setMachineError("Норма должна быть числом больше 0")
        return
      }

      await updatePart({
        ...part,
        machine_id: nextMachineId,
      })

      if (nextMachineId && parsedNormIsValid) {
        await setMachineNorm({
          machine_id: nextMachineId,
          part_id: part.id,
          stage: "machining",
          qty_per_shift: parsedNorm,
          is_configured: true,
          configured_by_id: currentUser?.id,
        })
      }

      setIsEquipmentModalOpen(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось сохранить оборудование"
      setMachineError(message)
    } finally {
      setIsSavingMachine(false)
    }
  }

  const sendDestination = sendStage ? flowCardByStage.get(sendStage)?.nextStage ?? null : null
  const isSendToWarehouse = sendDestination === "fg"
  const isCooperationPart = true
  const rootSpacingClass = isCooperationPart ? "space-y-4" : "space-y-6"
  const topShellClass = isCooperationPart
    ? "flex items-center gap-4"
    : "flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"
  const contentGridClass = isCooperationPart ? "grid grid-cols-1 gap-4 xl:grid-cols-12" : "grid grid-cols-12 gap-6"
  const mainColumnClass = isCooperationPart
    ? "order-2 space-y-4 xl:order-1 xl:col-span-9"
    : "col-span-12 space-y-6 xl:col-span-9"
  const sectionClass = isCooperationPart ? "rounded-lg border border-border bg-card p-4" : "rounded-xl border border-slate-200 bg-white p-5"
  const asideColumnClass = isCooperationPart
    ? "order-1 space-y-4 xl:order-2 xl:col-span-3"
    : "col-span-12 space-y-6 xl:col-span-3"
  const asideCardClass = isCooperationPart
    ? "rounded-lg border border-border bg-card p-4"
    : "rounded-xl border border-slate-200 bg-white p-4"

  return (
    <div className={rootSpacingClass}>
      <div className={topShellClass}>
        <Button
          variant="ghost"
          size={isCooperationPart ? "icon" : "sm"}
          className={cn(isCooperationPart ? "h-11 w-11" : "h-9 px-2")}
          onClick={handleBack}
        >
          <ArrowLeft className={cn("h-4 w-4", !isCooperationPart && "mr-1")} />
          {!isCooperationPart && "Назад"}
        </Button>
        <h1 className={cn("font-bold", isCooperationPart ? "text-xl" : "text-lg text-slate-900")}>Деталь: {part.code}</h1>
      </div>

      <div className={contentGridClass}>
        <div className={mainColumnClass}>
          <section className={sectionClass}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-xl font-bold text-slate-900">Деталь: {part.code}</h2>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">
                  Клиент: {part.customer || "--"}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">
                  Партия: {part.qty_plan.toLocaleString()} шт.
                </span>
              </div>
              <Button type="button" variant="outline" className="gap-2 text-sm" disabled title="Печать этикетки пока не подключена">
                <Printer className="h-4 w-4" />
                Печать этикетки
              </Button>
            </div>

            <div className="mb-5 flex flex-wrap items-center gap-6 border-b border-slate-100 pb-5">
              <div className="flex items-center gap-2 text-sm">
                <CalendarIcon className="h-4 w-4 text-slate-400" />
                <span className="text-xs uppercase tracking-wide text-slate-400">Внешний дедлайн</span>
                <span className="font-semibold text-slate-800">{formatDate(part.deadline)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <CalendarIcon className="h-4 w-4 text-slate-400" />
                <span className="text-xs uppercase tracking-wide text-slate-400">Внутренний</span>
                <span className="font-semibold text-slate-800">{internalDeadlineLabel}</span>
              </div>
              <div className="ml-auto flex items-center gap-3">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium",
                    scheduleStatus === "успеваем" && "bg-teal-50 text-teal-700",
                    scheduleStatus === "риск" && "bg-amber-100 text-amber-800",
                    scheduleStatus === "просрочено" && "bg-red-100 text-red-800",
                    scheduleStatus === "нет данных" && "bg-slate-200 text-slate-700"
                  )}
                >
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      scheduleStatus === "успеваем" && "bg-teal-500",
                      scheduleStatus === "риск" && "bg-amber-500",
                      scheduleStatus === "просрочено" && "bg-red-500",
                      scheduleStatus === "нет данных" && "bg-slate-500"
                    )}
                  />
                  {scheduleStatus === "успеваем"
                    ? "Успеваем"
                    : scheduleStatus === "риск"
                      ? "Риск"
                      : scheduleStatus === "просрочено"
                        ? "Просрочено"
                        : "Нет данных"}
                </span>
                <span className="text-sm text-slate-500">{shiftsReserveLabel}</span>
                {hasForecastInput && forecast.calendarBasis === "calendar" && (
                  <span className="text-xs text-slate-400">Календарные дни</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-sm text-slate-500">Выпуск (финал)</p>
                <div className="flex items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-teal-500" style={{ width: `${finalPercent}%` }} />
                  </div>
                  <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-slate-800">
                    {finalQty.toLocaleString()} / {part.qty_plan.toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-4 border-slate-200 sm:border-l sm:pl-6">
                <div>
                  <p className="mb-0.5 text-sm text-slate-500">НЗП (в производстве)</p>
                  <p className="text-xs text-slate-400">включая внешние этапы</p>
                </div>
                <span className="ml-auto text-4xl font-bold tabular-nums text-slate-900">{wipQty.toLocaleString()}</span>
              </div>
            </div>
          </section>

          <section className={sectionClass}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Factory className="h-4 w-4 text-slate-400" />
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-800">Производственный поток</h2>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-slate-400" />В работе
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-teal-500" />Доступно
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-amber-400" />Внешний
                </span>
              </div>
            </div>

            <div className="mb-6 flex flex-wrap items-center gap-2 border-b border-slate-100 pb-4">
              <span className="mr-1 text-sm text-slate-400">Маршрут:</span>
              {activeChain.map((stageKey) => {
                const stage = FLOW_STAGE_BY_KEY.get(stageKey)
                if (!stage) return null
                return (
                  <React.Fragment key={`chip_${stage.key}`}>
                    <span
                      className={cn(
                        "rounded px-2.5 py-1 text-xs font-medium",
                        stage.external
                          ? "border border-dashed border-amber-300 bg-amber-50 text-amber-600"
                          : "bg-slate-100 text-slate-600"
                      )}
                    >
                      {stage.shortLabel}
                      {stage.external ? " (внешн.)" : ""}
                    </span>
                    <ArrowRight className="h-3 w-3 flex-shrink-0 text-slate-300" />
                  </React.Fragment>
                )
              })}
              <span className="rounded bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">Склад ГП</span>
            </div>

            <div className="-mx-1 flex items-start gap-3 overflow-x-auto px-1 pb-2">
              {flowCards.map((flowCard, index) => {
                const nextStage = flowCard.nextStage
                const nextStageIsExternal =
                  !!nextStage && nextStage !== "fg" ? Boolean(flowCardByStage.get(nextStage)?.external) : false
                const requiresShippingAction = flowCard.external || nextStageIsExternal
                const canInternalTransfer =
                  !requiresShippingAction &&
                  !flowCard.external &&
                  flowCard.state !== "done" &&
                  flowCard.availableQty > 0 &&
                  permissions.canEditFacts
                const canShip =
                  requiresShippingAction &&
                  flowCard.availableQty > 0 &&
                  permissions.canEditFacts &&
                  !!nextStage
                const shippingButtonLabel = flowShipButtonLabel(flowCard.key, nextStage)
                const inWork = flowCard.inWorkQty
                const showInWork = flowCard.key !== "machining"

                return (
                  <React.Fragment key={flowCard.key}>
                    <div
                      className={cn(
                        "relative min-w-[220px] max-w-[240px] flex-shrink-0 rounded-xl border bg-white p-4",
                        flowCard.external ? "border-amber-300 border-dashed" : "border-slate-200"
                      )}
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={cn(flowCard.external ? "text-amber-500" : "text-teal-500")}>{stageIcon(flowCard.key)}</span>
                          <span className="text-sm font-semibold text-slate-800">{flowCard.shortLabel}</span>
                        </div>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs",
                            flowCard.external ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"
                          )}
                        >
                          {flowCard.external ? "Внешн." : "Внутр."}
                        </span>
                      </div>

                      <div className="mb-3 space-y-1.5">
                        {showInWork ? (
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-500">В работе:</span>
                            <span className={cn("font-semibold", flowCard.external ? "text-amber-600" : "text-slate-800")}>
                              {inWork.toLocaleString()}
                            </span>
                          </div>
                        ) : null}
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Доступно:</span>
                          <span
                            className={cn(
                              "rounded px-2 py-0.5 font-semibold",
                              flowCard.availableQty > 0 ? "bg-teal-50 text-teal-600" : "bg-slate-50 text-slate-400"
                            )}
                          >
                            {flowCard.availableQty.toLocaleString()}
                          </span>
                        </div>
                      </div>

                      <div className="mb-4">
                        <div className="mb-1 flex justify-between text-xs text-slate-400">
                          <span>Сделано</span>
                          <span className="tabular-nums">
                            {flowCard.doneQty.toLocaleString()} / {part.qty_plan.toLocaleString()}
                          </span>
                        </div>
                        <Progress value={flowCard.percent} className="h-1.5" />
                      </div>

                      <div className="space-y-2 border-t border-slate-100 pt-3">
                        {requiresShippingAction ? (
                          <>
                            <div className="flex items-center gap-1.5 text-xs text-slate-400">
                              <ArrowRight className="h-3 w-3" />
                              <span>→ {flowTargetLabel(nextStage)}</span>
                            </div>
                            <Button
                              type="button"
                              onClick={() => handleOpenSendDialog(flowCard.key)}
                              disabled={!canShip}
                              className={cn(
                                "h-8 w-full gap-1.5 text-sm",
                                canShip
                                  ? "bg-amber-500 text-white hover:bg-amber-600"
                                  : "cursor-not-allowed bg-slate-100 text-slate-400"
                              )}
                            >
                              <Truck className="h-3.5 w-3.5" />
                              {shippingButtonLabel}
                            </Button>
                            <p className="text-center text-xs text-slate-400">
                              Приёмка через блок «Отправки в пути».
                            </p>
                          </>
                        ) : (
                          <>
                            <div className="flex items-center gap-1.5 text-xs text-slate-400">
                              <ArrowRight className="h-3 w-3" />
                              <span>
                                →{" "}
                                {flowCard.nextStage === "fg"
                                  ? "Склад ГП"
                                  : flowCard.nextStage
                                    ? STAGE_LABELS[flowCard.nextStage]
                                    : "—"}
                              </span>
                            </div>
                            <Button
                              type="button"
                              onClick={() => handleOpenTransferDialog(flowCard.key)}
                              disabled={!canInternalTransfer}
                              className={cn(
                                "h-8 w-full text-sm",
                                canInternalTransfer
                                  ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                                  : "cursor-not-allowed bg-slate-100 text-slate-400"
                              )}
                              variant="outline"
                            >
                              Передать
                            </Button>
                          </>
                        )}
                      </div>
                    </div>

                    {index < flowCards.length - 1 ? (
                      <div className="flex flex-shrink-0 items-center self-center pt-6">
                        <ArrowRight className={cn("h-5 w-5", flowCards[index + 1].external ? "text-amber-300" : "text-slate-300")} />
                      </div>
                    ) : null}
                  </React.Fragment>
                )
              })}

              <div className="flex flex-shrink-0 items-center self-center pt-6">
                <ArrowRight className="h-5 w-5 text-slate-300" />
              </div>

              <div
                className={cn(
                  "min-w-[180px] flex-shrink-0 p-4",
                  isCooperationPart ? "rounded-lg border border-border bg-card" : "rounded-xl border border-slate-200 bg-white"
                )}
                data-stage="fg"
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Package className="h-5 w-5 text-slate-400" />
                    <span className="text-sm font-semibold text-slate-800">Склад ГП</span>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">Финал</span>
                </div>
                <div className="py-4 text-center">
                  <p className="text-4xl font-bold tabular-nums text-slate-900">{finalQty.toLocaleString()}</p>
                  <p className="mt-1 text-sm text-slate-500">готово к отгрузке</p>
                </div>
                <div className="mt-2">
                  <div className="mb-1 flex justify-between text-xs text-slate-400">
                    <span>Прогресс</span>
                    <span className="tabular-nums">
                      {finalQty.toLocaleString()} / {part.qty_plan.toLocaleString()}
                    </span>
                  </div>
                  <Progress value={finalPercent} className="h-1.5" />
                </div>
              </div>
            </div>
          </section>

          <section className={sectionClass}>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-slate-400" />
                <h3 className="font-semibold text-slate-800">Производственные факты</h3>
              </div>
              {permissions.canEditFacts ? (
                <Button
                  type="button"
                  onClick={openAddFactModal}
                  className="inline-flex items-center gap-2 bg-teal-500 text-sm text-white hover:bg-teal-600"
                >
                  <Plus className="h-4 w-4" />
                  Добавить факт
                </Button>
              ) : null}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wider text-slate-400">
                    <th className="pb-3 pr-4 font-medium">Дата/Смена</th>
                    <th className="pb-3 pr-4 font-medium">Операция</th>
                    <th className="pb-3 pr-4 font-medium">Оператор</th>
                    <th className="pb-3 pr-4 text-right font-medium">Готово</th>
                    <th className="pb-3 pr-4 text-right font-medium">Брак</th>
                    <th className="pb-3 text-right font-medium">Действия</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {sortedFacts.length === 0 ? (
                    <tr>
                      <td className="py-6 text-center text-slate-500" colSpan={6}>
                        Фактов пока нет
                      </td>
                    </tr>
                  ) : (
                    sortedFacts.slice(0, 20).map((fact, index) => {
                      const operator = getUserById(fact.operator_id)
                      const rowTone = index % 2 === 1 ? "bg-slate-50/50" : "bg-white"
                      return (
                        <tr key={fact.id} className={cn("border-b border-slate-50", rowTone)}>
                          <td className="py-3 pr-4">
                            <span className="text-slate-700">{new Date(fact.date).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}</span>
                            <span className="ml-1.5 text-slate-400">{fact.shift_type === "day" ? "☀" : fact.shift_type === "night" ? "☾" : "-"}</span>
                          </td>
                          <td className="py-3 pr-4">
                            <span className="inline-flex items-center gap-2">
                              <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
                              {STAGE_LABELS[fact.stage]}
                            </span>
                          </td>
                          <td className="py-3 pr-4">
                            <div className="inline-flex items-center gap-2">
                              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-xs font-medium text-slate-600">
                                {operator?.initials?.slice(0, 1) || "—"}
                              </div>
                              {operator?.initials || "--"}
                            </div>
                          </td>
                          <td className="py-3 pr-4 text-right font-semibold tabular-nums">{fact.qty_good.toLocaleString()}</td>
                          <td className={cn("py-3 pr-4 text-right tabular-nums", fact.qty_scrap > 0 ? "font-semibold text-red-500" : "text-slate-400")}>
                            {fact.qty_scrap.toLocaleString()}
                          </td>
                          <td className="py-3 text-right">
                            <button
                              type="button"
                              onClick={() => openEditFactModal(fact)}
                              className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-700"
                              disabled={!permissions.canEditFacts}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Изменить
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className={sectionClass}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-slate-400" />
                <h3 className="font-semibold text-slate-800">Журнал событий</h3>
              </div>

              <div className="flex items-center gap-1">
                {([
                  { key: "all", label: "Все" },
                  { key: "movement", label: "Перемещения" },
                  { key: "receipt", label: "Приёмка" },
                  { key: "fact", label: "Факты" },
                  { key: "task", label: "Задачи" },
                ] as const).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setJournalFilter(item.key)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-sm transition-colors",
                      journalFilter === item.key
                        ? "bg-slate-800 text-white"
                        : "text-slate-500 hover:bg-slate-100"
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="divide-y divide-slate-50">
              {filteredJournalEvents.length === 0 ? (
                <div className="py-4 text-sm text-slate-500">Событий по выбранному фильтру нет</div>
              ) : (
                filteredJournalEvents.slice(0, 30).map((event) => {
                  const toneClass =
                    event.type === "receipt"
                      ? "bg-amber-50 text-amber-600"
                      : event.type === "movement"
                        ? "bg-blue-50 text-blue-600"
                        : event.type === "fact"
                          ? "bg-emerald-50 text-emerald-600"
                          : "bg-slate-100 text-slate-500"

                  return (
                    <div key={event.id} className="flex items-start gap-3 py-3">
                      <div className={cn("rounded-lg p-2", toneClass)}>
                        {event.type === "receipt" ? (
                          <Package className="h-4 w-4" />
                        ) : event.type === "movement" ? (
                          <Truck className="h-4 w-4" />
                        ) : event.type === "fact" ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-slate-800">{event.title}</p>
                        {event.subtitle ? <p className="mt-0.5 text-xs text-slate-400">{event.subtitle}</p> : null}
                      </div>
                      <span className="flex-shrink-0 text-xs text-slate-400">{formatTime(event.at)}</span>
                    </div>
                  )
                })
              )}
            </div>
          </section>

        </div>

        <aside className={asideColumnClass}>
          <div className={asideCardClass}>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileImage className="h-4 w-4 text-slate-400" />
                <h3 className={cn("font-semibold text-slate-800", isCooperationPart ? "text-sm" : "text-xs uppercase tracking-wider")}>Чертёж</h3>
              </div>
              {drawingUrlValue ? (
                isCooperationPart ? (
                  <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 px-2" onClick={handleOpenDrawingModal}>
                    <Maximize2 className="h-3 w-3" />
                    На весь экран
                  </Button>
                ) : (
                  <button
                    type="button"
                    onClick={handleOpenDrawingModal}
                    className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200"
                  >
                    <Maximize2 className="h-3 w-3" />
                    На весь экран
                  </button>
                )
              ) : null}
            </div>
            <button
              type="button"
              onClick={handleOpenDrawingModal}
              disabled={!drawingUrlValue}
              className={cn(
                "block w-full overflow-hidden rounded-lg border p-0 text-left",
                isCooperationPart ? "border-border bg-muted/30" : "border-slate-100 bg-slate-100",
                drawingUrlValue
                  ? isCooperationPart
                    ? "cursor-pointer transition-colors hover:border-muted-foreground/40"
                    : "cursor-pointer transition-colors hover:border-slate-300"
                  : "cursor-default"
              )}
            >
              <div className={cn("flex h-48 items-center justify-center", isCooperationPart ? "bg-muted/30" : "bg-slate-100")}>
                {isLoadingDrawingFile ? (
                  <span className="text-sm text-slate-500">Загрузка...</span>
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
                  <div className="text-center text-slate-500">
                    <FileImage className="mx-auto mb-2 h-8 w-8 opacity-60" />
                    <p className="text-sm">Чертёж не загружен</p>
                  </div>
                )}
              </div>
            </button>
            <p className="mt-2 text-xs text-slate-400">
              {drawingUrlValue ? part.code : "Добавьте файл в карточке детали"}
            </p>
          </div>

          <div className={asideCardClass}>
            <div className="mb-4 flex items-center gap-2">
              <Truck className="h-4 w-4 text-slate-400" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-800">Отправки в пути</h3>
            </div>
            <div className="space-y-3">
              {inTransitShipments.length === 0 ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">Активных отправок нет</div>
              ) : (
                inTransitShipments.map((entry) => {
                  const status = movementStatus(entry)
                  const isArrived = status === "in_transit"
                  const from = entry.from_location || entry.from_holder || "Источник"
                  const to = entry.to_location || entry.to_holder || "Назначение"
                  const qty = entry.qty_sent ?? entry.quantity ?? 0
                  return (
                    <div
                      key={entry.id}
                      className={cn(
                        "rounded-lg border p-3",
                        isArrived ? "border-amber-300 bg-amber-50/30" : "border-slate-200 bg-white"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2">
                          {isArrived ? (
                            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
                          ) : (
                            <Truck className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
                          )}
                          <div>
                            <p className="text-sm font-medium text-slate-800">
                              {from} → {to}
                            </p>
                            <p className="text-xs text-slate-500">{qty.toLocaleString()} шт.</p>
                          </div>
                        </div>
                        <span className="flex-shrink-0 text-xs text-slate-400">
                          {formatRelativeTime(entry.updated_at || entry.sent_at || entry.created_at)}
                        </span>
                      </div>

                      {isArrived ? (
                        <span className="mt-2 inline-block rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-600">Прибыл</span>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => handleOpenReceiveDialog(entry)}
                        className={cn(
                          "mt-3 w-full rounded-lg py-2 text-sm font-medium transition-colors",
                          isArrived
                            ? "bg-teal-500 text-white hover:bg-teal-600"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        )}
                      >
                        Отметить прибытие
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          <div className={asideCardClass}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">Задачи</h3>
              {permissions.canCreateTasks ? (
                <button
                  type="button"
                  onClick={openTaskModal}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-500 text-white transition-colors hover:bg-teal-600"
                >
                  <Plus className="h-4 w-4" />
                </button>
              ) : null}
            </div>
            <div className="space-y-2.5">
              {tasksForPanel.length === 0 ? (
                <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">Нет активных задач</div>
              ) : (
                tasksForPanel.map((task) => {
                  const priority = normalizeTaskPriority(task)
                  return (
                    <div key={task.id} className="flex items-start gap-3 rounded-lg bg-slate-50 p-3">
                      <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-teal-500" disabled />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm leading-snug text-slate-800">{task.title}</p>
                        <span
                          className={cn(
                            "mt-1.5 inline-block rounded px-2 py-0.5 text-xs font-medium",
                            priority === "high" && "bg-red-50 text-red-600",
                            priority === "normal" && "bg-slate-200 text-slate-500",
                            priority === "low" && "bg-slate-100 text-slate-400"
                          )}
                        >
                          {priority === "high" ? "Срочно" : priority === "normal" ? "Норм" : "Низкий"}
                        </span>
                      </div>
                      <span className="flex-shrink-0 text-xs text-slate-400">{TASK_STATUS_LABELS[task.status]}</span>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          <div className={asideCardClass}>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cog className="h-5 w-5 text-slate-400" />
                <h3 className="text-sm font-semibold text-slate-800">Текущее оборудование</h3>
              </div>
              {permissions.canEditParts ? (
                <button
                  type="button"
                  onClick={() => {
                    setMachineDraftId(part.machine_id || NO_MACHINE_VALUE)
                    setMachineNormDraft(machineNorm?.qty_per_shift ? String(machineNorm.qty_per_shift) : "")
                    setMachineError("")
                    setIsEquipmentModalOpen(true)
                  }}
                  className="text-xs font-medium text-slate-500 transition-colors hover:text-slate-700"
                >
                  Редактировать
                </button>
              ) : null}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Станок</span>
                <span
                  className={cn(
                    "rounded px-2 py-0.5 text-xs font-medium",
                    machine ? "bg-teal-50 text-teal-600" : "bg-slate-100 text-slate-500"
                  )}
                >
                  {machine ? "Активен" : "Не назначен"}
                </span>
              </div>
              <p className="text-sm font-semibold text-slate-800">{machine?.name || "Не назначено"}</p>
              <div className="mt-1 border-t border-slate-100 pt-3">
                <p className="mb-1 text-xs text-slate-400">Норма выработки</p>
                <p className="text-3xl font-bold tabular-nums text-slate-900">
                  {machineNorm?.qty_per_shift?.toLocaleString() || "--"}{" "}
                  <span className="text-sm font-normal text-slate-500">шт/смену</span>
                </p>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <Dialog open={isDrawingModalOpen} onOpenChange={setIsDrawingModalOpen}>
        <DialogContent
          className={cn(
            "overflow-hidden p-0",
            isCooperationPart
              ? "h-[95vh] max-h-[95vh] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] sm:h-[94vh] sm:w-[calc(100vw-2rem)] sm:max-w-[calc(100vw-2rem)]"
              : "max-h-[90vh] max-w-[calc(100%-1.5rem)] sm:max-w-5xl"
          )}
        >
          <DialogHeader className={cn("px-4 py-3 sm:px-5 sm:py-4", isCooperationPart ? "border-b border-border" : "border-b border-slate-100")}>
            <DialogTitle className={cn("flex min-w-0 items-center gap-2 text-sm font-semibold", isCooperationPart ? "text-foreground" : "text-slate-800")}>
              <FileImage className={cn("h-4 w-4 flex-shrink-0", isCooperationPart ? "text-muted-foreground" : "text-slate-400")} />
              <span className="truncate">Чертеж: {part.code}</span>
            </DialogTitle>
            <DialogDescription className="sr-only">Просмотр чертежа детали</DialogDescription>
          </DialogHeader>
          <div
            className={cn(
              "flex items-center justify-center p-4 sm:p-8",
              isCooperationPart ? "h-[calc(95vh-4.5rem)] overflow-auto bg-muted/30 p-2 sm:p-4" : "min-h-[60vh] bg-slate-100"
            )}
          >
            {isLoadingDrawingFile ? (
              <span className="text-sm text-slate-500">Загрузка...</span>
            ) : drawingUrlValue && isImageDrawing && !drawingError ? (
              <img
                src={resolvedDrawingUrl || "/placeholder.svg"}
                alt={`Чертёж ${part.code}`}
                className={cn("w-full rounded bg-white object-contain", isCooperationPart ? "max-h-full" : "max-h-[75vh]")}
                onError={() => setDrawingError(true)}
              />
            ) : drawingUrlValue && isPdfDrawing ? (
              <iframe
                src={resolvedDrawingUrl || drawingUrlValue || undefined}
                title={`Чертёж ${part.code}`}
                className={cn(
                  "w-full rounded border border-slate-200 bg-white",
                  isCooperationPart ? "h-full min-h-[60vh]" : "h-[75vh]"
                )}
              />
            ) : (
              <div className="text-center text-slate-500">
                <FileImage className="mx-auto mb-2 h-10 w-10 opacity-60" />
                <p>Чертёж не загружен</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(transferStage)}
        onOpenChange={(open) => {
          if (!open) {
            setTransferStage(null)
            setTransferError("")
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {transferStage
                ? `Передача в ${(flowCardByStage.get(transferStage)?.nextStage === "fg"
                    ? "склад гп"
                    : flowCardByStage.get(transferStage)?.nextStage
                      ? STAGE_LABELS[flowCardByStage.get(transferStage)!.nextStage as FlowStageKey].toLowerCase()
                      : "следующий этап")}`
                : "Передача"}
            </DialogTitle>
            <DialogDescription>Внутреннее перемещение по производственному маршруту.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Откуда</Label>
                <Input value={transferStage ? STAGE_LABELS[transferStage] : "--"} disabled className="h-9" />
              </div>
              <div className="space-y-1">
                <Label>Куда</Label>
                <Input
                  value={
                    transferStage
                      ? flowCardByStage.get(transferStage)?.nextStage === "fg"
                        ? "Склад ГП"
                        : flowCardByStage.get(transferStage)?.nextStage
                          ? STAGE_LABELS[flowCardByStage.get(transferStage)!.nextStage as FlowStageKey]
                          : "--"
                      : "--"
                  }
                  disabled
                  className="h-9"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Количество</Label>
              <Input type="number" className="h-9" value={transferQty} onChange={(event) => setTransferQty(event.target.value)} />
              <div className="text-xs text-slate-500">
                Доступно: {(transferStage ? flowCardByStage.get(transferStage)?.availableQty || 0 : 0).toLocaleString()} шт.
              </div>
            </div>

            <div className="space-y-1">
              <Label>Комментарий</Label>
              <Textarea rows={2} value={transferComment} onChange={(event) => setTransferComment(event.target.value)} placeholder="Опционально" />
            </div>

            {transferError ? <div className="text-sm text-destructive">{transferError}</div> : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setTransferStage(null)}>
              Отмена
            </Button>
            <Button type="button" onClick={() => void handleConfirmTransfer()} disabled={isSubmittingTransfer}>
              {isSubmittingTransfer ? "Передаём..." : "Передать"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(sendStage)}
        onOpenChange={(open) => {
          if (!open) {
            setSendStage(null)
            setSendError("")
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Оформить отправку</DialogTitle>
            <DialogDescription>
              Внешняя логистика. Запись появится в блоке «Отправки в пути».
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Откуда</Label>
                <Input
                  className="h-9"
                  value={sendStage ? STAGE_LABELS[sendStage] : "--"}
                  disabled
                />
              </div>
              <div className="space-y-1">
                <Label>Куда</Label>
                <Input
                  className="h-9"
                  value={sendStage ? flowTargetLabel(flowCardByStage.get(sendStage)?.nextStage ?? null) : "--"}
                  disabled
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="send-partner">{isSendToWarehouse ? "Получатель" : "Получатель / кооператор"}</Label>
                <Input
                  id="send-partner"
                  className="h-9"
                  value={isSendToWarehouse ? "Склад ГП" : sendPartner}
                  onChange={(event) => setSendPartner(event.target.value)}
                  placeholder={isSendToWarehouse ? "Склад ГП" : "Например: Кооператор-1"}
                  disabled={isSendToWarehouse}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="send-qty">Количество</Label>
                <Input
                  id="send-qty"
                  className="h-9"
                  type="number"
                  value={sendQty}
                  onChange={(event) => setSendQty(event.target.value)}
                />
                <div className="text-xs text-slate-500">
                  Доступно: {(sendStage ? flowCardByStage.get(sendStage)?.availableQty || 0 : 0).toLocaleString()} шт.
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="send-eta">Ориентир поступления</Label>
                <Input
                  id="send-eta"
                  className="h-9"
                  type="date"
                  value={sendEta}
                  onChange={(event) => setSendEta(event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="send-tracking">Трек / накладная</Label>
                <Input
                  id="send-tracking"
                  className="h-9"
                  value={sendTracking}
                  onChange={(event) => setSendTracking(event.target.value)}
                  placeholder="Опционально"
                />
              </div>
            </div>

            {sendError ? <div className="text-sm text-destructive">{sendError}</div> : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSendStage(null)}>
              Отмена
            </Button>
            <Button type="button" onClick={() => void handleSubmitSend()} disabled={isSubmittingSend}>
              {isSubmittingSend ? "Оформляем..." : "Оформить отправку"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(receivingMovement)}
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
            <DialogTitle>Приёмка партии</DialogTitle>
            <DialogDescription>Подтвердите фактически принятое количество.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              <p>
                Отправка: <span className="font-medium text-slate-800">{receivingMovement?.from_location || receivingMovement?.from_holder || "Источник"} → {receivingMovement?.to_location || receivingMovement?.to_holder || "Назначение"}</span>
              </p>
              <p className="mt-0.5">
                Ожидается: <span className="font-medium text-slate-800">{(receivingMovement?.qty_sent ?? receivingMovement?.quantity ?? 0).toLocaleString()} шт.</span>
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Ожидаемое количество</Label>
                <Input className="h-9" value={String(receivingMovement?.qty_sent ?? receivingMovement?.quantity ?? 0)} disabled />
              </div>
              <div className="space-y-1">
                <Label>Принято</Label>
                <Input className="h-9" type="number" value={receivingQty} onChange={(event) => setReceivingQty(event.target.value)} />
              </div>
            </div>

            {receivingError ? <div className="text-sm text-destructive">{receivingError}</div> : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setReceivingMovement(null)
                setReceivingQty("")
                setReceivingError("")
              }}
            >
              Отмена
            </Button>
            <Button type="button" onClick={() => void handleConfirmReceive()} disabled={isConfirmingReceive}>
              {isConfirmingReceive ? "Сохраняем..." : "Подтвердить приёмку"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isTaskModalOpen}
        onOpenChange={(open) => {
          setIsTaskModalOpen(open)
          if (!open) setTaskError("")
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новая задача</DialogTitle>
            <DialogDescription>Добавление задачи по детали.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="task-title">Название задачи</Label>
              <Input
                id="task-title"
                className="h-9"
                value={taskTitle}
                onChange={(event) => setTaskTitle(event.target.value)}
                placeholder="Например: Подготовить паллеты"
              />
            </div>

            <div className="space-y-1">
              <Label>Этап</Label>
              <Select value={taskStage} onValueChange={(value) => setTaskStage(value as ProductionStage | typeof NO_STAGE_VALUE)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Не задан" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_STAGE_VALUE}>Не задан</SelectItem>
                  {factStageOptions.map((stage) => (
                    <SelectItem key={`task_stage_${stage}`} value={stage}>
                      {STAGE_LABELS[stage]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Приоритет</Label>
                <Select value={taskPriority} onValueChange={(value) => setTaskPriority(value as TaskPriority)}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">Срочно</SelectItem>
                    <SelectItem value="normal">Норм</SelectItem>
                    <SelectItem value="low">Низкий</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Исполнитель</Label>
                <Select value={taskAssigneePreset} onValueChange={(value) => setTaskAssigneePreset(value as TaskAssigneePreset)}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="operators">Операторам</SelectItem>
                    <SelectItem value="masters">Мастерам</SelectItem>
                    <SelectItem value="logistics">Снабжению</SelectItem>
                    <SelectItem value="all">Всем</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Срок</Label>
              <Input type="date" className="h-9" value={taskDueDate} onChange={(event) => setTaskDueDate(event.target.value)} />
            </div>

            <div className="space-y-1">
              <Label>Описание</Label>
              <Textarea rows={2} value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} placeholder="Опционально" />
            </div>

            {taskError ? <div className="text-sm text-destructive">{taskError}</div> : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsTaskModalOpen(false)}>
              Отмена
            </Button>
            <Button type="button" onClick={() => void handleCreateTask()} disabled={isCreatingTask}>
              {isCreatingTask ? "Создаём..." : "Создать задачу"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isAddFactModalOpen}
        onOpenChange={(open) => {
          setIsAddFactModalOpen(open)
          if (!open) setFactError("")
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Добавить факт выпуска</DialogTitle>
            <DialogDescription>Новая запись производственного факта.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Дата</Label>
                <Input type="date" className="h-9" value={factDate} onChange={(event) => setFactDate(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Смена</Label>
                <Select value={factShift} onValueChange={(value) => setFactShift(value as ShiftType)}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day">{SHIFT_LABELS.day}</SelectItem>
                    <SelectItem value="night">{SHIFT_LABELS.night}</SelectItem>
                    <SelectItem value="none">{SHIFT_LABELS.none}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Операция</Label>
              <Select value={factStage} onValueChange={(value) => setFactStage(value as ProductionStage)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {factStageOptions.map((stage) => (
                    <SelectItem key={`fact_stage_${stage}`} value={stage}>
                      {STAGE_LABELS[stage]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Оператор</Label>
              <Select value={factOperatorId} onValueChange={setFactOperatorId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Выберите оператора" />
                </SelectTrigger>
                <SelectContent>
                  {factOperatorOptions.map((user) => (
                    <SelectItem key={`fact_operator_${user.id}`} value={user.id}>
                      {user.initials}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Готово (шт.)</Label>
                <Input type="number" className="h-9" value={factQtyGood} onChange={(event) => setFactQtyGood(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Брак (шт.)</Label>
                <Input type="number" className="h-9" value={factQtyScrap} onChange={(event) => setFactQtyScrap(event.target.value)} />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Комментарий</Label>
              <Textarea rows={2} value={factComment} onChange={(event) => setFactComment(event.target.value)} placeholder="Опционально" />
            </div>

            {factError ? <div className="text-sm text-destructive">{factError}</div> : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsAddFactModalOpen(false)}>
              Отмена
            </Button>
            <Button type="button" onClick={() => void handleCreateFact()} disabled={isSavingFact}>
              {isSavingFact ? "Сохраняем..." : "Сохранить факт"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editingFact)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingFact(null)
            setEditFactError("")
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Изменить факт</DialogTitle>
            <DialogDescription>
              {editingFact
                ? `ID: ${editingFact.id} · ${new Date(editingFact.date).toLocaleDateString("ru-RU")} · ${SHIFT_LABELS[editingFact.shift_type]}`
                : "Редактирование факта"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
              {editingFact ? (
                <>
                  Текущие значения: {STAGE_LABELS[editingFact.stage]} · {getUserById(editingFact.operator_id)?.initials || "--"} · {editingFact.qty_good.toLocaleString()} готово · {editingFact.qty_scrap.toLocaleString()} брак
                </>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Дата</Label>
                <Input value={editingFact ? formatDate(editingFact.date) : "--"} disabled className="h-9" />
              </div>
              <div className="space-y-1">
                <Label>Смена</Label>
                <Input value={editingFact ? SHIFT_LABELS[editingFact.shift_type] : "--"} disabled className="h-9" />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Операция</Label>
              <Input value={editingFact ? STAGE_LABELS[editingFact.stage] : "--"} disabled className="h-9" />
            </div>

            <div className="space-y-1">
              <Label>Оператор</Label>
              <Select value={editFactOperatorId} onValueChange={setEditFactOperatorId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Выберите оператора" />
                </SelectTrigger>
                <SelectContent>
                  {factOperatorOptions.map((user) => (
                    <SelectItem key={`edit_fact_operator_${user.id}`} value={user.id}>
                      {user.initials}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Готово (шт.)</Label>
                <Input type="number" className="h-9" value={editFactQtyGood} onChange={(event) => setEditFactQtyGood(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Брак (шт.)</Label>
                <Input type="number" className="h-9" value={editFactQtyScrap} onChange={(event) => setEditFactQtyScrap(event.target.value)} />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Комментарий</Label>
              <Textarea rows={2} value={editFactComment} onChange={(event) => setEditFactComment(event.target.value)} placeholder="Опционально" />
            </div>

            {editFactError ? <div className="text-sm text-destructive">{editFactError}</div> : null}
          </div>

          <DialogFooter className="sm:justify-between">
            <Button type="button" variant="destructive" onClick={() => void handleDeleteFact()} disabled={!permissions.canRollbackFacts || isDeletingFact || isUpdatingFact}>
              {isDeletingFact ? "Удаляем..." : "Удалить факт"}
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setEditingFact(null)} disabled={isUpdatingFact || isDeletingFact}>
                Отмена
              </Button>
              <Button type="button" onClick={() => void handleUpdateFact()} disabled={isUpdatingFact || isDeletingFact}>
                {isUpdatingFact ? "Сохраняем..." : "Сохранить"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isEquipmentModalOpen}
        onOpenChange={(open) => {
          setIsEquipmentModalOpen(open)
          if (!open) setMachineError("")
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Редактирование оборудования</DialogTitle>
            <DialogDescription>Назначение станка для детали.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Станок</Label>
              <Select
                value={machineDraftId}
                onValueChange={(value) => {
                  setMachineDraftId(value)
                  if (value === NO_MACHINE_VALUE) {
                    setMachineNormDraft("")
                    return
                  }
                  const normForMachine = getMachineNorm(value, part.id, "machining")
                  setMachineNormDraft(normForMachine?.qty_per_shift ? String(normForMachine.qty_per_shift) : "")
                }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Можно выбрать позже" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_MACHINE_VALUE}>Без станка</SelectItem>
                  {machiningMachines.map((machineCandidate) => (
                    <SelectItem key={machineCandidate.id} value={machineCandidate.id}>
                      {machineCandidate.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Норма выработки</Label>
              <Input
                type="number"
                className="h-9"
                value={machineNormDraft}
                onChange={(event) => setMachineNormDraft(event.target.value)}
                placeholder={machineDraftId === NO_MACHINE_VALUE ? "Сначала выберите станок" : "Например 120"}
                disabled={machineDraftId === NO_MACHINE_VALUE}
              />
            </div>

            {machineError ? <div className="text-sm text-destructive">{machineError}</div> : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsEquipmentModalOpen(false)}>
              Отмена
            </Button>
            <Button type="button" onClick={() => void handleSaveMachine()} disabled={isSavingMachine}>
              {isSavingMachine ? "Сохраняем..." : "Сохранить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
