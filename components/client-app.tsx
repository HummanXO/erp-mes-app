"use client"

import { AppProvider } from "@/lib/app-context"
import { Dashboard } from "@/components/dashboard"

export function ClientApp() {
  return (
    <AppProvider>
      <Dashboard />
    </AppProvider>
  )
}
