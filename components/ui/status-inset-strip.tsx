import React from "react"

import { cn } from "@/lib/utils"

type StatusInsetTone = "neutral" | "info" | "success" | "warning" | "danger"

interface StatusInsetStripProps {
  tone?: StatusInsetTone
  title?: string
  className?: string
  children?: React.ReactNode
}

const TONE_CLASSES: Record<StatusInsetTone, string> = {
  neutral: "border-l-border bg-muted/40 text-foreground",
  info: "border-l-[var(--status-info-border)] bg-[var(--status-info-bg)] text-[var(--status-info-fg)]",
  success: "border-l-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-fg)]",
  warning: "border-l-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]",
  danger: "border-l-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-fg)]",
}

export function StatusInsetStrip({
  tone = "neutral",
  title,
  className,
  children,
}: StatusInsetStripProps) {
  return (
    <div className={cn("border-l-[3px] px-4 py-3", TONE_CLASSES[tone], className)}>
      {title ? <div className="text-xs font-medium uppercase tracking-wide">{title}</div> : null}
      {children ? <div className={cn("text-sm", title && "mt-1")}>{children}</div> : null}
    </div>
  )
}
