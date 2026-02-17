import { cn } from "@/lib/utils"

export interface KPIItem {
  key: string
  label: string
  value: string
  hint?: string
}

interface KPIStripProps {
  items: KPIItem[]
  className?: string
}

export function KPIStrip({ items, className }: KPIStripProps) {
  if (items.length === 0) return null

  return (
    <div
      className={cn(
        "grid gap-0 rounded-none border-y border-border bg-transparent sm:grid-cols-2 lg:grid-cols-4",
        className
      )}
    >
      {items.map((item, index) => (
        <div
          key={item.key}
          className={cn(
            "min-h-16 px-4 py-3",
            index > 0 && "border-t border-border sm:border-t-0 sm:border-l"
          )}
        >
          <div className="text-xs text-muted-foreground">{item.label}</div>
          <div className="mt-1 text-base font-semibold text-foreground">{item.value}</div>
          {item.hint ? <div className="mt-1 text-xs text-muted-foreground">{item.hint}</div> : null}
        </div>
      ))}
    </div>
  )
}
