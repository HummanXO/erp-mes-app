"use client"

import { useEffect, useMemo, useState } from "react"
import type { KeyboardEvent } from "react"
import { useApp } from "@/lib/app-context"
import type {
  AccessPermission,
  SpecItem,
  SpecItemStatus,
  SpecificationStatus,
  WorkOrder,
  WorkOrderPriority,
  WorkOrderStatus,
} from "@/lib/types"
import {
  PART_STATUS_LABELS,
  SPEC_ITEM_STATUS_LABELS,
  SPEC_ITEM_TYPE_LABELS,
  SPEC_STATUS_LABELS,
  WORK_ORDER_STATUS_LABELS,
} from "@/lib/types"
import { StatusBadge } from "@/components/inventory/status-badge"
import { PartCard } from "@/components/part-card"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import {
  Ban,
  CheckCircle2,
  ClipboardList,
  Play,
  Plus,
  Search,
  ShieldPlus,
  Timer,
  Trash2,
  Wrench,
  X,
} from "lucide-react"

type Tone = "info" | "success" | "warning" | "danger"

const SPEC_STATUS_TONES: Record<SpecificationStatus, Tone> = {
  draft: "info",
  active: "success",
  closed: "warning",
}

const SPEC_ITEM_STATUS_TONES: Record<SpecItemStatus, Tone> = {
  open: "info",
  partial: "warning",
  fulfilled: "success",
  blocked: "danger",
  canceled: "warning",
}

const WORK_ORDER_STATUS_TONES: Record<WorkOrderStatus, Tone> = {
  backlog: "info",
  queued: "info",
  in_progress: "warning",
  blocked: "danger",
  done: "success",
  canceled: "warning",
}

const WORK_ORDER_PRIORITY_LABELS: Record<WorkOrderPriority, string> = {
  low: "Низкий",
  normal: "Обычный",
  high: "Высокий",
}

const WORK_ORDER_PRIORITY_TONES: Record<WorkOrderPriority, Tone> = {
  low: "info",
  normal: "warning",
  high: "danger",
}

const ACCESS_PERMISSION_LABELS: Record<AccessPermission, string> = {
  view: "Только просмотр",
  report: "Отчёт по факту",
  manage: "Управление",
}

const ACCESS_PERMISSION_TONES: Record<AccessPermission, Tone> = {
  view: "info",
  report: "warning",
  manage: "success",
}

const WORK_ORDER_LANES: WorkOrderStatus[] = ["backlog", "queued", "in_progress", "blocked", "done"]

const PART_STATUS_TONES = {
  not_started: "info",
  in_progress: "warning",
  done: "success",
} as const

function formatDateTime(value?: string): string {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleString("ru-RU")
}

function getWorkOrderProgressPercent(order: WorkOrder): number {
  if (order.qty_plan <= 0) return 0
  return Math.min(100, Math.round((order.qty_done / order.qty_plan) * 100))
}

