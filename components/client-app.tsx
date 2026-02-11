"use client"

import { useEffect } from "react"
import { AppProvider } from "@/lib/app-context"
import { Dashboard } from "@/components/dashboard"
import { AppErrorBoundary } from "@/components/app-error-boundary"

export function ClientApp() {
  useEffect(() => {
    const RELOAD_GUARD_KEY = "pc.chunk.reload.once"

    const shouldReload = () => {
      if (typeof window === "undefined") return false
      return sessionStorage.getItem(RELOAD_GUARD_KEY) !== "1"
    }

    const markReloaded = () => {
      if (typeof window === "undefined") return
      sessionStorage.setItem(RELOAD_GUARD_KEY, "1")
    }

    const isChunkLoadError = (input: unknown): boolean => {
      const message = String(
        (input as { message?: string })?.message
        ?? (input as { reason?: { message?: string } })?.reason?.message
        ?? ""
      ).toLowerCase()
      return (
        message.includes("loading chunk") ||
        message.includes("chunkloaderror") ||
        message.includes("failed to fetch dynamically imported module")
      )
    }

    const reloadOnChunkError = (payload: unknown) => {
      if (!isChunkLoadError(payload) || !shouldReload()) return
      markReloaded()
      window.location.reload()
    }

    const onWindowError = (event: ErrorEvent) => {
      reloadOnChunkError(event.error ?? event)
    }

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      reloadOnChunkError(event.reason)
    }

    window.addEventListener("error", onWindowError)
    window.addEventListener("unhandledrejection", onUnhandledRejection)

    return () => {
      window.removeEventListener("error", onWindowError)
      window.removeEventListener("unhandledrejection", onUnhandledRejection)
    }
  }, [])

  return (
    <AppProvider>
      <AppErrorBoundary>
        <Dashboard />
      </AppErrorBoundary>
    </AppProvider>
  )
}
