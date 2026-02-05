"use client"

import { AppProvider } from "@/lib/app-context"
import { Dashboard } from "@/components/dashboard"

export default function Home() {
  return (
    <AppProvider>
      <Dashboard />
    </AppProvider>
  )
}
