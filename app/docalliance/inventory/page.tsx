"use client"

import { useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { InventoryView } from "@/components/inventory/inventory-view"
import { getDocAllianceInventoryPath } from "@/lib/docalliance-paths"

const INVENTORY_TABS = new Set(["overview", "metal", "tooling", "movements"])

export default function InventoryPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const initialTab = useMemo(() => {
    const fromQuery = searchParams.get("tab")
    return fromQuery && INVENTORY_TABS.has(fromQuery) ? fromQuery : undefined
  }, [searchParams])

  return (
    <InventoryView
      initialTab={initialTab}
      onTabChange={(tab) => router.replace(getDocAllianceInventoryPath(tab), { scroll: false })}
    />
  )
}
