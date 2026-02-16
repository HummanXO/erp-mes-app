"use client"

import React from "react"

import { useState, useId } from "react"
import { useApp } from "@/lib/app-context"
import type { Part, LogisticsEntry, MovementStatus } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { 
  Plus, 
  Truck, 
  CheckCircle,
  Clock,
  RotateCw,
  Undo2,
  Ban
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
  pending: "Ожидание",
  completed: "Завершено",
}

export function LogisticsList({ part }: LogisticsListProps) {
  const { getLogisticsForPart, createLogisticsEntry, updateLogisticsEntry, permissions } = useApp()
  
  const logistics = getLogisticsForPart(part.id)
  const [isCreating, setIsCreating] = useState(false)
  const [etaDrafts, setEtaDrafts] = useState<Record<string, string>>({})
  
  // Form state
  const [fromLocation, setFromLocation] = useState("")
  const [fromHolder, setFromHolder] = useState("")
  const [toLocation, setToLocation] = useState("")
  const [toHolder, setToHolder] = useState("")
  const [carrier, setCarrier] = useState("")
  const [description, setDescription] = useState("")
  const [quantitySent, setQuantitySent] = useState("")
  const [plannedEta, setPlannedEta] = useState("")
  const [trackingNumber, setTrackingNumber] = useState("")
  const [notes, setNotes] = useState("")
  const formId = useId()
  const fromLocationId = `${formId}-from-location`
  const fromHolderId = `${formId}-from-holder`
  const toLocationId = `${formId}-to-location`
  const toHolderId = `${formId}-to-holder`
  const carrierId = `${formId}-carrier`
  const descriptionId = `${formId}-description`
  const quantityId = `${formId}-qty-sent`
  const etaId = `${formId}-planned-eta`
  const trackingId = `${formId}-tracking`
  const notesId = `${formId}-notes`
  
  const handleCreate = async () => {
    await createLogisticsEntry({
      part_id: part.id,
      status: "sent",
      from_location: fromLocation || undefined,
      from_holder: fromHolder || undefined,
      to_location: toLocation || undefined,
      to_holder: toHolder || undefined,
      carrier: carrier || undefined,
      tracking_number: trackingNumber || undefined,
      planned_eta: plannedEta ? new Date(`${plannedEta}T00:00:00`).toISOString() : undefined,
      qty_sent: quantitySent ? Number.parseInt(quantitySent, 10) : undefined,
      description: description || "Перемещение",
      type: part.is_cooperation ? "coop_out" : "shipping_out",
      counterparty: toHolder || toLocation || undefined,
      notes: notes || undefined,
      date: new Date().toISOString().split("T")[0],
    })
    
    // Reset form
    setFromLocation("")
    setFromHolder("")
    setToLocation("")
    setToHolder("")
    setCarrier("")
    setDescription("")
    setQuantitySent("")
    setPlannedEta("")
    setTrackingNumber("")
    setNotes("")
    setIsCreating(false)
  }
  
  const handleStatusUpdate = async (entry: LogisticsEntry, newStatus: MovementStatus) => {
    await updateLogisticsEntry({
      ...entry,
      status: newStatus,
      qty_received: newStatus === "received" ? (entry.qty_received ?? entry.qty_sent) : entry.qty_received,
    })
  }

  const dateInputFromIso = (value?: string) => {
    if (!value) return ""
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return ""
    return parsed.toISOString().slice(0, 10)
  }

  const getEtaDraft = (entry: LogisticsEntry) => etaDrafts[entry.id] ?? dateInputFromIso(entry.planned_eta)

  const handleEtaChange = (entryId: string, value: string) => {
    setEtaDrafts((prev) => ({ ...prev, [entryId]: value }))
  }

  const handleSaveEta = async (entry: LogisticsEntry) => {
    const draft = getEtaDraft(entry)
    await updateLogisticsEntry({
      ...entry,
      planned_eta: draft ? new Date(`${draft}T00:00:00`).toISOString() : undefined,
    })
  }

  // Sort by movement timestamp descending
  const sortedLogistics = [...logistics].sort((a, b) => 
    new Date(
      b.sent_at || b.created_at || b.updated_at || b.date || new Date(0).toISOString()
    ).getTime() - new Date(
      a.sent_at || a.created_at || a.updated_at || a.date || new Date(0).toISOString()
    ).getTime()
  )

  const statusTone = (status: MovementStatus) => {
    const normalized = status
    if (normalized === "received") return "text-green-600 border-green-600 bg-green-500/5 border-green-200"
    if (normalized === "in_transit") return "text-blue-600 border-blue-600 bg-blue-500/5 border-blue-200"
    if (normalized === "returned") return "text-amber-600 border-amber-600 bg-amber-500/5 border-amber-200"
    if (normalized === "cancelled") return "text-zinc-600 border-zinc-600 bg-zinc-500/5 border-zinc-200"
    if (normalized === "completed") return "text-green-700 border-green-700 bg-green-500/5 border-green-200"
    return "text-indigo-600 border-indigo-600 bg-indigo-500/5 border-indigo-200"
  }

  const statusIcon = (status: MovementStatus) => {
    const normalized = status
    if (normalized === "received") return <CheckCircle className="h-3 w-3 mr-1" />
    if (normalized === "in_transit") return <RotateCw className="h-3 w-3 mr-1" />
    if (normalized === "returned") return <Undo2 className="h-3 w-3 mr-1" />
    if (normalized === "cancelled") return <Ban className="h-3 w-3 mr-1" />
    if (normalized === "completed") return <CheckCircle className="h-3 w-3 mr-1" />
    return <Clock className="h-3 w-3 mr-1" />
  }

  return (
      <div className="space-y-4">
		      {permissions.canEditFacts && !isCreating && (
		        <Button onClick={() => setIsCreating(true)} className="w-full h-11">
		          <Plus className="h-4 w-4 mr-2" />
		          Добавить перемещение
		        </Button>
		      )}
      
      {/* Create form */}
      {isCreating && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Truck className="h-4 w-4" />
              Новое перемещение
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
		            <div className="space-y-2">
		              <Label htmlFor={descriptionId}>Описание</Label>
		              <Input
		                id={descriptionId}
		                placeholder="Например: Отправка на термообработку"
		                value={description}
		                onChange={(e) => setDescription(e.target.value)}
		                className="h-11"
		              />
		            </div>
		            
		            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
		              <div className="space-y-2">
		                <Label htmlFor={fromLocationId}>Откуда (локация)</Label>
		                <Input
		                  id={fromLocationId}
		                  placeholder="Цех / склад / адрес"
		                  value={fromLocation}
		                  onChange={(e) => setFromLocation(e.target.value)}
		                  className="h-11"
		                />
		              </div>
		              <div className="space-y-2">
		                <Label htmlFor={fromHolderId}>Отправитель (держатель)</Label>
		                <Input
		                  id={fromHolderId}
		                  placeholder="Кто отправляет"
		                  value={fromHolder}
		                  onChange={(e) => setFromHolder(e.target.value)}
		                  className="h-11"
		                />
		              </div>
		            </div>

		            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
		              <div className="space-y-2">
		                <Label htmlFor={toLocationId}>Куда (локация)</Label>
		                <Input
		                  id={toLocationId}
		                  placeholder="Цех / склад / адрес"
		                  value={toLocation}
		                  onChange={(e) => setToLocation(e.target.value)}
		                  className="h-11"
		                />
		              </div>
		              <div className="space-y-2">
		                <Label htmlFor={toHolderId}>Получатель (держатель)</Label>
		                <Input
		                  id={toHolderId}
		                  placeholder="Контрагент / участок"
		                  value={toHolder}
		                  onChange={(e) => setToHolder(e.target.value)}
		                  className="h-11"
		                />
		              </div>
		            </div>

		            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
		              <div className="space-y-2">
		                <Label htmlFor={carrierId}>Перевозчик</Label>
		                <Input
		                  id={carrierId}
		                  placeholder="Например: CDEK"
		                  value={carrier}
		                  onChange={(e) => setCarrier(e.target.value)}
		                  className="h-11"
		                />
		              </div>
		              <div className="space-y-2">
		                <Label htmlFor={quantityId}>Кол-во отправлено</Label>
		                <Input
		                  id={quantityId}
		                  type="number"
		                  placeholder="шт"
		                  value={quantitySent}
		                  onChange={(e) => setQuantitySent(e.target.value)}
		                  className="h-11"
		                />
		              </div>
		            </div>
            
		            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
		              <div className="space-y-2">
		              <Label htmlFor={trackingId}>Трек-номер / Накладная</Label>
		              <Input
		                id={trackingId}
		                placeholder="Номер отслеживания"
		                value={trackingNumber}
		                onChange={(e) => setTrackingNumber(e.target.value)}
		                className="h-11"
		              />
		            </div>
		              <div className="space-y-2">
		                <Label htmlFor={etaId}>Ориентировочная дата поступления</Label>
		                <Input
		                  id={etaId}
		                  type="date"
		                  value={plannedEta}
		                  onChange={(e) => setPlannedEta(e.target.value)}
		                  className="h-11"
		                />
		                <div className="text-xs text-muted-foreground">
		                  Укажите дату, когда ожидаете получение у получателя.
		                </div>
		              </div>
		            </div>
            
            <div className="space-y-2">
              <Label htmlFor={notesId}>Примечания</Label>
              <Textarea
                id={notesId}
                placeholder="Дополнительная информация..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            
		            <div className="flex gap-2">
		              <Button variant="outline" className="flex-1 h-11 bg-transparent" onClick={() => setIsCreating(false)}>
		                Отмена
		              </Button>
		              <Button className="flex-1 h-11" onClick={() => void handleCreate()} disabled={!toLocation && !toHolder}>
		                Создать
		              </Button>
		            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Logistics list */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Truck className="h-4 w-4" />
            Журнал перемещений ({logistics.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sortedLogistics.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Нет перемещений
            </p>
          ) : (
            <div className="space-y-3">
              {sortedLogistics.map(entry => (
                <div 
                  key={entry.id} 
                  className={cn("p-3 rounded-lg border", statusTone(entry.status))}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded bg-muted text-muted-foreground">
                        <Truck className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="font-medium">{entry.description || "Перемещение"}</div>
                        <div className="text-sm text-muted-foreground">
                          {(entry.from_location || entry.from_holder || "Источник не указан")}
                          {" -> "}
                          {(entry.to_location || entry.to_holder || "Назначение не указано")}
                        </div>
                        {(entry.from_holder || entry.to_holder) && (
                          <div className="text-sm text-muted-foreground">
                            {(entry.from_holder || "—")} {" -> "} {(entry.to_holder || entry.carrier || "—")}
                          </div>
                        )}
                        {entry.qty_sent && (
                          <div className="text-sm">Отправлено: {entry.qty_sent} шт</div>
                        )}
                        {entry.qty_received && (
                          <div className="text-sm">Получено: {entry.qty_received} шт</div>
                        )}
                        {entry.tracking_number && (
                          <div className="text-xs text-muted-foreground">
                            {entry.carrier ? `${entry.carrier.toUpperCase()} • ` : ""}Трек: {entry.tracking_number}
                          </div>
                        )}
                        {entry.planned_eta && (
                          <div className="text-xs text-muted-foreground">
                            Ориентир поступления: {new Date(entry.planned_eta).toLocaleDateString("ru-RU")}
                          </div>
                        )}
                        {entry.notes && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {entry.notes}
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground mt-1">
                          {new Date(
                            entry.sent_at || entry.created_at || entry.updated_at || entry.date || new Date().toISOString()
                          ).toLocaleString("ru-RU")}
                        </div>
                        {permissions.canEditFacts && !["received", "cancelled", "returned", "completed"].includes(entry.status) && (
                          <div className="mt-2 flex items-end gap-2">
                            <div className="space-y-1">
                              <Label htmlFor={`eta-edit-${entry.id}`} className="text-xs text-muted-foreground">
                                Срок от кооператора
                              </Label>
                              <Input
                                id={`eta-edit-${entry.id}`}
                                type="date"
                                value={getEtaDraft(entry)}
                                onChange={(e) => handleEtaChange(entry.id, e.target.value)}
                                className="h-9 w-[190px]"
                              />
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              className="h-9"
                              onClick={() => void handleSaveEta(entry)}
                            >
                              Сохранить срок
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge variant="outline">
                        {statusIcon(entry.status)}
                        {STATUS_LABELS[entry.status]}
                      </Badge>
                      
                      {permissions.canEditFacts && !["cancelled", "completed", "received", "returned"].includes(entry.status) && (
                        <Select 
                          value={entry.status} 
                          onValueChange={(v) => void handleStatusUpdate(entry, v as MovementStatus)}
                        >
                          <SelectTrigger className="w-28 h-10 text-sm md:h-7 md:text-xs">
                            <SelectValue placeholder="Статус" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Черновик</SelectItem>
                            <SelectItem value="sent">Отправлено</SelectItem>
                            <SelectItem value="in_transit">В пути</SelectItem>
                            <SelectItem value="received">Получено</SelectItem>
                            <SelectItem value="returned">Возврат</SelectItem>
                            <SelectItem value="cancelled">Отменено</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
