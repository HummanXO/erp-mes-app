"use client"

import { useState, useRef, useEffect, useId } from "react"
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
import { Sun, Moon, Plus, TrendingUp, TrendingDown, Minus, CheckCircle, AlertCircle, Paperclip, FileImage, X, Loader2, Pencil, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { ApiClientError } from "@/lib/api-client"

const STAGE_ORDER: ProductionStage[] = [
  "machining",
  "fitting",
  "galvanic",
  "heat_treatment",
  "grinding",
  "qc",
]

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

function toRussianFactError(message: string): string {
  const value = (message || "").trim()
  if (!value) return "Не удалось сохранить факт"
  const normalized = value.toLowerCase()

  if (normalized.includes("failed to fetch") || normalized.includes("network error")) {
    return "Нет связи с сервером. Проверьте интернет и попробуйте снова."
  }
  if (normalized.includes("permission denied") || normalized.includes("forbidden")) {
    return "Недостаточно прав для выполнения операции."
  }
  if (normalized.includes("fact for this date/shift/stage already exists")) {
    return "Факт за эту дату и смену уже есть. Откройте его через кнопку «Редактировать»."
  }
  if (normalized.includes("stage is not enabled for this part")) {
    return "Этот этап не включён для выбранной детали."
  }
  if (normalized.includes("operator_id is required")) {
    return "Нужно выбрать оператора."
  }
  if (normalized.includes("shift_type must be")) {
    return "Для механообработки нужно выбрать смену: день или ночь."
  }
  if (normalized.includes("one operator = one shift")) {
    return "Один оператор может быть назначен только на одну смену (день или ночь)."
  }

  return value
}

interface StageFactFormProps {
  part: Part
}

export function StageFactForm({ part }: StageFactFormProps) {
  const { 
    createStageFact, 
    updateStageFact,
    deleteStageFact,
    uploadAttachment,
    currentUser, 
    permissions,
    demoDate, 
    machines, 
    getOperators,
    getMachineNorm,
    setMachineNorm,
    stageFacts
  } = useApp()
  const isOperator = currentUser?.role === "operator"
  
  const operators = getOperators()
  const formId = useId()
  const stageFieldId = `${formId}-stage`
  const machineFieldId = `${formId}-machine`
  const operatorFieldId = `${formId}-operator`
  const qtyGoodId = `${formId}-qty-good`
  const qtyScrapId = `${formId}-qty-scrap`
  const deviationId = `${formId}-deviation`
  const commentId = `${formId}-comment`
  const attachmentId = `${formId}-attachment`
  
  // Get active stages (not done and not skipped) with null safety
  const stageStatuses = part.stage_statuses || []
  const activeStages = stageStatuses
    .filter(s => (s.status === "pending" || s.status === "in_progress") && s.stage !== "logistics")
    .map(s => s.stage)
    .sort((a, b) => STAGE_ORDER.indexOf(a) - STAGE_ORDER.indexOf(b))
  const availableStages = isOperator
    ? activeStages.filter((activeStage) => activeStage === "machining")
    : activeStages
  
  const [isOpen, setIsOpen] = useState(false)
  const [shiftType, setShiftType] = useState<ShiftType>(getCurrentShift())
  const [stage, setStage] = useState<ProductionStage>(() => {
    if (isOperator) return "machining"
    const inProgressStage = stageStatuses.find(s => s.status === "in_progress" && s.stage !== "logistics")?.stage
    return inProgressStage || availableStages[0] || "machining"
  })
  const [operatorId, setOperatorId] = useState<string>(currentUser?.role === "operator" ? currentUser.id : "")
  const [qtyGood, setQtyGood] = useState("")
  const [qtyScrap, setQtyScrap] = useState("")
  const [comment, setComment] = useState("")
  const [deviationReason, setDeviationReason] = useState<DeviationReason>(null)
  const [attachments, setAttachments] = useState<TaskAttachment[]>([])
  const [submitError, setSubmitError] = useState("")
  const [attachmentError, setAttachmentError] = useState("")
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false)
  const [savedHint, setSavedHint] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeletingFact, setIsDeletingFact] = useState(false)
  const [normQty, setNormQty] = useState("")
  const [isSavingNorm, setIsSavingNorm] = useState(false)
  const [normError, setNormError] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Reset shift to current when stage changes and requires shift
  useEffect(() => {
    if (stageRequiresShift(stage)) {
      setShiftType(getCurrentShift())
    }
  }, [stage])

  useEffect(() => {
    if (isOperator) {
      setStage("machining")
      return
    }
    if (!availableStages.includes(stage)) {
      setStage(availableStages[0] || "machining")
    }
  }, [availableStages, isOperator, stage])

  useEffect(() => {
    if (isOperator && currentUser?.id) {
      setOperatorId(currentUser.id)
      return
    }
    if (stageRequiresOperator(stage) && (!operatorId || operatorId === "none") && operators.length > 0) {
      setOperatorId(operators[0].id)
    }
  }, [stage, operatorId, operators, isOperator, currentUser?.id])
  
  // Filter machines for machining stage
  const machiningMachines = machines.filter(m => m.department === "machining")
  const assignedMachineId = part.machine_id || ""
  const assignedMachine = assignedMachineId
    ? machiningMachines.find((machine) => machine.id === assignedMachineId)
    : undefined
  
  // Get norm for current machine/part/stage
  const currentMachineId = stage === "machining" ? assignedMachineId : undefined
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
  const nonMachiningFact = todayFacts.find(f => f.shift_type === "none")
  const currentFact = stageRequiresShift(stage)
    ? (shiftType === "day" ? dayFact : nightFact)
    : nonMachiningFact
  const oppositeShiftFact = stageRequiresShift(stage)
    ? (shiftType === "day" ? nightFact : dayFact)
    : undefined
  const effectiveOperatorId = isOperator ? (currentUser?.id || "") : operatorId
  const hasOperatorShiftConflict =
    stage === "machining" &&
    !!effectiveOperatorId &&
    !!oppositeShiftFact?.operator_id &&
    oppositeShiftFact.operator_id === effectiveOperatorId &&
    (!currentFact || currentFact.id !== oppositeShiftFact.id)
  
  // Performance indicators
  const getPerformanceIndicator = (actual: number, expected: number) => {
    if (expected === 0) return { status: "unknown", percent: 0 }
    const percent = Math.round((actual / expected) * 100)
    if (percent >= 95) return { status: "good", percent }
    if (percent >= 80) return { status: "warning", percent }
    return { status: "bad", percent }
  }

  useEffect(() => {
    if (!isOpen) return
    if (!currentFact) {
      setQtyGood("")
      setQtyScrap("")
      setComment("")
      setDeviationReason(null)
      setAttachments([])
      return
    }

    setQtyGood(String(currentFact.qty_good || ""))
    setQtyScrap(String(currentFact.qty_scrap || ""))
    setComment(currentFact.comment || "")
    setDeviationReason(currentFact.deviation_reason ?? null)
    setAttachments(currentFact.attachments || [])
    if (currentFact.operator_id) {
      setOperatorId(currentFact.operator_id)
    }
  }, [isOpen, currentFact])

  useEffect(() => {
    setSavedHint("")
  }, [stage])

  const handleSubmit = async () => {
    setSubmitError("")
    setSavedHint("")

    const normalizedOperatorId = isOperator
      ? (currentUser?.id || "")
      : (operatorId === "none" ? "" : operatorId)
    const resolvedMachineId = stage === "machining" ? assignedMachineId : undefined

    // For machining, operator is required. For other stages, it's optional
    if (!qtyGood) return
    if (stageRequiresOperator(stage) && !normalizedOperatorId) {
      setSubmitError("Выберите оператора")
      return
    }

    if (stage === "machining" && !resolvedMachineId) {
      setSubmitError("Для детали не назначен станок. Обратитесь к администратору.")
      return
    }
    if (stage === "machining" && hasOperatorShiftConflict) {
      setSubmitError("Один оператор может быть только в одной смене (день или ночь) за эту дату по этой детали.")
      return
    }

    try {
      setIsSubmitting(true)
      const operatorValue = stageRequiresOperator(stage)
        ? (normalizedOperatorId || currentUser?.id || operators[0]?.id || "")
        : undefined

      if (currentFact) {
        const updatePayload: any = {
          machine_id: resolvedMachineId,
          qty_good: Number.parseInt(qtyGood, 10),
          qty_scrap: Number.parseInt(qtyScrap, 10) || 0,
          qty_expected: expectedQty,
          comment,
          deviation_reason: deviationReason,
          attachments: attachments.length > 0 ? attachments : undefined,
        }
        if (operatorValue) {
          updatePayload.operator_id = operatorValue
        }
        await updateStageFact(currentFact.id, updatePayload)
      } else {
        const createPayload: any = {
          date: demoDate,
          shift_type: stageRequiresShift(stage) ? shiftType : "none",
          part_id: part.id,
          stage,
          machine_id: resolvedMachineId,
          qty_good: Number.parseInt(qtyGood, 10),
          qty_scrap: Number.parseInt(qtyScrap, 10) || 0,
          qty_expected: expectedQty,
          comment,
          deviation_reason: deviationReason,
          attachments: attachments.length > 0 ? attachments : undefined,
        }
        if (operatorValue) {
          createPayload.operator_id = operatorValue
        }
        await createStageFact(createPayload)
      }

      const savedShiftLabel = stageRequiresShift(stage)
        ? (shiftType === "day" ? "дневную" : "ночную")
        : ""
      setSavedHint(
        stageRequiresShift(stage)
          ? `Факт за ${savedShiftLabel} смену сохранён.`
          : "Факт сохранён."
      )

      // Reset form
      setQtyGood("")
      setQtyScrap("")
      setAttachments([])
      setComment("")
      setDeviationReason(null)
      setSubmitError("")
      setIsOpen(false)
    } catch (error) {
      if (error instanceof ApiClientError) {
        const message = error.error?.message || error.message || "Не удалось сохранить факт"
        setSubmitError(toRussianFactError(message))
      } else if (error instanceof Error) {
        setSubmitError(toRussianFactError(error.message))
      } else {
        setSubmitError("Не удалось сохранить факт")
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteFact = async () => {
    if (!currentFact) return

    const confirmed = window.confirm("Удалить этот факт? Действие необратимо.")
    if (!confirmed) return

    try {
      setIsDeletingFact(true)
      setSubmitError("")
      setSavedHint("")
      await deleteStageFact(currentFact.id)
      setSavedHint("Факт удалён.")
      setIsOpen(false)
    } catch (error) {
      if (error instanceof ApiClientError) {
        const message = error.error?.message || error.message || "Не удалось удалить факт"
        setSubmitError(toRussianFactError(message))
      } else if (error instanceof Error) {
        setSubmitError(toRussianFactError(error.message))
      } else {
        setSubmitError("Не удалось удалить факт")
      }
    } finally {
      setIsDeletingFact(false)
    }
  }

  const handleSaveNorm = async () => {
    if (!assignedMachineId || !normQty) return
    setNormError("")
    try {
      setIsSavingNorm(true)
      await setMachineNorm({
        machine_id: assignedMachineId,
        part_id: part.id,
        stage: "machining",
        qty_per_shift: Number(normQty),
        is_configured: true,
        configured_by_id: currentUser?.id,
      })
      setNormQty("")
    } catch (error) {
      setNormError(error instanceof Error ? error.message : "Не удалось сохранить норму")
    } finally {
      setIsSavingNorm(false)
    }
  }

  const openFactEditor = (targetShift?: ShiftType) => {
    if (targetShift) {
      setShiftType(targetShift)
    }
    setSubmitError("")
    setIsOpen(true)
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
    const toneClass = shift === "day"
      ? "border-amber-200/70 bg-gradient-to-br from-amber-50/80 via-background to-amber-100/40"
      : "border-indigo-200/70 bg-gradient-to-br from-indigo-50/80 via-background to-indigo-100/40"
    
    return (
      <Card className={cn(
        "flex-1 transition-all",
        toneClass,
        isActive && "ring-2 ring-primary",
        fact && !isActive && "opacity-90"
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
    if (isOperator && availableStages.length === 0) {
      return (
        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          Для вашей роли ввод факта доступен только на этапе «Механообработка».
        </div>
      )
    }

    const primaryActionLabel = stageRequiresShift(stage)
      ? (currentFact
          ? `Редактировать ${shiftType === "day" ? "дневную" : "ночную"} смену`
          : `Внести факт (${shiftType === "day" ? "дневная" : "ночная"})`)
      : (currentFact ? "Редактировать факт" : "Внести факт")

    return (
      <div className="space-y-4">
        {savedHint && (
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            <CheckCircle className="inline h-4 w-4 mr-2" />
            {savedHint}
          </div>
        )}

        {stageRequiresShift(stage) ? (
          <>
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

            {(dayFact || nightFact) && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                Факты за смены зафиксированы. Можно открыть и отредактировать любую смену.
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                className={cn(
                  "justify-start bg-transparent",
                  shiftType === "day" && "border-amber-300 bg-amber-50 text-amber-900"
                )}
                onClick={() => setShiftType("day")}
              >
                <Sun className="h-4 w-4 mr-2" />
                День
                {dayFact && <CheckCircle className="h-3 w-3 ml-auto text-emerald-600" />}
              </Button>
              <Button
                type="button"
                variant="outline"
                className={cn(
                  "justify-start bg-transparent",
                  shiftType === "night" && "border-indigo-300 bg-indigo-50 text-indigo-900"
                )}
                onClick={() => setShiftType("night")}
              >
                <Moon className="h-4 w-4 mr-2" />
                Ночь
                {nightFact && <CheckCircle className="h-3 w-3 ml-auto text-emerald-600" />}
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                className="bg-transparent"
                disabled={!dayFact}
                onClick={() => openFactEditor("day")}
              >
                <Pencil className="h-4 w-4 mr-2" />
                Редактировать день
              </Button>
              <Button
                type="button"
                variant="outline"
                className="bg-transparent"
                disabled={!nightFact}
                onClick={() => openFactEditor("night")}
              >
                <Pencil className="h-4 w-4 mr-2" />
                Редактировать ночь
              </Button>
            </div>
          </>
        ) : (
          <>
            {nonMachiningFact && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                <CheckCircle className="inline h-4 w-4 mr-2" />
                Факт по этапу «{STAGE_LABELS[stage]}» зафиксирован. Его можно отредактировать.
              </div>
            )}
          </>
        )}
        
        {/* Norm not configured warning */}
        {!norm && stage === "machining" && currentMachineId && (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5" />
            <div className="text-sm">
              <span className="font-medium text-amber-700">Норма не настроена (это не блокирует ввод факта)</span>
              <p className="text-amber-600 text-xs">Факт можно сохранить и без нормы. Норма нужна только для анализа эффективности.</p>
            </div>
          </div>
        )}

        {stage === "machining" && currentMachineId && (
          <div className="p-3 rounded-lg border space-y-2">
            <div className="text-sm font-medium">Пусконаладочная норма (шт/смена)</div>
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder={norm?.qty_per_shift ? String(norm.qty_per_shift) : "Например 420"}
                value={normQty}
                onChange={(e) => setNormQty(e.target.value)}
              />
              <Button onClick={handleSaveNorm} disabled={!normQty || isSavingNorm}>
                {isSavingNorm ? "Сохраняем..." : "Сохранить норму"}
              </Button>
            </div>
            {norm?.qty_per_shift && (
              <div className="text-xs text-muted-foreground">
                Текущая норма: {norm.qty_per_shift} шт/смена
              </div>
            )}
            {normError && <div className="text-xs text-destructive" role="status" aria-live="polite">{normError}</div>}
          </div>
        )}

        {stage === "machining" && !currentMachineId && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
            Для этой детали не назначен станок. Ввод факта недоступен, пока станок не будет указан в карточке детали.
          </div>
        )}
        
        <Button onClick={() => openFactEditor()} className="w-full" disabled={stage === "machining" && !currentMachineId}>
          <Plus className="h-4 w-4 mr-2" />
          {primaryActionLabel}
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
              variant="outline"
              className={cn(
                "bg-transparent justify-start",
                shiftType === "day" && "border-amber-300 bg-amber-50 text-amber-900"
              )}
              onClick={() => setShiftType("day")}
            >
              <Sun className="h-4 w-4 mr-2" />
              Дневная
              {dayFact && <CheckCircle className="h-3 w-3 ml-auto text-emerald-600" />}
            </Button>
            <Button
              type="button"
              variant="outline"
              className={cn(
                "bg-transparent justify-start",
                shiftType === "night" && "border-indigo-300 bg-indigo-50 text-indigo-900"
              )}
              onClick={() => setShiftType("night")}
            >
              <Moon className="h-4 w-4 mr-2" />
              Ночная
              {nightFact && <CheckCircle className="h-3 w-3 ml-auto text-emerald-600" />}
            </Button>
          </div>
        )}
        
        {/* Warning if both shifts filled - only for machining */}
        {stageRequiresShift(stage) && dayFact && nightFact && (
          <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">
            <CheckCircle className="h-4 w-4 inline mr-2" />
            Обе смены заполнены — можно выбрать любую и отредактировать
          </div>
        )}
        
        {/* Stage selection */}
        {isOperator ? (
          <div className="space-y-2">
            <Label htmlFor={stageFieldId}>Этап</Label>
            <Input id={stageFieldId} value={STAGE_LABELS.machining} readOnly />
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor={stageFieldId}>Этап</Label>
            <Select value={stage} onValueChange={(v) => setStage(v as ProductionStage)}>
              <SelectTrigger id={stageFieldId}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableStages.map(s => (
                  <SelectItem key={s} value={s}>
                    {STAGE_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        
        {/* Machine selection - only for machining */}
        {stage === "machining" && (
          <div className="space-y-2">
            <Label htmlFor={machineFieldId}>Станок (из детали)</Label>
            <Input
              id={machineFieldId}
              value={assignedMachine?.name || "Станок не назначен"}
              readOnly
            />
          </div>
        )}
        
        {/* Operator selection - only for machining */}
        {stageRequiresOperator(stage) && !isOperator && (
          <div className="space-y-2">
            <Label htmlFor={operatorFieldId}>Оператор</Label>
            <Select value={operatorId} onValueChange={setOperatorId}>
              <SelectTrigger id={operatorFieldId}>
                <SelectValue placeholder="Выберите оператора" />
              </SelectTrigger>
              <SelectContent>
                {operators.map(op => (
                  <SelectItem key={op.id} value={op.id}>
                    {op.initials}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        
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

        {stage === "machining" && hasOperatorShiftConflict && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Для этой даты оператор уже закреплён в другой смене. Выберите другого оператора.
          </div>
        )}
        
        {/* Quantities */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor={qtyGoodId}>Годные, шт</Label>
            <Input
              id={qtyGoodId}
              type="number"
              placeholder="0"
              value={qtyGood}
              onChange={(e) => setQtyGood(e.target.value)}
              aria-invalid={!!submitError && !qtyGood}
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
            <Label htmlFor={qtyScrapId}>Брак, шт</Label>
            <Input
              id={qtyScrapId}
              type="number"
              placeholder="0"
              value={qtyScrap}
              onChange={(e) => setQtyScrap(e.target.value)}
              aria-invalid={!!submitError && qtyScrap === ""}
            />
          </div>
        </div>
        
        {/* Deviation reason */}
        <div className="space-y-2">
          <Label htmlFor={deviationId}>Причина отклонения (если есть)</Label>
          <Select 
            value={deviationReason || "none"} 
            onValueChange={(v) => setDeviationReason(v === "none" ? null : v as DeviationReason)}
          >
            <SelectTrigger id={deviationId}>
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
          <Label htmlFor={commentId}>Комментарий</Label>
          <Textarea
            id={commentId}
            placeholder="Примечания к смене..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </div>
        
        {/* Attachments */}
        <div className="space-y-2">
          <Label htmlFor={attachmentId}>Прикрепить фото/файл</Label>
          <input
            id={attachmentId}
            type="file"
            ref={fileInputRef}
            onChange={async (e) => {
              const files = e.target.files
              if (!files) return
              setAttachmentError("")
              setIsUploadingAttachment(true)
              try {
                for (const file of Array.from(files)) {
                  const uploaded = await uploadAttachment(file)
                  setAttachments((prev) => [...prev, uploaded])
                }
              } catch (err) {
                const message =
                  err instanceof ApiClientError
                    ? toRussianFactError(err.error?.message || "")
                    : err instanceof Error
                    ? toRussianFactError(err.message)
                    : "Не удалось загрузить файл"
                setAttachmentError(message)
              } finally {
                setIsUploadingAttachment(false)
              }
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
            disabled={isUploadingAttachment}
          >
            <Paperclip className="h-4 w-4 mr-2" />
            {isUploadingAttachment ? "Загружаем..." : "Прикрепить фото"}
          </Button>
          {attachmentError && (
            <p className="text-xs text-destructive">{attachmentError}</p>
          )}
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
          {currentFact && permissions.canRollbackFacts && (
            <Button
              type="button"
              variant="destructive"
              onClick={handleDeleteFact}
              disabled={isSubmitting || isDeletingFact}
            >
              {isDeletingFact ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Удаляем...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Удалить
                </>
              )}
            </Button>
          )}
          <Button
            variant="outline"
            className="flex-1 bg-transparent"
            onClick={() => setIsOpen(false)}
            disabled={isDeletingFact}
          >
            Отмена
          </Button>
          <Button 
            className="flex-1" 
            onClick={handleSubmit} 
            disabled={isSubmitting ||
              isDeletingFact ||
              !qtyGood || 
              (stageRequiresOperator(stage) && !isOperator && (!operatorId || operatorId === "none")) ||
              hasOperatorShiftConflict ||
              (stage === "machining" && !currentMachineId)
            }
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Сохраняем...
              </>
            ) : currentFact ? "Сохранить изменения" : "Сохранить"}
          </Button>
        </div>
        {submitError && (
          <div className="text-sm text-destructive" role="status" aria-live="polite">{submitError}</div>
        )}
      </CardContent>
    </Card>
  )
}
