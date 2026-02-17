"use client"

import React from "react"

import { useEffect, useMemo, useState } from "react"
import { useApp } from "@/lib/app-context"
import {
  ASSIGNEE_ROLE_GROUPS,
  ROLE_LABELS,
  STAGE_LABELS,
  TASK_CATEGORY_LABELS,
  TASK_STATUS_LABELS,
} from "@/lib/types"
import type {
  ProductionStage,
  Task,
  TaskAssigneeType,
  TaskCategory,
  TaskStatus,
  UserRole,
} from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { Circle, Clock3, MessageSquare, Plus, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { TaskDetails } from "./task-details"

interface TasksListProps {
  partId?: string
  machineId?: string
}

type AssigneeFilter = "all" | "mine" | "team"
type DueFilter = "all" | "overdue" | "today" | "week"
type DensityMode = "comfortable" | "compact"

function formatDateTime(value?: string): string {
  if (!value) return "—"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return "—"
  return parsed.toLocaleString("ru-RU")
}

function formatDate(value?: string): string {
  if (!value) return "—"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return "—"
  return parsed.toLocaleDateString("ru-RU")
}

function dueDateBucket(dueDate: string, demoDate: string): Exclude<DueFilter, "all"> | null {
  const due = new Date(dueDate)
  const base = new Date(demoDate)
  if (Number.isNaN(due.getTime()) || Number.isNaN(base.getTime())) return null

  const dayDue = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime()
  const dayBase = new Date(base.getFullYear(), base.getMonth(), base.getDate()).getTime()
  const deltaDays = Math.floor((dayDue - dayBase) / (24 * 60 * 60 * 1000))

  if (deltaDays < 0) return "overdue"
  if (deltaDays === 0) return "today"
  if (deltaDays <= 7) return "week"
  return null
}

function resolveAssigneeLabel(task: Task, users: Array<{ id: string; initials: string }>): string {
  if (task.assignee_type === "all") return "Всем"
  if (task.assignee_type === "role" && task.assignee_role) {
    return ASSIGNEE_ROLE_GROUPS[task.assignee_role] || task.assignee_role
  }
  if (task.assignee_type === "user" && task.assignee_id) {
    const user = users.find((u) => u.id === task.assignee_id)
    return user?.initials || "Не назначено"
  }
  return "Не назначено"
}

function statusBadgeTone(status: TaskStatus): string {
  if (status === "done") return "border-[var(--status-success-border)] text-[var(--status-success-fg)]"
  if (status === "review") return "border-[var(--status-warning-border)] text-[var(--status-warning-fg)]"
  if (status === "in_progress") return "border-[var(--status-info-border)] text-[var(--status-info-fg)]"
  return "border-border text-muted-foreground"
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
    acceptTask,
    isTaskAssignedToUser,
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

  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all")
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>("all")
  const [dueFilter, setDueFilter] = useState<DueFilter>("all")
  const [density, setDensity] = useState<DensityMode>("comfortable")

  useEffect(() => {
    const handler = (event: Event) => {
      if (!permissions.canCreateTasks) return
      const detail = (event as CustomEvent<{ partId?: string }>).detail
      if (partId && detail?.partId && detail.partId !== partId) return
      setShowForm(true)
    }

    window.addEventListener("pc-part-tasks-create", handler)
    return () => window.removeEventListener("pc-part-tasks-create", handler)
  }, [partId, permissions.canCreateTasks])

  const selectedTask = selectedTaskId ? tasks.find((task) => task.id === selectedTaskId) : null
  if (selectedTask) {
    return <TaskDetails task={selectedTask} onBack={() => setSelectedTaskId(null)} />
  }

  const isMaster = currentUser?.role === "master"
  const isShopHead = currentUser?.role === "shop_head"

  const allowedUsers = useMemo(
    () =>
      users.filter((user) => {
        if (isMaster) return user.role === "operator"
        if (isShopHead) return user.role !== "director"
        return true
      }),
    [users, isMaster, isShopHead]
  )

  const allowedRoleEntries = useMemo(
    () =>
      Object.entries(ASSIGNEE_ROLE_GROUPS).filter(([role]) => {
        if (isMaster) return role === "operator"
        if (isShopHead) return role !== "director"
        return true
      }),
    [isMaster, isShopHead]
  )

  const visibleTasks = useMemo(() => {
    let rows = tasks.filter((task) => {
      if (partId && task.part_id !== partId) return false
      if (machineId && !partId && task.machine_id !== machineId) return false
      return true
    })

    const query = searchQuery.trim().toLowerCase()
    if (query) {
      rows = rows.filter((task) =>
        [task.title, task.description, task.review_comment]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query))
      )
    }

    if (statusFilter !== "all") {
      rows = rows.filter((task) => task.status === statusFilter)
    }

    if (assigneeFilter === "mine" && currentUser) {
      rows = rows.filter((task) => isTaskAssignedToUser(task, currentUser))
    } else if (assigneeFilter === "team" && currentUser) {
      rows = rows.filter((task) => !isTaskAssignedToUser(task, currentUser))
    }

    if (dueFilter !== "all") {
      rows = rows.filter((task) => dueDateBucket(task.due_date, demoDate) === dueFilter)
    }

    rows.sort((a, b) => {
      const dueDiff = new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
      if (dueDiff !== 0) return dueDiff
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })

    return rows
  }, [tasks, partId, machineId, searchQuery, statusFilter, assigneeFilter, currentUser, isTaskAssignedToUser, dueFilter, demoDate])

  const handleStatusChange = (task: Task, status: TaskStatus) => {
    updateTask({ ...task, status })
  }

  const handleAcceptTask = async (taskId: string) => {
    await acceptTask(taskId)
  }

  const handleCreateTask = async () => {
    if (!title.trim() || !currentUser) return

    const normalizedAssigneeType =
      (isMaster || isShopHead) && assigneeType === "all" ? "role" : assigneeType

    await createTask({
      part_id: partId,
      machine_id: machineId,
      stage: stage !== "none" ? stage : undefined,
      title: title.trim(),
      description: description.trim(),
      creator_id: currentUser.id,
      assignee_type: normalizedAssigneeType,
      assignee_id: normalizedAssigneeType === "user" ? assigneeId || undefined : undefined,
      assignee_role: normalizedAssigneeType === "role" ? assigneeRole : undefined,
      status: "open",
      is_blocker: isBlocker,
      due_date: dueDate || demoDate,
      category,
      comments: [],
    })

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

  const rowPadding = density === "compact" ? "py-1.5" : "py-2.5"

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as TaskStatus | "all")}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Статус" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            {(Object.keys(TASK_STATUS_LABELS) as TaskStatus[]).map((status) => (
              <SelectItem key={status} value={status}>{TASK_STATUS_LABELS[status]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={assigneeFilter} onValueChange={(value) => setAssigneeFilter(value as AssigneeFilter)}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Исполнитель" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все исполнители</SelectItem>
            <SelectItem value="mine">Назначено мне</SelectItem>
            <SelectItem value="team">Другие исполнители</SelectItem>
          </SelectContent>
        </Select>

        <Select value={dueFilter} onValueChange={(value) => setDueFilter(value as DueFilter)}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Срок" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Любой срок</SelectItem>
            <SelectItem value="overdue">Просрочено</SelectItem>
            <SelectItem value="today">Сегодня</SelectItem>
            <SelectItem value="week">7 дней</SelectItem>
          </SelectContent>
        </Select>

        <Select value={density} onValueChange={(value) => setDensity(value as DensityMode)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Плотность" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="comfortable">Comfortable</SelectItem>
            <SelectItem value="compact">Compact</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Поиск по названию и описанию"
            className="pl-9"
          />
        </div>
      </div>

      <Card className="gap-0 border shadow-none py-0">
        <CardHeader className="px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-sm font-semibold">Список задач</CardTitle>
            {permissions.canCreateTasks ? (
              <Button onClick={() => setShowForm(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Создать задачу
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-5 sm:px-6">
          {visibleTasks.length === 0 ? (
            <div className="rounded-md bg-muted/40 px-4 py-8 text-center">
              <p className="text-sm text-muted-foreground">Задач по выбранным фильтрам нет.</p>
              {permissions.canCreateTasks ? (
                <Button className="mt-3" onClick={() => setShowForm(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Создать задачу
                </Button>
              ) : null}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">Статус</TableHead>
                  <TableHead>Задача</TableHead>
                  <TableHead className="w-[140px]">Срок</TableHead>
                  <TableHead className="w-[180px]">Исполнитель</TableHead>
                  <TableHead className="w-[180px]">Обновлено</TableHead>
                  <TableHead className="w-[220px] text-right">Быстрые действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleTasks.map((task) => {
                  const assigneeLabel = resolveAssigneeLabel(task, users)
                  const isAssignedToCurrent = currentUser ? isTaskAssignedToUser(task, currentUser) : false
                  const canAccept =
                    isAssignedToCurrent &&
                    task.status === "open" &&
                    task.assignee_type !== "all" &&
                    !task.accepted_by_id

                  const updatedAt = task.reviewed_at || task.accepted_at || task.created_at

                  return (
                    <TableRow key={task.id} className={cn("min-h-11", density === "compact" && "text-xs")}> 
                      <TableCell className={rowPadding}>
                        <Badge variant="outline" className={cn("bg-transparent", statusBadgeTone(task.status))}>
                          {TASK_STATUS_LABELS[task.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className={rowPadding}>
                        <div className="flex items-center gap-2">
                          {task.is_blocker ? (
                            <Badge variant="outline" className="border-[var(--status-danger-border)] text-[var(--status-danger-fg)]">
                              Блокер
                            </Badge>
                          ) : (
                            <Circle className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                          <div>
                            <div className="font-medium">{task.title}</div>
                            {task.description ? (
                              <div className="text-xs text-muted-foreground line-clamp-2">{task.description}</div>
                            ) : null}
                            <div className="mt-1 flex flex-wrap gap-1 text-xs text-muted-foreground">
                              <span>{TASK_CATEGORY_LABELS[task.category]}</span>
                              {task.stage ? <span>· {STAGE_LABELS[task.stage]}</span> : null}
                              {task.comments.length > 0 ? (
                                <span className="inline-flex items-center gap-1">
                                  · <MessageSquare className="h-3 w-3" /> {task.comments.length}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className={cn("whitespace-nowrap", rowPadding)}>
                        <div className="inline-flex items-center gap-1 text-sm">
                          <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />
                          {formatDate(task.due_date)}
                        </div>
                      </TableCell>
                      <TableCell className={rowPadding}>{assigneeLabel}</TableCell>
                      <TableCell className={cn("whitespace-nowrap text-muted-foreground", rowPadding)}>
                        {formatDateTime(updatedAt)}
                      </TableCell>
                      <TableCell className={cn("text-right", rowPadding)}>
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" className="h-8" onClick={() => setSelectedTaskId(task.id)}>
                            Открыть
                          </Button>

                          {canAccept ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 bg-transparent"
                              onClick={() => void handleAcceptTask(task.id)}
                            >
                              Принять
                            </Button>
                          ) : null}

                          {(task.status === "accepted" || task.status === "open") && isAssignedToCurrent ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 bg-transparent"
                              onClick={() => handleStatusChange(task, "in_progress")}
                            >
                              В работу
                            </Button>
                          ) : null}

                          {task.status === "in_progress" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 bg-transparent"
                              onClick={() => handleStatusChange(task, "review")}
                            >
                              На проверку
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Новая задача</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="task-title">Название</Label>
              <Input
                id="task-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Что нужно сделать?"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="task-description">Описание</Label>
              <Textarea
                id="task-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                placeholder="Детали задачи"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="task-assignee-type">Кому назначить</Label>
                <Select value={assigneeType} onValueChange={(value) => setAssigneeType(value as TaskAssigneeType)}>
                  <SelectTrigger id="task-assignee-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">Конкретному сотруднику</SelectItem>
                    <SelectItem value="role">Группе по роли</SelectItem>
                    {!isMaster && !isShopHead ? <SelectItem value="all">Всем</SelectItem> : null}
                  </SelectContent>
                </Select>
              </div>

              {assigneeType === "user" ? (
                <div className="space-y-2">
                  <Label htmlFor="task-assignee-user">Исполнитель</Label>
                  <Select value={assigneeId} onValueChange={setAssigneeId}>
                    <SelectTrigger id="task-assignee-user">
                      <SelectValue placeholder="Выберите сотрудника" />
                    </SelectTrigger>
                    <SelectContent>
                      {allowedUsers.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.initials} ({ROLE_LABELS[user.role]})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              {assigneeType === "role" ? (
                <div className="space-y-2">
                  <Label htmlFor="task-assignee-role">Роль</Label>
                  <Select value={assigneeRole} onValueChange={(value) => setAssigneeRole(value as UserRole)}>
                    <SelectTrigger id="task-assignee-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {allowedRoleEntries.map(([role, label]) => (
                        <SelectItem key={role} value={role}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="task-category">Категория</Label>
                <Select value={category} onValueChange={(value) => setCategory(value as TaskCategory)}>
                  <SelectTrigger id="task-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TASK_CATEGORY_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="task-stage">Этап</Label>
                <Select value={stage} onValueChange={(value) => setStage(value as ProductionStage | "none")}> 
                  <SelectTrigger id="task-stage">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Без этапа</SelectItem>
                    {(Object.keys(STAGE_LABELS) as ProductionStage[]).map((stageKey) => (
                      <SelectItem key={stageKey} value={stageKey}>{STAGE_LABELS[stageKey]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="task-due-date">Срок</Label>
                <Input
                  id="task-due-date"
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </div>
            </div>

            <label className="inline-flex items-center gap-2 text-sm">
              <Checkbox checked={isBlocker} onCheckedChange={(value) => setIsBlocker(Boolean(value))} />
              Блокирующая задача
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" className="bg-transparent" onClick={() => setShowForm(false)}>
              Отмена
            </Button>
            <Button onClick={() => void handleCreateTask()} disabled={!title.trim()}>
              Создать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
