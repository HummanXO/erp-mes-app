import type { ReactNode } from "react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const toneClasses: Record<"info" | "success" | "warning" | "danger", string> = {
  info: "bg-[color:var(--status-info-bg)] text-[color:var(--status-info-fg)] border border-[color:var(--status-info-border)]",
  success: "bg-[color:var(--status-success-bg)] text-[color:var(--status-success-fg)] border border-[color:var(--status-success-border)]",
  warning: "bg-[color:var(--status-warning-bg)] text-[color:var(--status-warning-fg)] border border-[color:var(--status-warning-border)]",
  danger: "bg-[color:var(--status-danger-bg)] text-[color:var(--status-danger-fg)] border border-[color:var(--status-danger-border)]",
}

export function StatusBadge({
  tone,
  children,
  className,
}: {
  tone: "info" | "success" | "warning" | "danger"
  children: ReactNode
  className?: string
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-medium",
        toneClasses[tone],
        className
      )}
    >
      {children}
    </Badge>
  )
}
