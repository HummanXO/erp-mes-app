"use client"

import type { Part } from "@/lib/types"
import { useApp } from "@/lib/app-context"
import { CreatePartDialog } from "@/components/create-part-dialog"

interface SpecItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  specificationId: string
  defaultCustomer?: string
}

function buildDescription(part: Part): string {
  return `${part.code} ${part.name}`.trim()
}

export function SpecItemDialog({ open, onOpenChange, specificationId, defaultCustomer }: SpecItemDialogProps) {
  const { createSpecItem } = useApp()

  const handlePartCreated = async (part: Part) => {
    await createSpecItem(specificationId, {
      item_type: part.is_cooperation ? "coop" : "make",
      part_id: part.id,
      description: buildDescription(part),
      qty_required: part.qty_plan,
      uom: "шт",
    })
  }

  return (
    <CreatePartDialog
      open={open}
      onOpenChange={onOpenChange}
      sourceSpecificationId={specificationId}
      defaultCustomer={defaultCustomer}
      submitLabel="Создать и добавить позицию"
      onPartCreated={handlePartCreated}
    />
  )
}
