"use client"

import { SpecItemDialog } from "@/components/specifications/spec-item-dialog"

interface NewPositionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  specificationId: string
  defaultCustomer?: string
  defaultDeadline?: string
  enabled: boolean
}

export function NewPositionModal({
  open,
  onOpenChange,
  specificationId,
  defaultCustomer,
  defaultDeadline,
  enabled,
}: NewPositionModalProps) {
  return (
    <SpecItemDialog
      open={open && enabled}
      onOpenChange={onOpenChange}
      specificationId={specificationId}
      defaultCustomer={defaultCustomer}
      defaultDeadline={defaultDeadline}
    />
  )
}
