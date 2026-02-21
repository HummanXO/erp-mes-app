"use client"

import { useRouter } from "next/navigation"
import { PartsView } from "@/components/parts-view"
import { getDocAlliancePartsPath } from "@/lib/docalliance-paths"

export default function PartsPage() {
  const router = useRouter()

  return (
    <PartsView onSelectPart={(partId) => router.push(getDocAlliancePartsPath(partId))} />
  )
}
