"use client"

import { useEffect, useState } from "react"
import { useApp } from "@/lib/app-context"
import { ROLE_LABELS } from "@/lib/types"
import { LoginPage } from "@/components/login-page"
import { LoginPageApi } from "@/components/login-page-api"
import { AppSidebar } from "@/components/app-sidebar"
import { PartsView } from "@/components/parts-view"
import { AllTasksView } from "@/components/all-tasks-view"
import { InventoryView } from "@/components/inventory/inventory-view"
import { SpecificationsView } from "@/components/specifications-view"
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import * as dataProvider from "@/lib/data-provider-adapter"

type View = "parts" | "tasks" | "inventory" | "specifications"

export function Dashboard() {
  const { currentUser, getUnreadTasksCount, permissions } = useApp()
  
  const [activeView, setActiveView] = useState<View>("parts")
  const unreadCount = getUnreadTasksCount()

  useEffect(() => {
    if (activeView === "inventory" && !permissions.canViewInventory) {
      setActiveView("parts")
    }
    if (activeView === "specifications" && !permissions.canViewSpecifications) {
      setActiveView("parts")
    }
  }, [activeView, permissions.canViewInventory, permissions.canViewSpecifications])

  // Not logged in
  if (!currentUser) {
    // Show API login form if using HTTP API, otherwise show user picker
    return dataProvider.isUsingApi() ? <LoginPageApi /> : <LoginPage />
  }

  return (
    <SidebarProvider>
      <AppSidebar activeView={activeView} onViewChange={setActiveView} />
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
          {activeView === "parts" ? (
            <PartsView />
          ) : activeView === "tasks" ? (
            <AllTasksView />
          ) : activeView === "inventory" && permissions.canViewInventory ? (
            <InventoryView />
          ) : activeView === "specifications" && permissions.canViewSpecifications ? (
            <SpecificationsView />
          ) : (
            <PartsView />
          )}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
