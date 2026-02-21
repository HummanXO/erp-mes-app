"use client"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"

interface DeleteConfirmationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  itemName?: string
  withCascadeOption?: boolean
  cascadeChecked?: boolean
  onCascadeCheckedChange?: (checked: boolean) => void
  onConfirm: () => void
  busy?: boolean
}

export function DeleteConfirmationModal({
  open,
  onOpenChange,
  title,
  description,
  itemName,
  withCascadeOption = false,
  cascadeChecked = false,
  onCascadeCheckedChange,
  onConfirm,
  busy,
}: DeleteConfirmationModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <p className="text-sm text-muted-foreground">{description}</p>
          {itemName && <p className="rounded-md bg-muted/40 px-3 py-2 text-sm font-medium">{itemName}</p>}

          {withCascadeOption && onCascadeCheckedChange && (
            <div className="rounded-md border p-3">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="delete-linked-parts"
                  checked={cascadeChecked}
                  onCheckedChange={(checked) => onCascadeCheckedChange(Boolean(checked))}
                />
                <div className="space-y-1">
                  <Label htmlFor="delete-linked-parts" className="text-sm font-medium">
                    Удалить связанные детали каскадом
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Удаляются только детали, которые больше не используются в других спецификациях.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button className="h-11" onClick={onConfirm} disabled={busy}>
            Удалить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
