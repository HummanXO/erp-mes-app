"use client"

import React from "react"

import { useMemo, useState } from "react"
import { useApp } from "@/lib/app-context"
import type { LogisticsEntry, MovementStatus, Part } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { StatusInsetStrip } from "@/components/ui/status-inset-strip"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { CheckCircle2, Search, Truck } from "lucide-react"
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

const ACTIVE_STATUSES = new Set<MovementStatus>(["sent", "in_transit"])
const RECEIVED_STATUSES = new Set<MovementStatus>(["received", "completed"])

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

function toDateInputValue(value?: string): string {
  if (!value) return ""
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ""
  const yyyy = parsed.getFullYear()
  const mm = String(parsed.getMonth() + 1).padStart(2, "0")
  const dd = String(parsed.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

function badgeTone(status: MovementStatus): string {
  if (RECEIVED_STATUSES.has(status)) return "border-[var(--status-success-border)] text-[var(--status-success-fg)]"
  if (status === "returned" || status === "cancelled") return "border-[var(--status-danger-border)] text-[var(--status-danger-fg)]"
  if (ACTIVE_STATUSES.has(status)) return "border-[var(--status-warning-border)] text-[var(--status-warning-fg)]"
  return "border-border text-muted-foreground"
}

export function LogisticsList({ part }: LogisticsListProps) {
  const { getLogisticsForPart, createLogisticsEntry, updateLogisticsEntry, permissions } = useApp()

  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<MovementStatus | "all">("all")
  const [actionError, setActionError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [showSendForm, setShowSendForm] = useState(false)
  const [sendPartner, setSendPartner] = useState(part.cooperation_partner || "")
  const [sendQty, setSendQty] = useState("")
  const [sendEta, setSendEta] = useState(toDateInputValue(part.cooperation_due_date || undefined))
  const [sendTracking, setSendTracking] = useState("")

  const logistics = getLogisticsForPart(part.id)

  const sortedLogistics = useMemo(
    () => [...logistics].sort((a, b) => movementTimestamp(b) - movementTimestamp(a)),
    [logistics]
  )

  const activeMovement = useMemo(
    () => sortedLogistics.find((entry) => ACTIVE_STATUSES.has((entry.status || "pending") as MovementStatus)),
    [sortedLogistics]
  )

  const latestMovement = sortedLogistics[0]

  const totalReceivedQty = useMemo(
    () =>
      sortedLogistics
        .filter((entry) => RECEIVED_STATUSES.has((entry.status || "pending") as MovementStatus))
        .reduce((sum, entry) => sum + (entry.qty_received ?? entry.qty_sent ?? entry.quantity ?? 0), 0),
    [sortedLogistics]
  )

  const canAcceptDelivery = Boolean(permissions.canManageLogistics && activeMovement)

  const filteredLogistics = useMemo(() => {
    let rows = sortedLogistics

    if (statusFilter !== "all") {
      rows = rows.filter((entry) => (entry.status || "pending") === statusFilter)
    }

    const query = searchQuery.trim().toLowerCase()
    if (!query) return rows

    return rows.filter((entry) =>
      [
        entry.from_holder,
        entry.to_holder,
        entry.from_location,
        entry.to_location,
        entry.tracking_number,
        entry.last_tracking_status,
        entry.notes,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    )
  }, [searchQuery, sortedLogistics, statusFilter])

  const handleAcceptDelivery = async (movement: LogisticsEntry) => {
    setActionError("")
    setIsSubmitting(true)

    const now = new Date().toISOString()
    const qtyReceived = movement.qty_received ?? movement.qty_sent ?? movement.quantity ?? 0

    try {
      await updateLogisticsEntry({
        ...movement,
        status: "received",
        received_at: now,
        qty_received: qtyReceived,
        updated_at: now,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось принять поставку"
      setActionError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCreateSend = async () => {
    if (!permissions.canManageLogistics) return

    const qty = Number(sendQty)
    if (!Number.isFinite(qty) || qty <= 0) {
      setActionError("Укажите корректное количество для отправки")
      return
    }

    setActionError("")
    setIsSubmitting(true)
    const now = new Date().toISOString()

    try {
      await createLogisticsEntry({
        part_id: part.id,
        status: "sent",
        type: "coop_out",
        from_location: "Производство",
        from_holder: "Производство",
        to_location: "Кооператор",
        to_holder: sendPartner.trim() || part.cooperation_partner || "Кооператор",
        planned_eta: sendEta ? `${sendEta}T00:00:00` : undefined,
        sent_at: now,
        qty_sent: qty,
        tracking_number: sendTracking.trim() || undefined,
        notes: "Создано из карточки логистики",
        created_at: now,
        updated_at: now,
      })

      setSendQty("")
      setSendTracking("")
      setShowSendForm(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось создать отправку"
      setActionError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const step2Status = activeMovement
    ? `В пути: ${STATUS_LABELS[(activeMovement.status || "pending") as MovementStatus]}`
    : latestMovement && RECEIVED_STATUSES.has((latestMovement.status || "pending") as MovementStatus)
      ? "Поставка принята"
      : "Ожидает отправки"

  const step3Status = totalReceivedQty >= part.qty_plan
    ? "Партия поступила полностью"
    : `Поступило ${totalReceivedQty} из ${part.qty_plan}`

  return (
    <div className="space-y-4">
      <Card className="gap-0 border shadow-none py-0">
        <CardHeader className="px-4 py-4 sm:px-6 sm:py-5">
          <CardTitle className="text-sm font-semibold">Логистические шаги</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div className="px-4 py-4 sm:px-6">
            <div className="text-xs text-muted-foreground">Шаг 1</div>
            <div className="mt-1 text-sm font-medium">У кооператора</div>
            <div className="mt-2 grid gap-1 text-sm text-muted-foreground sm:grid-cols-3">
              <span>Партнёр: {part.cooperation_partner || sendPartner || "Не указан"}</span>
              <span>Плановая дата: {formatDate(activeMovement?.planned_eta || part.cooperation_due_date || undefined)}</span>
              <span>План: {part.qty_plan.toLocaleString("ru-RU")} шт</span>
            </div>
          </div>

          <Separator />

          <div className="px-4 py-4 sm:px-6">
            <div className="text-xs text-muted-foreground">Шаг 2</div>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">В пути / Получение</div>
                <div className="mt-1 text-sm text-muted-foreground">{step2Status}</div>
                {activeMovement?.tracking_number ? (
                  <div className="mt-1 text-xs text-muted-foreground">Трек-номер: {activeMovement.tracking_number}</div>
                ) : null}
              </div>
              {canAcceptDelivery ? (
                <Button
                  type="button"
                  onClick={() => void handleAcceptDelivery(activeMovement as LogisticsEntry)}
                  disabled={isSubmitting}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  {isSubmitting ? "Принимаем..." : "Принять поставку"}
                </Button>
              ) : null}
            </div>
          </div>

          <Separator />

          <div className="px-4 py-4 sm:px-6">
            <div className="text-xs text-muted-foreground">Шаг 3</div>
            <div className="mt-1 text-sm font-medium">Склад / ОТК</div>
            <div className="mt-2 grid gap-1 text-sm text-muted-foreground sm:grid-cols-3">
              <span>{step3Status}</span>
              <span>Статус ОТК: {part.cooperation_qc_status === "accepted" ? "Принято" : part.cooperation_qc_status === "rejected" ? "Не принято" : "Не проведён"}</span>
              <span>Последнее движение: {formatDateTime(latestMovement?.updated_at || latestMovement?.created_at || latestMovement?.date)}</span>
            </div>
          </div>

          {permissions.canManageLogistics ? (
            <>
              <Separator />
              <div className="px-4 py-4 sm:px-6">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium">Новая отправка</div>
                  <Button
                    type="button"
                    variant="outline"
                    className="bg-transparent"
                    onClick={() => setShowSendForm((prev) => !prev)}
                  >
                    <Truck className="mr-2 h-4 w-4" />
                    {showSendForm ? "Скрыть" : "Оформить отправку"}
                  </Button>
                </div>
                {showSendForm ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="space-y-1">
                      <Label htmlFor="send-partner" className="text-xs text-muted-foreground">Партнёр</Label>
                      <Input
                        id="send-partner"
                        value={sendPartner}
                        onChange={(event) => setSendPartner(event.target.value)}
                        placeholder="Название партнёра"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="send-qty" className="text-xs text-muted-foreground">Количество</Label>
                      <Input
                        id="send-qty"
                        inputMode="numeric"
                        value={sendQty}
                        onChange={(event) => setSendQty(event.target.value)}
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="send-eta" className="text-xs text-muted-foreground">План ETA</Label>
                      <Input
                        id="send-eta"
                        type="date"
                        value={sendEta}
                        onChange={(event) => setSendEta(event.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="send-track" className="text-xs text-muted-foreground">Трекинг</Label>
                      <Input
                        id="send-track"
                        value={sendTracking}
                        onChange={(event) => setSendTracking(event.target.value)}
                        placeholder="Опционально"
                      />
                    </div>
                    <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
                      <Button type="button" onClick={() => void handleCreateSend()} disabled={isSubmitting}>
                        {isSubmitting ? "Сохраняем..." : "Сохранить отправку"}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </>
          ) : null}

          {activeMovement ? (
            <StatusInsetStrip tone="warning" className="mx-4 mb-4 sm:mx-6 sm:mb-5" title="Контроль поставки">
              Партия ещё в пути. Основное действие на этом этапе: принять поставку после фактического поступления.
            </StatusInsetStrip>
          ) : null}

          {actionError ? (
            <div className="px-4 pb-4 text-sm text-destructive sm:px-6" role="status" aria-live="polite">
              {actionError}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="gap-0 border shadow-none py-0">
        <CardHeader className="px-4 py-4 sm:px-6 sm:py-5">
          <CardTitle className="text-sm font-semibold">Журнал перемещений</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 px-4 pb-5 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Поиск по маршруту, партнёру, трекингу"
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as MovementStatus | "all")}> 
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Статус" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все статусы</SelectItem>
                {Object.entries(STATUS_LABELS).map(([status, label]) => (
                  <SelectItem key={status} value={status}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {filteredLogistics.length === 0 ? (
            <div className="rounded-md bg-muted/40 px-4 py-6 text-sm text-muted-foreground">
              Здесь появится история отправок и приёмок после первого движения по партии.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[170px] whitespace-nowrap">Дата</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Маршрут</TableHead>
                  <TableHead className="text-right">Кол-во</TableHead>
                  <TableHead>Трекинг</TableHead>
                  <TableHead className="w-[120px] text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogistics.map((entry) => {
                  const status = (entry.status || "pending") as MovementStatus
                  const qty = entry.qty_received ?? entry.qty_sent ?? entry.quantity ?? 0
                  const fromLabel = entry.from_holder || entry.from_location || "—"
                  const toLabel = entry.to_holder || entry.to_location || "—"
                  const canAcceptRow = permissions.canManageLogistics && ACTIVE_STATUSES.has(status)

                  return (
                    <TableRow key={entry.id} className="min-h-11">
                      <TableCell className="whitespace-nowrap">{formatDateTime(entry.updated_at || entry.created_at || entry.date)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("bg-transparent", badgeTone(status))}>
                          {STATUS_LABELS[status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{fromLabel}</span>
                        <span className="mx-2 text-muted-foreground">→</span>
                        <span className="text-sm">{toLabel}</span>
                      </TableCell>
                      <TableCell className="text-right font-medium">{qty.toLocaleString("ru-RU")}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{entry.tracking_number || "—"}</TableCell>
                      <TableCell className="text-right">
                        {canAcceptRow ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8"
                            onClick={() => void handleAcceptDelivery(entry)}
                            disabled={isSubmitting}
                          >
                            Принять
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
