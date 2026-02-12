"use client"

import React from "react"

import { useMemo, useState, useEffect, useId, useRef } from "react"
import { useApp } from "@/lib/app-context"
import type { Part, ProductionStage, StageStatus } from "@/lib/types"
import { STAGE_LABELS } from "@/lib/types"
import { STAGE_ICONS } from "@/lib/stage-icons"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { cn } from "@/lib/utils"
import { Building2, AlertCircle, X } from "lucide-react"

const COOP_STAGES: ProductionStage[] = ["logistics", "qc"]
const SHOP_REQUIRED_STAGES: ProductionStage[] = ["machining", "fitting", "qc"]
const SHOP_OPTIONAL_STAGES: ProductionStage[] = ["galvanic", "heat_treatment", "grinding", "logistics"]
const CUSTOMER_STORAGE_KEY = "erp_customer_list"

interface CreatePartDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sourceSpecificationId?: string
  defaultCustomer?: string
  defaultDeadline?: string
  fixedMode?: "shop" | "cooperation"
  submitLabel?: string
  onPartCreated?: (part: Part) => Promise<void> | void
}

export function CreatePartDialog({
  open,
  onOpenChange,
  sourceSpecificationId,
  defaultCustomer,
  defaultDeadline,
  fixedMode,
  submitLabel = "Создать деталь",
  onPartCreated,
}: CreatePartDialogProps) {
  const { createPart, machines, permissions, parts } = useApp()
  
  // Form state
  const [code, setCode] = useState("")
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [qtyPlan, setQtyPlan] = useState("")
  const [deadline, setDeadline] = useState("")
  const [customer, setCustomer] = useState("")
  const [customerList, setCustomerList] = useState<string[]>([])
  const [isCustomerFocused, setIsCustomerFocused] = useState(false)
  const [formError, setFormError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const formId = useId()
  const codeId = `${formId}-code`
  const nameId = `${formId}-name`
  const descriptionId = `${formId}-description`
  const qtyPlanId = `${formId}-qty`
  const deadlineId = `${formId}-deadline`
  const customerId = `${formId}-customer`
  const partnerId = `${formId}-partner`
  const machineIdField = `${formId}-machine`
  const formErrorId = `${formId}-error`
  
  // Cooperation
  const [isCooperation, setIsCooperation] = useState(false)
  const [cooperationPartner, setCooperationPartner] = useState("")
  
  // Stages
  const [selectedOptionalStages, setSelectedOptionalStages] = useState<ProductionStage[]>([])
  
  // Machine (for machining stage)
  const [machineId, setMachineId] = useState("")
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [footerElevated, setFooterElevated] = useState(false)
  const [footerHasScroll, setFooterHasScroll] = useState(false)
  
  const machiningMachines = machines.filter(m => m.department === "machining")
  const isShopOnly = fixedMode === "shop"
  const isCooperationOnly = fixedMode === "cooperation"
  const useSpecificationDeadline = Boolean(sourceSpecificationId)

  const existingCustomers = useMemo(() => {
    const fromParts = parts
      .map((part) => part.customer?.trim())
      .filter((value): value is string => !!value && value.length > 0)
    return Array.from(new Set(fromParts))
  }, [parts])
  
  // Determine what the user can create based on permissions
  const canCreateOwnParts = permissions.canCreateOwnParts
  const canCreateCoopParts = permissions.canCreateCoopParts
  
  // If user can only create cooperation parts, default to cooperation mode
  useEffect(() => {
    if (isShopOnly) {
      setIsCooperation(false)
      setSelectedOptionalStages([])
      return
    }

    if (isCooperationOnly || (!canCreateOwnParts && canCreateCoopParts)) {
      setIsCooperation(true)
      setSelectedOptionalStages([])
    }
  }, [canCreateOwnParts, canCreateCoopParts, isCooperationOnly, isShopOnly])

  useEffect(() => {
    if (!open) return
    const el = scrollRef.current
    if (!el) return
    const update = () => {
      const maxScroll = el.scrollHeight - el.clientHeight
      const hasScroll = maxScroll > 2
      const atBottom = el.scrollTop >= maxScroll - 2
      setFooterHasScroll(hasScroll)
      setFooterElevated(hasScroll && !atBottom)
    }
    update()
    const onScroll = () => update()
    const onResize = () => update()
    el.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onResize)
    const ro = new ResizeObserver(() => update())
    ro.observe(el)
    return () => {
      el.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onResize)
      ro.disconnect()
    }
  }, [open])

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const stored = JSON.parse(localStorage.getItem(CUSTOMER_STORAGE_KEY) || "[]")
      const merged = Array.from(new Set([...(Array.isArray(stored) ? stored : []), ...existingCustomers]))
      setCustomerList(merged)
    } catch {
      setCustomerList(existingCustomers)
    }
  }, [existingCustomers, open])

  useEffect(() => {
    if (!open) return
    setCustomer(defaultCustomer || "")
  }, [defaultCustomer, open])

  useEffect(() => {
    if (!open) return
    setDeadline(defaultDeadline || "")
  }, [defaultDeadline, open])

  const toggleCooperation = () => {
    if (isShopOnly || isCooperationOnly) return
    setIsCooperation((prev) => !prev)
    setSelectedOptionalStages([])
  }
  
  const toggleOptionalStage = (stage: ProductionStage) => {
    if (selectedOptionalStages.includes(stage)) {
      setSelectedOptionalStages(selectedOptionalStages.filter(s => s !== stage))
    } else {
      setSelectedOptionalStages([...selectedOptionalStages, stage])
    }
  }

  const persistCustomerList = (list: string[]) => {
    if (typeof window === "undefined") return
    localStorage.setItem(CUSTOMER_STORAGE_KEY, JSON.stringify(list))
  }

  const addCustomerToList = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return
    const normalized = trimmed.replace(/\s+/g, " ")
    const merged = Array.from(new Set([normalized, ...customerList]))
    setCustomerList(merged)
    persistCustomerList(merged)
  }

  const removeCustomerFromList = (value: string) => {
    const filtered = customerList.filter((item) => item !== value)
    setCustomerList(filtered)
    persistCustomerList(filtered)
  }

  const filteredCustomers = useMemo(() => {
    const query = customer.trim().toLowerCase()
    if (!query) return customerList.slice(0, 8)
    return customerList
      .filter((item) => item.toLowerCase().includes(query))
      .slice(0, 8)
  }, [customer, customerList])

  const showCustomerSuggestions = isCustomerFocused && filteredCustomers.length > 0
  
  const handleCreate = async () => {
    setFormError("")
    if (!code || !name || !qtyPlan) {
      setFormError("Заполните обязательные поля")
      return
    }
    if (!isCooperation && !machineId) {
      setFormError("Для цеховой детали нужно выбрать станок")
      return
    }
    if (isCooperation && !cooperationPartner.trim()) {
      setFormError("Для кооперации укажите партнёра-кооператора")
      return
    }
    if (!sourceSpecificationId) {
      setFormError("Деталь можно создать только из выбранной спецификации")
      return
    }

    const requiredStages = isCooperation
      ? COOP_STAGES
      : [...SHOP_REQUIRED_STAGES, ...selectedOptionalStages]
    
    // Create stage statuses
    const stageStatuses: StageStatus[] = requiredStages.map(stage => ({
      stage,
      status: "pending" as const,
    }))
    
    setIsSubmitting(true)
    try {
      const resolvedDeadline = defaultDeadline || deadline || "2099-12-31"

      const createdPart = await createPart({
        code: code.trim(),
        name: name.trim(),
        description: description.trim() || undefined,
        qty_plan: Number.parseInt(qtyPlan, 10),
        qty_done: 0,
        deadline: resolvedDeadline,
        status: "not_started",
        is_cooperation: isCooperation,
        cooperation_partner: isCooperation ? cooperationPartner.trim() : undefined,
        required_stages: requiredStages,
        stage_statuses: stageStatuses,
        machine_id: !isCooperation ? machineId : undefined,
        customer: customer.trim() || undefined,
        source_specification_id: sourceSpecificationId,
      })

      addCustomerToList(customer)
      if (onPartCreated) {
        await onPartCreated(createdPart)
      }

      // Reset and close
      resetForm()
      onOpenChange(false)
    } catch (error) {
      if (error instanceof Error && error.message?.trim()) {
        setFormError(error.message)
      } else {
        setFormError("Не удалось создать деталь (проверьте поля и уникальность кода)")
      }
    } finally {
      setIsSubmitting(false)
    }
  }
  
  const resetForm = () => {
    setCode("")
    setName("")
    setDescription("")
    setQtyPlan("")
    setDeadline(defaultDeadline || "")
    setCustomer(defaultCustomer || "")
    setFormError("")
    if (isShopOnly) {
      setIsCooperation(false)
    } else if (isCooperationOnly || (!canCreateOwnParts && canCreateCoopParts)) {
      setIsCooperation(true)
    } else {
      setIsCooperation(false)
    }
    setCooperationPartner("")
    setSelectedOptionalStages([])
    setMachineId("")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        <div className="flex flex-col max-h-[90vh] relative">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>
              {isCooperation ? "Новая деталь (Кооперация)" : "Новая деталь (Цех)"}
            </DialogTitle>
          </DialogHeader>
          
          <div ref={scrollRef} className="space-y-6 px-6 pb-24 pt-4 overflow-y-auto scroll-modal-body flex-1 min-h-0">
          {/* Role-based info alert */}
          {!isShopOnly && !isCooperationOnly && !canCreateOwnParts && canCreateCoopParts && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Вы можете создавать только кооперационные детали
              </AlertDescription>
            </Alert>
          )}
          
          {!isShopOnly && !isCooperationOnly && canCreateOwnParts && !canCreateCoopParts && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Вы можете создавать только цеховые детали
            </AlertDescription>
            </Alert>
          )}
          
          {/* Basic info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor={codeId}>Код детали *</Label>
              <Input
                id={codeId}
                placeholder="01488.900.725"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                aria-invalid={!!formError && !code}
                aria-describedby={formError ? formErrorId : undefined}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={nameId}>Название *</Label>
              <Input
                id={nameId}
                placeholder="Корпус основной"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={!!formError && !name}
                aria-describedby={formError ? formErrorId : undefined}
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor={descriptionId}>Описание</Label>
            <Textarea
              id={descriptionId}
              placeholder="Описание детали..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor={qtyPlanId}>Количество *</Label>
              <Input
                id={qtyPlanId}
                type="number"
                placeholder="1000"
                value={qtyPlan}
                onChange={(e) => setQtyPlan(e.target.value)}
                aria-invalid={!!formError && !qtyPlan}
                aria-describedby={formError ? formErrorId : undefined}
              />
            </div>
            {useSpecificationDeadline ? (
              <div className="space-y-2">
                <Label>Дедлайн</Label>
                <div className="h-11 rounded-md border px-3 flex items-center text-sm text-muted-foreground">
                  {defaultDeadline || "Будет взят из спецификации"}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor={deadlineId}>Дедлайн</Label>
                <Input
                  id={deadlineId}
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />
              </div>
            )}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor={customerId}>Заказчик</Label>
            <div className="relative">
              <Input
                id={customerId}
                placeholder="ООО Компания"
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
                onFocus={() => setIsCustomerFocused(true)}
                onBlur={() => setIsCustomerFocused(false)}
                autoComplete="off"
              />
              {showCustomerSuggestions && (
                <div className="absolute left-0 right-0 mt-2 z-30 rounded-lg border bg-background shadow-sm">
                  <div className="max-h-48 overflow-auto py-1">
                    {filteredCustomers.map((item) => (
                      <div key={item} className="flex items-center justify-between gap-2 px-2">
                        <button
                          type="button"
                          className="flex-1 text-left px-2 py-1.5 rounded-md hover:bg-muted"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setCustomer(item)
                            setIsCustomerFocused(false)
                          }}
                        >
                          <span className="text-sm">{item}</span>
                        </button>
                        <button
                          type="button"
                          className="h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
                          aria-label={`Удалить заказчика ${item}`}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => removeCustomerFromList(item)}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="border-t px-3 py-1 text-xs text-muted-foreground">
                    Нажмите на заказчика, чтобы выбрать. Можно удалить из списка.
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* Cooperation toggle - only if user can create both types */}
          {!isShopOnly && !isCooperationOnly && canCreateOwnParts && canCreateCoopParts && (
            <button
              type="button"
              className={`
                flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-colors
                ${isCooperation
                  ? "bg-muted border-foreground"
                  : "bg-background border-border hover:bg-muted/30 hover:border-muted-foreground/30"
                }
              `}
              onClick={toggleCooperation}
              aria-pressed={isCooperation}
            >
              <span className="inline-flex h-5 w-5 items-center justify-center rounded border text-xs">
                {isCooperation ? "✓" : ""}
              </span>
              <div className="flex items-center gap-2">
                <Building2 className={`h-5 w-5 ${isCooperation ? "text-foreground" : "text-muted-foreground"}`} />
                <span>Кооперация (деталь изготавливается на стороне)</span>
              </div>
            </button>
          )}
          
          {/* Cooperation partner input */}
          {isCooperation && (
            <div className="space-y-2">
              <Label htmlFor={partnerId}>Партнёр-кооператор</Label>
              <Input
                id={partnerId}
                placeholder="ООО Литейщик"
                value={cooperationPartner}
                onChange={(e) => setCooperationPartner(e.target.value)}
                aria-invalid={!!formError && isCooperation && !cooperationPartner.trim()}
                aria-describedby={formError ? formErrorId : undefined}
              />
            </div>
          )}
          
          {/* Stages selection */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Этапы производства</CardTitle>
            </CardHeader>
            <CardContent>
              {isCooperation ? (
                <>
                  <p className="text-xs text-muted-foreground mb-3">
                    Для кооперации этапы фиксированы
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {COOP_STAGES.map((stage) => (
                      <div key={stage} className="flex items-center gap-2 p-2.5 rounded-lg border bg-primary/10 border-primary overflow-hidden min-h-11">
                        <Checkbox checked disabled />
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {STAGE_ICONS[stage]}
                          <span className="text-sm leading-tight break-words">{STAGE_LABELS[stage]}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground mb-3">
                    Базовые этапы цеха фиксированы. Выберите только дополнительные операции.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                    {SHOP_REQUIRED_STAGES.map((stage) => (
                      <div key={stage} className="flex items-center gap-2 p-2.5 rounded-lg border bg-primary/10 border-primary overflow-hidden min-h-11">
                        <Checkbox checked disabled />
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {STAGE_ICONS[stage]}
                          <span className="text-sm leading-tight break-words">{STAGE_LABELS[stage]}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {SHOP_OPTIONAL_STAGES.map((stage) => (
                      <button
                        type="button"
                        key={stage}
                        className={`
                          flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors overflow-hidden min-h-11
                          ${selectedOptionalStages.includes(stage)
                            ? "bg-primary/10 border-primary"
                            : "bg-muted/50 border-transparent hover:border-muted-foreground/20"
                          }
                        `}
                        onClick={() => toggleOptionalStage(stage)}
                        aria-pressed={selectedOptionalStages.includes(stage)}
                      >
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded border text-xs">
                          {selectedOptionalStages.includes(stage) ? "✓" : ""}
                        </span>
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {STAGE_ICONS[stage]}
                          <span className="text-sm leading-tight break-words">{STAGE_LABELS[stage]}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {formError && (
            <Alert variant="destructive" role="status" aria-live="polite" id={formErrorId}>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}
          
          {/* Machine selection - required for own production */}
          {!isCooperation && (
            <div className="space-y-2">
              <Label htmlFor={machineIdField}>Станок для обработки *</Label>
              <Select value={machineId} onValueChange={setMachineId}>
                <SelectTrigger
                  id={machineIdField}
                  aria-invalid={!!formError && !isCooperation && !machineId}
                  aria-describedby={formError ? formErrorId : undefined}
                >
                  <SelectValue placeholder="Выберите станок" />
                </SelectTrigger>
                <SelectContent>
                  {machiningMachines.map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          </div>
          <DialogFooter
            className={cn(
              "gap-2 px-6 py-3 transition-[background-color,box-shadow,border-color,backdrop-filter,opacity] duration-200",
              "absolute bottom-0 left-0 right-0",
              footerHasScroll
                ? "border-t border-border/60 bg-background/55 backdrop-blur-lg"
                : "border-t border-border/30 bg-background/65 backdrop-blur-md",
              footerElevated
                ? "shadow-[0_-8px_20px_rgba(0,0,0,0.08)]"
                : "shadow-none"
            )}
          >
            <div
              className={cn(
                "pointer-events-none absolute inset-x-0 -top-6 h-6 bg-gradient-to-t from-background/70 to-transparent transition-opacity duration-200",
                footerElevated ? "opacity-100" : "opacity-0"
              )}
            />
            <Button variant="outline" className="bg-transparent" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button
              onClick={() => void handleCreate()}
              disabled={isSubmitting || !code || !name || !qtyPlan || (!isCooperation && !machineId)}
            >
              {submitLabel}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
