"use client"

import { useParams, useRouter } from "next/navigation"
import { SpecificationsView } from "@/components/specifications-view"
import {
  getDocAlliancePartsPath,
  getDocAllianceSpecificationsPath,
} from "@/lib/docalliance-paths"

export default function SpecificationDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const specId = String(params.id)

  return (
    <SpecificationsView
      selectedSpecificationId={specId}
      onSelectSpecification={(nextId) => router.push(getDocAllianceSpecificationsPath(nextId))}
      onOpenPart={(partId) => router.push(getDocAlliancePartsPath(partId))}
    />
  )
}
