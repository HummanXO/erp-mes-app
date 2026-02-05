"use client"

import React from "react"

import { useState, useEffect } from "react"
import { useApp } from "@/lib/app-context"
import type { Priority, ProductionStage, StageStatus } from "@/lib/types"
import { STAGE_LABELS, PRIORITY_LABELS } from "@/lib/types"
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

const ALL_STAGES: ProductionStage[] = ["machining", "fitting", "galvanic", "heat_treatment", "grinding", "qc", "logistics"]

interface CreatePartDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreatePartDialog({ open, onOpenChange }: CreatePartDialogProps) {
  const { createPart, machines, permissions, currentUser } = useApp()
  
  // Form state
  const [code, setCode] = useState("")
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [qtyPlan, setQtyPlan] = useState("")
  const [priority, setPriority] = useState<Priority>("medium")
  const [deadline, setDeadline] = useState("")
  const [customer, setCustomer] = useState("")
  
  // Cooperation
  const [isCooperation, setIsCooperation] = useState(false)
  const [cooperationPartner, setCooperationPartner] = useState("")
  
  // Stages
  const [selectedStages, setSelectedStages] = useState<ProductionStage[]>(["machining", "qc"])
  
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
      setSelectedStages(["logistics", "qc"])
    }
  }, [canCreateOwnParts, canCreateCoopParts])
  
  const toggleStage = (stage: ProductionStage) => {
    if (selectedStages.includes(stage)) {
      setSelectedStages(selectedStages.filter(s => s !== stage))
    } else {
      setSelectedStages([...selectedStages, stage])
    }
  }
  
  const handleCreate = () => {
    if (!code || !name || !qtyPlan || !deadline) return
    
    // Create stage statuses
    const stageStatuses: StageStatus[] = selectedStages.map(stage => ({
      stage,
      status: "pending" as const,
    }))
    
    createPart({
      code,
      name,
      description: description || undefined,
      qty_plan: Number.parseInt(qtyPlan, 10),
      qty_done: 0,
      priority,
      deadline,
      status: "not_started",
      is_cooperation: isCooperation,
      cooperation_partner: isCooperation ? cooperationPartner : undefined,
      required_stages: selectedStages,
      stage_statuses: stageStatuses,
      machine_id: selectedStages.includes("machining") && !isCooperation ? machineId : undefined,
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
    setPriority("medium")
    setDeadline("")
    setCustomer("")
    setIsCooperation(!canCreateOwnParts && canCreateCoopParts)
    setCooperationPartner("")
    setSelectedStages(canCreateOwnParts ? ["machining", "qc"] : ["logistics", "qc"])
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
          
          <div className="grid grid-cols-3 gap-4">
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
              <Label>Приоритет</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            <Card className={isCooperation ? "border-blue-200 bg-blue-50/50 dark:bg-blue-950/20" : ""}>
              <CardContent className="p-4">
                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="cooperation"
                    checked={isCooperation}
                    onCheckedChange={(checked) => {
                      setIsCooperation(checked === true)
                      if (checked) {
                        setSelectedStages(["logistics", "qc"])
                      } else {
                        setSelectedStages(["machining", "qc"])
                      }
                    }}
                  />
                  <div className="flex items-center gap-2">
                    <Building2 className={`h-5 w-5 ${isCooperation ? "text-blue-600" : "text-muted-foreground"}`} />
                    <Label htmlFor="cooperation" className="cursor-pointer">
                      Кооперация (деталь изготавливается на стороне)
                    </Label>
                  </div>
                </div>
              </CardContent>
            </Card>
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
              <p className="text-xs text-muted-foreground mb-3">
                Выберите этапы, через которые проходит деталь
              </p>
              <div className="grid grid-cols-2 gap-2">
                {ALL_STAGES.map(stage => (
                  <div 
                    key={stage}
                    className={`
                      flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors
                      ${selectedStages.includes(stage) 
                        ? "bg-primary/10 border-primary" 
                        : "bg-muted/50 border-transparent hover:border-muted-foreground/20"
                      }
                    `}
                    onClick={() => toggleStage(stage)}
                  >
                    <Checkbox
                      checked={selectedStages.includes(stage)}
                      onCheckedChange={() => toggleStage(stage)}
                    />
                    <div className="flex items-center gap-2">
                      {STAGE_ICONS[stage]}
                      <span>{STAGE_LABELS[stage]}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          
          {/* Machine selection - only if machining is selected and not cooperation */}
          {selectedStages.includes("machining") && !isCooperation && (
            <div className="space-y-2">
              <Label>Станок для обработки</Label>
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
          <Button onClick={handleCreate} disabled={!code || !name || !qtyPlan || !deadline}>
            Создать деталь
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
