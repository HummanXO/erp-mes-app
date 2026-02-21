"use client"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

interface NewSpecificationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  number: string
  customer: string
  deadline: string
  note: string
  onNumberChange: (value: string) => void
  onCustomerChange: (value: string) => void
  onDeadlineChange: (value: string) => void
  onNoteChange: (value: string) => void
  onCreate: () => void
  busy?: boolean
}

export function NewSpecificationModal({
  open,
  onOpenChange,
  number,
  customer,
  deadline,
  note,
  onNumberChange,
  onCustomerChange,
  onDeadlineChange,
  onNoteChange,
  onCreate,
  busy,
}: NewSpecificationModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl">Новая спецификация</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-2">
            <Label htmlFor="spec-number">Номер *</Label>
            <Input
              id="spec-number"
              className="h-11"
              placeholder="СП-2026-003"
              value={number}
              onChange={(event) => onNumberChange(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="spec-customer">Клиент</Label>
            <Input
              id="spec-customer"
              className="h-11"
              placeholder="ООО Заказчик"
              value={customer}
              onChange={(event) => onCustomerChange(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="spec-deadline">Дедлайн спецификации</Label>
            <Input
              id="spec-deadline"
              className="h-11"
              type="date"
              value={deadline}
              onChange={(event) => onDeadlineChange(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="spec-note">Примечание</Label>
            <Textarea
              id="spec-note"
              rows={3}
              placeholder="Комментарий к заказу"
              value={note}
              onChange={(event) => onNoteChange(event.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button className="h-11" onClick={onCreate} disabled={busy}>
            Создать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
