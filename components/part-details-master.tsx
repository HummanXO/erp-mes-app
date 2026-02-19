"use client"

import React from "react"

import { useEffect, useMemo, useState } from "react"
import { useApp } from "@/lib/app-context"
import type { LogisticsEntry, MovementStatus, Part, ProductionStage, ShiftType, Task } from "@/lib/types"
import { STAGE_LABELS, SHIFT_LABELS, TASK_STATUS_LABELS } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { StageFactForm } from "@/components/stage-fact-form"
import { TasksList } from "@/components/tasks-list"
import { AuditLogView } from "@/components/audit-log-view"
import { cn } from "@/lib/utils"
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Circle,
  Clock3,
  Cog,
  Factory,
  Flame,
  FlaskConical,
  Package,
  Plus,
  Printer,
  Truck,
  Wrench,
} from "lucide-react"

interface PartDetailsMasterProps {
  part: Part
  onBack: () => void
}

type JournalFilter = "all" | "movement" | "receipt" | "fact" | "task"
type FlowStageKey = "machining" | "fitting" | "heat_treatment" | "galvanic"
type FlowStageState = "unused" | "pending" | "in_progress" | "done"

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

const ACTIVE_SHIPMENT_STATUSES = new Set<MovementStatus>(["sent", "in_transit"])
const RECEIVED_SHIPMENT_STATUSES = new Set<MovementStatus>(["received", "completed"])

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

const INTERNAL_STAGE_CHAIN: ProductionStage[] = ["machining", "fitting", "heat_treatment", "galvanic", "qc"]

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

function stageIcon(stage: FlowStageKey) {
  if (stage === "machining") return <Cog className="h-4 w-4" />
  if (stage === "fitting") return <Wrench className="h-4 w-4" />
  if (stage === "heat_treatment") return <Flame className="h-4 w-4" />
  return <FlaskConical className="h-4 w-4" />
}

