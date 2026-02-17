"use client"

import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import type { ReactNode } from "react"

interface EmptyStateCardProps {
  title: string
  description: string
  actionLabel: string
  onAction: () => void
  helpLabel?: string
  onHelp?: () => void
  icon?: ReactNode
  disabled?: boolean
}

export function EmptyStateCard({
  title,
  description,
  actionLabel,
  onAction,
  helpLabel = "Как работает",
  onHelp,
  icon,
  disabled,
}: EmptyStateCardProps) {
  return (
    <Empty className="border-none p-2 md:p-4">
      <EmptyHeader>
        {icon && <EmptyMedia variant="icon">{icon}</EmptyMedia>}
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button className="h-11" onClick={onAction} disabled={disabled}>
            {actionLabel}
          </Button>
          {onHelp && (
            <Button variant="ghost" className="h-11" onClick={onHelp}>
              {helpLabel}
            </Button>
          )}
        </div>
      </EmptyContent>
    </Empty>
  )
}