export function SpecificationsView() {
  const {
    currentUser,
    permissions,
    dataError,
    users,
    parts,
    machines,
    createSpecification,
    setSpecificationPublished,
    deleteSpecification,
    createWorkOrder,
    queueWorkOrder,
    startWorkOrder,
    blockWorkOrder,
    reportWorkOrderProgress,
    completeWorkOrder,
    grantAccess,
    revokeAccess,
    getSpecificationsForCurrentUser,
    getSpecItemsBySpecification,
    getWorkOrdersForCurrentUser,
    getWorkOrdersForSpecification,
    getAccessGrantsForSpecification,
    getPartById,
    getPartProgress,
    getMachineById,
    getUserById,
  } = useApp()

  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<SpecificationStatus | "all">("all")
  const [selectedSpecificationId, setSelectedSpecificationId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState(false)

  const [createOpen, setCreateOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteLinkedParts, setDeleteLinkedParts] = useState(false)
  const [newSpecNumber, setNewSpecNumber] = useState("")
  const [newSpecCustomer, setNewSpecCustomer] = useState("")
  const [newSpecNote, setNewSpecNote] = useState("")
  const [newSpecPartId, setNewSpecPartId] = useState("")
  const [newSpecQty, setNewSpecQty] = useState("100")

  const [grantUserId, setGrantUserId] = useState("")
  const [grantPermission, setGrantPermission] = useState<AccessPermission>("view")

  const [machineDraftByOrderId, setMachineDraftByOrderId] = useState<Record<string, string>>({})

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 200)
    return () => clearTimeout(timer)
  }, [])

  const visibleSpecifications = useMemo(() => getSpecificationsForCurrentUser(), [getSpecificationsForCurrentUser])

  const filteredSpecifications = useMemo(() => {
    let list = [...visibleSpecifications]

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      list = list.filter((specification) =>
        [specification.number, specification.customer, specification.note]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(query))
      )
    }

    if (statusFilter !== "all") {
      list = list.filter((specification) => specification.status === statusFilter)
    }

    return list.sort((a, b) => b.created_at.localeCompare(a.created_at))
  }, [visibleSpecifications, searchQuery, statusFilter])

  useEffect(() => {
    if (filteredSpecifications.length === 0) {
      setSelectedSpecificationId(null)
      return
    }

    if (!selectedSpecificationId || !filteredSpecifications.some((specification) => specification.id === selectedSpecificationId)) {
      setSelectedSpecificationId(filteredSpecifications[0].id)
    }
  }, [filteredSpecifications, selectedSpecificationId])

  const selectedSpecification = useMemo(
    () => filteredSpecifications.find((specification) => specification.id === selectedSpecificationId) ?? null,
    [filteredSpecifications, selectedSpecificationId]
  )

  const selectedSpecItems = useMemo(
    () => (selectedSpecification ? getSpecItemsBySpecification(selectedSpecification.id) : []),
    [selectedSpecification, getSpecItemsBySpecification]
  )

  const currentUserWorkOrderIds = useMemo(
    () => new Set(getWorkOrdersForCurrentUser().map((order) => order.id)),
    [getWorkOrdersForCurrentUser]
  )

  const selectedWorkOrders = useMemo(() => {
    if (!selectedSpecification) return []
    const workOrders = getWorkOrdersForSpecification(selectedSpecification.id)
    if (currentUser?.role !== "operator") return workOrders
    return workOrders.filter((order) => currentUserWorkOrderIds.has(order.id))
  }, [selectedSpecification, getWorkOrdersForSpecification, currentUser?.role, currentUserWorkOrderIds])

  const selectedAccessGrants = useMemo(
    () => (selectedSpecification ? getAccessGrantsForSpecification(selectedSpecification.id) : []),
    [selectedSpecification, getAccessGrantsForSpecification]
  )

  const summary = useMemo(() => {
    const active = visibleSpecifications.filter((item) => item.status === "active").length
    const draft = visibleSpecifications.filter((item) => item.status === "draft").length
    const published = visibleSpecifications.filter((item) => item.published_to_operators).length
    return {
      total: visibleSpecifications.length,
      active,
      draft,
      published,
    }
  }, [visibleSpecifications])

  const operatorUsers = useMemo(() => users.filter((user) => user.role === "operator"), [users])

  const ordersByLane = useMemo(() => {
    const lanes: Record<WorkOrderStatus, WorkOrder[]> = {
      backlog: [],
      queued: [],
      in_progress: [],
      blocked: [],
      done: [],
      canceled: [],
    }

    for (const order of selectedWorkOrders) {
      lanes[order.status].push(order)
    }

    for (const lane of Object.values(lanes)) {
      lane.sort((a, b) => {
        if (a.status === "queued" && b.status === "queued") {
          return (a.queue_pos ?? 9999) - (b.queue_pos ?? 9999)
        }
        return b.created_at.localeCompare(a.created_at)
      })
    }

    return lanes
  }, [selectedWorkOrders])

  const canManageSpecifications = permissions.canManageSpecifications
  const canManageWorkOrders = permissions.canManageWorkOrders
  const isOperator = currentUser?.role === "operator"

  const canStartOrder = (order: WorkOrder): boolean => {
    if (canManageWorkOrders) return true
    if (!isOperator || !currentUser) return false
    if (order.status !== "queued" && order.status !== "backlog") return false
    return !order.assigned_operator_id || order.assigned_operator_id === currentUser.id
  }

  const canReportOrder = (order: WorkOrder): boolean => {
    if (canManageWorkOrders) return true
    if (!isOperator || !currentUser) return false
    if (order.status !== "in_progress") return false
    return !order.assigned_operator_id || order.assigned_operator_id === currentUser.id
  }

  const clearCreateSpecificationForm = () => {
    setNewSpecNumber("")
    setNewSpecCustomer("")
    setNewSpecNote("")
    setNewSpecPartId("")
    setNewSpecQty("100")
  }

  const handleSpecificationRowKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number
  ) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End", "Enter"].includes(event.key)) return

    event.preventDefault()

    if (event.key === "Enter") {
      const nextId = filteredSpecifications[index]?.id
      if (nextId) setSelectedSpecificationId(nextId)
      return
    }

    const maxIndex = filteredSpecifications.length - 1
    let nextIndex = index

    if (event.key === "ArrowDown") nextIndex = Math.min(maxIndex, index + 1)
    if (event.key === "ArrowUp") nextIndex = Math.max(0, index - 1)
    if (event.key === "Home") nextIndex = 0
    if (event.key === "End") nextIndex = maxIndex

    const nextId = filteredSpecifications[nextIndex]?.id
    if (!nextId) return

    setSelectedSpecificationId(nextId)
    document.getElementById(`spec-row-${nextId}`)?.focus()
  }

  const runAction = async (callback: () => Promise<void>) => {
    try {
      setActionError(null)
      setActionBusy(true)
      await callback()
    } catch (error) {
      console.error(error)
      setActionError(error instanceof Error ? error.message : "Операция не выполнена")
    } finally {
      setActionBusy(false)
    }
  }

  const openPartDetails = (partId: string) => {
    sessionStorage.setItem("pc.navigate.partId", partId)
    window.dispatchEvent(new CustomEvent("pc-open-part", { detail: { partId } }))
  }

  const handleCreateSpecification = async () => {
    const number = newSpecNumber.trim()
    if (!number || !currentUser) {
      setActionError("Укажите номер спецификации")
      return
    }

    const items: Array<Omit<SpecItem, "id" | "specification_id" | "line_no" | "qty_done" | "status">> = []

    if (newSpecPartId) {
      const selectedPart = parts.find((part) => part.id === newSpecPartId)
      if (!selectedPart) {
        setActionError("Выберите корректную деталь")
        return
      }
      const qty = Number(newSpecQty)
      if (!Number.isFinite(qty) || qty <= 0) {
        setActionError("Количество должно быть больше 0")
        return
      }

      items.push({
        item_type: "make",
        part_id: selectedPart.id,
        description: `${selectedPart.code} ${selectedPart.name}`,
        qty_required: qty,
        uom: "шт",
      })
    }

    await runAction(async () => {
      const createdSpecification = await createSpecification({
        specification: {
          number,
          customer: newSpecCustomer.trim() || undefined,
          note: newSpecNote.trim() || undefined,
          status: "draft",
          published_to_operators: false,
          created_by: currentUser.id,
        },
        items,
      })
      setSelectedSpecificationId(createdSpecification.id)
      setCreateOpen(false)
      clearCreateSpecificationForm()
    })
  }

  const handleDeleteSpecification = async () => {
    if (!selectedSpecification) return
    const deletedSpecId = selectedSpecification.id

    await runAction(async () => {
      await deleteSpecification(deletedSpecId, deleteLinkedParts)
      setDeleteOpen(false)
      setDeleteLinkedParts(false)

      const nextList = filteredSpecifications.filter(spec => spec.id !== deletedSpecId)
      setSelectedSpecificationId(nextList[0]?.id ?? null)
    })
  }

  const handleCreateWorkOrder = async (item: SpecItem) => {
    if (!selectedSpecification || !item.part_id || !currentUser) return

    const part = getPartById(item.part_id)
    const machineId = part?.machine_id ?? machines[0]?.id

    await runAction(async () => {
      await createWorkOrder({
        specification_id: selectedSpecification.id,
        spec_item_id: item.id,
        part_id: item.part_id as string,
        machine_id: machineId,
        status: "backlog",
        qty_plan: item.qty_required,
        qty_done: 0,
        qty_scrap: 0,
        priority: "normal",
        created_by: currentUser.id,
      })
    })
  }

  const resolveMachineForOrder = (order: WorkOrder): string | null => {
    const fromDraft = machineDraftByOrderId[order.id]
    if (fromDraft) return fromDraft
    if (order.machine_id) return order.machine_id
    const partMachine = getPartById(order.part_id)?.machine_id
    if (partMachine) return partMachine
    return machines[0]?.id ?? null
  }

  const handleQueueWorkOrder = async (order: WorkOrder) => {
    const machineId = resolveMachineForOrder(order)
    if (!machineId) {
      setActionError("Нет доступного станка для постановки в очередь")
      return
    }

    await runAction(async () => {
      await queueWorkOrder(order.id, machineId)
    })
  }

  const handleStartWorkOrder = async (order: WorkOrder) => {
    await runAction(async () => {
      await startWorkOrder(order.id, currentUser?.id)
    })
  }

  const handleBlockWorkOrder = async (order: WorkOrder) => {
    const reason = window.prompt("Причина блокировки", order.block_reason ?? "")
    if (!reason || !reason.trim()) return

    await runAction(async () => {
      await blockWorkOrder(order.id, reason.trim())
    })
  }

  const handleReportProgress = async (order: WorkOrder) => {
    const qtyGoodRaw = window.prompt("Сколько годных добавить?", "0")
    if (qtyGoodRaw === null) return
    const qtyGood = Number(qtyGoodRaw.replace(",", "."))
    if (!Number.isFinite(qtyGood) || qtyGood < 0) {
      setActionError("Количество годных должно быть числом >= 0")
      return
    }

    const qtyScrapRaw = window.prompt("Сколько брака добавить?", "0")
    if (qtyScrapRaw === null) return
    const qtyScrap = Number(qtyScrapRaw.replace(",", "."))
    if (!Number.isFinite(qtyScrap) || qtyScrap < 0) {
      setActionError("Количество брака должно быть числом >= 0")
      return
    }

    await runAction(async () => {
      await reportWorkOrderProgress(order.id, qtyGood, qtyScrap)
    })
  }

  const handleCompleteWorkOrder = async (order: WorkOrder) => {
    await runAction(async () => {
      await completeWorkOrder(order.id)
    })
  }

  const handleGrantAccess = async () => {
    if (!selectedSpecification || !grantUserId) {
      setActionError("Выберите оператора")
      return
    }

    await runAction(async () => {
      await grantAccess("specification", selectedSpecification.id, grantUserId, grantPermission)
      setGrantUserId("")
      setGrantPermission("view")
    })
  }

  const renderWorkOrderCard = (order: WorkOrder) => {
    const part = getPartById(order.part_id)
    const machine = order.machine_id ? getMachineById(order.machine_id) : undefined
    const operator = order.assigned_operator_id ? getUserById(order.assigned_operator_id) : undefined
    const progress = getWorkOrderProgressPercent(order)
    const machineSelectValue = machineDraftByOrderId[order.id] ?? order.machine_id

    return (
      <div key={order.id} className="rounded-lg border p-3 space-y-3">
        <div className="space-y-1">
          <div className="text-sm font-medium leading-tight">
            {part ? `${part.code} ${part.name}` : order.part_id}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={WORK_ORDER_PRIORITY_TONES[order.priority]}>
              {WORK_ORDER_PRIORITY_LABELS[order.priority]}
            </StatusBadge>
            <StatusBadge tone={WORK_ORDER_STATUS_TONES[order.status]}>
              {WORK_ORDER_STATUS_LABELS[order.status]}
            </StatusBadge>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{order.qty_done} / {order.qty_plan} шт</span>
            <span>{progress}%</span>
          </div>
          <Progress value={progress} />
        </div>

        <div className="grid gap-1 text-xs text-muted-foreground">
          <div>Станок: {machine?.name ?? "Не назначен"}</div>
          <div>Оператор: {operator?.initials ?? "Не назначен"}</div>
          <div>Брак: {order.qty_scrap} шт</div>
          <div>Создано: {formatDateTime(order.created_at)}</div>
          {order.block_reason && <div>Причина блока: {order.block_reason}</div>}
        </div>

        {canManageWorkOrders && (
          <div className="space-y-2">
            <Label className="text-xs">Станок</Label>
            <Select
              value={machineSelectValue}
              onValueChange={(value) =>
                setMachineDraftByOrderId((prev) => ({
                  ...prev,
                  [order.id]: value,
                }))
              }
            >
              <SelectTrigger className="h-11 w-full">
                <SelectValue placeholder="Выберите станок" />
              </SelectTrigger>
              <SelectContent>
                {machines.map((machineItem) => (
                  <SelectItem key={machineItem.id} value={machineItem.id}>
                    {machineItem.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {canManageWorkOrders && (order.status === "backlog" || order.status === "blocked") && (
            <Button
              variant="outline"
              size="sm"
              className="h-11"
              onClick={() => void handleQueueWorkOrder(order)}
              disabled={actionBusy}
              aria-label={`Поставить задание ${order.id} в очередь`}
            >
              <Timer className="h-4 w-4" aria-hidden="true" />
              В очередь
            </Button>
          )}

          {canStartOrder(order) && (
            <Button
              variant="outline"
              size="sm"
              className="h-11"
              onClick={() => void handleStartWorkOrder(order)}
              disabled={actionBusy}
              aria-label={`Запустить задание ${order.id}`}
            >
              <Play className="h-4 w-4" aria-hidden="true" />
              Старт
            </Button>
          )}

          {canReportOrder(order) && (
            <Button
              variant="outline"
              size="sm"
              className="h-11"
              onClick={() => void handleReportProgress(order)}
              disabled={actionBusy}
              aria-label={`Добавить факт по заданию ${order.id}`}
            >
              <Wrench className="h-4 w-4" aria-hidden="true" />
              Факт
            </Button>
          )}

          {canManageWorkOrders && order.status !== "done" && order.status !== "canceled" && (
            <Button
              variant="outline"
              size="sm"
              className="h-11"
              onClick={() => void handleBlockWorkOrder(order)}
              disabled={actionBusy}
              aria-label={`Заблокировать задание ${order.id}`}
            >
              <Ban className="h-4 w-4" aria-hidden="true" />
              Блок
            </Button>
          )}

          {canManageWorkOrders && order.status !== "done" && order.status !== "canceled" && (
            <Button
              variant="outline"
              size="sm"
              className="h-11"
              onClick={() => void handleCompleteWorkOrder(order)}
              disabled={actionBusy}
              aria-label={`Закрыть задание ${order.id}`}
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Закрыть
            </Button>
          )}
        </div>
      </div>
    )
  }

  if (!permissions.canViewSpecifications) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          У вас нет доступа к разделу спецификаций
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Спецификации</h1>
          <p className="text-sm text-muted-foreground">
            Управление спецификациями, очередью заданий и доступами операторов
          </p>
        </div>
        {canManageSpecifications && (
          <Button className="h-11" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Новая спецификация
          </Button>
        )}
      </div>

      {actionError && (
        <div className="rounded-md border border-[color:var(--status-danger-border)] bg-[color:var(--status-danger-bg)] px-3 py-2 text-sm text-[color:var(--status-danger-fg)]">
          {actionError}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1.95fr)]">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-semibold">{summary.total}</div>
                <div className="text-xs text-muted-foreground">Всего</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-semibold">{summary.active}</div>
                <div className="text-xs text-muted-foreground">Активные</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-semibold">{summary.draft}</div>
                <div className="text-xs text-muted-foreground">Черновики</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-semibold">{summary.published}</div>
                <div className="text-xs text-muted-foreground">Опубликованы</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Фильтры</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  className="pl-9 h-11"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Поиск по номеру, клиенту, примечанию"
                />
              </div>
              <div className="space-y-2">
                <Label>Статус</Label>
                <Select
                  value={statusFilter}
                  onValueChange={(value) => setStatusFilter(value as SpecificationStatus | "all")}
                >
                  <SelectTrigger className="h-11 w-full">
                    <SelectValue placeholder="Все статусы" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все</SelectItem>
                    <SelectItem value="draft">{SPEC_STATUS_LABELS.draft}</SelectItem>
                    <SelectItem value="active">{SPEC_STATUS_LABELS.active}</SelectItem>
                    <SelectItem value="closed">{SPEC_STATUS_LABELS.closed}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Список ({filteredSpecifications.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {dataError ? (
                <div className="rounded-md border border-[color:var(--status-danger-border)] bg-[color:var(--status-danger-bg)] px-3 py-2 text-sm text-[color:var(--status-danger-fg)]">
                  Ошибка загрузки: {dataError}
                </div>
              ) : isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Skeleton key={index} className="h-16 w-full" />
                  ))}
                </div>
              ) : filteredSpecifications.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Спецификации не найдены
                </div>
              ) : (
                filteredSpecifications.map((specification, index) => (
                  <button
                    key={specification.id}
                    id={`spec-row-${specification.id}`}
                    type="button"
                    onClick={() => setSelectedSpecificationId(specification.id)}
                    onFocus={() => setSelectedSpecificationId(specification.id)}
                    onKeyDown={(event) => handleSpecificationRowKeyDown(event, index)}
                    aria-selected={selectedSpecificationId === specification.id}
                    className={cn(
                      "w-full min-h-[44px] rounded-lg border px-3 py-2 text-left transition",
                      selectedSpecificationId === specification.id
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted/50"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="font-medium">{specification.number}</div>
                        <div className="text-xs text-muted-foreground">
                          {specification.customer ?? "Без клиента"} • {formatDateTime(specification.created_at)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {specification.published_to_operators && (
                          <StatusBadge tone="success">Опубликована</StatusBadge>
                        )}
                        <StatusBadge tone={SPEC_STATUS_TONES[specification.status]}>
                          {SPEC_STATUS_LABELS[specification.status]}
                        </StatusBadge>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {!selectedSpecification ? (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                Выберите спецификацию из списка
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Карточка спецификации</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold">{selectedSpecification.number}</div>
                      <div className="text-sm text-muted-foreground">
                        {selectedSpecification.customer ?? "Клиент не указан"}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone={SPEC_STATUS_TONES[selectedSpecification.status]}>
                        {SPEC_STATUS_LABELS[selectedSpecification.status]}
                      </StatusBadge>
                      {selectedSpecification.published_to_operators && (
                        <StatusBadge tone="success">Опубликована</StatusBadge>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <div className="text-xs text-muted-foreground">Примечание</div>
                      <div className="text-sm">{selectedSpecification.note ?? "—"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Создана</div>
                      <div className="text-sm">{formatDateTime(selectedSpecification.created_at)}</div>
                    </div>
                  </div>

                  {canManageSpecifications && (
                    <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={selectedSpecification.published_to_operators}
                          onCheckedChange={(checked) =>
                            void runAction(async () => {
                              await setSpecificationPublished(selectedSpecification.id, checked)
                            })
                          }
                          disabled={actionBusy}
                        />
                        <Label>Опубликовать операторам</Label>
                      </div>
                      <div className="ml-auto">
                        <Button
                          variant="outline"
                          className="h-11"
                          onClick={() => setDeleteOpen(true)}
                          disabled={actionBusy}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                          Удалить спецификацию
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Позиции спецификации ({selectedSpecItems.length})</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {selectedSpecItems.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                      Позиции не добавлены
                    </div>
                  ) : (
                    selectedSpecItems.map((item) => {
                      const part = item.part_id ? getPartById(item.part_id) : undefined
                      const hasWorkOrder = selectedWorkOrders.some(
                        (workOrder) => workOrder.spec_item_id === item.id && workOrder.status !== "canceled"
                      )
                      const linkedPartProgress =
                        part && item.item_type === "make" ? getPartProgress(part.id) : null
                      const effectiveQtyDone = linkedPartProgress ? linkedPartProgress.qtyDone : item.qty_done
                      const effectiveQtyRequired = linkedPartProgress ? part.qty_plan : item.qty_required
                      const itemProgress = effectiveQtyRequired > 0
                        ? Math.min(100, Math.round((effectiveQtyDone / effectiveQtyRequired) * 100))
                        : 0

                      return (
                        <div key={item.id} className="rounded-lg border p-3 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <div className="font-medium">#{item.line_no} {item.description}</div>
                              <div className="text-xs text-muted-foreground">
                                {part ? `${part.code} • ${part.name}` : "Без связанной детали"}
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <StatusBadge tone={SPEC_ITEM_STATUS_TONES[item.status]}>
                                {SPEC_ITEM_STATUS_LABELS[item.status]}
                              </StatusBadge>
                              {part && item.item_type === "make" && (
                                <StatusBadge tone={PART_STATUS_TONES[part.status]}>
                                  Деталь: {PART_STATUS_LABELS[part.status]}
                                </StatusBadge>
                              )}
                              <StatusBadge tone="info">{SPEC_ITEM_TYPE_LABELS[item.item_type]}</StatusBadge>
                            </div>
                          </div>

                          {part && (
                            <div className="space-y-2">
                              <PartCard part={part} onClick={() => openPartDetails(part.id)} />
                              <div className="flex justify-end">
                                <Button
                                  variant="outline"
                                  className="h-11"
                                  onClick={() => openPartDetails(part.id)}
                                >
                                  Открыть в деталях
                                </Button>
                              </div>
                            </div>
                          )}

                          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                            <div>
                              Выполнено: <span className="font-medium">{effectiveQtyDone} / {effectiveQtyRequired} {item.uom}</span>
                            </div>
                            <div className="text-muted-foreground">{itemProgress}%</div>
                          </div>

                          <Progress value={itemProgress} />

                          {canManageWorkOrders && item.item_type === "make" && item.part_id && !hasWorkOrder && (
                            <Button
                              variant="outline"
                              className="h-11"
                              onClick={() => void handleCreateWorkOrder(item)}
                              disabled={actionBusy}
                            >
                              <ClipboardList className="h-4 w-4" aria-hidden="true" />
                              Создать задание
                            </Button>
                          )}
                        </div>
                      )
                    })
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Очередь и выполнение заданий</CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedWorkOrders.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                      По этой спецификации пока нет заданий
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 2xl:grid-cols-5 lg:grid-cols-2">
                      {WORK_ORDER_LANES.map((laneStatus) => (
                        <div key={laneStatus} className="rounded-lg border p-2">
                          <div className="mb-2 flex items-center justify-between">
                            <StatusBadge tone={WORK_ORDER_STATUS_TONES[laneStatus]}>
                              {WORK_ORDER_STATUS_LABELS[laneStatus]}
                            </StatusBadge>
                            <span className="text-xs text-muted-foreground">{ordersByLane[laneStatus].length}</span>
                          </div>
                          <div className="space-y-2">
                            {ordersByLane[laneStatus].length === 0 ? (
                              <div className="rounded-md border border-dashed px-2 py-4 text-center text-xs text-muted-foreground">
                                Пусто
                              </div>
                            ) : (
                              ordersByLane[laneStatus].map((order) => renderWorkOrderCard(order))
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Доступ операторов</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {canManageSpecifications && (
                    <div className="grid gap-2 rounded-lg border p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                      <Select value={grantUserId} onValueChange={setGrantUserId}>
                        <SelectTrigger className="h-11 w-full">
                          <SelectValue placeholder="Оператор" />
                        </SelectTrigger>
                        <SelectContent>
                          {operatorUsers.map((operator) => (
                            <SelectItem key={operator.id} value={operator.id}>
                              {operator.initials}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select
                        value={grantPermission}
                        onValueChange={(value) => setGrantPermission(value as AccessPermission)}
                      >
                        <SelectTrigger className="h-11 w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="view">{ACCESS_PERMISSION_LABELS.view}</SelectItem>
                          <SelectItem value="report">{ACCESS_PERMISSION_LABELS.report}</SelectItem>
                          <SelectItem value="manage">{ACCESS_PERMISSION_LABELS.manage}</SelectItem>
                        </SelectContent>
                      </Select>

                      <Button
                        className="h-11"
                        onClick={() => void handleGrantAccess()}
                        disabled={actionBusy}
                      >
                        <ShieldPlus className="h-4 w-4" aria-hidden="true" />
                        Выдать
                      </Button>
                    </div>
                  )}

                  {selectedAccessGrants.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                      Выданных доступов нет
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {selectedAccessGrants.map((grant) => {
                        const user = getUserById(grant.user_id)
                        return (
                          <div
                            key={grant.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2"
                          >
                            <div>
                              <div className="font-medium text-sm">{user?.initials ?? grant.user_id}</div>
                              <div className="text-xs text-muted-foreground">{formatDateTime(grant.created_at)}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <StatusBadge tone={ACCESS_PERMISSION_TONES[grant.permission]}>
                                {ACCESS_PERMISSION_LABELS[grant.permission]}
                              </StatusBadge>
                              {canManageSpecifications && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-11"
                                  onClick={() =>
                                    void runAction(async () => {
                                      await revokeAccess(grant.id)
                                    })
                                  }
                                  disabled={actionBusy}
                                  aria-label={`Отозвать доступ ${user?.initials ?? grant.user_id}`}
                                >
                                  <X className="h-4 w-4" aria-hidden="true" />
                                  Отозвать
                                </Button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>

      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open)
          if (!open) {
            setDeleteLinkedParts(false)
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Удалить спецификацию</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-sm text-muted-foreground">
              Спецификация <span className="font-medium text-foreground">{selectedSpecification?.number ?? "—"}</span> будет удалена вместе с позициями, заданиями и доступами операторов.
            </p>
            <div className="rounded-md border p-3">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="delete-linked-parts"
                  checked={deleteLinkedParts}
                  onCheckedChange={(checked) => setDeleteLinkedParts(Boolean(checked))}
                />
                <div className="space-y-1">
                  <Label htmlFor="delete-linked-parts" className="text-sm font-medium">
                    Удалить связанные детали каскадом
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Удаляются только детали, которые больше не используются в других спецификациях/заданиях.
                  </p>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-11" onClick={() => setDeleteOpen(false)}>
              Отмена
            </Button>
            <Button className="h-11" onClick={() => void handleDeleteSpecification()} disabled={actionBusy}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Новая спецификация</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-2">
              <Label htmlFor="spec-number">Номер *</Label>
              <Input
                id="spec-number"
                className="h-11"
                placeholder="SP-2026-003"
                value={newSpecNumber}
                onChange={(event) => setNewSpecNumber(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="spec-customer">Клиент</Label>
              <Input
                id="spec-customer"
                className="h-11"
                placeholder="ООО Заказчик"
                value={newSpecCustomer}
                onChange={(event) => setNewSpecCustomer(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="spec-note">Примечание</Label>
              <Textarea
                id="spec-note"
                rows={2}
                placeholder="Комментарий к заказу"
                value={newSpecNote}
                onChange={(event) => setNewSpecNote(event.target.value)}
              />
            </div>

            <div className="rounded-lg border p-3 space-y-3">
              <div className="text-sm font-medium">Опционально: добавить 1 производственную позицию</div>
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_140px]">
                <div className="space-y-2">
                  <Label>Деталь</Label>
                  <Select value={newSpecPartId} onValueChange={setNewSpecPartId}>
                    <SelectTrigger className="h-11 w-full">
                      <SelectValue placeholder="Не добавлять сейчас" />
                    </SelectTrigger>
                    <SelectContent>
                      {parts
                        .filter((part) => !part.is_cooperation)
                        .map((part) => (
                          <SelectItem key={part.id} value={part.id}>
                            {part.code} • {part.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Кол-во</Label>
                  <Input
                    className="h-11"
                    type="number"
                    min={1}
                    value={newSpecQty}
                    onChange={(event) => setNewSpecQty(event.target.value)}
                    disabled={!newSpecPartId}
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              className="h-11"
              onClick={() => {
                setCreateOpen(false)
                clearCreateSpecificationForm()
              }}
            >
              Отмена
            </Button>
            <Button className="h-11" onClick={() => void handleCreateSpecification()} disabled={actionBusy}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Создать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
