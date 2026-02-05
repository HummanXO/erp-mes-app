"use client"

import { useState } from "react"
import { useApp } from "@/lib/app-context"
import { ROLE_LABELS } from "@/lib/types"
import { LoginPage } from "@/components/login-page"
import { LoginPageApi } from "@/components/login-page-api"
import { AppSidebar } from "@/components/app-sidebar"
import { PartsView } from "@/components/parts-view"
import { AllTasksView } from "@/components/all-tasks-view"
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import * as dataProvider from "@/lib/data-provider-adapter"

type View = "parts" | "tasks"

export function Dashboard() {
  const { currentUser, getUnreadTasksCount } = useApp()
  
  const [activeView, setActiveView] = useState<View>("parts")
  const unreadCount = getUnreadTasksCount()

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
            {activeView === "parts" ? "Детали" : "Все задачи"}
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
          ) : (
            <AllTasksView />
          )}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
