"use client"

import { useState, useRef, useEffect } from "react"
import { useApp } from "@/lib/app-context"
import type { Part, ShiftType, ProductionStage, DeviationReason, TaskAttachment } from "@/lib/types"
import { STAGE_LABELS, DEVIATION_REASON_LABELS } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Sun, Moon, Plus, TrendingUp, TrendingDown, Minus, CheckCircle, AlertCircle, Paperclip, FileImage, X } from "lucide-react"
import { cn } from "@/lib/utils"

// Determine current shift based on time (09:00-21:00 = day, 21:00-09:00 = night)
function getCurrentShift(): ShiftType {
  const hour = new Date().getHours()
  return hour >= 9 && hour < 21 ? "day" : "night"
}

// Check if stage requires shift selection (only machining)
function stageRequiresShift(stage: ProductionStage): boolean {
  return stage === "machining"
}

// Check if stage requires operator (only machining requires it strictly)
function stageRequiresOperator(stage: ProductionStage): boolean {
  return stage === "machining"
}

interface StageFactFormProps {
  part: Part
}

export function StageFactForm({ part }: StageFactFormProps) {
  const { 
    createStageFact, 
    currentUser, 
    demoDate, 
    machines, 
    getOperators,
    getMachineNorm,
    getStageFactsForPart,
    stageFacts
  } = useApp()
  
  const operators = getOperators()
  
  // Get active stages (not done and not skipped) with null safety
  const stageStatuses = part.stage_statuses || []
  const activeStages = stageStatuses
    .filter(s => s.status === "pending" || s.status === "in_progress")
    .map(s => s.stage)
  
  const [isOpen, setIsOpen] = useState(false)
  const [shiftType, setShiftType] = useState<ShiftType>(getCurrentShift())
  const [stage, setStage] = useState<ProductionStage>(activeStages[0] || "machining")
  const [machineId, setMachineId] = useState<string>(part.machine_id || "")
  const [operatorId, setOperatorId] = useState<string>(currentUser?.id || "")
  const [qtyGood, setQtyGood] = useState("")
  const [qtyScrap, setQtyScrap] = useState("")
  const [comment, setComment] = useState("")
  const [deviationReason, setDeviationReason] = useState<DeviationReason>(null)
  const [attachments, setAttachments] = useState<TaskAttachment[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Reset shift to current when stage changes and requires shift
  useEffect(() => {
    if (stageRequiresShift(stage)) {
      setShiftType(getCurrentShift())
    }
  }, [stage])
  
  // Filter machines for machining stage
  const machiningMachines = machines.filter(m => m.department === "machining")
  
  // Get norm for current machine/part/stage
  const currentMachineId = stage === "machining" ? machineId : undefined
  const norm = currentMachineId ? getMachineNorm(currentMachineId, part.id, stage) : undefined
  const expectedQty = norm?.qty_per_shift || 0
  
  // Get today's facts for this part/stage
  const todayFacts = stageFacts.filter(f => 
    f.part_id === part.id && 
    f.date === demoDate && 
    f.stage === stage
  )
  const dayFact = todayFacts.find(f => f.shift_type === "day")
  const nightFact = todayFacts.find(f => f.shift_type === "night")
  
  // Calculate day totals
  const dayTotal = dayFact?.qty_good || 0
  const nightTotal = nightFact?.qty_good || 0
  const dayTotalWithNew = shiftType === "day" ? (Number(qtyGood) || 0) : dayTotal
  const nightTotalWithNew = shiftType === "night" ? (Number(qtyGood) || 0) : nightTotal
  
  // Performance indicators
  const getPerformanceIndicator = (actual: number, expected: number) => {
    if (expected === 0) return { status: "unknown", percent: 0 }
    const percent = Math.round((actual / expected) * 100)
    if (percent >= 95) return { status: "good", percent }
    if (percent >= 80) return { status: "warning", percent }
    return { status: "bad", percent }
  }

  const handleSubmit = () => {
    // For machining, operator is required. For other stages, it's optional
    if (!qtyGood) return
    if (stageRequiresOperator(stage) && !operatorId) return
    
    createStageFact({
      date: demoDate,
      // For non-machining stages, shift is "day" by default (no real shift tracking)
      shift_type: stageRequiresShift(stage) ? shiftType : "day",
      part_id: part.id,
      stage,
      machine_id: stage === "machining" ? machineId : undefined,
      // For non-machining, operator can be empty string or current user
      operator_id: operatorId || currentUser?.id || "",
      qty_good: Number.parseInt(qtyGood, 10),
      qty_scrap: Number.parseInt(qtyScrap, 10) || 0,
      qty_expected: expectedQty,
      comment,
      deviation_reason: deviationReason,
      attachments: attachments.length > 0 ? attachments : undefined,
    })
  
  // Reset form
  setQtyGood("")
  setQtyScrap("")
  setAttachments([])
    setComment("")
    setDeviationReason(null)
    setIsOpen(false)
  }

  // Shift summary card component
  const ShiftSummaryCard = ({ 
    shift, 
    fact, 
    expected,
    isActive,
    newValue
  }: { 
    shift: ShiftType
    fact: typeof dayFact
    expected: number
    isActive: boolean
    newValue?: number
  }) => {
    const actual = fact?.qty_good || 0
    const displayValue = isActive && newValue ? newValue : actual
    const perf = getPerformanceIndicator(displayValue, expected)
    const scrap = fact?.qty_scrap || 0
    
    return (
      <Card className={cn(
        "flex-1 transition-all",
        isActive && "ring-2 ring-primary",
        fact && !isActive && "opacity-75"
      )}>
        <CardContent className="p-3">
          <div className="flex items-center gap-2 mb-2">
            {shift === "day" ? (
              <Sun className="h-4 w-4 text-amber-500" />
            ) : (
              <Moon className="h-4 w-4 text-indigo-500" />
            )}
            <span className="font-medium text-sm">
              {shift === "day" ? "Дневная" : "Ночная"} смена
            </span>
            {fact && !isActive && (
              <Badge variant="outline" className="text-xs text-green-600 border-green-600 ml-auto">
                <CheckCircle className="h-3 w-3 mr-1" />
                Внесено
              </Badge>
            )}
          </div>
          
          <div className="space-y-2">
            {/* Expected vs Actual */}
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground text-xs">Ожидание</span>
                <div className="font-medium">{expected > 0 ? expected : "—"}</div>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Факт</span>
                <div className={cn(
                  "font-bold",
                  perf.status === "good" && displayValue > 0 && "text-green-600",
                  perf.status === "warning" && "text-amber-600",
                  perf.status === "bad" && displayValue > 0 && "text-red-600"
                )}>
                  {displayValue > 0 ? displayValue : "—"}
                </div>
              </div>
            </div>
            
            {/* Progress bar */}
            {expected > 0 && displayValue > 0 && (
              <div className="space-y-1">
                <Progress 
                  value={Math.min(perf.percent, 100)} 
                  className={cn(
                    "h-1.5",
                    perf.status === "good" && "[&>div]:bg-green-500",
                    perf.status === "warning" && "[&>div]:bg-amber-500",
                    perf.status === "bad" && "[&>div]:bg-red-500"
                  )}
                />
                <div className="flex items-center justify-between text-xs">
                  <span className={cn(
                    perf.status === "good" && "text-green-600",
                    perf.status === "warning" && "text-amber-600",
                    perf.status === "bad" && displayValue > 0 && "text-red-600"
                  )}>
                    {perf.percent}%
                  </span>
                  {scrap > 0 && (
                    <span className="text-destructive">Брак: {scrap}</span>
                  )}
                </div>
              </div>
            )}
            
            {/* Status indicator */}
            {expected > 0 && displayValue > 0 && (
              <div className={cn(
                "flex items-center gap-1 text-xs",
                perf.status === "good" && "text-green-600",
                perf.status === "warning" && "text-amber-600",
                perf.status === "bad" && "text-red-600"
              )}>
                {perf.status === "good" ? (
                  <>
                    <TrendingUp className="h-3 w-3" />
                    Норма
                  </>
                ) : perf.status === "warning" ? (
                  <>
                    <Minus className="h-3 w-3" />
                    Ниже нормы
                  </>
                ) : (
                  <>
                    <TrendingDown className="h-3 w-3" />
                    Плохо
                  </>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!isOpen) {
    return (
      <div className="space-y-4">
        {/* Current shift status summary */}
        {(dayFact || nightFact || expectedQty > 0) && (
          <div className="grid grid-cols-2 gap-3">
            <ShiftSummaryCard 
              shift="day" 
              fact={dayFact} 
              expected={expectedQty}
              isActive={false}
            />
            <ShiftSummaryCard 
              shift="night" 
              fact={nightFact} 
              expected={expectedQty}
              isActive={false}
            />
          </div>
        )}
        
        {/* Norm not configured warning */}
        {!norm && stage === "machining" && machineId && (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5" />
            <div className="text-sm">
              <span className="font-medium text-amber-700">Норма не настроена</span>
              <p className="text-amber-600 text-xs">После пусконаладки установите норму выработки для отслеживания эффективности</p>
            </div>
          </div>
        )}
        
        <Button onClick={() => setIsOpen(true)} className="w-full">
          <Plus className="h-4 w-4 mr-2" />
          Внести факт за смену
        </Button>
      </div>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Внести факт за смену</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Shift summary at top - only for machining */}
        {stageRequiresShift(stage) && (
          <div className="grid grid-cols-2 gap-3">
            <ShiftSummaryCard 
              shift="day" 
              fact={dayFact} 
              expected={expectedQty}
              isActive={shiftType === "day"}
              newValue={shiftType === "day" ? Number(qtyGood) || 0 : undefined}
            />
            <ShiftSummaryCard 
              shift="night" 
              fact={nightFact} 
              expected={expectedQty}
              isActive={shiftType === "night"}
              newValue={shiftType === "night" ? Number(qtyGood) || 0 : undefined}
            />
          </div>
        )}
        
        {/* Shift selection - only for machining */}
        {stageRequiresShift(stage) && (
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={shiftType === "day" ? "default" : "outline"}
              className={shiftType === "day" ? "" : "bg-transparent"}
              onClick={() => setShiftType("day")}
              disabled={!!dayFact}
            >
              <Sun className="h-4 w-4 mr-2" />
              Дневная
              {dayFact && <CheckCircle className="h-3 w-3 ml-2" />}
            </Button>
            <Button
              type="button"
              variant={shiftType === "night" ? "default" : "outline"}
              className={shiftType === "night" ? "" : "bg-transparent"}
              onClick={() => setShiftType("night")}
              disabled={!!nightFact}
            >
              <Moon className="h-4 w-4 mr-2" />
              Ночная
              {nightFact && <CheckCircle className="h-3 w-3 ml-2" />}
            </Button>
          </div>
        )}
        
        {/* Warning if both shifts filled - only for machining */}
        {stageRequiresShift(stage) && dayFact && nightFact && (
          <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">
            <CheckCircle className="h-4 w-4 inline mr-2" />
            Факт за обе смены уже внесён на сегодня
          </div>
        )}
        
        {/* Stage selection */}
        <div className="space-y-2">
          <Label>Этап</Label>
          <Select value={stage} onValueChange={(v) => setStage(v as ProductionStage)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {activeStages.map(s => (
                <SelectItem key={s} value={s}>
                  {STAGE_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        {/* Machine selection - only for machining */}
        {stage === "machining" && (
          <div className="space-y-2">
            <Label>Станок</Label>
            <Select value={machineId} onValueChange={setMachineId}>
              <SelectTrigger>
                <SelectValue placeholder="Выберите станок" />
              </SelectTrigger>
              <SelectContent>
                {machiningMachines.map(m => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        
        {/* Operator selection - required only for machining */}
        <div className="space-y-2">
          <Label>
            Оператор
            {!stageRequiresOperator(stage) && <span className="text-muted-foreground text-xs ml-1">(необязательно)</span>}
          </Label>
          <Select value={operatorId} onValueChange={setOperatorId}>
            <SelectTrigger>
              <SelectValue placeholder={stageRequiresOperator(stage) ? "Выберите оператора" : "Не указан"} />
            </SelectTrigger>
            <SelectContent>
              {!stageRequiresOperator(stage) && (
                <SelectItem value="none">Не указан</SelectItem>
              )}
              {operators.map(op => (
                <SelectItem key={op.id} value={op.id}>
                  {op.initials}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        {/* Expected quantity info */}
        {expectedQty > 0 && (
          <div className="p-2 rounded bg-muted/50 text-sm">
            <span className="text-muted-foreground">Норма за смену:</span>
            <span className="font-medium ml-2">{expectedQty} шт</span>
            {norm?.is_configured && (
              <Badge variant="outline" className="ml-2 text-xs">Настроено</Badge>
            )}
          </div>
        )}
        
        {/* Quantities */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Годные, шт</Label>
            <Input
              type="number"
              placeholder="0"
              value={qtyGood}
              onChange={(e) => setQtyGood(e.target.value)}
            />
            {expectedQty > 0 && qtyGood && (
              <div className={cn(
                "text-xs",
                Number(qtyGood) >= expectedQty * 0.95 && "text-green-600",
                Number(qtyGood) >= expectedQty * 0.8 && Number(qtyGood) < expectedQty * 0.95 && "text-amber-600",
                Number(qtyGood) < expectedQty * 0.8 && "text-red-600"
              )}>
                {Math.round((Number(qtyGood) / expectedQty) * 100)}% от нормы
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label>Брак, шт</Label>
            <Input
              type="number"
              placeholder="0"
              value={qtyScrap}
              onChange={(e) => setQtyScrap(e.target.value)}
            />
          </div>
        </div>
        
        {/* Deviation reason */}
        <div className="space-y-2">
          <Label>Причина отклонения (если есть)</Label>
          <Select 
            value={deviationReason || "none"} 
            onValueChange={(v) => setDeviationReason(v === "none" ? null : v as DeviationReason)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Нет отклонения" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Нет отклонения</SelectItem>
              {Object.entries(DEVIATION_REASON_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        {/* Comment */}
        <div className="space-y-2">
          <Label>Комментарий</Label>
          <Textarea
            placeholder="Примечания к смене..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </div>
        
        {/* Attachments */}
        <div className="space-y-2">
          <Label>Прикрепить фото/файл</Label>
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => {
              const files = e.target.files
              if (!files) return
              Array.from(files).forEach(file => {
                const mockUrl = URL.createObjectURL(file)
                const isImage = file.type.startsWith("image/")
                setAttachments(prev => [...prev, {
                  id: `att_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                  name: file.name,
                  url: mockUrl,
                  type: isImage ? "image" : "file"
                }])
              })
              if (fileInputRef.current) {
                fileInputRef.current.value = ""
              }
            }}
            multiple
            accept="image/*,.pdf,.doc,.docx"
            className="hidden"
          />
          <Button 
            type="button"
            variant="outline" 
            className="w-full bg-transparent" 
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="h-4 w-4 mr-2" />
            Прикрепить фото
          </Button>
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 p-2 bg-muted rounded-lg">
              {attachments.map(att => (
                <div key={att.id} className="flex items-center gap-1 bg-background rounded px-2 py-1 text-xs">
                  <FileImage className="h-3 w-3" />
                  <span className="max-w-[100px] truncate">{att.name}</span>
                  <button 
                    type="button"
                    onClick={() => setAttachments(prev => prev.filter(a => a.id !== att.id))}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Actions */}
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setIsOpen(false)}>
            Отмена
          </Button>
          <Button 
            className="flex-1" 
            onClick={handleSubmit} 
            disabled={
              !qtyGood || 
              (stageRequiresOperator(stage) && !operatorId) || 
              (stageRequiresShift(stage) && dayFact && nightFact)
            }
          >
            Сохранить
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
