"use client"

import React from "react"

import { useState, useEffect } from "react"
import { useApp } from "@/lib/app-context"
import type { ProductionStage, StageStatus } from "@/lib/types"
import { STAGE_LABELS } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { 
  Cog,
  Wrench,
  Zap,
  Flame,
  CircleDot,
  CheckSquare,
  Truck,
  Building2,
  AlertCircle
} from "lucide-react"

const STAGE_ICONS: Record<ProductionStage, React.ReactNode> = {
  machining: <Cog className="h-4 w-4" />,
  fitting: <Wrench className="h-4 w-4" />,
  galvanic: <Zap className="h-4 w-4" />,
  heat_treatment: <Flame className="h-4 w-4" />,
  grinding: <CircleDot className="h-4 w-4" />,
  qc: <CheckSquare className="h-4 w-4" />,
  logistics: <Truck className="h-4 w-4" />,
}

const COOP_STAGES: ProductionStage[] = ["logistics", "qc"]
const SHOP_REQUIRED_STAGES: ProductionStage[] = ["machining", "fitting", "qc"]
const SHOP_OPTIONAL_STAGES: ProductionStage[] = ["galvanic", "heat_treatment", "grinding", "logistics"]

interface CreatePartDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreatePartDialog({ open, onOpenChange }: CreatePartDialogProps) {
  const { createPart, machines, permissions } = useApp()
  
  // Form state
  const [code, setCode] = useState("")
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [qtyPlan, setQtyPlan] = useState("")
  const [deadline, setDeadline] = useState("")
  const [customer, setCustomer] = useState("")
  const [formError, setFormError] = useState("")
  
  // Cooperation
  const [isCooperation, setIsCooperation] = useState(false)
  const [cooperationPartner, setCooperationPartner] = useState("")
  
  // Stages
  const [selectedOptionalStages, setSelectedOptionalStages] = useState<ProductionStage[]>([])
  
  // Machine (for machining stage)
  const [machineId, setMachineId] = useState("")
  
  const machiningMachines = machines.filter(m => m.department === "machining")
  
  // Determine what the user can create based on permissions
  const canCreateOwnParts = permissions.canCreateOwnParts
  const canCreateCoopParts = permissions.canCreateCoopParts
  
  // If user can only create cooperation parts, default to cooperation mode
  useEffect(() => {
    if (!canCreateOwnParts && canCreateCoopParts) {
      setIsCooperation(true)
      setSelectedOptionalStages([])
    }
  }, [canCreateOwnParts, canCreateCoopParts])

  const toggleCooperation = () => {
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
  
  const handleCreate = () => {
    setFormError("")
    if (!code || !name || !qtyPlan || !deadline) return
    if (!isCooperation && !machineId) {
      setFormError("Для цеховой детали нужно выбрать станок")
      return
    }
    if (isCooperation && !cooperationPartner.trim()) {
      setFormError("Для кооперации укажите партнёра-кооператора")
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
    
    createPart({
      code,
      name,
      description: description || undefined,
      qty_plan: Number.parseInt(qtyPlan, 10),
      qty_done: 0,
      deadline,
      status: "not_started",
      is_cooperation: isCooperation,
      cooperation_partner: isCooperation ? cooperationPartner.trim() : undefined,
      required_stages: requiredStages,
      stage_statuses: stageStatuses,
      machine_id: !isCooperation ? machineId : undefined,
      customer: customer || undefined,
    })
    
    // Reset and close
    resetForm()
    onOpenChange(false)
  }
  
  const resetForm = () => {
    setCode("")
    setName("")
    setDescription("")
    setQtyPlan("")
    setDeadline("")
    setCustomer("")
    setFormError("")
    setIsCooperation(!canCreateOwnParts && canCreateCoopParts)
    setCooperationPartner("")
    setSelectedOptionalStages([])
    setMachineId("")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isCooperation ? "Новая деталь (Кооперация)" : "Новая деталь (Цех)"}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* Role-based info alert */}
          {!canCreateOwnParts && canCreateCoopParts && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Вы можете создавать только кооперационные детали
              </AlertDescription>
            </Alert>
          )}
          
