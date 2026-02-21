"use client"

import { useState, useEffect } from "react"
import { useApp } from "@/lib/app-context"
import { STAGE_LABELS, TASK_CATEGORY_LABELS, ASSIGNEE_ROLE_GROUPS, ROLE_LABELS } from "@/lib/types"
import type { TaskStatus, ProductionStage, Task, UserRole, TaskAssigneeType } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { TaskDetails } from "@/components/task-details"
import {
  AlertTriangle, 
  Clock, 
  CheckCircle,
  Circle,
  Loader2,
  Filter,
  Eye,
  EyeOff,
  UserCheck,
  User,
  Users,
  Plus,
  ChevronRight
} from "lucide-react"
import { cn } from "@/lib/utils"
import * as dataProvider from "@/lib/data-provider-adapter"

export function AllTasksView() {
  const { 
    tasks, 
    updateTask, 
    createTask,
    users,
    machines,
    demoDate,
    getPartById,
    getMachineById,
    currentUser,
    markTaskAsRead,
    acceptTask,
    permissions,
    isTaskAssignedToUser
  } = useApp()
  
  const [filter, setFilter] = useState<"all" | "blockers" | "overdue" | "mine" | "created">("all")
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all")
  const [machineFilter, setMachineFilter] = useState<string>("all")
  const [stageFilter, setStageFilter] = useState<ProductionStage | "all">("all")
  const [readFilter, setReadFilter] = useState<"all" | "unread" | "read">("all")
  const [acceptedFilter, setAcceptedFilter] = useState<"all" | "accepted" | "pending">("all")
  const [assigneeTypeFilter, setAssigneeTypeFilter] = useState<TaskAssigneeType | "all_types">("all_types")
  
  // Selected task for detail view
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  
  // Create task form
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [isBlocker, setIsBlocker] = useState(false)
  const [assigneeType, setAssigneeType] = useState<TaskAssigneeType>("user")
  const [assigneeId, setAssigneeId] = useState("")
  const [assigneeRole, setAssigneeRole] = useState<UserRole>("operator")
  const [dueDate, setDueDate] = useState("")
  const [category, setCategory] = useState<"tooling" | "quality" | "machine" | "material" | "logistics" | "general">("general")
  const canDirectStatusUpdate = dataProvider.isCapabilitySupported("taskManualStatusUpdate")
  const isMaster = currentUser?.role === "master"
  const isShopHead = currentUser?.role === "shop_head"
  const allowedUsers = users.filter((user) => {
    if (isMaster) return user.role === "operator"
    if (isShopHead) return user.role !== "director"
    return true
  })
  const allowedRoleEntries = Object.entries(ASSIGNEE_ROLE_GROUPS).filter(([role]) => {
    if (isMaster) return role === "operator"
    if (isShopHead) return role !== "director"
    return true
  })
  
  // NOTE: Removed auto-mark-as-read on view - tasks are marked as read only when opened individually
  // This prevents infinite loops when markTaskAsRead updates the tasks array
  
  // Filter tasks
  let filteredTasks = statusFilter === "all" 
    ? tasks.filter(t => t.status !== "done")
    : tasks.filter(t => t.status === statusFilter)
  
  // My tasks filter
  if (filter === "mine" && currentUser) {
    filteredTasks = filteredTasks.filter(t => isTaskAssignedToUser(t, currentUser))
  } else if (filter === "created" && currentUser) {
    filteredTasks = filteredTasks.filter(t => t.creator_id === currentUser.id)
  }
  
  if (machineFilter !== "all") {
    filteredTasks = filteredTasks.filter(t => t.machine_id === machineFilter)
  }
  
  if (stageFilter !== "all") {
    filteredTasks = filteredTasks.filter(t => t.stage === stageFilter)
  }
  
  // Read/unread filter
  if (readFilter === "unread" && currentUser) {
    filteredTasks = filteredTasks.filter(t => !t.read_by.includes(currentUser.id))
  } else if (readFilter === "read" && currentUser) {
    filteredTasks = filteredTasks.filter(t => t.read_by.includes(currentUser.id))
  }
  
  // Accepted filter
  if (acceptedFilter === "accepted") {
    filteredTasks = filteredTasks.filter(t => t.accepted_by_id)
  } else if (acceptedFilter === "pending") {
    filteredTasks = filteredTasks.filter(t => !t.accepted_by_id)
  }
  
  // Assignee type filter
  if (assigneeTypeFilter !== "all_types") {
    filteredTasks = filteredTasks.filter(t => t.assignee_type === assigneeTypeFilter)
  }
  
  switch (filter) {
    case "blockers":
      filteredTasks = filteredTasks.filter(t => t.is_blocker)
      break
    case "overdue":
      filteredTasks = filteredTasks.filter(t => t.due_date < demoDate)
      break
  }
  
  // Sort: blockers first, then unread, then by due date
  filteredTasks.sort((a, b) => {
    if (a.is_blocker && !b.is_blocker) return -1
    if (!a.is_blocker && b.is_blocker) return 1
    
    // Unread first for assignee
    if (currentUser) {
      const aUnread = !a.read_by.includes(currentUser.id) && isTaskAssignedToUser(a, currentUser)
      const bUnread = !b.read_by.includes(currentUser.id) && isTaskAssignedToUser(b, currentUser)
      if (aUnread && !bUnread) return -1
      if (!aUnread && bUnread) return 1
    }
    
    return a.due_date.localeCompare(b.due_date)
  })
  
  const blockerCount = tasks.filter(t => t.is_blocker && t.status !== "done").length
  const overdueCount = tasks.filter(t => t.status !== "done" && t.due_date < demoDate).length
  const myTasksCount = currentUser ? tasks.filter(t => isTaskAssignedToUser(t, currentUser) && t.status !== "done").length : 0
  const createdByMeCount = currentUser ? tasks.filter(t => t.creator_id === currentUser.id && t.status !== "done").length : 0
  const unreadCount = currentUser ? tasks.filter(t => isTaskAssignedToUser(t, currentUser) && !t.read_by.includes(currentUser.id) && t.status !== "done").length : 0
  const groupTasksCount = tasks.filter(t => (t.assignee_type === "role" || t.assignee_type === "all") && t.status !== "done").length
  
  const handleStatusChange = (taskId: string, newStatus: TaskStatus) => {
    if (!canDirectStatusUpdate) return
    const task = tasks.find(t => t.id === taskId)
    if (task) {
      updateTask({ ...task, status: newStatus })
    }
  }
  
  const handleAcceptTask = (taskId: string) => {
    acceptTask(taskId)
  }
  
  const handleCreateTask = () => {
    if (!title || !currentUser) return
    
    const normalizedAssigneeType =
      (isMaster || isShopHead) && assigneeType === "all" ? "role" : assigneeType

    createTask({
      title,
      description,
      creator_id: currentUser.id,
      assignee_type: normalizedAssigneeType,
      assignee_id: normalizedAssigneeType === "user" ? assigneeId : undefined,
      assignee_role: normalizedAssigneeType === "role" ? assigneeRole : undefined,
      status: "open",
      is_blocker: isBlocker,
      due_date: dueDate || demoDate,
      category,
      comments: [],
    })
    
    // Reset form
    setTitle("")
    setDescription("")
    setIsBlocker(false)
    setAssigneeType("user")
    setAssigneeId("")
    setAssigneeRole("operator")
    setDueDate("")
    setCategory("general")
    setShowForm(false)
  }
  
const getStatusIcon = (status: TaskStatus) => {
  switch (status) {
  case "done": return <CheckCircle className="h-4 w-4 text-green-500" />
  case "review": return <Eye className="h-4 w-4 text-amber-500" />
  case "in_progress": return <Loader2 className="h-4 w-4 text-blue-500" />
  case "accepted": return <UserCheck className="h-4 w-4 text-teal-500" />
  default: return <Circle className="h-4 w-4 text-muted-foreground" />
  }
  }
  
  const isTaskUnread = (task: Task) => {
    return currentUser && !task.read_by.includes(currentUser.id)
  }
  
  const isMyTask = (task: Task) => {
    return currentUser && isTaskAssignedToUser(task, currentUser)
  }
  
  // Get assignee display text
  const getAssigneeDisplay = (task: Task) => {
    if (task.assignee_type === "all") return "Всем"
    if (task.assignee_type === "role" && task.assignee_role) {
      return ASSIGNEE_ROLE_GROUPS[task.assignee_role]
    }
    if (task.assignee_type === "user" && task.assignee_id) {
      const user = users.find(u => u.id === task.assignee_id)
      return user?.initials || "Неизвестно"
    }
    return "Не назначено"
  }

  // If a task is selected, show TaskDetails
  if (selectedTask) {
    // Find the latest version of the task from the tasks array
    const currentTask = tasks.find(t => t.id === selectedTask.id) || selectedTask
    return (
      <TaskDetails 
        task={currentTask} 
        onBack={() => setSelectedTask(null)} 
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">Все задачи</h1>
            {unreadCount > 0 && (
              <Badge variant="destructive">
                {unreadCount} непрочитанных
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Управление задачами по всем деталям и этапам
          </p>
        </div>
        {permissions.canCreateTasks && (
          <Button 
            onClick={() => setShowForm(true)}
            variant="default"
            className="w-full h-11 sm:w-auto sm:h-9"
          >
            <Plus className="h-4 w-4 mr-2" />
            Создать задачу
          </Button>
        )}
      </div>

      {!canDirectStatusUpdate && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          В API-режиме ручная смена статуса отключена. Используйте действия Принять, Начать и На проверку.
        </div>
      )}
      
      {permissions.canCreateTasks && (
        <Dialog open={showForm} onOpenChange={setShowForm}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Новая задача</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="task-title">Название</Label>
                  <Input
                    id="task-title"
                    placeholder="Что нужно сделать?"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="task-due">Срок</Label>
                  <Input
                    id="task-due"
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="task-desc">Описание</Label>
                <Textarea
                  id="task-desc"
                  placeholder="Подробности..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                />
              </div>
              
              {/* Assignee type selection */}
                <div className="space-y-2">
                  <Label htmlFor="assignee-type-tabs">Кому назначить</Label>
                  <Tabs value={assigneeType} onValueChange={(v) => setAssigneeType(v as TaskAssigneeType)}>
                  <TabsList
                    id="assignee-type-tabs"
                    className={cn(
                      "grid w-full h-auto gap-1",
                      isMaster || isShopHead ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-3",
                    )}
                  >
                    <TabsTrigger value="user">
                      <User className="h-4 w-4 mr-1" />
                      Человеку
                    </TabsTrigger>
                    <TabsTrigger value="role">
                      <Users className="h-4 w-4 mr-1" />
                      Группе
                    </TabsTrigger>
                    {!isMaster && !isShopHead && (
                      <TabsTrigger value="all">
                        <Users className="h-4 w-4 mr-1" />
                        Всем
                      </TabsTrigger>
                    )}
                  </TabsList>
                </Tabs>
              </div>
              
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {assigneeType === "user" && (
                  <div className="space-y-2">
                    <Label htmlFor="assignee-user-all">Исполнитель</Label>
                    <Select value={assigneeId} onValueChange={setAssigneeId}>
                      <SelectTrigger id="assignee-user-all">
                        <SelectValue placeholder="Выберите человека" />
                      </SelectTrigger>
                      <SelectContent>
                        {allowedUsers.map(user => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.initials} ({ROLE_LABELS[user.role]})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                
                {assigneeType === "role" && (
                  <div className="space-y-2">
                    <Label htmlFor="assignee-role-all">Группа</Label>
                    <Select value={assigneeRole} onValueChange={(v) => setAssigneeRole(v as UserRole)}>
                      <SelectTrigger id="assignee-role-all">
                        <SelectValue placeholder="Выберите группу" />
                      </SelectTrigger>
                      <SelectContent>
                        {allowedRoleEntries.map(([role, label]) => (
                          <SelectItem key={role} value={role}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                
                <div className="space-y-2">
                  <Label htmlFor="task-category-all">Категория</Label>
                  <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
                    <SelectTrigger id="task-category-all">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(TASK_CATEGORY_LABELS).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="is-blocker"
                  checked={isBlocker}
                  onCheckedChange={(checked) => setIsBlocker(checked === true)}
                />
                <Label htmlFor="is-blocker" className="text-sm font-normal">
                  Это блокер
                </Label>
              </div>
              
              <DialogFooter className="gap-2">
                <Button variant="outline" className="bg-transparent" onClick={() => setShowForm(false)}>
                  Отмена
                </Button>
                <Button 
                  onClick={handleCreateTask} 
                  disabled={!title || (assigneeType === "user" && !assigneeId)}
                >
                  Создать задачу
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      )}
      
      {/* Filters */}
      <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
        <div className="overflow-x-auto overflow-y-hidden py-1">
          <TabsList className="h-10 md:h-9 w-max min-w-full justify-start">
            <TabsTrigger value="all" className="flex-none shrink-0">
              Все ({tasks.filter(t => t.status !== "done").length})
            </TabsTrigger>
            <TabsTrigger value="mine" className={cn("flex-none shrink-0", myTasksCount > 0 ? "relative" : "")}>
              Мои ({myTasksCount})
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 h-2 w-2 bg-destructive rounded-full" />
              )}
            </TabsTrigger>
            <TabsTrigger value="created" className="flex-none shrink-0">
              Созданные ({createdByMeCount})
            </TabsTrigger>
            <TabsTrigger value="blockers" className={cn("flex-none shrink-0", blockerCount > 0 ? "text-destructive" : "")}>
              Блокеры ({blockerCount})
            </TabsTrigger>
            <TabsTrigger value="overdue" className={cn("flex-none shrink-0", overdueCount > 0 ? "text-amber-600" : "")}>
              Просрочено ({overdueCount})
            </TabsTrigger>
          </TabsList>
        </div>
      </Tabs>
      
      {/* Status filter chips */}
      <div className="overflow-x-auto overflow-y-hidden py-1">
        <div className="flex w-max min-w-full items-center justify-start gap-2">
          {(["all", "open", "accepted", "in_progress", "review", "done"] as const).map((status) => {
            const count = status === "all" 
              ? tasks.filter(t => t.status !== "done").length
              : tasks.filter(t => t.status === status).length
            const labels: Record<string, string> = {
              all: "Все статусы",
              open: "Открытые",
              accepted: "Принятые",
              in_progress: "В работе",
              review: "На проверке",
              done: "Готовые"
            }
            return (
              <Button
                key={status}
                size="sm"
                variant={statusFilter === status ? "default" : "outline"}
                className={statusFilter === status ? "" : "bg-transparent"}
                onClick={() => setStatusFilter(status === "all" ? "all" : status)}
              >
                {labels[status]} ({count})
              </Button>
            )
          })}
        </div>
      </div>
      
      <div className="flex flex-wrap gap-2">
        <Select value={assigneeTypeFilter} onValueChange={(v) => setAssigneeTypeFilter(v as TaskAssigneeType | "all_types")}>
          <SelectTrigger className="w-40">
            <Users className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all_types">Все типы</SelectItem>
            <SelectItem value="user">Личные</SelectItem>
            <SelectItem value="role">Групповые ({groupTasksCount})</SelectItem>
            <SelectItem value="all">Для всех</SelectItem>
          </SelectContent>
        </Select>
        
        <Select value={readFilter} onValueChange={(v) => setReadFilter(v as typeof readFilter)}>
          <SelectTrigger className="w-40">
            {readFilter === "unread" ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все</SelectItem>
            <SelectItem value="unread">Непрочитанные</SelectItem>
            <SelectItem value="read">Прочитанные</SelectItem>
          </SelectContent>
        </Select>
        
        <Select value={acceptedFilter} onValueChange={(v) => setAcceptedFilter(v as typeof acceptedFilter)}>
          <SelectTrigger className="w-40">
            <UserCheck className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все</SelectItem>
            <SelectItem value="accepted">Принятые</SelectItem>
            <SelectItem value="pending">Ожидают принятия</SelectItem>
          </SelectContent>
        </Select>
        
        <Select value={machineFilter} onValueChange={setMachineFilter}>
          <SelectTrigger className="w-48">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Все станки" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все станки</SelectItem>
            {machines.map(machine => (
              <SelectItem key={machine.id} value={machine.id}>{machine.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Select value={stageFilter} onValueChange={(v) => setStageFilter(v as ProductionStage | "all")}>
          <SelectTrigger className="w-48">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Все этапы" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все этапы</SelectItem>
            {Object.entries(STAGE_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      {/* Summary cards */}
      {(blockerCount > 0 || overdueCount > 0 || unreadCount > 0) && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {unreadCount > 0 && (
            <Card className="border-blue-500 bg-blue-500/5">
              <CardContent className="p-4 flex items-center gap-3">
                <EyeOff className="h-8 w-8 text-blue-600" />
                <div>
                  <div className="text-2xl font-bold text-blue-600">{unreadCount}</div>
                  <div className="text-sm text-muted-foreground">Непрочитанных</div>
                </div>
              </CardContent>
            </Card>
          )}
          {blockerCount > 0 && (
            <Card className="border-destructive bg-destructive/5">
              <CardContent className="p-4 flex items-center gap-3">
                <AlertTriangle className="h-8 w-8 text-destructive" />
                <div>
                  <div className="text-2xl font-bold text-destructive">{blockerCount}</div>
                  <div className="text-sm text-muted-foreground">Активных блокеров</div>
                </div>
              </CardContent>
            </Card>
          )}
          {overdueCount > 0 && (
            <Card className="border-amber-500 bg-amber-500/5">
              <CardContent className="p-4 flex items-center gap-3">
                <Clock className="h-8 w-8 text-amber-600" />
                <div>
                  <div className="text-2xl font-bold text-amber-600">{overdueCount}</div>
                  <div className="text-sm text-muted-foreground">Просроченных задач</div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
      
      {/* Tasks list */}
      <Card>
        <CardContent className="p-4 space-y-2">
          {filteredTasks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>Нет активных задач</p>
            </div>
          ) : (
            filteredTasks.map(task => {
              const isOverdue = task.due_date < demoDate
              const creator = users.find(u => u.id === task.creator_id)
              const acceptedBy = task.accepted_by_id ? users.find(u => u.id === task.accepted_by_id) : null
              const part = task.part_id ? getPartById(task.part_id) : null
              const machine = task.machine_id ? getMachineById(task.machine_id) : null
              const unread = isTaskUnread(task)
              const mine = isMyTask(task)
              const isGroupTask = task.assignee_type === "role" || task.assignee_type === "all"
              
              const openTask = () => setSelectedTask(task)
              const handleKeyOpen = (e: React.KeyboardEvent<HTMLButtonElement>) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  openTask()
                }
              }

              return (
                <div 
                  key={task.id} 
                  className={cn(
                    "p-3 rounded-md border transition-colors",
                    task.is_blocker && "border-destructive bg-destructive/5",
                    isOverdue && !task.is_blocker && "border-amber-500 bg-amber-500/5",
                    unread && mine && !task.is_blocker && !isOverdue && "border-blue-500 bg-blue-50/50 dark:bg-blue-950/20",
                    !task.is_blocker && !isOverdue && !(unread && mine) && "hover:shadow-md"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={openTask}
                      onKeyDown={handleKeyOpen}
                      className="flex-1 text-left flex items-start gap-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 rounded-md"
                      aria-label={`Открыть задачу ${task.title}`}
                    >
                      <span className="mt-0.5" aria-hidden>
                        {getStatusIcon(task.status)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {unread && mine && (
                            <Badge variant="default" className="gap-1 bg-blue-500">
                              <EyeOff className="h-3 w-3" />
                              Новое
                            </Badge>
                          )}
                          <span className="font-medium">{task.title}</span>
                          {task.is_blocker && (
                            <Badge variant="destructive" className="gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              Блокер
                            </Badge>
                          )}
                          {isOverdue && (
                            <Badge variant="outline" className="text-amber-600 border-amber-600 gap-1">
                              <Clock className="h-3 w-3" />
                              Просрочено
                            </Badge>
                          )}
                          {isGroupTask && (
                            <Badge variant="outline" className="gap-1">
                              <Users className="h-3 w-3" />
                              {getAssigneeDisplay(task)}
                            </Badge>
                          )}
                          {task.stage && (
                            <Badge variant="outline" className="text-xs">
                              {STAGE_LABELS[task.stage]}
                            </Badge>
                          )}
                          {task.accepted_by_id && (
                            <Badge variant="secondary" className="gap-1 text-green-600">
                              <UserCheck className="h-3 w-3" />
                              Принято: {acceptedBy?.initials}
                            </Badge>
                          )}
                        </div>
                        {task.description && (
                          <p className="text-sm text-muted-foreground mt-1">{task.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                          {machine && <Badge variant="secondary">{machine.name}</Badge>}
                          {part && <span className="font-mono">{part.code}</span>}
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            От: {creator?.initials}
                          </span>
                          {!isGroupTask && (
                            <span className="flex items-center gap-1">
                              Кому: {getAssigneeDisplay(task)}
                            </span>
                          )}
                          <span>до {new Date(task.due_date).toLocaleDateString("ru-RU")}</span>
                          <Badge variant="secondary" className="text-xs">
                            {TASK_CATEGORY_LABELS[task.category]}
                          </Badge>
                        </div>
                      </div>
                    </button>
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      {canDirectStatusUpdate && (
                        <button
                          type="button"
                          aria-label={task.status === "open" ? "Отметить как в работе" : "Отметить как выполнено"}
                          className="rounded-md h-10 w-10 flex items-center justify-center hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleStatusChange(task.id, task.status === "open" ? "in_progress" : "done")
                          }}
                        >
                          {getStatusIcon(task.status)}
                        </button>
                      )}
                      {mine && task.status === "open" && !task.accepted_by_id && (
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="h-10 text-sm md:h-8 md:text-xs bg-transparent"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleAcceptTask(task.id)
                          }}
                        >
                          <UserCheck className="h-3 w-3 mr-1" />
                          Принять
                        </Button>
                      )}
                      {canDirectStatusUpdate ? (
                        <Select 
                          value={task.status} 
                          onValueChange={(v) => handleStatusChange(task.id, v as TaskStatus)}
                        >
                          <SelectTrigger className="w-28 h-10 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="open">Открыта</SelectItem>
                            <SelectItem value="accepted">Принята</SelectItem>
                            <SelectItem value="in_progress">В работе</SelectItem>
                            <SelectItem value="review">На проверке</SelectItem>
                            <SelectItem value="done">Готово</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          API workflow
                        </Badge>
                      )}
                      <ChevronRight className="h-5 w-5 text-muted-foreground" aria-hidden />
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>
      
      {/* Done tasks */}
      {tasks.filter(t => t.status === "done").length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Выполненные ({tasks.filter(t => t.status === "done").length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {tasks.filter(t => t.status === "done").slice(0, 5).map(task => (
              <button
                key={task.id}
                type="button"
                onClick={() => setSelectedTask(task)}
                aria-label={`Открыть выполненную задачу ${task.title}`}
                className="w-full text-left p-2 rounded-md bg-muted/50 flex items-center gap-3 hover:bg-muted transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
              >
                <CheckCircle className="h-4 w-4 text-green-500" aria-hidden />
                <span className="text-sm line-through text-muted-foreground flex-1">{task.title}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
              </button>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
