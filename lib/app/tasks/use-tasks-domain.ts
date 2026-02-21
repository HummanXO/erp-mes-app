import { useCallback, type Dispatch, type SetStateAction } from "react"
import * as dataProvider from "../../data-provider-adapter"
import type { Task, TaskComment, User } from "../../types"
import { awaitCriticalRefresh } from "../shared/refresh-invariants"

interface Params {
  currentUser: User | null
  users: User[]
  tasks: Task[]
  demoDate: string
  refreshData: () => Promise<void>
  setTasks: Dispatch<SetStateAction<Task[]>>
  setDataError: Dispatch<SetStateAction<string | null>>
}

export function useTasksDomain({
  currentUser,
  users,
  tasks,
  demoDate,
  refreshData,
  setTasks,
  setDataError,
}: Params) {
  const createTask = useCallback(async (task: Omit<Task, "id" | "created_at" | "read_by">) => {
    const newTask = await dataProvider.createTask(task)
    setTasks((prev) => [newTask, ...prev])
    await awaitCriticalRefresh(refreshData, "tasks:createTask")
    return newTask
  }, [refreshData, setTasks])

  const updateTask = useCallback(async (task: Task) => {
    try {
      await Promise.resolve(dataProvider.updateTask(task))
      await awaitCriticalRefresh(refreshData, "tasks:updateTask")
    } catch (error) {
      setDataError(error instanceof Error ? error.message : "Не удалось обновить задачу")
    }
  }, [refreshData, setDataError])

  const markTaskAsRead = useCallback(async (taskId: string) => {
    if (!currentUser) return

    setTasks((prevTasks) =>
      prevTasks.map((t) =>
        t.id === taskId
          ? { ...t, read_by: [...t.read_by, currentUser.id] }
          : t
      )
    )

    try {
      await dataProvider.markTaskAsRead(taskId, currentUser.id)
    } catch (error) {
      console.error("Failed to mark task as read:", error)
      await awaitCriticalRefresh(refreshData, "tasks:markTaskAsRead:rollback")
    }
  }, [currentUser, refreshData, setTasks])

  const acceptTask = useCallback(async (taskId: string) => {
    if (!currentUser) return
    await dataProvider.acceptTask(taskId, currentUser.id)
    await awaitCriticalRefresh(refreshData, "tasks:acceptTask")
  }, [currentUser, refreshData])

  const startTask = useCallback(async (taskId: string) => {
    if (!currentUser) return
    await dataProvider.startTask(taskId, currentUser.id)
    await awaitCriticalRefresh(refreshData, "tasks:startTask")
  }, [currentUser, refreshData])

  const isTaskAssignedToUser = useCallback((task: Task, user: User) => {
    if (task.assignee_type === "all") return true
    if (task.assignee_type === "role" && task.assignee_role === user.role) return true
    if (task.assignee_type === "user" && task.assignee_id === user.id) return true
    return false
  }, [])

  const getTasksForUser = useCallback((userId: string) => {
    const user = users.find((u) => u.id === userId)
    if (!user) return []
    return tasks.filter((task) => isTaskAssignedToUser(task, user))
  }, [isTaskAssignedToUser, tasks, users])

  const getUnreadTasksForUser = useCallback((userId: string) => {
    return getTasksForUser(userId).filter((task) => !task.read_by.includes(userId) && task.status !== "done")
  }, [getTasksForUser])

  const getTasksCreatedByUser = useCallback((userId: string) => {
    return tasks.filter((task) => task.creator_id === userId)
  }, [tasks])

  const getUnreadTasksCount = useCallback(() => {
    if (!currentUser) return 0
    return getUnreadTasksForUser(currentUser.id).length
  }, [currentUser, getUnreadTasksForUser])

  const getUsersByRole = useCallback((role: string) => {
    return users.filter((u) => u.role === role)
  }, [users])

  const addTaskComment = useCallback(async (
    taskId: string,
    message: string,
    attachments?: TaskComment["attachments"]
  ) => {
    if (!currentUser) return null
    const comment = await dataProvider.addTaskComment(taskId, currentUser.id, message, attachments)
    await awaitCriticalRefresh(refreshData, "tasks:addTaskComment")
    return comment
  }, [currentUser, refreshData])

  const sendTaskForReview = useCallback(async (taskId: string, comment?: string) => {
    if (!currentUser) return
    await dataProvider.sendTaskForReview(taskId, currentUser.id, comment)
    await awaitCriticalRefresh(refreshData, "tasks:sendTaskForReview")
  }, [currentUser, refreshData])

  const reviewTask = useCallback(async (taskId: string, approved: boolean, comment?: string) => {
    if (!currentUser) return
    await dataProvider.reviewTask(taskId, currentUser.id, approved, comment)
    await awaitCriticalRefresh(refreshData, "tasks:reviewTask")
  }, [currentUser, refreshData])

  const getTasksForPart = useCallback((partId: string) => {
    return tasks.filter((t) => t.part_id === partId)
  }, [tasks])

  const getTasksForMachine = useCallback((machineId: string) => {
    return tasks.filter((t) => t.machine_id === machineId)
  }, [tasks])

  const getBlockersForMachine = useCallback((machineId: string) => {
    return tasks.filter((t) => t.machine_id === machineId && t.is_blocker && t.status !== "done")
  }, [tasks])

  const getBlockersForPart = useCallback((partId: string) => {
    return tasks.filter((t) => t.part_id === partId && t.is_blocker && t.status !== "done")
  }, [tasks])

  const getOverdueTasks = useCallback(() => {
    return tasks.filter((t) => t.status !== "done" && t.due_date < demoDate)
  }, [tasks, demoDate])

  const getAllBlockers = useCallback(() => {
    return tasks.filter((t) => t.is_blocker && t.status !== "done")
  }, [tasks])

  return {
    createTask,
    updateTask,
    markTaskAsRead,
    acceptTask,
    startTask,
    isTaskAssignedToUser,
    getTasksForUser,
    getUnreadTasksForUser,
    getTasksCreatedByUser,
    getUnreadTasksCount,
    getUsersByRole,
    addTaskComment,
    sendTaskForReview,
    reviewTask,
    getTasksForPart,
    getTasksForMachine,
    getBlockersForMachine,
    getBlockersForPart,
    getOverdueTasks,
    getAllBlockers,
  }
}