          {canCreateOwnParts && !canCreateCoopParts && (
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
              <Label>Код детали *</Label>
              <Input
                placeholder="01488.900.725"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Название *</Label>
              <Input
                placeholder="Корпус основной"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label>Описание</Label>
            <Textarea
              placeholder="Описание детали..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Количество *</Label>
              <Input
                type="number"
                placeholder="1000"
                value={qtyPlan}
                onChange={(e) => setQtyPlan(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Дедлайн *</Label>
              <Input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label>Заказчик</Label>
            <Input
              placeholder="ООО Компания"
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
            />
          </div>
          
          {/* Cooperation toggle - only if user can create both types */}
          {canCreateOwnParts && canCreateCoopParts && (
            <div
              className={`
                flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-colors
                ${isCooperation
                  ? "bg-muted border-foreground"
                  : "bg-background border-border hover:bg-muted/30 hover:border-muted-foreground/30"
                }
              `}
              onClick={toggleCooperation}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  toggleCooperation()
                }
              }}
            >
              <Checkbox
                id="cooperation"
                checked={isCooperation}
                onClick={(e) => e.stopPropagation()}
                onCheckedChange={(checked) => {
                  setIsCooperation(checked === true)
                  setSelectedOptionalStages([])
                }}
              />
              <div className="flex items-center gap-2">
                <Building2 className={`h-5 w-5 ${isCooperation ? "text-foreground" : "text-muted-foreground"}`} />
                <span>Кооперация (деталь изготавливается на стороне)</span>
              </div>
            </div>
          )}
          
          {/* Cooperation partner input */}
          {isCooperation && (
            <div className="space-y-2">
              <Label>Партнёр-кооператор</Label>
              <Input
                placeholder="ООО Литейщик"
                value={cooperationPartner}
                onChange={(e) => setCooperationPartner(e.target.value)}
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
                  <div className="grid grid-cols-2 gap-2">
                    {COOP_STAGES.map((stage) => (
                      <div key={stage} className="flex items-center gap-3 p-3 rounded-lg border bg-primary/10 border-primary">
                        <Checkbox checked disabled />
                        <div className="flex items-center gap-2">
                          {STAGE_ICONS[stage]}
                          <span>{STAGE_LABELS[stage]}</span>
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
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {SHOP_REQUIRED_STAGES.map((stage) => (
                      <div key={stage} className="flex items-center gap-3 p-3 rounded-lg border bg-primary/10 border-primary">
                        <Checkbox checked disabled />
                        <div className="flex items-center gap-2">
                          {STAGE_ICONS[stage]}
                          <span>{STAGE_LABELS[stage]}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {SHOP_OPTIONAL_STAGES.map((stage) => (
                      <div
                        key={stage}
                        className={`
                          flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors
                          ${selectedOptionalStages.includes(stage)
                            ? "bg-primary/10 border-primary"
                            : "bg-muted/50 border-transparent hover:border-muted-foreground/20"
                          }
                        `}
                        onClick={() => toggleOptionalStage(stage)}
                      >
                        <Checkbox
                          checked={selectedOptionalStages.includes(stage)}
                          onCheckedChange={() => toggleOptionalStage(stage)}
                        />
                        <div className="flex items-center gap-2">
                          {STAGE_ICONS[stage]}
                          <span>{STAGE_LABELS[stage]}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {formError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}
          
          {/* Machine selection - required for own production */}
          {!isCooperation && (
            <div className="space-y-2">
              <Label>Станок для обработки *</Label>
              <Select value={machineId} onValueChange={setMachineId}>
                <SelectTrigger>
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
        
        <DialogFooter>
          <Button variant="outline" className="bg-transparent" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={handleCreate} disabled={!code || !name || !qtyPlan || !deadline || (!isCooperation && !machineId)}>
            Создать деталь
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
