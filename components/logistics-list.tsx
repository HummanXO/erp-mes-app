"use client"

import React from "react"

import { useState, useId } from "react"
import { useApp } from "@/lib/app-context"
import type { Part, LogisticsType, LogisticsEntry } from "@/lib/types"
import { LOGISTICS_TYPE_LABELS } from "@/lib/types"
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
  Package, 
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle,
  Clock,
  RotateCw
} from "lucide-react"
import { cn } from "@/lib/utils"

interface LogisticsListProps {
  part: Part
}

const LOGISTICS_ICONS: Record<LogisticsType, React.ReactNode> = {
  material_in: <ArrowDownToLine className="h-4 w-4" />,
  tooling_in: <Package className="h-4 w-4" />,
  shipping_out: <ArrowUpFromLine className="h-4 w-4" />,
  coop_out: <ArrowUpFromLine className="h-4 w-4" />,
  coop_in: <ArrowDownToLine className="h-4 w-4" />,
}

const STATUS_LABELS: Record<LogisticsEntry["status"], string> = {
  pending: "Ожидание",
  in_transit: "В пути",
  received: "Получено",
  completed: "Завершено",
}

export function LogisticsList({ part }: LogisticsListProps) {
  const { getLogisticsForPart, createLogisticsEntry, updateLogisticsEntry, demoDate, permissions } = useApp()
  
  const logistics = getLogisticsForPart(part.id)
  const [isCreating, setIsCreating] = useState(false)
  
  // Form state
  const [type, setType] = useState<LogisticsType>("material_in")
  const [description, setDescription] = useState("")
  const [quantity, setQuantity] = useState("")
  const [counterparty, setCounterparty] = useState("")
  const [trackingNumber, setTrackingNumber] = useState("")
  const [notes, setNotes] = useState("")
  const formId = useId()
  const typeId = `${formId}-type`
  const descriptionId = `${formId}-description`
  const quantityId = `${formId}-quantity`
  const counterpartyId = `${formId}-counterparty`
  const trackingId = `${formId}-tracking`
  const notesId = `${formId}-notes`
  
  const handleCreate = () => {
    createLogisticsEntry({
      part_id: part.id,
      type,
      description,
      quantity: quantity ? Number.parseInt(quantity, 10) : undefined,
      date: demoDate,
      status: "pending",
      counterparty: counterparty || undefined,
      tracking_number: trackingNumber || undefined,
      notes: notes || undefined,
    })
    
    // Reset form
    setDescription("")
    setQuantity("")
    setCounterparty("")
    setTrackingNumber("")
    setNotes("")
    setIsCreating(false)
  }
  
  const handleStatusUpdate = (entry: LogisticsEntry, newStatus: LogisticsEntry["status"]) => {
    updateLogisticsEntry({ ...entry, status: newStatus })
  }

  // Sort by date descending
  const sortedLogistics = [...logistics].sort((a, b) => 
    new Date(b.date).getTime() - new Date(a.date).getTime()
  )

  return (
      <div className="space-y-4">
	      {permissions.canEditFacts && !isCreating && (
	        <Button onClick={() => setIsCreating(true)} className="w-full h-11">
	          <Plus className="h-4 w-4 mr-2" />
	          Добавить запись логистики
	        </Button>
	      )}
      
      {/* Create form */}
      {isCreating && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Truck className="h-4 w-4" />
              Новая запись логистики
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
	            <div className="space-y-2">
	              <Label htmlFor={typeId}>Тип</Label>
	              <Select value={type} onValueChange={(v) => setType(v as LogisticsType)}>
	                <SelectTrigger id={typeId} className="h-11">
	                  <SelectValue />
	                </SelectTrigger>
	                <SelectContent>
                  {Object.entries(LOGISTICS_TYPE_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        {LOGISTICS_ICONS[key as LogisticsType]}
                        {label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
	            <div className="space-y-2">
	              <Label htmlFor={descriptionId}>Описание *</Label>
	              <Input
	                id={descriptionId}
	                placeholder="Что перемещается..."
	                value={description}
	                onChange={(e) => setDescription(e.target.value)}
	                className="h-11"
	              />
	            </div>
	            
	            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
	              <div className="space-y-2">
	                <Label htmlFor={quantityId}>Количество</Label>
	                <Input
	                  id={quantityId}
	                  type="number"
	                  placeholder="шт"
	                  value={quantity}
	                  onChange={(e) => setQuantity(e.target.value)}
	                  className="h-11"
	                />
	              </div>
	              <div className="space-y-2">
	                <Label htmlFor={counterpartyId}>Контрагент</Label>
	                <Input
	                  id={counterpartyId}
	                  placeholder="Поставщик/Получатель"
	                  value={counterparty}
	                  onChange={(e) => setCounterparty(e.target.value)}
	                  className="h-11"
	                />
	              </div>
	            </div>
            
	            <div className="space-y-2">
	              <Label htmlFor={trackingId}>Трек-номер / Накладная</Label>
	              <Input
	                id={trackingId}
	                placeholder="Номер для отслеживания"
	                value={trackingNumber}
	                onChange={(e) => setTrackingNumber(e.target.value)}
	                className="h-11"
	              />
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
	              <Button className="flex-1 h-11" onClick={handleCreate} disabled={!description}>
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
            История логистики ({logistics.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sortedLogistics.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Нет записей логистики
            </p>
          ) : (
            <div className="space-y-3">
              {sortedLogistics.map(entry => (
                <div 
                  key={entry.id} 
                  className={cn(
                    "p-3 rounded-lg border",
                    entry.status === "completed" && "bg-green-500/5 border-green-200",
                    entry.status === "in_transit" && "bg-blue-500/5 border-blue-200",
                    entry.status === "received" && "bg-green-500/5 border-green-200",
                    entry.status === "pending" && "bg-amber-500/5 border-amber-200",
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "p-2 rounded",
                        entry.status === "completed" && "bg-green-500/20 text-green-700",
                        entry.status === "in_transit" && "bg-blue-500/20 text-blue-700",
                        entry.status === "received" && "bg-green-500/20 text-green-700",
                        entry.status === "pending" && "bg-amber-500/20 text-amber-700",
                      )}>
                        {LOGISTICS_ICONS[entry.type]}
                      </div>
                      <div>
                        <div className="font-medium">{entry.description}</div>
                        <div className="text-sm text-muted-foreground">
                          {LOGISTICS_TYPE_LABELS[entry.type]}
                          {entry.counterparty && ` • ${entry.counterparty}`}
                        </div>
                        {entry.quantity && (
                          <div className="text-sm">Кол-во: {entry.quantity} шт</div>
                        )}
                        {entry.tracking_number && (
                          <div className="text-xs text-muted-foreground">
                            Трек: {entry.tracking_number}
                          </div>
                        )}
                        {entry.notes && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {entry.notes}
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground mt-1">
                          {new Date(entry.date).toLocaleDateString("ru-RU")}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge 
                        variant="outline" 
                        className={cn(
                          entry.status === "completed" && "text-green-600 border-green-600",
                          entry.status === "in_transit" && "text-blue-600 border-blue-600",
                          entry.status === "received" && "text-green-600 border-green-600",
                          entry.status === "pending" && "text-amber-600 border-amber-600",
                        )}
                      >
                        {entry.status === "completed" && <CheckCircle className="h-3 w-3 mr-1" />}
                        {entry.status === "in_transit" && <RotateCw className="h-3 w-3 mr-1" />}
                        {entry.status === "received" && <CheckCircle className="h-3 w-3 mr-1" />}
                        {entry.status === "pending" && <Clock className="h-3 w-3 mr-1" />}
                        {STATUS_LABELS[entry.status]}
                      </Badge>
                      
                      {permissions.canEditFacts && entry.status !== "completed" && (
                        <Select 
                          value={entry.status} 
                          onValueChange={(v) => handleStatusUpdate(entry, v as LogisticsEntry["status"])}
                        >
                          <SelectTrigger className="w-28 h-10 text-sm md:h-7 md:text-xs">
                            <SelectValue placeholder="Статус" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Ожидание</SelectItem>
                            <SelectItem value="in_transit">В пути</SelectItem>
                            <SelectItem value="received">Получено</SelectItem>
                            <SelectItem value="completed">Завершено</SelectItem>
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
