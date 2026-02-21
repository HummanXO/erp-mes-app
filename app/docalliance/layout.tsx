"use client"

import { useCallback, useMemo } from "react"
import { usePathname, useRouter } from "next/navigation"
import { AppProvider, useApp } from "@/lib/app-context"
import { AppErrorBoundary } from "@/components/app-error-boundary"
import { DashboardShell } from "@/components/dashboard"
import type { View } from "@/components/dashboard"
import { getDocAlliancePathForView, getDocAllianceViewFromPath } from "@/lib/docalliance-paths"

function DocAllianceShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { permissions } = useApp()

  const activeView = useMemo(
    () => getDocAllianceViewFromPath(pathname, permissions.canViewSpecifications),
    [pathname, permissions.canViewSpecifications]
  )

  const handleViewChange = useCallback(
    (view: View) => {
      router.push(getDocAlliancePathForView(view))
    },
    [router]
  )

  return (
    <DashboardShell activeView={activeView} onViewChange={handleViewChange}>
      {children}
    </DashboardShell>
  )
}

export default function DocAllianceLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <AppErrorBoundary>
        <DocAllianceShell>{children}</DocAllianceShell>
      </AppErrorBoundary>
    </AppProvider>
  )
}
