"use client"

import React from "react"

import { useMemo, useState } from "react"
import { useApp } from "@/lib/app-context"
import type { LogisticsEntry, MovementStatus, Part, ProductionStage } from "@/lib/types"
import { STAGE_LABELS } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import {
  ArrowRightLeft,
  Ban,
  CheckCircle,
  Clock,
  RotateCw,
  Truck,
  Undo2,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface LogisticsListProps {
  part: Part
}

const STATUS_LABELS: Record<MovementStatus, string> = {
  sent: "Отправлено",
  in_transit: "В пути",
  received: "Получено",
  returned: "Возврат",
  cancelled: "Отменено",
  pending: "Черновик",
  completed: "Завершено",
}

const EXTERNAL_STAGE_FLOW: ProductionStage[] = ["galvanic", "heat_treatment", "grinding"]
const ACTIVE_MOVEMENT_STATUSES = new Set<MovementStatus>(["sent", "in_transit"])
const RECEIVED_MOVEMENT_STATUSES = new Set<MovementStatus>(["received", "completed"])
const ONE_DAY_MS = 24 * 60 * 60 * 1000
const COOP_FLOW_ID = "__cooperation__"

function normalizeMovementStatus(status: string | undefined): MovementStatus {
  if (!status) return "pending"
  return status as MovementStatus
}

function movementTimestamp(entry: LogisticsEntry): number {
  return new Date(
    entry.received_at ||
      entry.returned_at ||
      entry.cancelled_at ||
      entry.sent_at ||
      entry.updated_at ||
      entry.created_at ||
      entry.date ||
      new Date(0).toISOString()
  ).getTime()
}

function toDateOnly(value?: string): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
}

function formatDate(value?: string): string {
  if (!value) return "—"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return "—"
  return parsed.toLocaleDateString("ru-RU")
}

function formatDateTime(value?: string): string {
  if (!value) return "Дата не указана"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return "Дата не указана"
  return parsed.toLocaleString("ru-RU")
}

