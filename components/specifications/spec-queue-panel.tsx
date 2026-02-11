"use client"

import { useMemo, useState } from "react"
import type { Machine, WorkOrder } from "@/lib/types"
import { WORK_ORDER_STATUS_LABELS } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Progress } from "@/components/ui/progress"
import { StatusBadge } from "@/components/inventory/status-badge"
import { EmptyStateCard } from "@/components/specifications/empty-state-card"
import { Ban, CheckCircle2, Play, Timer, Wrench } from "lucide-react"

const LANES: Array<WorkOrder["status"]> = ["backlog", "queued", "in_progress", "blocked", "done"]

const STATUS_TONES: Record<WorkOrder["status"], "info" | "success" | "warning" | "danger"> = {
  backlog: "info",
  queued: "info",
  in_progress: "warning",
  blocked: "danger",
  done: "success",
  canceled: "warning",
}

const STATUS_LABELS: Record<WorkOrder["status"], string> = {
  ...WORK_ORDER_STATUS_LABELS,
  queued: "Ready",
}

const PRIORITY_TONES: Record<WorkOrder["priority"], "info" | "success" | "warning" | "danger"> = {
  low: "info",
  normal: "warning",
  high: "danger",
}

const PRIORITY_LABELS: Record<WorkOrder["priority"], string> = {
  low: "Низкий",
  normal: "Обычный",
  high: "Высокий",
}

interface SpecQueuePanelProps {
  workOrders: WorkOrder[]
  machines: Machine[]
  getPartTitle: (partId: string) => string
  getMachineName: (machineId?: string) => string
  getOperatorName: (operatorId?: string) => string
  onCreateOrders: () => void
  onHelp: () => void
  onSetReady: (orderId: string, machineId: string) => void
  onStart: (orderId: string) => void
  onReport: (orderId: string) => void
  onBlock: (orderId: string) => void
  onComplete: (orderId: string) => void
  canManageWorkOrders: boolean
  canStartOrder: (order: WorkOrder) => boolean
  canReportOrder: (order: WorkOrder) => boolean
  actionBusy?: boolean
}

function formatDateTime(value?: string): string {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleString("ru-RU")
}

export function SpecQueuePanel({
  workOrders,
  machines,
  getPartTitle,
  getMachineName,
  getOperatorName,
  onCreateOrders,
  onHelp,
  onSetReady,
  onStart,
  onReport,
  onBlock,
  onComplete,
  canManageWorkOrders,
  canStartOrder,
  canReportOrder,
  actionBusy,
}: SpecQueuePanelProps) {
  const [machineDraftByOrderId, setMachineDraftByOrderId] = useState<Record<string, string>>({})

  const lanes = useMemo(() => {
    const grouped: Record<WorkOrder["status"], WorkOrder[]> = {
      backlog: [],
      queued: [],
      in_progress: [],
      blocked: [],
      done: [],
      canceled: [],
    }
    for (const order of workOrders) {
      grouped[order.status].push(order)
    }
    for (const lane of Object.values(grouped)) {
      lane.sort((a, b) => (a.queue_pos ?? 9999) - (b.queue_pos ?? 9999))
    }
    return grouped
  }, [workOrders])

  if (workOrders.length === 0) {
    return (
      <EmptyStateCard
        title="Очередь ещё не создана"
        description="Очередь появится после создания заданий из производственных позиций. Затем можно назначить станок и запускать работу."
        actionLabel="Создать задания"
        onAction={onCreateOrders}
        onHelp={onHelp}
        icon={<Timer className="h-5 w-5" aria-hidden="true" />}
        disabled={actionBusy}
      />
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Очередь и задания</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 2xl:grid-cols-5 lg:grid-cols-2">
          {LANES.map((status) => (
            <div key={status} className="rounded-lg border p-2 space-y-2">
              <div className="flex items-center justify-between">
                <StatusBadge tone={STATUS_TONES[status]}>{STATUS_LABELS[status]}</StatusBadge>
                <span className="text-xs text-muted-foreground">{lanes[status].length}</span>
              </div>

              {lanes[status].length === 0 ? (
                <div className="rounded-md border border-dashed px-2 py-4 text-center text-xs text-muted-foreground">
                  Пусто
                </div>
              ) : (
                lanes[status].map((order) => {
                  const progress = order.qty_plan > 0 ? Math.min(100, Math.round((order.qty_done / order.qty_plan) * 100)) : 0
                  const machineId = machineDraftByOrderId[order.id] ?? order.machine_id

                  return (
                    <div key={order.id} className="rounded-lg border p-3 space-y-3">
                      <div className="space-y-1">
                        <div className="text-sm font-medium">{getPartTitle(order.part_id)}</div>
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge tone={PRIORITY_TONES[order.priority]}>{PRIORITY_LABELS[order.priority]}</StatusBadge>
                          {order.due_date && <StatusBadge tone="warning">Срок: {order.due_date}</StatusBadge>}
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
                        <div>Станок: {getMachineName(order.machine_id)}</div>
                        <div>Оператор: {getOperatorName(order.assigned_operator_id)}</div>
                        <div>Старт: {formatDateTime(order.started_at)}</div>
                        <div>Финиш: {formatDateTime(order.completed_at)}</div>
                        {order.block_reason && <div>Причина блока: {order.block_reason}</div>}
                      </div>

                      {canManageWorkOrders && (
                        <Select
                          value={machineId}
                          onValueChange={(value) => setMachineDraftByOrderId((prev) => ({ ...prev, [order.id]: value }))}
                        >
                          <SelectTrigger className="h-11 w-full">
                            <SelectValue placeholder="Выберите станок" />
                          </SelectTrigger>
                          <SelectContent>
                            {machines.map((machine) => (
                              <SelectItem key={machine.id} value={machine.id}>
                                {machine.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}

                      <div className="flex flex-wrap gap-2">
                        {canManageWorkOrders && (order.status === "backlog" || order.status === "blocked") && machineId && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-11"
                            onClick={() => onSetReady(order.id, machineId)}
                            disabled={actionBusy}
                            aria-label={`Перевести задание ${order.id} в Ready`}
                          >
                            <Timer className="h-4 w-4" aria-hidden="true" />
                            Ready
                          </Button>
                        )}

                        {canStartOrder(order) && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-11"
                            onClick={() => onStart(order.id)}
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
                            onClick={() => onReport(order.id)}
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
                            onClick={() => onBlock(order.id)}
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
                            onClick={() => onComplete(order.id)}
                            disabled={actionBusy}
                            aria-label={`Завершить задание ${order.id}`}
                          >
                            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                            Done
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
