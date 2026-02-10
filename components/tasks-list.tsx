"use client"

import { useState } from "react"
import { useApp } from "@/lib/app-context"
import { TASK_CATEGORY_LABELS, STAGE_LABELS, ROLE_LABELS, ASSIGNEE_ROLE_GROUPS } from "@/lib/types"
import type { TaskStatus, TaskCategory, ProductionStage, UserRole, TaskAssigneeType } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  Plus, 
  AlertTriangle, 
  Clock, 
  CheckCircle,
  Circle,
  Loader2,
  User,
  UserCheck,
  EyeOff,
  Users,
  Eye,
  MessageSquare,
  ChevronRight
} from "lucide-react"
import { cn } from "@/lib/utils"
import { TaskDetails } from "./task-details"

interface TasksListProps {
  partId?: string
  machineId?: string
}

export function TasksList({ partId, machineId }: TasksListProps) {
  const { 
    tasks, 
    createTask, 
    updateTask, 
    currentUser, 
    users,
    permissions,
    demoDate,
    getPartById,
    acceptTask,
    isTaskAssignedToUser
  } = useApp()
  
  const [showForm, setShowForm] = useState(false)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [isBlocker, setIsBlocker] = useState(false)
  const [assigneeType, setAssigneeType] = useState<TaskAssigneeType>("user")
  const [assigneeId, setAssigneeId] = useState("")
  const [assigneeRole, setAssigneeRole] = useState<UserRole>("operator")
  const [dueDate, setDueDate] = useState("")
  const [category, setCategory] = useState<TaskCategory>("general")
  const [stage, setStage] = useState<ProductionStage | "none">("none")
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all")
  
  // Filter tasks
  const filteredTasks = tasks.filter(t => {
    if (partId && t.part_id !== partId) return false
    if (machineId && !partId && t.machine_id !== machineId) return false
    return true
  })
  
  // Apply status filter
  const statusFilteredTasks = statusFilter === "all" 
    ? filteredTasks.filter(t => t.status !== "done")
    : filteredTasks.filter(t => t.status === statusFilter)
  
  const activeTasks = statusFilteredTasks.filter(t => t.status !== "done" && t.status !== "review")
  const reviewTasks = statusFilteredTasks.filter(t => t.status === "review")
  const doneTasks = filteredTasks.filter(t => t.status === "done")
  
  const selectedTask = selectedTaskId ? tasks.find(t => t.id === selectedTaskId) : null
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

  const unreadActiveCount = currentUser
    ? activeTasks.filter(t => !t.read_by.includes(currentUser.id)).length
    : 0
  
  // If a task is selected, show task details
  if (selectedTask) {
    return <TaskDetails task={selectedTask} onBack={() => setSelectedTaskId(null)} />
  }
  
  const handleCreateTask = () => {
    if (!title || !currentUser) return
    
    const normalizedAssigneeType =
      (isMaster || isShopHead) && assigneeType === "all" ? "role" : assigneeType

    createTask({
      part_id: partId,
      machine_id: machineId,
      stage: stage !== "none" ? stage : undefined,
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
    setStage("none")
    setShowForm(false)
  }
  
  const handleStatusChange = (taskId: string, newStatus: TaskStatus) => {
    const task = tasks.find(t => t.id === taskId)
    if (task) {
      updateTask({ ...task, status: newStatus })
    }
  }
  
  const handleAcceptTask = (taskId: string) => {
    acceptTask(taskId)
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
  
  // Get assignee display text
  const getAssigneeDisplay = (task: typeof tasks[0]) => {
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

// Status filter counts
  const statusCounts: Record<TaskStatus | "all", number> = {
    all: filteredTasks.filter(t => t.status !== "done").length,
    open: filteredTasks.filter(t => t.status === "open").length,
    accepted: filteredTasks.filter(t => t.status === "accepted").length,
    in_progress: filteredTasks.filter(t => t.status === "in_progress").length,
    review: filteredTasks.filter(t => t.status === "review").length,
    done: filteredTasks.filter(t => t.status === "done").length,
  }
  
  return (
  <div className="space-y-4">
  {/* Status filter chips */}
  <div className="flex flex-wrap gap-1">
    {(["all", "open", "accepted", "in_progress", "review", "done"] as const).map((status) => {
      const labels: Record<string, string> = {
        all: "Все",
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
          className={cn("h-7 text-xs", statusFilter === status ? "" : "bg-transparent")}
          onClick={() => setStatusFilter(status === "all" ? "all" : status)}
        >
          {labels[status]} ({statusCounts[status]})
        </Button>
      )
    })}
  </div>
  
  {/* Create button */}
  {permissions.canCreateTasks && (
  <Button
  variant={showForm ? "secondary" : "default"}
  className="w-full"
  onClick={() => setShowForm(!showForm)}
  >
  <Plus className="h-4 w-4 mr-2" />
  {showForm ? "Отмена" : "Создать задачу"}
  </Button>
  )}
      
      {/* Create form */}
      {showForm && (
        <Card>
          <CardContent className="p-4 space-y-4">
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
              <Label>Кому назначить</Label>
              <Tabs value={assigneeType} onValueChange={(v) => setAssigneeType(v as TaskAssigneeType)}>
                <TabsList className={isMaster || isShopHead ? "grid grid-cols-2" : "grid grid-cols-3"}>
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
            
            {assigneeType === "user" && (
              <div className="space-y-2">
                <Label>Исполнитель</Label>
                <Select value={assigneeId} onValueChange={setAssigneeId}>
                  <SelectTrigger>
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
                <Label>Группа</Label>
                <Select value={assigneeRole} onValueChange={(v) => setAssigneeRole(v as UserRole)}>
                  <SelectTrigger>
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
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="task-due">Срок</Label>
                <Input
                  id="task-due"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <Label>Категория</Label>
                <Select value={category} onValueChange={(v) => setCategory(v as TaskCategory)}>
                  <SelectTrigger>
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
            
            <div className="space-y-2">
              <Label>Этап (опционально)</Label>
              <Select value={stage} onValueChange={(v) => setStage(v as ProductionStage | "none")}>
                <SelectTrigger>
                  <SelectValue placeholder="Любой этап" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Любой этап</SelectItem>
                  {Object.entries(STAGE_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox
                id="is-blocker"
                checked={isBlocker}
                onCheckedChange={(checked) => setIsBlocker(checked === true)}
              />
              <Label htmlFor="is-blocker" className="text-sm font-normal">
                Это блокер (останавливает работу)
              </Label>
            </div>
            
            <Button 
              className="w-full" 
              onClick={handleCreateTask} 
              disabled={!title || (assigneeType === "user" && !assigneeId)}
            >
              Создать задачу
            </Button>
          </CardContent>
        </Card>
      )}
      
      {/* Active tasks */}
      {activeTasks.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              Активные задачи ({activeTasks.length}
              {unreadActiveCount > 0 && `, непрочитанных: ${unreadActiveCount}`})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {activeTasks.map(task => {
              const isOverdue = task.due_date < demoDate
              const creator = users.find(u => u.id === task.creator_id)
              const acceptedBy = task.accepted_by_id ? users.find(u => u.id === task.accepted_by_id) : null
              const part = task.part_id ? getPartById(task.part_id) : null
              const isMyTask = currentUser && isTaskAssignedToUser(task, currentUser)
              const isUnread = currentUser && !task.read_by.includes(currentUser.id)
              const isGroupTask = task.assignee_type === "role" || task.assignee_type === "all"
              
              const openTask = () => setSelectedTaskId(task.id)
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
                    isUnread && isMyTask && !task.is_blocker && !isOverdue && "border-blue-500 bg-blue-50/50 dark:bg-blue-950/20",
                    !task.is_blocker && !isOverdue && !(isUnread && isMyTask) && "hover:bg-muted/50"
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
                          {isUnread && isMyTask && (
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
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          {part && <span className="font-mono">{part.code}</span>}
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {creator?.initials}
                          </span>
                          {!isGroupTask && <span>Кому: {getAssigneeDisplay(task)}</span>}
                          <span>до {new Date(task.due_date).toLocaleDateString("ru-RU")}</span>
                          <Badge variant="secondary" className="text-xs">
                            {TASK_CATEGORY_LABELS[task.category]}
                          </Badge>
                        </div>
                      </div>
                    </button>
                    <div className="flex items-center gap-2">
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
                      {isMyTask && task.status === "open" && !task.accepted_by_id && (
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="h-8 text-xs bg-transparent"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleAcceptTask(task.id)
                          }}
                        >
                          <UserCheck className="h-3 w-3 mr-1" />
                          Принять
                        </Button>
                      )}
                      {task.comments && task.comments.length > 0 && (
                        <div className="flex items-center gap-1 text-muted-foreground" aria-label={`Комментариев: ${task.comments.length}`}>
                          <MessageSquare className="h-3 w-3" />
                          <span className="text-xs">{task.comments.length}</span>
                        </div>
                      )}
                      <Select 
                        value={task.status} 
                        onValueChange={(v) => {
                          v && handleStatusChange(task.id, v as TaskStatus)
                        }}
                      >
                        <SelectTrigger className="w-32 h-10 text-xs" onClick={(e) => e.stopPropagation()}>
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
                      <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
                    </div>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}
      
      {/* Review tasks */}
      {reviewTasks.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-amber-600 flex items-center gap-2">
              <Eye className="h-4 w-4" />
              На проверке ({reviewTasks.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {reviewTasks.map(task => {
              const creator = users.find(u => u.id === task.creator_id)
              const part = task.part_id ? getPartById(task.part_id) : null
              
              return (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => setSelectedTaskId(task.id)}
                  aria-label={`Открыть задачу ${task.title}`}
                  className="w-full text-left p-3 rounded-md border border-amber-200 bg-amber-50/50 hover:bg-amber-100/50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Eye className="h-4 w-4 text-amber-500" aria-hidden />
                      <span className="font-medium">{task.title}</span>
                      {task.is_blocker && (
                        <Badge variant="destructive" className="gap-1 text-xs">
                          Блокер
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {task.comments && task.comments.length > 0 && (
                        <div className="flex items-center gap-1 text-muted-foreground" aria-label={`Комментариев: ${task.comments.length}`}>
                          <MessageSquare className="h-3 w-3" />
                          <span className="text-xs">{task.comments.length}</span>
                        </div>
                      )}
                      <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    {part && <span className="font-mono">{part.code}</span>}
                    <span>Создал: {creator?.initials}</span>
                    {task.review_comment && (
                      <span className="italic">"{task.review_comment.slice(0, 30)}..."</span>
                    )}
                  </div>
                </button>
              )
            })}
          </CardContent>
        </Card>
      )}
      
      {/* Done tasks */}
      {doneTasks.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Выполненные ({doneTasks.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {doneTasks.slice(0, 5).map(task => (
              <div key={task.id} className="p-2 rounded-md bg-muted/50 flex items-center gap-3">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-sm line-through text-muted-foreground">{task.title}</span>
              </div>
            ))}
            {doneTasks.length > 5 && (
              <p className="text-xs text-muted-foreground text-center">
                +{doneTasks.length - 5} ещё
              </p>
            )}
          </CardContent>
        </Card>
      )}
      
      {filteredTasks.length === 0 && !showForm && (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            <p>Нет задач</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
