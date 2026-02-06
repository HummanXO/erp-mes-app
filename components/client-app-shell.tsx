"use client"

import dynamic from "next/dynamic"

const ClientAppNoSSR = dynamic(
  () => import("@/components/client-app").then((mod) => mod.ClientApp),
  { ssr: false }
)

export function ClientAppShell() {
  return <ClientAppNoSSR />
}