function toDateInputValue(value?: string): string {
  const date = toDateOnly(value)
  if (!date) return ""
  const yyyy = String(date.getFullYear())
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const dd = String(date.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

function buildEtaDelta(
  plannedEta?: string,
  receivedAt?: string,
  referenceDateIso?: string
): { label: string; tone: "ok" | "risk" | "neutral" } | null {
  const planned = toDateOnly(plannedEta)
  if (!planned) return null

  const actual = toDateOnly(receivedAt || referenceDateIso)
  if (!actual) return null

  const deltaDays = Math.ceil((actual.getTime() - planned.getTime()) / ONE_DAY_MS)
  if (deltaDays > 0) {
    return { label: `Задержка ${deltaDays} дн.`, tone: "risk" }
  }
  if (deltaDays < 0) {
    return { label: `Раньше на ${Math.abs(deltaDays)} дн.`, tone: "ok" }
  }
  return { label: "В срок", tone: "ok" }
}

type StageCardData = {
  stageId: string
  stage: ProductionStage
  stageStatus: string
  qtyReady: number
  percent: number
  latestMovement?: LogisticsEntry
  activeMovement?: LogisticsEntry
  lastReceivedMovement?: LogisticsEntry
  statusLabel: string
  statusTone: "ok" | "risk" | "neutral"
  lastPartner?: string
  etaLabel: string
  etaDelta: { label: string; tone: "ok" | "risk" | "neutral" } | null
}

export function LogisticsList({ part }: LogisticsListProps) {
  const {
    getLogisticsForPart,
    createLogisticsEntry,
    updateLogisticsEntry,
    permissions,
    demoDate,
  } = useApp()

  const logistics = getLogisticsForPart(part.id)
  const sortedLogistics = useMemo(
    () => [...logistics].sort((a, b) => movementTimestamp(b) - movementTimestamp(a)),
    [logistics]
  )

  const stageOptions = useMemo(
    () =>
      (part.stage_statuses || [])
        .filter((status) => Boolean(status.id) && EXTERNAL_STAGE_FLOW.includes(status.stage))
        .sort(
          (a, b) =>
            EXTERNAL_STAGE_FLOW.indexOf(a.stage) -
            EXTERNAL_STAGE_FLOW.indexOf(b.stage)
        ),
    [part.stage_statuses]
  )

  const stageNameById = useMemo(
    () =>
      new Map(
        (part.stage_statuses || [])
          .filter((status) => Boolean(status.id))
          .map((status) => [String(status.id), status.stage])
      ),
    [part.stage_statuses]
  )

  const stageCards: StageCardData[] = useMemo(
    () =>
      stageOptions.map((stageStatus) => {
        const stageId = String(stageStatus.id)
        const linked = sortedLogistics.filter((entry) => entry.stage_id === stageId)
        const active = linked.find((entry) =>
          ACTIVE_MOVEMENT_STATUSES.has(normalizeMovementStatus(entry.status))
        )
        const latest = linked[0]
        const lastReceived = linked.find((entry) =>
          RECEIVED_MOVEMENT_STATUSES.has(normalizeMovementStatus(entry.status))
        )

        const movementReadyQty = linked
          .filter((entry) => RECEIVED_MOVEMENT_STATUSES.has(normalizeMovementStatus(entry.status)))
          .reduce(
            (sum, entry) =>
              sum + (entry.qty_received ?? entry.qty_sent ?? entry.quantity ?? 0),
            0
          )

        const qtyReady =
          typeof stageStatus.qty_good === "number" ? stageStatus.qty_good : movementReadyQty
        const percent =
          part.qty_plan > 0
            ? Math.max(0, Math.min(100, Math.round((qtyReady / part.qty_plan) * 100)))
            : 0

        const plannedEta = active?.planned_eta || latest?.planned_eta
        const etaDelta = buildEtaDelta(
          plannedEta,
          lastReceived?.received_at,
          active ? `${demoDate}T00:00:00` : undefined
        )

        let statusLabel = "Не отправлено"
        let statusTone: StageCardData["statusTone"] = "neutral"

        if (active) {
          statusLabel = "У кооператора"
          statusTone = "neutral"
        } else if (stageStatus.status === "done" || lastReceived) {
          statusLabel = "Получено"
          statusTone = "ok"
        } else if (latest) {
          const latestStatus = normalizeMovementStatus(latest.status)
          statusLabel = STATUS_LABELS[latestStatus] || "Есть движение"
          statusTone = latestStatus === "cancelled" || latestStatus === "returned" ? "risk" : "neutral"
        }

        return {
          stageId,
          stage: stageStatus.stage,
          stageStatus: stageStatus.status,
          qtyReady,
          percent,
          latestMovement: latest,
          activeMovement: active,
          lastReceivedMovement: lastReceived,
          statusLabel,
          statusTone,
          lastPartner: active?.to_holder || latest?.to_holder,
          etaLabel: plannedEta ? formatDate(plannedEta) : "Не задан",
          etaDelta,
        }
      }),
    [demoDate, part.qty_plan, sortedLogistics, stageOptions]
  )

  const cooperationMovements = useMemo(
    () => sortedLogistics.filter((entry) => !entry.stage_id),
    [sortedLogistics]
  )

  const cooperationFlow = useMemo(() => {
    const active = cooperationMovements.find((entry) =>
      ACTIVE_MOVEMENT_STATUSES.has(normalizeMovementStatus(entry.status))
    )
    const latest = cooperationMovements[0]
    const lastReceived = cooperationMovements.find((entry) =>
      RECEIVED_MOVEMENT_STATUSES.has(normalizeMovementStatus(entry.status))
    )
    const qtyReceived = cooperationMovements
      .filter((entry) => RECEIVED_MOVEMENT_STATUSES.has(normalizeMovementStatus(entry.status)))
      .reduce((sum, entry) => sum + (entry.qty_received ?? entry.qty_sent ?? entry.quantity ?? 0), 0)

    const plannedEta = active?.planned_eta || part.cooperation_due_date || latest?.planned_eta
    const etaDelta = buildEtaDelta(
      plannedEta,
      lastReceived?.received_at,
      active ? `${demoDate}T00:00:00` : undefined
    )

    let statusLabel = "Не отправлено"
    let statusTone: "ok" | "risk" | "neutral" = "neutral"

    if (active) {
      statusLabel = "У кооператора"
    } else if (lastReceived) {
      statusLabel = "Получено"
      statusTone = "ok"
    } else if (latest) {
      const latestStatus = normalizeMovementStatus(latest.status)
      statusLabel = STATUS_LABELS[latestStatus] || "Есть движение"
      if (latestStatus === "cancelled" || latestStatus === "returned") {
        statusTone = "risk"
      }
    }

    return {
      activeMovement: active,
      latestMovement: latest,
      lastReceivedMovement: lastReceived,
      qtyReceived,
      statusLabel,
      statusTone,
      partner: active?.to_holder || latest?.to_holder || part.cooperation_partner || "—",
      etaLabel: plannedEta ? formatDate(plannedEta) : "Не задан",
      etaDelta,
    }
  }, [cooperationMovements, demoDate, part.cooperation_due_date, part.cooperation_partner])

  const hasCooperationFlow = part.is_cooperation
  const hasStageFlow = stageCards.length > 0

  const [sendStageId, setSendStageId] = useState<string | null>(null)
  const [sendPartner, setSendPartner] = useState("")
  const [sendQty, setSendQty] = useState("")
  const [sendEta, setSendEta] = useState("")
  const [sendTracking, setSendTracking] = useState("")
  const [sendCarrier, setSendCarrier] = useState("CDEK")
  const [sendNotes, setSendNotes] = useState("")

  const [receivingMovementId, setReceivingMovementId] = useState<string | null>(null)
  const [receiveQty, setReceiveQty] = useState("")
  const [editingEtaMovementId, setEditingEtaMovementId] = useState<string | null>(null)
  const [actionError, setActionError] = useState("")

  const [etaDrafts, setEtaDrafts] = useState<Record<string, string>>({})

  const getEtaDraft = (entry: LogisticsEntry) =>
    etaDrafts[entry.id] ?? toDateInputValue(entry.planned_eta)

  const toErrorMessage = (error: unknown): string => {
    if (error instanceof Error && error.message.trim()) {
      return error.message
    }
    return "Не удалось выполнить действие. Обновите страницу и повторите."
  }

  const handleEtaChange = (entryId: string, value: string) => {
    setEtaDrafts((prev) => ({ ...prev, [entryId]: value }))
  }

  const handleSaveEta = async (entry: LogisticsEntry) => {
    try {
      const draft = getEtaDraft(entry)
      await updateLogisticsEntry({
        ...entry,
        planned_eta: draft ? new Date(`${draft}T00:00:00`).toISOString() : undefined,
      })
      setEditingEtaMovementId(null)
      setActionError("")
    } catch (error) {
      setActionError(toErrorMessage(error))
    }
  }

  const openSendForm = (card: StageCardData) => {
    const qtyRemaining = Math.max(part.qty_plan - card.qtyReady, 0)
    setSendStageId(card.stageId)
    setSendPartner(card.lastPartner || "")
    setSendQty(qtyRemaining > 0 ? String(qtyRemaining) : "")
    setSendEta("")
    setSendTracking("")
    setSendCarrier("CDEK")
    setSendNotes("")
    setEditingEtaMovementId(null)
    setActionError("")
  }

  const openCooperationSendForm = () => {
    const qtyRemaining = Math.max(part.qty_plan - cooperationFlow.qtyReceived, 0)
    setSendStageId(COOP_FLOW_ID)
    setSendPartner(part.cooperation_partner || cooperationFlow.partner || "")
    setSendQty(qtyRemaining > 0 ? String(qtyRemaining) : "")
    setSendEta(toDateInputValue(part.cooperation_due_date || cooperationFlow.latestMovement?.planned_eta))
    setSendTracking("")
    setSendCarrier("CDEK")
    setSendNotes("")
    setEditingEtaMovementId(null)
    setActionError("")
  }

  const handleSendToStage = async () => {
    if (!sendStageId) return
    const isCooperationSend = sendStageId === COOP_FLOW_ID
    const card = isCooperationSend
      ? undefined
      : stageCards.find((item) => item.stageId === sendStageId)
    if (!isCooperationSend && !card) return

    const qtyValue = Number.parseInt(sendQty, 10)
    if (!Number.isFinite(qtyValue) || qtyValue <= 0) {
      setActionError("Укажите корректное количество для отправки")
      return
    }
    if (!sendPartner.trim()) {
      setActionError("Укажите кооператора/получателя")
      return
    }

    const remainingQty = isCooperationSend
      ? Math.max(part.qty_plan - cooperationFlow.qtyReceived, 0)
      : Math.max(part.qty_plan - (card?.qtyReady || 0), 0)
    if (remainingQty <= 0) {
      setActionError("Отправка недоступна: остаток для отправки равен 0")
      return
    }
    if (qtyValue > remainingQty) {
      setActionError(`Нельзя отправить больше остатка: доступно ${remainingQty} шт`)
      return
    }

    try {
      const toLocation = isCooperationSend ? "Кооперация" : STAGE_LABELS[card!.stage]
      const description = isCooperationSend
        ? "Отправка кооператору"
        : `Отправка на этап: ${STAGE_LABELS[card!.stage]}`

      await createLogisticsEntry({
        part_id: part.id,
        status: "sent",
        from_location: "Цех",
        from_holder: "Производство",
        to_location: toLocation,
        to_holder: sendPartner.trim(),
        carrier: sendCarrier.trim() || undefined,
        tracking_number: sendTracking.trim() || undefined,
        planned_eta: sendEta ? new Date(`${sendEta}T00:00:00`).toISOString() : undefined,
        qty_sent: qtyValue,
        stage_id: isCooperationSend ? undefined : sendStageId,
        description,
        type: "coop_out",
        counterparty: sendPartner.trim(),
        notes: sendNotes.trim() || undefined,
        date: new Date().toISOString().split("T")[0],
      })

      setSendStageId(null)
      setSendPartner("")
      setSendQty("")
      setSendEta("")
      setSendTracking("")
      setSendCarrier("CDEK")
      setSendNotes("")
      setActionError("")
    } catch (error) {
      setActionError(toErrorMessage(error))
    }
  }

  const handleStartReceive = (movement: LogisticsEntry) => {
    setReceivingMovementId(movement.id)
    setReceiveQty(String(movement.qty_sent ?? ""))
    setEditingEtaMovementId(null)
    setActionError("")
  }

  const handleConfirmReceive = async () => {
    if (!receivingMovementId) return
    const movement = sortedLogistics.find((entry) => entry.id === receivingMovementId)
    if (!movement) return

    const parsedQty = receiveQty ? Number.parseInt(receiveQty, 10) : undefined
    if (parsedQty !== undefined && (!Number.isFinite(parsedQty) || parsedQty < 0)) {
      setActionError("Укажите корректное количество приёмки")
      return
    }
    if (
      parsedQty !== undefined &&
      movement.qty_sent !== undefined &&
      parsedQty > movement.qty_sent
    ) {
      setActionError(`Нельзя принять больше отправленного: ${movement.qty_sent} шт`)
      return
    }

    try {
      await updateLogisticsEntry({
        ...movement,
        status: "received",
        qty_received: parsedQty ?? movement.qty_sent,
      })

      setReceivingMovementId(null)
      setReceiveQty("")
      setActionError("")
    } catch (error) {
      setActionError(toErrorMessage(error))
    }
  }

  const handleReceiveFromHistory = async (entry: LogisticsEntry) => {
    const parsedQty = receiveQty ? Number.parseInt(receiveQty, 10) : undefined
    if (parsedQty !== undefined && (!Number.isFinite(parsedQty) || parsedQty < 0)) {
      setActionError("Укажите корректное количество приёмки")
      return
    }
    if (
      parsedQty !== undefined &&
      entry.qty_sent !== undefined &&
      parsedQty > entry.qty_sent
    ) {
      setActionError(`Нельзя принять больше отправленного: ${entry.qty_sent} шт`)
      return
    }

    try {
      await updateLogisticsEntry({
        ...entry,
        status: "received",
        qty_received: parsedQty ?? entry.qty_sent,
      })
      setReceivingMovementId(null)
      setReceiveQty("")
      setActionError("")
    } catch (error) {
      setActionError(toErrorMessage(error))
    }
  }

  const statusTone = (status: MovementStatus) => {
    if (status === "received" || status === "completed") {
      return "text-green-700 border-green-200 bg-green-50/40"
    }
    if (status === "in_transit") {
      return "text-blue-700 border-blue-200 bg-blue-50/40"
    }
    if (status === "returned") {
      return "text-amber-700 border-amber-200 bg-amber-50/40"
    }
    if (status === "cancelled") {
      return "text-zinc-700 border-zinc-200 bg-zinc-50/40"
    }
    return "text-indigo-700 border-indigo-200 bg-indigo-50/40"
  }

  const statusIcon = (status: MovementStatus) => {
    if (status === "received" || status === "completed") {
      return <CheckCircle className="mr-1 h-3 w-3" />
    }
    if (status === "in_transit") {
      return <RotateCw className="mr-1 h-3 w-3" />
    }
    if (status === "returned") {
      return <Undo2 className="mr-1 h-3 w-3" />
    }
    if (status === "cancelled") {
      return <Ban className="mr-1 h-3 w-3" />
    }
    return <Clock className="mr-1 h-3 w-3" />
  }

  return (
    <div className="space-y-4">
      {hasCooperationFlow && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4" />
              Кооперация
            </CardTitle>
            <div className="text-xs text-muted-foreground">
              Отправка и приёмка по кооператору. Ручной ввод ниже используйте только для нестандартных перемещений.
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div
              className={cn(
                "rounded-lg border p-3 space-y-3",
                cooperationFlow.statusTone === "ok" && "border-green-200 bg-green-50/40",
                cooperationFlow.statusTone === "risk" && "border-amber-200 bg-amber-50/40",
                cooperationFlow.statusTone === "neutral" && "border-border bg-muted/20"
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">{cooperationFlow.partner}</div>
                  <div className="text-xs text-muted-foreground">Статус кооперации: {cooperationFlow.statusLabel}</div>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    cooperationFlow.statusTone === "ok" && "border-green-600 text-green-700",
                    cooperationFlow.statusTone === "risk" && "border-amber-600 text-amber-700",
                    cooperationFlow.statusTone === "neutral" && "border-muted-foreground/40 text-muted-foreground"
                  )}
                >
                  {cooperationFlow.statusLabel}
                </Badge>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Поступило от кооператора</span>
                  <span>{cooperationFlow.qtyReceived.toLocaleString()} / {part.qty_plan.toLocaleString()} шт</span>
                </div>
                <Progress
                  value={
                    part.qty_plan > 0
                      ? Math.max(
                          0,
                          Math.min(100, Math.round((cooperationFlow.qtyReceived / part.qty_plan) * 100))
                        )
                      : 0
                  }
                  className="h-1.5"
                />
              </div>

              <div className="grid grid-cols-1 gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-md bg-background/70 p-2">
                  <div>Ориентир поступления</div>
                  <div className="mt-1 text-sm font-medium text-foreground">{cooperationFlow.etaLabel}</div>
                </div>
                <div className="rounded-md bg-background/70 p-2">
                  <div>Факт поступления</div>
                  <div className="mt-1 text-sm font-medium text-foreground">
                    {cooperationFlow.lastReceivedMovement
                      ? formatDate(cooperationFlow.lastReceivedMovement.received_at)
                      : "—"}
                  </div>
                </div>
                <div className="rounded-md bg-background/70 p-2">
                  <div>Отклонение по сроку</div>
                  <div
                    className={cn(
                      "mt-1 text-sm font-medium",
                      cooperationFlow.etaDelta?.tone === "ok" && "text-green-700",
                      cooperationFlow.etaDelta?.tone === "risk" && "text-amber-700",
                      (!cooperationFlow.etaDelta || cooperationFlow.etaDelta.tone === "neutral") && "text-foreground"
                    )}
                  >
                    {cooperationFlow.etaDelta?.label || "—"}
                  </div>
                </div>
                <div className="rounded-md bg-background/70 p-2">
                  <div>Текущий держатель</div>
                  <div className="mt-1 text-sm font-medium text-foreground">{cooperationFlow.partner || "—"}</div>
                </div>
              </div>

              {permissions.canEditFacts && sendStageId !== COOP_FLOW_ID && (
                <div className="flex flex-wrap items-center gap-2">
                  {!cooperationFlow.activeMovement && (
                    <Button type="button" className="h-8" onClick={openCooperationSendForm}>
                      Отправить
                    </Button>
                  )}

                  {cooperationFlow.activeMovement &&
                    receivingMovementId !== cooperationFlow.activeMovement.id && (
                      <Button
                        type="button"
                        className="h-8"
                        onClick={() => handleStartReceive(cooperationFlow.activeMovement!)}
                      >
                        Принять
                      </Button>
                    )}

                  {cooperationFlow.activeMovement && (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-8"
                      onClick={() =>
                        setEditingEtaMovementId((prev) =>
                          prev === cooperationFlow.activeMovement!.id
                            ? null
                            : cooperationFlow.activeMovement!.id
                        )
                      }
                    >
                      Срок
                    </Button>
                  )}
                </div>
              )}

              {permissions.canEditFacts &&
                cooperationFlow.activeMovement &&
                editingEtaMovementId === cooperationFlow.activeMovement.id && (
                  <div className="rounded-md border bg-background p-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[220px_auto_auto] sm:items-end">
                      <div className="space-y-1">
                        <Label
                          htmlFor={`eta-cooperation-${cooperationFlow.activeMovement.id}`}
                          className="text-xs text-muted-foreground"
                        >
                          Ориентир поступления
                        </Label>
                        <Input
                          id={`eta-cooperation-${cooperationFlow.activeMovement.id}`}
                          type="date"
                          className="h-9"
                          value={getEtaDraft(cooperationFlow.activeMovement)}
                          onChange={(event) =>
                            handleEtaChange(cooperationFlow.activeMovement!.id, event.target.value)
                          }
                        />
                      </div>
                      <Button
                        type="button"
                        className="h-9"
                        onClick={() => void handleSaveEta(cooperationFlow.activeMovement)}
                      >
                        Сохранить срок
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9"
                        onClick={() => setEditingEtaMovementId(null)}
                      >
                        Отмена
                      </Button>
                    </div>
                  </div>
                )}

              {permissions.canEditFacts && sendStageId === COOP_FLOW_ID && (
                <div className="rounded-md border bg-background p-3 space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="send-partner-cooperation">Кооператор</Label>
                      <Input
                        id="send-partner-cooperation"
                        placeholder="Например: ПК Реном"
                        value={sendPartner}
                        onChange={(event) => setSendPartner(event.target.value)}
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="send-qty-cooperation">Количество</Label>
                      <Input
                        id="send-qty-cooperation"
                        type="number"
                        placeholder="шт"
                        value={sendQty}
                        onChange={(event) => setSendQty(event.target.value)}
                        className="h-9"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="send-eta-cooperation">Ориентир поступления</Label>
                      <Input
                        id="send-eta-cooperation"
                        type="date"
                        value={sendEta}
                        onChange={(event) => setSendEta(event.target.value)}
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="send-tracking-cooperation">Трек / накладная</Label>
                      <Input
                        id="send-tracking-cooperation"
                        placeholder="Номер отслеживания"
                        value={sendTracking}
                        onChange={(event) => setSendTracking(event.target.value)}
                        className="h-9"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="send-carrier-cooperation">Перевозчик</Label>
                      <Input
                        id="send-carrier-cooperation"
                        placeholder="Например: CDEK"
                        value={sendCarrier}
                        onChange={(event) => setSendCarrier(event.target.value)}
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="send-notes-cooperation">Примечание</Label>
                      <Input
                        id="send-notes-cooperation"
                        placeholder="Опционально"
                        value={sendNotes}
                        onChange={(event) => setSendNotes(event.target.value)}
                        className="h-9"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button type="button" variant="outline" className="h-9" onClick={() => setSendStageId(null)}>
                      Отмена
                    </Button>
                    <Button type="button" className="h-9" onClick={() => void handleSendToStage()}>
                      Отправить
                    </Button>
                  </div>
                </div>
              )}

              {permissions.canEditFacts &&
                cooperationFlow.activeMovement &&
                receivingMovementId === cooperationFlow.activeMovement.id && (
                  <div className="rounded-md border bg-background p-3 space-y-2">
                    <div className="text-sm font-medium">Приёмка от кооператора</div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[200px_auto_auto] sm:items-end">
                      <div className="space-y-1">
                        <Label htmlFor={`receive-qty-cooperation-${cooperationFlow.activeMovement.id}`}>
                          Принято, шт
                        </Label>
                        <Input
                          id={`receive-qty-cooperation-${cooperationFlow.activeMovement.id}`}
                          type="number"
                          value={receiveQty}
                          onChange={(event) => setReceiveQty(event.target.value)}
                          className="h-9"
                        />
                      </div>
                      <Button type="button" className="h-9" onClick={() => void handleConfirmReceive()}>
                        Подтвердить приёмку
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9"
                        onClick={() => {
                          setReceivingMovementId(null)
                          setReceiveQty("")
                        }}
                      >
                        Отмена
                      </Button>
                    </div>
                  </div>
                )}
            </div>

            {actionError && <div className="text-sm text-destructive">{actionError}</div>}
          </CardContent>
        </Card>
      )}

      {hasStageFlow && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4" />
              Внешние этапы
            </CardTitle>
            <div className="text-xs text-muted-foreground">
              Для этапов на стороне используйте кнопки «Отправить» и «Принять». Журнал ниже формируется автоматически.
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {stageCards.map((card) => {
              const toneClass =
                card.statusTone === "ok"
                  ? "border-green-200 bg-green-50/40"
                  : card.statusTone === "risk"
                    ? "border-amber-200 bg-amber-50/40"
                    : "border-border bg-muted/20"

              const activeMovement = card.activeMovement

              return (
                <div key={card.stageId} className={cn("rounded-lg border p-3 space-y-3", toneClass)}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium">{STAGE_LABELS[card.stage]}</div>
                      <div className="text-xs text-muted-foreground">Статус этапа: {card.statusLabel}</div>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        card.statusTone === "ok" && "border-green-600 text-green-700",
                        card.statusTone === "risk" && "border-amber-600 text-amber-700",
                        card.statusTone === "neutral" && "border-muted-foreground/40 text-muted-foreground"
                      )}
                    >
                      {card.statusLabel}
                    </Badge>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Готово по этапу</span>
                      <span>{card.qtyReady.toLocaleString()} / {part.qty_plan.toLocaleString()} шт</span>
                    </div>
                    <Progress value={card.percent} className="h-1.5" />
                  </div>

                  <div className="grid grid-cols-1 gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-md bg-background/70 p-2">
                      <div>Ориентир поступления</div>
                      <div className="mt-1 text-sm font-medium text-foreground">{card.etaLabel}</div>
                    </div>
                    <div className="rounded-md bg-background/70 p-2">
                      <div>Факт поступления</div>
                      <div className="mt-1 text-sm font-medium text-foreground">
                        {card.lastReceivedMovement ? formatDate(card.lastReceivedMovement.received_at) : "—"}
                      </div>
                    </div>
                    <div className="rounded-md bg-background/70 p-2">
                      <div>Отклонение по сроку</div>
                      <div
                        className={cn(
                          "mt-1 text-sm font-medium",
                          card.etaDelta?.tone === "ok" && "text-green-700",
                          card.etaDelta?.tone === "risk" && "text-amber-700",
                          (!card.etaDelta || card.etaDelta.tone === "neutral") && "text-foreground"
                        )}
                      >
                        {card.etaDelta?.label || "—"}
                      </div>
                    </div>
                    <div className="rounded-md bg-background/70 p-2">
                      <div>Последний кооператор</div>
                      <div className="mt-1 text-sm font-medium text-foreground">{card.lastPartner || "—"}</div>
                    </div>
                  </div>

                  {permissions.canEditFacts && sendStageId !== card.stageId && (
                    <div className="flex flex-wrap items-center gap-2">
                      {!activeMovement && card.stageStatus !== "done" && (
                        <Button type="button" className="h-8" onClick={() => openSendForm(card)}>
                          Отправить
                        </Button>
                      )}

                      {activeMovement && receivingMovementId !== activeMovement.id && (
                        <Button type="button" className="h-8" onClick={() => handleStartReceive(activeMovement)}>
                          Принять
                        </Button>
                      )}

                      {activeMovement && (
                        <Button
                          type="button"
                          variant="outline"
                          className="h-8"
                          onClick={() =>
                            setEditingEtaMovementId((prev) =>
                              prev === activeMovement.id ? null : activeMovement.id
                            )
                          }
                        >
                          Срок
                        </Button>
                      )}
                    </div>
                  )}

                  {permissions.canEditFacts &&
                    activeMovement &&
                    editingEtaMovementId === activeMovement.id && (
                      <div className="rounded-md border bg-background p-3">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[220px_auto_auto] sm:items-end">
                          <div className="space-y-1">
                            <Label
                              htmlFor={`eta-stage-${activeMovement.id}`}
                              className="text-xs text-muted-foreground"
                            >
                              Ориентир поступления
                            </Label>
                            <Input
                              id={`eta-stage-${activeMovement.id}`}
                              type="date"
                              className="h-9"
                              value={getEtaDraft(activeMovement)}
                              onChange={(event) => handleEtaChange(activeMovement.id, event.target.value)}
                            />
                          </div>
                          <Button
                            type="button"
                            className="h-9"
                            onClick={() => void handleSaveEta(activeMovement)}
                          >
                            Сохранить срок
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-9"
                            onClick={() => setEditingEtaMovementId(null)}
                          >
                            Отмена
                          </Button>
                        </div>
                      </div>
                    )}

                  {permissions.canEditFacts && sendStageId === card.stageId && (
                    <div className="rounded-md border bg-background p-3 space-y-3">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label htmlFor={`send-partner-${card.stageId}`}>Кооператор</Label>
                          <Input
                            id={`send-partner-${card.stageId}`}
                            placeholder="Например: ПК Реном"
                            value={sendPartner}
                            onChange={(event) => setSendPartner(event.target.value)}
                            className="h-9"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`send-qty-${card.stageId}`}>Количество</Label>
                          <Input
                            id={`send-qty-${card.stageId}`}
                            type="number"
                            placeholder="шт"
                            value={sendQty}
                            onChange={(event) => setSendQty(event.target.value)}
                            className="h-9"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label htmlFor={`send-eta-${card.stageId}`}>Ориентир поступления</Label>
                          <Input
                            id={`send-eta-${card.stageId}`}
                            type="date"
                            value={sendEta}
                            onChange={(event) => setSendEta(event.target.value)}
                            className="h-9"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`send-tracking-${card.stageId}`}>Трек / накладная</Label>
                          <Input
                            id={`send-tracking-${card.stageId}`}
                            placeholder="Номер отслеживания"
                            value={sendTracking}
                            onChange={(event) => setSendTracking(event.target.value)}
                            className="h-9"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label htmlFor={`send-carrier-${card.stageId}`}>Перевозчик</Label>
                          <Input
                            id={`send-carrier-${card.stageId}`}
                            placeholder="Например: CDEK"
                            value={sendCarrier}
                            onChange={(event) => setSendCarrier(event.target.value)}
                            className="h-9"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`send-notes-${card.stageId}`}>Примечание</Label>
                          <Input
                            id={`send-notes-${card.stageId}`}
                            placeholder="Опционально"
                            value={sendNotes}
                            onChange={(event) => setSendNotes(event.target.value)}
                            className="h-9"
                          />
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button type="button" variant="outline" className="h-9" onClick={() => setSendStageId(null)}>
                          Отмена
                        </Button>
                        <Button type="button" className="h-9" onClick={() => void handleSendToStage()}>
                          Отправить
                        </Button>
                      </div>
                    </div>
                  )}

                  {permissions.canEditFacts && activeMovement && receivingMovementId === activeMovement.id && (
                    <div className="rounded-md border bg-background p-3 space-y-2">
                      <div className="text-sm font-medium">Приёмка с этапа {STAGE_LABELS[card.stage]}</div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[200px_auto_auto] sm:items-end">
                        <div className="space-y-1">
                          <Label htmlFor={`receive-qty-${activeMovement.id}`}>Принято, шт</Label>
                          <Input
                            id={`receive-qty-${activeMovement.id}`}
                            type="number"
                            value={receiveQty}
                            onChange={(event) => setReceiveQty(event.target.value)}
                            className="h-9"
                          />
                        </div>
                        <Button type="button" className="h-9" onClick={() => void handleConfirmReceive()}>
                          Подтвердить приёмку
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-9"
                          onClick={() => {
                            setReceivingMovementId(null)
                            setReceiveQty("")
                          }}
                        >
                          Отмена
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            {actionError && <div className="text-sm text-destructive">{actionError}</div>}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Truck className="h-4 w-4" />
            Журнал перемещений ({logistics.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sortedLogistics.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Нет перемещений</p>
          ) : (
            <div className="space-y-3">
              {sortedLogistics.map((entry) => {
                const status = normalizeMovementStatus(entry.status)
                const stageName = entry.stage_id ? stageNameById.get(entry.stage_id) : undefined
                const timelineDate =
                  entry.received_at ||
                  entry.returned_at ||
                  entry.cancelled_at ||
                  entry.sent_at ||
                  entry.updated_at ||
                  entry.created_at ||
                  entry.date

                const etaDelta = buildEtaDelta(
                  entry.planned_eta,
                  entry.received_at,
                  ACTIVE_MOVEMENT_STATUSES.has(status) ? `${demoDate}T00:00:00` : undefined
                )

                return (
                  <div key={entry.id} className={cn("p-3 rounded-lg border", statusTone(status))}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{entry.description || "Перемещение"}</div>
                        <div className="text-sm text-muted-foreground">
                          {(entry.from_holder || entry.from_location || "Источник не указан")} {" -> "}
                          {(entry.to_holder || entry.to_location || "Назначение не указано")}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          {stageName && <span>Этап: {STAGE_LABELS[stageName]}</span>}
                          {entry.qty_sent !== undefined && <span>Отправлено: {entry.qty_sent} шт</span>}
                          {entry.qty_received !== undefined && <span>Получено: {entry.qty_received} шт</span>}
                          {entry.planned_eta && <span>Ориентир: {formatDate(entry.planned_eta)}</span>}
                          {etaDelta && (
                            <span
                              className={cn(
                                etaDelta.tone === "ok" && "text-green-700",
                                etaDelta.tone === "risk" && "text-amber-700"
                              )}
                            >
                              {etaDelta.label}
                            </span>
                          )}
                          {entry.tracking_number && (
                            <span>
                              {entry.carrier ? `${entry.carrier.toUpperCase()} • ` : ""}Трек: {entry.tracking_number}
                            </span>
                          )}
                        </div>
                        {entry.notes && <div className="mt-1 text-xs text-muted-foreground">{entry.notes}</div>}
                        <div className="mt-1 text-xs text-muted-foreground">{formatDateTime(timelineDate)}</div>
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        <Badge variant="outline">
                          {statusIcon(status)}
                          {STATUS_LABELS[status]}
                        </Badge>

                        {permissions.canEditFacts && ACTIVE_MOVEMENT_STATUSES.has(status) && (
                          <Button
                            type="button"
                            className="h-8 text-xs"
                            onClick={() => {
                              setReceivingMovementId(entry.id)
                              setReceiveQty(String(entry.qty_sent ?? ""))
                              setEditingEtaMovementId(null)
                            }}
                          >
                            Принять
                          </Button>
                        )}

                      </div>
                    </div>

                    {permissions.canEditFacts && receivingMovementId === entry.id && (
                      <div className="mt-3 rounded-md border bg-background p-3">
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[180px_auto_auto] sm:items-end">
                          <div className="space-y-1">
                            <Label htmlFor={`receive-history-${entry.id}`}>Принято, шт</Label>
                            <Input
                              id={`receive-history-${entry.id}`}
                              type="number"
                              value={receiveQty}
                              onChange={(event) => setReceiveQty(event.target.value)}
                              className="h-8"
                            />
                          </div>
                          <Button
                            type="button"
                            className="h-8"
                            onClick={() => void handleReceiveFromHistory(entry)}
                          >
                            Подтвердить
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8"
                            onClick={() => {
                              setReceivingMovementId(null)
                              setReceiveQty("")
                            }}
                          >
                            Отмена
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
