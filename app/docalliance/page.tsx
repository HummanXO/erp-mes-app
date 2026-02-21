"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useApp } from "@/lib/app-context"
import { getDocAlliancePathForView } from "@/lib/docalliance-paths"

export default function DocAllianceIndexPage() {
  const router = useRouter()
  const { currentUser, permissions } = useApp()

  useEffect(() => {
    if (!currentUser) return
    const target = getDocAlliancePathForView(
      permissions.canViewSpecifications ? "specifications" : "parts"
    )
    router.replace(target)
  }, [currentUser, permissions.canViewSpecifications, router])

  return null
}
