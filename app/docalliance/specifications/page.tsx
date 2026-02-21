"use client"

import { useRouter } from "next/navigation"
import { SpecificationsView } from "@/components/specifications-view"
import {
  getDocAlliancePartsPath,
  getDocAllianceSpecificationsPath,
} from "@/lib/docalliance-paths"

export default function SpecificationsPage() {
  const router = useRouter()

  return (
    <SpecificationsView
      onSelectSpecification={(specId) => router.push(getDocAllianceSpecificationsPath(specId))}
      onOpenPart={(partId) => router.push(getDocAlliancePartsPath(partId))}
    />
  )
}
