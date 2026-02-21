"use client"

import { useEffect, useState } from "react"
import { useApp } from "@/lib/app-context"
import type { DocAllianceView } from "@/lib/docalliance-paths"
import { ROLE_LABELS } from "@/lib/types"
import { LoginPage } from "@/components/login-page"
import { LoginPageApi } from "@/components/login-page-api"
import { AppSidebar } from "@/components/app-sidebar"
import { PartsView } from "@/components/parts-view"
import { AllTasksView } from "@/components/all-tasks-view"
import { InventoryView } from "@/components/inventory/inventory-view"
import { SpecificationsView } from "@/components/specifications-view"
import { AdminUsersView } from "@/components/admin-users-view"
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import * as dataProvider from "@/lib/data-provider-adapter"

export type View = DocAllianceView

interface DashboardShellProps {
  activeView: View
  onViewChange: (view: View) => void
  children: React.ReactNode
}

export function DashboardShell({ activeView, onViewChange, children }: DashboardShellProps) {
  const { currentUser, getUnreadTasksCount, permissions } = useApp()
  const unreadCount = getUnreadTasksCount()

  useEffect(() => {
    if (activeView === "inventory" && !permissions.canViewInventory) {
      onViewChange("parts")
    }
    if (activeView === "specifications" && !permissions.canViewSpecifications) {
      onViewChange("parts")
    }
  }, [activeView, permissions.canViewInventory, permissions.canViewSpecifications, onViewChange])

  // Not logged in
  if (!currentUser) {
    // Show API login form if using HTTP API, otherwise show user picker
    return dataProvider.isUsingApi() ? <LoginPageApi /> : <LoginPage />
  }

  return (
    <SidebarProvider>
      <AppSidebar activeView={activeView} onViewChange={onViewChange} />
      <SidebarInset className="flex flex-col">
        <header className="flex h-14 items-center gap-2 border-b px-4 lg:px-6">
          <SidebarTrigger className="-ml-2" />
          <Separator orientation="vertical" className="h-6" />
          <h1 className="font-semibold">
            {activeView === "parts"
              ? "Детали"
              : activeView === "tasks"
                ? "Все задачи"
                : activeView === "inventory"
                  ? permissions.canViewInventory ? "Склад" : "Детали"
                  : activeView === "adminUsers"
                    ? "Пользователи"
                    : permissions.canViewSpecifications ? "Спецификации" : "Детали"}
          </h1>
          <div className="flex items-center gap-2 ml-auto">
            {/* Unread tasks badge */}
            {unreadCount > 0 && (
              <Badge variant="destructive">
                {unreadCount} новых задач
              </Badge>
            )}
            {/* Current user */}
            <Badge variant="secondary">
              {currentUser.initials} - {ROLE_LABELS[currentUser.role]}
            </Badge>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-4 lg:p-6">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}

export function Dashboard() {
  const { currentUser, permissions } = useApp()
  
  const [activeView, setActiveView] = useState<View>("parts")
  const [defaultViewUserId, setDefaultViewUserId] = useState<string | null>(null)
  useEffect(() => {
    if (!currentUser) {
      setDefaultViewUserId(null)
      setActiveView("parts")
      return
    }
    if (defaultViewUserId === currentUser.id) return
    setActiveView(permissions.canViewSpecifications ? "specifications" : "parts")
    setDefaultViewUserId(currentUser.id)
  }, [currentUser, permissions.canViewSpecifications, defaultViewUserId])

  useEffect(() => {
    const openPartListener = () => {
      setActiveView("parts")
    }

    window.addEventListener("pc-open-part", openPartListener)
    return () => {
      window.removeEventListener("pc-open-part", openPartListener)
    }
  }, [])

  useEffect(() => {
    const switchViewListener = (event: Event) => {
      const customEvent = event as CustomEvent<{ view?: View }>
      const targetView = customEvent.detail?.view
      if (!targetView) return
      if (targetView === "inventory" && !permissions.canViewInventory) return
      if (targetView === "specifications" && !permissions.canViewSpecifications) return
      setActiveView(targetView)
    }

    window.addEventListener("pc-switch-view", switchViewListener)
    return () => {
      window.removeEventListener("pc-switch-view", switchViewListener)
    }
  }, [permissions.canViewInventory, permissions.canViewSpecifications])

  return (
    <DashboardShell activeView={activeView} onViewChange={setActiveView}>
      {activeView === "parts" ? (
        <PartsView />
      ) : activeView === "tasks" ? (
        <AllTasksView />
      ) : activeView === "inventory" && permissions.canViewInventory ? (
        <InventoryView />
      ) : activeView === "adminUsers" ? (
        <AdminUsersView />
      ) : activeView === "specifications" && permissions.canViewSpecifications ? (
        <SpecificationsView />
      ) : (
        <PartsView />
      )}
    </DashboardShell>
  )
}