function parseQty(value: string): number | null {
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

export function PartDetailsMaster({ part, onBack }: PartDetailsMasterProps) {
  const {
    currentUser,
    permissions,
    machines,
    getPartProgress,
    getPartForecast,
    getMachineById,
    getMachineNorm,
    getStageFactsForPart,
    getLogisticsForPart,
    getTasksForPart,
    getUserById,
    updatePart,
    updatePartStageStatus,
    createLogisticsEntry,
    updateLogisticsEntry,
  } = useApp()

  const [journalFilter, setJournalFilter] = useState<JournalFilter>("all")
  const [showFactForm, setShowFactForm] = useState(false)
  const [showTasksPanel, setShowTasksPanel] = useState(false)

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

  const [machineDraftId, setMachineDraftId] = useState(part.machine_id || "__none__")
  const [isEditingMachine, setIsEditingMachine] = useState(false)
  const [isSavingMachine, setIsSavingMachine] = useState(false)
  const [machineError, setMachineError] = useState("")

  useEffect(() => {
    setMachineDraftId(part.machine_id || "__none__")
    setMachineError("")
    setIsEditingMachine(false)
  }, [part.id, part.machine_id])

  const machine = part.machine_id ? getMachineById(part.machine_id) : undefined
  const machiningMachines = machines.filter((machineCandidate) => machineCandidate.department === "machining")
  const machineNorm = part.machine_id ? getMachineNorm(part.machine_id, part.id, "machining") : undefined

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

  const stageStatusByStage = useMemo(
    () => new Map((part.stage_statuses || []).map((status) => [status.stage, status] as const)),
    [part.stage_statuses]
  )

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
    for (const stageStatus of part.stage_statuses || []) {
      if (typeof stageStatus.qty_good === "number") {
        map.set(stageStatus.stage, stageStatus.qty_good)
      }
    }
    for (const fact of stageFacts) {
      if (map.has(fact.stage)) continue
      map.set(fact.stage, (map.get(fact.stage) || 0) + fact.qty_good)
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

  const activeChain = useMemo(
    () =>
      FLOW_STAGES
        .filter((stage) => {
          if (!stage.optional) return true
          return usedStages.has(stage.key)
        })
        .map((stage) => stage.key),
    [usedStages]
  )

  const inTransitShipments = useMemo(
    () =>
      sortedLogistics.filter((entry) => {
        const status = movementStatus(entry)
        return ACTIVE_SHIPMENT_STATUSES.has(status)
      }),
    [sortedLogistics]
  )

  const hasForecastInput = stageFacts.length > 0 || forecast.shiftsNeeded > 0
  const internalDeadlineLabel = hasForecastInput ? formatDate(forecast.estimatedFinishDate) : "--"
  const shiftsReserve = hasForecastInput ? forecast.shiftsRemaining - forecast.shiftsNeeded : null

  const scheduleStatus =
    shiftsReserve === null ? "нет данных" : shiftsReserve >= 0 ? "успеваем" : "риск"

  const shiftsReserveLabel =
    shiftsReserve === null
      ? "Запас: --"
      : shiftsReserve >= 0
        ? `Запас: +${shiftsReserve} смен`
        : `Дефицит: ${Math.abs(shiftsReserve)} смен`

  const finalQty = progress.qtyDone
  const finalPercent = part.qty_plan > 0 ? Math.max(0, Math.min(100, Math.round((finalQty / part.qty_plan) * 100))) : 0

  const wipQty = useMemo(() => {
    const trackedStages: ProductionStage[] = ["machining", "fitting", "heat_treatment", "galvanic", "grinding"]
    const sumAcrossStages = trackedStages.reduce((sum, stage) => sum + (stageQtyByStage.get(stage) || 0), 0)
    return Math.max(sumAcrossStages - finalQty, 0)
  }, [stageQtyByStage, finalQty])

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
        title:
          task.status === "done"
            ? `Задача выполнена: ${task.title}`
            : `Задача: ${task.title}`,
        subtitle: `Статус: ${TASK_STATUS_LABELS[task.status]}`,
        at: task.created_at || `${task.due_date}T00:00:00`,
      })
    }

    return events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  }, [getUserById, sortedFacts, sortedLogistics, tasks])

  const filteredJournalEvents = useMemo(
    () => (journalFilter === "all" ? journalEvents : journalEvents.filter((event) => event.type === journalFilter)),
    [journalEvents, journalFilter]
  )

  const flowCards = useMemo(() => {
    return FLOW_STAGES.map((flowStage) => {
      const stageStatus = stageStatusByStage.get(flowStage.key)
      const isUsed = flowStage.optional ? usedStages.has(flowStage.key) : true
      const state: FlowStageState = !isUsed
        ? "unused"
        : stageStatus?.status === "done"
          ? "done"
          : stageStatus?.status === "in_progress"
            ? "in_progress"
            : "pending"

      const doneQty = stageQtyByStage.get(flowStage.key) || 0
      const percent =
        part.qty_plan > 0 ? Math.max(0, Math.min(100, Math.round((doneQty / part.qty_plan) * 100))) : 0

      const currentStageIndex = activeChain.indexOf(flowStage.key)
      const previousStage = currentStageIndex > 0 ? activeChain[currentStageIndex - 1] : null
      const previousDone = previousStage ? stageQtyByStage.get(previousStage) || 0 : part.qty_plan
      const availableQty = Math.max(previousDone - doneQty, 0)

      return {
        ...flowStage,
        state,
        isUsed,
        doneQty,
        percent,
        availableQty,
        stageStatus,
      }
    })
  }, [activeChain, part.qty_plan, stageQtyByStage, stageStatusByStage, usedStages])

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back()
      return
    }
    onBack()
  }

  const handleOpenReceiveDialog = (entry: LogisticsEntry) => {
    const qty = entry.qty_sent ?? entry.quantity ?? 0
    setReceivingMovement(entry)
    setReceivingQty(qty > 0 ? String(qty) : "")
    setReceivingError("")
  }

  const handleConfirmReceive = async () => {
    if (!receivingMovement) return
    const parsedQty = parseQty(receivingQty)
    if (parsedQty === null) {
      setReceivingError("Укажите корректное количество приёмки")
      return
    }
    if (
      receivingMovement.qty_sent !== undefined &&
      parsedQty > receivingMovement.qty_sent
    ) {
      setReceivingError(`Нельзя принять больше отправленного: ${receivingMovement.qty_sent} шт`)
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
        const stage = stageByStatusId.get(receivingMovement.stage_id)
        if (stage) {
          updatePartStageStatus(part.id, stage, "done", currentUser?.id)
        }
      }

      setReceivingMovement(null)
      setReceivingQty("")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось подтвердить приёмку"
      setReceivingError(message)
    } finally {
      setIsConfirmingReceive(false)
    }
  }

  const openSendDialog = (stage: FlowStageKey) => {
    const qtyRemaining = Math.max(part.qty_plan - (stageQtyByStage.get(stage) || 0), 0)
    setSendStage(stage)
    setSendQty(qtyRemaining > 0 ? String(qtyRemaining) : "")
    setSendPartner(part.cooperation_partner || "")
    setSendEta("")
    setSendTracking("")
    setSendError("")
  }

  const handleSubmitSend = async () => {
    if (!sendStage) return

    const parsedQty = parseQty(sendQty)
    if (parsedQty === null) {
      setSendError("Укажите корректное количество")
      return
    }
    if (!sendPartner.trim()) {
      setSendError("Укажите получателя/кооператора")
      return
    }

    const stageStatus = stageStatusByStage.get(sendStage)
    const stageId = stageStatus?.id ? String(stageStatus.id) : undefined
    const stageIndex = activeChain.indexOf(sendStage)
    const fromStage = stageIndex > 0 ? activeChain[stageIndex - 1] : null
    const fromLabel = fromStage ? STAGE_LABELS[fromStage] : "Цех"

    setIsSubmittingSend(true)
    setSendError("")
    try {
      await createLogisticsEntry({
        part_id: part.id,
        status: "sent",
        from_location: fromLabel,
        from_holder: "Производство",
        to_location: STAGE_LABELS[sendStage],
        to_holder: sendPartner.trim(),
        carrier: "",
        tracking_number: sendTracking.trim() || undefined,
        planned_eta: sendEta ? new Date(`${sendEta}T00:00:00`).toISOString() : undefined,
        qty_sent: parsedQty,
        stage_id: stageId,
        description: `Отправка на этап: ${STAGE_LABELS[sendStage]}`,
        type: "coop_out",
        counterparty: sendPartner.trim(),
        notes: undefined,
        date: new Date().toISOString().split("T")[0],
      })

      updatePartStageStatus(part.id, sendStage, "in_progress", currentUser?.id)
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

  const handleInternalTransfer = (stage: FlowStageKey) => {
    const dynamicChain = INTERNAL_STAGE_CHAIN.filter((candidate) => {
      if (candidate === "heat_treatment") return usedStages.has("heat_treatment")
      if (candidate === "galvanic") return usedStages.has("galvanic")
      return true
    })
    const currentIndex = dynamicChain.indexOf(stage)
    const nextStage = currentIndex >= 0 ? dynamicChain[currentIndex + 1] : null

    updatePartStageStatus(part.id, stage, "done", currentUser?.id)
    if (nextStage) {
      updatePartStageStatus(part.id, nextStage, "in_progress", currentUser?.id)
    }
  }

  const handleSaveMachine = async () => {
    setMachineError("")
    setIsSavingMachine(true)
    try {
      await updatePart({
        ...part,
        machine_id: machineDraftId === "__none__" ? undefined : machineDraftId,
      })
      setIsEditingMachine(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось сохранить станок"
      setMachineError(message)
    } finally {
      setIsSavingMachine(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
        <Button variant="ghost" size="sm" className="h-9 px-2" onClick={handleBack}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Назад
        </Button>
        <h1 className="text-lg font-bold text-slate-900">Деталь: {part.code}</h1>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-5">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex-1">
              <div className="mb-2 flex flex-wrap items-center gap-3">
                <h2 className="text-xl font-bold text-slate-900">Деталь: {part.code}</h2>
                <span className="rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                  Клиент: {part.customer || "--"}
                </span>
                <span className="rounded border border-teal-100 bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700">
                  Партия: {part.qty_plan.toLocaleString()} шт.
                </span>
                <Button
                  type="button"
                  variant="outline"
                  className="ml-auto h-7 gap-1.5 text-xs font-semibold"
                  disabled
                  title="Печать этикетки пока не подключена"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Печать этикетки
                </Button>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-4 rounded-lg border border-slate-100 bg-slate-50 p-3">
                <div className="flex items-center gap-2 border-r border-slate-200 pr-4">
                  <CalendarClock className="h-4 w-4 text-slate-400" />
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Внешний дедлайн</div>
                    <div className="text-sm font-semibold text-slate-900">{formatDate(part.deadline)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 border-r border-slate-200 pr-4">
                  <CalendarCheck2 className="h-4 w-4 text-slate-400" />
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Внутренний</div>
                    <div className="text-sm font-semibold text-slate-900">{internalDeadlineLabel}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                      scheduleStatus === "успеваем" && "bg-emerald-100 text-emerald-800",
                      scheduleStatus === "риск" && "bg-amber-100 text-amber-800",
                      scheduleStatus === "нет данных" && "bg-slate-200 text-slate-700"
                    )}
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        scheduleStatus === "успеваем" && "bg-emerald-500",
                        scheduleStatus === "риск" && "bg-amber-500",
                        scheduleStatus === "нет данных" && "bg-slate-500"
                      )}
                    />
                    {scheduleStatus === "успеваем" ? "Успеваем" : scheduleStatus === "риск" ? "Риск" : "Нет данных"}
                  </span>
                  <span className="text-xs font-medium text-slate-500">{shiftsReserveLabel}</span>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded border border-slate-100 bg-slate-50 p-3">
                  <div className="mb-1.5 flex justify-between text-xs font-medium text-slate-500">
                    <span>Выпуск (финал)</span>
                    <span className="font-bold text-slate-900">{finalQty.toLocaleString()} / {part.qty_plan.toLocaleString()}</span>
                  </div>
                  <Progress value={finalPercent} className="h-2" />
                </div>
                <div className="flex items-center justify-between rounded border border-blue-100 bg-blue-50/60 p-3">
                  <div>
                    <div className="mb-0.5 text-xs font-medium text-slate-500">НЗП (в производстве)</div>
                    <div className="text-xs text-slate-400">включая внешние этапы</div>
                  </div>
                  <div className="text-xl font-bold text-slate-900">{wipQty.toLocaleString()}</div>
                </div>
              </div>
            </div>

            <div className="mt-2 flex min-w-[300px] flex-col gap-2 self-start xl:mt-0">
              <h3 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <Truck className="h-4 w-4" />
                Отправки в пути
              </h3>
              <div className="flex flex-col gap-2">
                {inTransitShipments.length === 0 ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                    Активных отправок нет
                  </div>
                ) : (
                  inTransitShipments.map((entry) => {
                    const from = entry.from_location || entry.from_holder || "Цех"
                    const to = entry.to_location || entry.to_holder || "Назначение"
                    const qty = entry.qty_sent ?? entry.quantity ?? 0
                    const isArrived = movementStatus(entry) === "in_transit"
                    return (
                      <div
                        key={entry.id}
                        className={cn(
                          "flex items-center gap-3 rounded-lg border p-2.5 shadow-sm",
                          isArrived ? "border-amber-200 bg-amber-50" : "border-blue-200 bg-blue-50"
                        )}
                      >
                        <div
                          className={cn(
                            "flex-shrink-0 rounded-full p-1.5",
                            isArrived ? "bg-amber-100 text-amber-600" : "bg-blue-100 text-blue-600"
                          )}
                        >
                          <Truck className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-800">{from} {"->"} {to}</span>
                            <span className="text-[10px] text-slate-500">{formatTime(entry.updated_at || entry.sent_at || entry.created_at)}</span>
                          </div>
                          <div className="mt-0.5 flex items-center justify-between">
                            <span className="text-[11px] text-slate-600">{qty.toLocaleString()} шт.</span>
                            <Button
                              type="button"
                              size="sm"
                              className={cn(
                                "h-6 px-2 text-[10px]",
                                isArrived ? "bg-amber-600 hover:bg-amber-700" : "bg-blue-600 hover:bg-blue-700"
                              )}
                              onClick={() => handleOpenReceiveDialog(entry)}
                            >
                              Отметить прибытие
                            </Button>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-200 bg-slate-50 py-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-900">
              <Factory className="h-4 w-4 text-teal-600" />
              Производственный поток
            </CardTitle>
            <div className="flex items-center gap-4 text-xs text-slate-500">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-slate-300" />
                В работе
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Доступно
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-blue-500" />
                В пути
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto p-6">
          <div className="flex min-w-max items-center">
            {flowCards.map((flowCard, index) => {
              const toneClass =
                flowCard.state === "done"
                  ? "border-emerald-200 bg-emerald-50/50"
                  : flowCard.state === "in_progress"
                    ? "border-slate-200 bg-slate-50"
                    : flowCard.state === "unused"
                      ? "border-slate-200 bg-slate-100/70 opacity-70"
                      : "border-slate-200 bg-slate-50"

              const availableTone =
                flowCard.state === "unused"
                  ? "text-slate-400"
                  : flowCard.availableQty > 0
                    ? "text-emerald-700"
                    : "text-slate-500"

              const inWorkQty = Math.max((stageQtyByStage.get(flowCard.key) || 0) - flowCard.doneQty, 0)

              return (
                <React.Fragment key={flowCard.key}>
                  <div className={cn("relative flex w-60 flex-col rounded-lg border p-3", toneClass)}>
                    <div className="mb-2 flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "text-slate-500",
                            flowCard.state === "done" && "text-emerald-600",
                            flowCard.state === "in_progress" && "text-slate-500",
                            flowCard.state === "pending" && "text-emerald-600",
                            flowCard.state === "unused" && "text-slate-400"
                          )}
                        >
                          {flowCard.state === "done" ? <CheckCircle2 className="h-5 w-5" /> : stageIcon(flowCard.key)}
                        </span>
                        <h4 className="text-sm font-bold text-slate-900">{flowCard.shortLabel}</h4>
                      </div>
                      <span
                        className={cn(
                          "rounded border px-1.5 py-0.5 text-[10px]",
                          flowCard.external
                            ? "border-amber-200 bg-amber-100 text-amber-800"
                            : "border-slate-200 bg-slate-100 text-slate-500"
                        )}
                      >
                        {flowCard.external ? "Внешн." : "Внутр."}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500">В работе:</span>
                        <span className="font-semibold text-slate-700">{inWorkQty.toLocaleString()}</span>
                      </div>
                      <div className={cn("flex items-center justify-between rounded border p-1.5 text-xs", flowCard.state === "unused" ? "border-slate-200 bg-slate-100" : "border-emerald-100 bg-emerald-50")}> 
                        <span className={cn("font-medium", availableTone)}>Доступно:</span>
                        <span className={cn("font-bold", availableTone)}>{flowCard.availableQty.toLocaleString()}</span>
                      </div>

                      <div className="mt-2 border-t border-slate-100 pt-2">
                        <div className="mb-1 flex justify-between text-[10px] text-slate-500">
                          <span>Сделано</span>
                          <span className="font-medium">{flowCard.doneQty.toLocaleString()} / {part.qty_plan.toLocaleString()}</span>
                        </div>
                        <Progress value={flowCard.percent} className="h-1.5" />
                      </div>
                    </div>

                    <div className="mt-3 space-y-2 border-t border-slate-100 pt-2">
                      {flowCard.state === "unused" ? (
                        <Badge variant="outline" className="h-7 justify-center text-xs text-slate-500">
                          Не используется в маршруте
                        </Badge>
                      ) : flowCard.external ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="h-8 w-full text-xs text-amber-700"
                          disabled={!permissions.canEditFacts}
                          onClick={() => openSendDialog(flowCard.key)}
                        >
                          Оформить отправку
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          className="h-8 w-full text-xs"
                          disabled={!permissions.canEditFacts}
                          onClick={() => handleInternalTransfer(flowCard.key)}
                        >
                          Передать
                        </Button>
                      )}

                      {flowCard.external && flowCard.state !== "unused" ? (
                        <p className="text-[9px] leading-tight text-slate-400">
                          Приёмка выполняется из блока "Отправки в пути" через "Отметить прибытие".
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {index < flowCards.length - 1 ? (
                    <div className="flex min-w-[60px] flex-1 items-center justify-center text-slate-300">
                      <ArrowRight className="h-7 w-7" />
                    </div>
                  ) : null}
                </React.Fragment>
              )
            })}

            <div className="flex min-w-[60px] flex-1 items-center justify-center text-slate-300">
              <ArrowRight className="h-7 w-7" />
            </div>

            <div className="flex w-40 flex-col items-center justify-center rounded-lg border border-slate-200 bg-slate-100 p-3 opacity-80">
              <Package className="mb-1 h-6 w-6 text-slate-400" />
              <h4 className="text-sm font-bold text-slate-600">Склад ГП</h4>
              <span className="mt-1 text-[10px] text-slate-400">Финал</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card className="overflow-hidden border-slate-200 shadow-sm">
            <CardHeader className="flex-row items-center justify-between border-b border-slate-200 bg-slate-50 py-4">
              <CardTitle className="flex items-center gap-2 text-lg text-slate-900">
                <ClipboardList className="h-5 w-5 text-slate-400" />
                Производственные факты
              </CardTitle>
              {permissions.canEditFacts ? (
                <Button type="button" className="h-8 text-xs" onClick={() => setShowFactForm((prev) => !prev)}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  {showFactForm ? "Скрыть форму" : "Добавить факт"}
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Дата/Смена</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Операция</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Оператор</th>
                      <th className="w-24 px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-slate-500">Готово</th>
                      <th className="w-24 px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-slate-500">Брак</th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500">Действия</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {sortedFacts.length === 0 ? (
                      <tr>
                        <td className="px-4 py-6 text-center text-sm text-slate-500" colSpan={6}>
                          Записей пока нет
                        </td>
                      </tr>
                    ) : (
                      sortedFacts.slice(0, 12).map((fact) => {
                        const operator = getUserById(fact.operator_id)
                        const shiftLabel: ShiftType = fact.shift_type
                        return (
                          <tr key={fact.id} className="transition-colors hover:bg-slate-50">
                            <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-500">
                              <div className="flex items-center gap-2">
                                <span>{new Date(fact.date).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}</span>
                                {fact.stage === "machining" ? (
                                  <span className="text-xs text-amber-500" title={SHIFT_LABELS[shiftLabel]}>
                                    {shiftLabel === "day" ? "☀" : shiftLabel === "night" ? "☾" : "-"}
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-slate-900">
                              <div className="flex items-center gap-2">
                                <Circle className="h-3 w-3 text-emerald-600" />
                                {STAGE_LABELS[fact.stage]}
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-500">
                              {operator?.initials || "--"}
                            </td>
                            <td className="whitespace-nowrap bg-green-50 px-4 py-3 text-center text-sm font-bold text-slate-900">
                              {fact.qty_good.toLocaleString()}
                            </td>
                            <td className={cn(
                              "whitespace-nowrap px-4 py-3 text-center text-sm",
                              fact.qty_scrap > 0 ? "bg-red-50 font-semibold text-red-500" : "text-slate-400"
                            )}>
                              {fact.qty_scrap.toLocaleString()}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-right">
                              <span className="text-xs text-slate-400">Изменить</span>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {showFactForm && permissions.canEditFacts ? <StageFactForm part={part} /> : null}
        </div>

        <div className="space-y-6">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="flex-row items-center justify-between border-b border-slate-200 py-4">
              <CardTitle className="text-sm font-semibold text-slate-900">Задачи</CardTitle>
              <Button
                type="button"
                className="h-7 w-7 p-0"
                onClick={() => setShowTasksPanel((prev) => !prev)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-3 p-4">
              {tasksForPanel.length === 0 ? (
                <div className="text-xs text-slate-500">Нет активных задач</div>
              ) : (
                tasksForPanel.map((task) => {
                  const priority = normalizeTaskPriority(task)
                  return (
                    <div key={task.id} className="rounded border border-slate-100 bg-slate-50 p-2">
                      <div className="text-xs font-medium text-slate-900">{task.title}</div>
                      <div className="mt-0.5 flex items-center justify-between">
                        <span
                          className={cn(
                            "rounded px-1 text-[10px] font-bold",
                            priority === "high" && "bg-red-50 text-red-500",
                            priority === "normal" && "text-slate-500",
                            priority === "low" && "text-slate-400"
                          )}
                        >
                          {priority === "high" ? "Срочно" : priority === "normal" ? "Норм" : "Низк."}
                        </span>
                        <span className="text-[10px] text-slate-400">{TASK_STATUS_LABELS[task.status]}</span>
                      </div>
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200 p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Текущее оборудование</h3>
              {!part.is_cooperation && permissions.canEditParts ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setIsEditingMachine((prev) => !prev)}
                >
                  {isEditingMachine ? "Скрыть" : "Редактировать"}
                </Button>
              ) : null}
            </div>

            <div className="space-y-4">
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs text-slate-500">Станок</span>
                  <span className={cn(
                    "rounded px-1.5 py-0.5 text-xs font-bold",
                    machine ? "bg-green-50 text-green-600" : "bg-slate-100 text-slate-500"
                  )}>
                    {machine ? "Активен" : "Не назначен"}
                  </span>
                </div>
                <p className="text-sm font-bold text-slate-900">{machine?.name || "Не назначено"}</p>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs text-slate-500">Норма выработки</span>
                </div>
                <div className="flex items-end gap-2">
                  <span className="text-2xl font-bold text-slate-900">
                    {machineNorm?.qty_per_shift?.toLocaleString() || "--"}
                  </span>
                  <span className="text-xs text-slate-500">шт/смену</span>
                </div>
              </div>

              {isEditingMachine ? (
                <div className="space-y-2 border-t border-slate-200 pt-3">
                  <Label className="text-xs text-slate-500">Станок для детали</Label>
                  <Select
                    value={machineDraftId}
                    onValueChange={setMachineDraftId}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Можно выбрать позже" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Без станка</SelectItem>
                      {machiningMachines.map((machineCandidate) => (
                        <SelectItem key={machineCandidate.id} value={machineCandidate.id}>
                          {machineCandidate.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {machineError ? <div className="text-xs text-destructive">{machineError}</div> : null}
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      className="h-8 text-xs"
                      onClick={() => void handleSaveMachine()}
                      disabled={isSavingMachine}
                    >
                      {isSavingMachine ? "Сохраняем..." : "Сохранить"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => {
                        setMachineDraftId(part.machine_id || "__none__")
                        setMachineError("")
                        setIsEditingMachine(false)
                      }}
                      disabled={isSavingMachine}
                    >
                      Отмена
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </Card>
        </div>
      </div>

      {showTasksPanel ? (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-200 py-3">
            <CardTitle className="text-sm">Задачи (полный список)</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <TasksList partId={part.id} machineId={part.machine_id} />
          </CardContent>
        </Card>
      ) : null}

      <Card className="overflow-hidden border-slate-200 shadow-sm">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-slate-50 py-4">
          <CardTitle className="text-lg text-slate-900">Журнал событий</CardTitle>
          <div className="flex flex-wrap gap-2">
            {([
              { key: "all", label: "Все" },
              { key: "movement", label: "Перемещения" },
              { key: "receipt", label: "Приёмка" },
              { key: "fact", label: "Факты" },
              { key: "task", label: "Задачи" },
            ] as const).map((item) => (
              <Button
                key={item.key}
                type="button"
                variant={journalFilter === item.key ? "default" : "secondary"}
                className={cn(
                  "h-7 rounded-full px-3 text-xs",
                  journalFilter === item.key ? "bg-slate-800 text-white hover:bg-slate-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
                onClick={() => setJournalFilter(item.key)}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <ul className="-mb-8">
            {filteredJournalEvents.length === 0 ? (
              <li className="pb-2 text-sm text-slate-500">Событий по выбранному фильтру нет</li>
            ) : (
              filteredJournalEvents.slice(0, 30).map((event, index) => {
                const iconTone =
                  event.type === "receipt"
                    ? "bg-amber-100 text-amber-600"
                    : event.type === "movement"
                      ? "bg-blue-100 text-blue-600"
                      : event.type === "fact"
                        ? "bg-green-100 text-green-600"
                        : "bg-slate-100 text-slate-500"

                return (
                  <li key={event.id}>
                    <div className={cn("relative", index < filteredJournalEvents.length - 1 ? "pb-8" : "") }>
                      {index < filteredJournalEvents.length - 1 ? (
                        <span aria-hidden="true" className="absolute left-4 top-4 -ml-px h-full w-0.5 bg-slate-200" />
                      ) : null}
                      <div className="relative flex space-x-3">
                        <div>
                          <span className={cn("flex h-8 w-8 items-center justify-center rounded-full ring-8 ring-white", iconTone)}>
                            {event.type === "receipt" ? (
                              <Package className="h-4 w-4" />
                            ) : event.type === "movement" ? (
                              <Truck className="h-4 w-4" />
                            ) : event.type === "fact" ? (
                              <CheckCircle2 className="h-4 w-4" />
                            ) : (
                              <Clock3 className="h-4 w-4" />
                            )}
                          </span>
                        </div>
                        <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                          <div>
                            <p className="text-sm text-slate-500">{event.title}</p>
                            {event.subtitle ? (
                              <p className="mt-0.5 text-xs text-slate-400">{event.subtitle}</p>
                            ) : null}
                          </div>
                          <div className="whitespace-nowrap text-right text-sm text-slate-500">
                            {formatTime(event.at)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                )
              })
            )}
          </ul>
        </CardContent>
      </Card>

      {permissions.canViewAudit ? (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-200 py-3">
            <CardTitle className="text-sm">Журнал аудита (расширенно)</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <AuditLogView partId={part.id} compact={false} />
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={Boolean(receivingMovement)} onOpenChange={(open) => {
        if (!open) {
          setReceivingMovement(null)
          setReceivingQty("")
          setReceivingError("")
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Подтвердить приёмку</DialogTitle>
            <DialogDescription>
              Подтвердите количество принятых деталей по отправке в пути.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Ожидаемое</Label>
                <Input value={String(receivingMovement?.qty_sent ?? receivingMovement?.quantity ?? 0)} disabled className="h-9" />
              </div>
              <div className="space-y-1">
                <Label>Принято, шт</Label>
                <Input
                  className="h-9"
                  type="number"
                  value={receivingQty}
                  onChange={(event) => setReceivingQty(event.target.value)}
                />
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
            <Button
              type="button"
              onClick={() => void handleConfirmReceive()}
              disabled={isConfirmingReceive}
            >
              {isConfirmingReceive ? "Сохраняем..." : "Подтвердить приёмку"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(sendStage)} onOpenChange={(open) => {
        if (!open) {
          setSendStage(null)
          setSendError("")
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Оформить отправку</DialogTitle>
            <DialogDescription>
              Отправка на внешний этап {sendStage ? STAGE_LABELS[sendStage] : ""}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="send-partner">Получатель / кооператор</Label>
                <Input
                  id="send-partner"
                  className="h-9"
                  value={sendPartner}
                  onChange={(event) => setSendPartner(event.target.value)}
                  placeholder="Например: Кооператор-1"
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
                  placeholder="шт"
                />
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
            <Button
              type="button"
              onClick={() => void handleSubmitSend()}
              disabled={isSubmittingSend}
            >
              {isSubmittingSend ? "Оформляем..." : "Оформить отправку"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
