"use client"

import { ClientApp } from "@/components/client-app"

// Force dynamic rendering - this page depends on auth state
export const dynamic = "force-dynamic"

export default function Home() {
  return <ClientApp />
}
