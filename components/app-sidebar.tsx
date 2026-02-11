"use client"

import { useApp } from "@/lib/app-context"
import * as dataProvider from "@/lib/data-provider-adapter"
import { ROLE_LABELS } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar"
import { 
  Factory, 
  Package, 
  ListTodo, 
  LogOut, 
  RefreshCw,
  Calendar,
  User,
  Warehouse
} from "lucide-react"
import { cn } from "@/lib/utils"

interface AppSidebarProps {
  activeView: "parts" | "tasks" | "inventory"
  onViewChange: (view: "parts" | "tasks" | "inventory") => void
}

export function AppSidebar({ activeView, onViewChange }: AppSidebarProps) {
  const { currentUser, logout, demoDate, setDemoDate, resetData, getAllBlockers, getOverdueTasks, getUnreadTasksCount, inventoryMetal, inventoryTooling, permissions } = useApp()
  const usingApi = dataProvider.isUsingApi()

  const blockers = getAllBlockers()
  const overdue = getOverdueTasks()
  const unreadCount = getUnreadTasksCount()
  const lowMetal = inventoryMetal.filter(item => {
    if (!item.min_level) return false
    const pcsOk = item.min_level.pcs !== undefined ? (item.qty.pcs ?? 0) < item.min_level.pcs : false
    const kgOk = item.min_level.kg !== undefined ? (item.qty.kg ?? 0) < item.min_level.kg : false
    return pcsOk || kgOk
  }).length
  const lowTooling = inventoryTooling.filter(item => {
    if (item.min_level === undefined) return false
    return item.qty < item.min_level
  }).length
  const lowStockCount = lowMetal + lowTooling

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <Factory className="h-6 w-6 text-primary" />
          <span className="font-semibold text-lg">Производство</span>
        </div>
      </SidebarHeader>
      
      <SidebarContent className="px-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton 
              isActive={activeView === "parts"}
              onClick={() => onViewChange("parts")}
              className="justify-start"
            >
              <Package className="h-4 w-4" />
              <span>Детали</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          
          <SidebarMenuItem>
            <SidebarMenuButton 
              isActive={activeView === "tasks"}
              onClick={() => onViewChange("tasks")}
              className="justify-start relative"
            >
              <ListTodo className="h-4 w-4" />
              <span>Все задачи</span>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 h-4 w-4 bg-blue-500 text-white text-xs rounded-full flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
              {(blockers.length > 0 || overdue.length > 0) && unreadCount === 0 && (
                <span className={cn(
                  "ml-auto text-xs px-1.5 py-0.5 rounded-full",
                  blockers.length > 0 ? "bg-destructive text-destructive-foreground" : "bg-amber-500 text-white"
                )}>
                  {blockers.length + overdue.length}
                </span>
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>

          {permissions.canViewInventory && (
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={activeView === "inventory"}
                onClick={() => onViewChange("inventory")}
                className="justify-start relative"
              >
                <Warehouse className="h-4 w-4" />
                <span>Склад</span>
                {lowStockCount > 0 && (
                  <span className={cn(
                    "ml-auto text-xs px-1.5 py-0.5 rounded-full",
                    "bg-[color:var(--status-warning-bg)] text-[color:var(--status-warning-fg)] border border-[color:var(--status-warning-border)]"
                  )}>
                    {lowStockCount}
                  </span>
                )}
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
        
        <Separator className="my-4" />
        
        {/* Demo date control - only for admin */}
        {currentUser?.role === "admin" && (
          <div className="px-2 space-y-2">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Демо-дата
            </Label>
            <Input
              type="date"
              value={demoDate}
              onChange={(e) => setDemoDate(e.target.value)}
              className="h-8 text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Для тестирования разных сценариев
            </p>
          </div>
        )}
      </SidebarContent>
      
      <SidebarFooter className="p-4 space-y-3">
        {/* Current user */}
        {currentUser && (
          <div className="p-3 rounded-lg bg-muted/50">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{currentUser.initials}</div>
                <div className="text-xs text-muted-foreground">
                  {ROLE_LABELS[currentUser.role]}
                </div>
              </div>
            </div>
          </div>
        )}
        
        <div className="flex gap-2">
          {!usingApi && (
            <Button variant="outline" size="sm" className="flex-1 bg-transparent" onClick={resetData}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Сброс
            </Button>
          )}
          <Button variant="outline" size="sm" className="flex-1 bg-transparent" onClick={logout}>
            <LogOut className="h-4 w-4 mr-1" />
            Выход
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
