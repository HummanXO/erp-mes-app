"use client"

import { useMemo } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { PartsView } from "@/components/parts-view"
import {
  getDocAlliancePartTaskPath,
  getDocAlliancePartsPath,
} from "@/lib/docalliance-paths"

const PART_TABS = new Set(["overview", "facts", "journal", "logistics", "tasks", "audit", "drawing"])

export default function PartDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const partId = String(params.id)

  const activeTab = useMemo(() => {
    const fromQuery = searchParams.get("tab")
    return fromQuery && PART_TABS.has(fromQuery) ? fromQuery : "overview"
  }, [searchParams])

  const handleBack = () => {
    if (window.history.length > 1) {
      router.back()
    } else {
      router.push(getDocAlliancePartsPath())
    }
  }

  const handleTabChange = (nextTab: string) => {
    if (nextTab === "overview") {
      router.replace(getDocAlliancePartsPath(partId), { scroll: false })
      return
    }
    router.replace(getDocAlliancePartsPath(partId, nextTab), { scroll: false })
  }

  return (
    <PartsView
      selectedPartId={partId}
      onBack={handleBack}
      detailTab={activeTab}
      onDetailTabChange={handleTabChange}
      onSelectTask={(taskId) => router.push(getDocAlliancePartTaskPath(partId, taskId))}
    />
  )
}
