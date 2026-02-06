"use client"

import React, { createContext, useContext, useState, useEffect, useCallback } from "react"
import type { User, Machine, Part, StageFact, Task, LogisticsEntry, ShiftType, ProductionStage, StageStatus, TaskComment, MachineNorm } from "./types"
import { ROLE_PERMISSIONS } from "./types"
import * as dataProvider from "./data-provider-adapter"

interface AppContextType {
  // Auth
  currentUser: User | null
  login: (userId: string) => void
  loginWithCredentials: (username: string, password: string) => Promise<void>
  logout: () => void
  permissions: typeof ROLE_PERMISSIONS["admin"]
  
  // Demo Date
  demoDate: string
  setDemoDate: (date: string) => void
  
  // Data
  users: User[]
  machines: Machine[]
  parts: Part[]
  stageFacts: StageFact[]
  tasks: Task[]
  logistics: LogisticsEntry[]
  
  // Actions
  refreshData: () => void
  resetData: () => void
  
  // Part operations
  createPart: (part: Omit<Part, "id">) => Promise<Part>
  updatePart: (part: Part) => Promise<void>
  updatePartDrawing: (partId: string, drawingUrl: string) => void
  updatePartStageStatus: (partId: string, stage: ProductionStage, status: StageStatus["status"], operatorId?: string) => void
  
  // Stage fact operations
  createStageFact: (fact: Omit<StageFact, "id" | "created_at">) => Promise<StageFact>
  
  // Task operations
  createTask: (task: Omit<Task, "id" | "created_at" | "read_by">) => Promise<Task>
  updateTask: (task: Task) => void
  markTaskAsRead: (taskId: string) => Promise<void>
  acceptTask: (taskId: string) => Promise<void>
  startTask: (taskId: string) => Promise<void>
  getTasksForUser: (userId: string) => Task[]
  getUnreadTasksForUser: (userId: string) => Task[]
  getTasksCreatedByUser: (userId: string) => Task[]
  getUnreadTasksCount: () => number
  isTaskAssignedToUser: (task: Task, user: User) => boolean
  getUsersByRole: (role: string) => User[]
  
  // Task comment operations
  addTaskComment: (taskId: string, message: string, attachments?: TaskComment["attachments"]) => Promise<TaskComment | null>
  sendTaskForReview: (taskId: string, comment?: string) => Promise<void>
  reviewTask: (taskId: string, approved: boolean, comment?: string) => Promise<void>
  
  // Machine norm operations
  machineNorms: MachineNorm[]
  getMachineNorm: (machineId: string, partId: string, stage: ProductionStage) => MachineNorm | undefined
  getMachineNormsForPart: (partId: string) => MachineNorm[]
  setMachineNorm: (norm: Omit<MachineNorm, "configured_at">) => MachineNorm
  
  // Logistics operations
  createLogisticsEntry: (entry: Omit<LogisticsEntry, "id">) => LogisticsEntry
  updateLogisticsEntry: (entry: LogisticsEntry) => void
  
  // Computed
  getPartProgress: (partId: string) => { qtyDone: number; qtyPlan: number; percent: number; qtyScrap: number }
  getPartForecast: (partId: string) => ReturnType<typeof dataProvider.getPartForecast>
  getMachineTodayProgress: (machineId: string) => ReturnType<typeof dataProvider.getMachineTodayProgress>
  getPartsForMachine: (machineId: string) => Part[]
  getPartsByStage: (stage: ProductionStage) => Part[]
  getPartsInProgressAtStage: (stage: ProductionStage) => Part[]
  getCooperationParts: () => Part[]
  getOwnProductionParts: () => Part[]
  getTasksForPart: (partId: string) => Task[]
  getTasksForMachine: (machineId: string) => Task[]
  getBlockersForMachine: (machineId: string) => Task[]
  getBlockersForPart: (partId: string) => Task[]
  getStageFactsForPart: (partId: string) => StageFact[]
  getStageFactsForPartAndStage: (partId: string, stage: ProductionStage) => StageFact[]
  getLogisticsForPart: (partId: string) => LogisticsEntry[]
  getOverdueTasks: () => Task[]
  getAllBlockers: () => Task[]
  isMissingShiftFact: (machineId: string, shiftType: ShiftType) => boolean
  getCurrentStage: (partId: string) => ProductionStage | null
  getStageCompletion: (partId: string) => { completed: number; total: number; percent: number }
  getUserById: (id: string) => User | undefined
  getMachineById: (id: string) => Machine | undefined
  getPartById: (id: string) => Part | undefined
  getOperators: () => User[]
}

const defaultPermissions = ROLE_PERMISSIONS["operator"]

const AppContext = createContext<AppContextType | null>(null)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [demoDate, setDemoDateState] = useState<string>("2026-01-31")
  const [users, setUsers] = useState<User[]>([])
  const [machines, setMachines] = useState<Machine[]>([])
  const [parts, setParts] = useState<Part[]>([])
  const [stageFacts, setStageFacts] = useState<StageFact[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [logistics, setLogistics] = useState<LogisticsEntry[]>([])
  const [machineNorms, setMachineNorms] = useState<MachineNorm[]>([])
  const [isInitialized, setIsInitialized] = useState(false)

  useEffect(() => {
    dataProvider.initializeData()
    
    // Only load data if NOT using API (localStorage mode)
    // In API mode, data is loaded after login
    if (!dataProvider.isUsingApi()) {
      refreshData()
    }
    
    const user = dataProvider.getCurrentUser()
    setCurrentUser(user)
    
    const date = dataProvider.getDemoDate()
    setDemoDateState(date)
    
    setIsInitialized(true)
  }, [])

  const refreshData = useCallback(async () => {
    try {
      // Load data (async in API mode, sync in localStorage mode)
      const [users, machines, parts, facts, tasks, logistics, norms] = await Promise.all([
        dataProvider.getUsers(),
        dataProvider.getMachines(),
        dataProvider.getParts(),
        dataProvider.getStageFacts(),
        dataProvider.getTasks(),
        dataProvider.getLogistics(),
        dataProvider.getMachineNorms(),
      ])
      
      setUsers(Array.isArray(users) ? users : [])
      setMachines(Array.isArray(machines) ? machines : [])
      setParts(Array.isArray(parts) ? parts : [])
      setStageFacts(Array.isArray(facts) ? facts : [])
      setTasks(Array.isArray(tasks) ? tasks : [])
      setLogistics(Array.isArray(logistics) ? logistics : [])
      setMachineNorms(Array.isArray(norms) ? norms : [])
    } catch (error) {
      console.error("Failed to load data:", error)
    }
  }, [])

  const login = useCallback((userId: string) => {
    dataProvider.setCurrentUser(userId)
    setCurrentUser(dataProvider.getUserById(userId) || null)
  }, [])

  const loginWithCredentials = useCallback(async (username: string, password: string) => {
    if (!dataProvider.login) {
      throw new Error("Login not available in localStorage mode")
    }
    
    const user = await dataProvider.login(username, password)
    setCurrentUser(user)
    refreshData()
  }, [refreshData])

  const logout = useCallback(async () => {
    // Call API logout if available
    if (dataProvider.logout) {
      await dataProvider.logout()
    }
    dataProvider.setCurrentUser(null)
    setCurrentUser(null)
  }, [])

  const setDemoDate = useCallback((date: string) => {
    dataProvider.setDemoDate(date)
    setDemoDateState(date)
  }, [])

  const resetData = useCallback(() => {
    dataProvider.resetData()
    refreshData()
    setCurrentUser(null)
    setDemoDateState(dataProvider.getDemoDate())
  }, [refreshData])

  const permissions = currentUser 
    ? ROLE_PERMISSIONS[currentUser.role] 
    : defaultPermissions

  const createPart = useCallback(async (part: Omit<Part, "id">) => {
    const newPart = await dataProvider.createPart(part)
    await refreshData()
    return newPart
  }, [refreshData])

  const updatePart = useCallback(async (part: Part) => {
    await dataProvider.updatePart(part)
    await refreshData()
  }, [refreshData])

  const updatePartDrawing = useCallback((partId: string, drawingUrl: string) => {
    dataProvider.updatePartDrawing(partId, drawingUrl)
    refreshData()
  }, [refreshData])

  const updatePartStageStatus = useCallback((partId: string, stage: ProductionStage, status: StageStatus["status"], operatorId?: string) => {
    dataProvider.updatePartStageStatus(partId, stage, status, operatorId)
    refreshData()
  }, [refreshData])

  const createStageFact = useCallback(async (fact: Omit<StageFact, "id" | "created_at">) => {
    const newFact = await dataProvider.createStageFact(fact)
    await refreshData()
    return newFact
  }, [refreshData])

  const createTask = useCallback(async (task: Omit<Task, "id" | "created_at" | "read_by">) => {
    const newTask = await dataProvider.createTask(task)
    await refreshData()
    return newTask
  }, [refreshData])

  const updateTask = useCallback((task: Task) => {
    dataProvider.updateTask(task)
    refreshData()
  }, [refreshData])

  const markTaskAsRead = useCallback(async (taskId: string) => {
    if (!currentUser) return
    
    // Optimistically update local state first
    setTasks(prevTasks => 
      prevTasks.map(t => 
        t.id === taskId 
          ? { ...t, read_by: [...t.read_by, currentUser.id] }
          : t
      )
    )
    
    // Then update on server (no refresh needed - already updated locally)
    try {
      await dataProvider.markTaskAsRead(taskId, currentUser.id)
    } catch (error) {
      console.error("Failed to mark task as read:", error)
      // Revert on error
      await refreshData()
    }
  }, [currentUser, refreshData])

  const acceptTask = useCallback(async (taskId: string) => {
    if (!currentUser) return
    await dataProvider.acceptTask(taskId, currentUser.id)
    await refreshData()
  }, [currentUser, refreshData])

  const startTask = useCallback(async (taskId: string) => {
    if (!currentUser) return
    await dataProvider.startTask(taskId, currentUser.id)
    await refreshData()
  }, [currentUser, refreshData])

  const getTasksForUserCb = useCallback((userId: string) => {
    return dataProvider.getTasksForUser(userId)
  }, [])

  const getUnreadTasksForUserCb = useCallback((userId: string) => {
    return dataProvider.getUnreadTasksForUser(userId)
  }, [])

  const getTasksCreatedByUserCb = useCallback((userId: string) => {
    return dataProvider.getTasksCreatedByUser(userId)
  }, [])

  const getUnreadTasksCount = useCallback(() => {
    if (!currentUser) return 0
    return dataProvider.getUnreadTasksForUser(currentUser.id).length
  }, [currentUser])

  const isTaskAssignedToUserCb = useCallback((task: Task, user: User) => {
    return dataProvider.isTaskAssignedToUser(task, user)
  }, [])

  const getUsersByRoleCb = useCallback((role: string) => {
    return dataProvider.getUsersByRole(role)
  }, [])

  // Task comment operations
  const addTaskCommentCb = useCallback(async (taskId: string, message: string, attachments?: TaskComment["attachments"]) => {
    if (!currentUser) return null
    const comment = await dataProvider.addTaskComment(taskId, currentUser.id, message, attachments)
    await refreshData()
    return comment
  }, [currentUser, refreshData])

  const sendTaskForReviewCb = useCallback(async (taskId: string, comment?: string) => {
    if (!currentUser) return
    await dataProvider.sendTaskForReview(taskId, currentUser.id, comment)
    await refreshData()
  }, [currentUser, refreshData])

  const reviewTaskCb = useCallback(async (taskId: string, approved: boolean, comment?: string) => {
    if (!currentUser) return
    await dataProvider.reviewTask(taskId, currentUser.id, approved, comment)
    await refreshData()
  }, [currentUser, refreshData])

  // Machine norm operations
  const getMachineNormCb = useCallback((machineId: string, partId: string, stage: ProductionStage) => {
    return dataProvider.getMachineNorm(machineId, partId, stage)
  }, [])

  const getMachineNormsForPartCb = useCallback((partId: string) => {
    return dataProvider.getMachineNormsForPart(partId)
  }, [])

  const setMachineNormCb = useCallback((norm: Omit<MachineNorm, "configured_at">) => {
    const newNorm = dataProvider.setMachineNorm(norm)
    refreshData()
    return newNorm
  }, [refreshData])

  const createLogisticsEntry = useCallback((entry: Omit<LogisticsEntry, "id">) => {
    const newEntry = dataProvider.createLogisticsEntry(entry)
    refreshData()
    return newEntry
  }, [refreshData])

  const updateLogisticsEntry = useCallback((entry: LogisticsEntry) => {
    dataProvider.updateLogisticsEntry(entry)
    refreshData()
  }, [refreshData])

  const getPartProgress = useCallback((partId: string) => {
    return dataProvider.getPartProgress(partId)
  }, [])

  const getPartForecast = useCallback((partId: string) => {
    return dataProvider.getPartForecast(partId, demoDate)
  }, [demoDate])

  const getMachineTodayProgress = useCallback((machineId: string) => {
    return dataProvider.getMachineTodayProgress(machineId, demoDate)
  }, [demoDate])

  const getPartsForMachine = useCallback((machineId: string) => {
    return parts.filter(p => p.machine_id === machineId)
  }, [parts])

  const getPartsByStage = useCallback((stage: ProductionStage) => {
    return parts.filter(p => {
      const stageStatuses = p.stage_statuses || []
      const stageStatus = stageStatuses.find(s => s.stage === stage)
      return stageStatus && stageStatus.status !== "skipped"
    })
  }, [parts])

  const getPartsInProgressAtStage = useCallback((stage: ProductionStage) => {
    return parts.filter(p => {
      const stageStatuses = p.stage_statuses || []
      const stageStatus = stageStatuses.find(s => s.stage === stage)
      return stageStatus && stageStatus.status === "in_progress"
    })
  }, [parts])

  const getCooperationParts = useCallback(() => {
    return parts.filter(p => p.is_cooperation)
  }, [parts])

  const getOwnProductionParts = useCallback(() => {
    return parts.filter(p => !p.is_cooperation)
  }, [parts])

  const getTasksForPart = useCallback((partId: string) => {
    return tasks.filter(t => t.part_id === partId)
  }, [tasks])

  const getTasksForMachine = useCallback((machineId: string) => {
    return tasks.filter(t => t.machine_id === machineId)
  }, [tasks])

  const getBlockersForMachine = useCallback((machineId: string) => {
    return tasks.filter(t => t.machine_id === machineId && t.is_blocker && t.status !== "done")
  }, [tasks])

  const getBlockersForPart = useCallback((partId: string) => {
    return tasks.filter(t => t.part_id === partId && t.is_blocker && t.status !== "done")
  }, [tasks])

  const getStageFactsForPart = useCallback((partId: string) => {
    return stageFacts.filter(f => f.part_id === partId)
  }, [stageFacts])

  const getStageFactsForPartAndStage = useCallback((partId: string, stage: ProductionStage) => {
    return stageFacts.filter(f => f.part_id === partId && f.stage === stage)
  }, [stageFacts])

  const getLogisticsForPart = useCallback((partId: string) => {
    return logistics.filter(l => l.part_id === partId)
  }, [logistics])

  const getOverdueTasks = useCallback(() => {
    return tasks.filter(t => t.status !== "done" && t.due_date < demoDate)
  }, [tasks, demoDate])

  const getAllBlockers = useCallback(() => {
    return tasks.filter(t => t.is_blocker && t.status !== "done")
  }, [tasks])

  const isMissingShiftFact = useCallback((machineId: string, shiftType: ShiftType) => {
    return dataProvider.isMissingShiftFact(machineId, shiftType, demoDate)
  }, [demoDate])

  const getCurrentStage = useCallback((partId: string) => {
    return dataProvider.getCurrentStage(partId)
  }, [])

  const getStageCompletion = useCallback((partId: string) => {
    return dataProvider.getStageCompletion(partId)
  }, [])

  const getUserById = useCallback((id: string) => {
    return users.find(u => u.id === id)
  }, [users])

  const getMachineById = useCallback((id: string) => {
    return machines.find(m => m.id === id)
  }, [machines])

  const getPartById = useCallback((id: string) => {
    return parts.find(p => p.id === id)
  }, [parts])

  const getOperators = useCallback(() => {
    return users.filter(u => u.role === "operator")
  }, [users])

  if (!isInitialized) {
    return null
  }

  return (
    <AppContext.Provider
      value={{
        currentUser,
        login,
        loginWithCredentials,
        logout,
        permissions,
        demoDate,
        setDemoDate,
        users,
        machines,
        parts,
        stageFacts,
        tasks,
        logistics,
        refreshData,
        resetData,
        createPart,
        updatePart,
        updatePartDrawing,
        updatePartStageStatus,
        createStageFact,
        createTask,
        updateTask,
markTaskAsRead,
  acceptTask,
  startTask,
  getTasksForUser: getTasksForUserCb,
        getUnreadTasksForUser: getUnreadTasksForUserCb,
        getTasksCreatedByUser: getTasksCreatedByUserCb,
        getUnreadTasksCount,
        isTaskAssignedToUser: isTaskAssignedToUserCb,
        getUsersByRole: getUsersByRoleCb,
        addTaskComment: addTaskCommentCb,
        sendTaskForReview: sendTaskForReviewCb,
        reviewTask: reviewTaskCb,
        machineNorms,
        getMachineNorm: getMachineNormCb,
        getMachineNormsForPart: getMachineNormsForPartCb,
        setMachineNorm: setMachineNormCb,
        createLogisticsEntry,
        updateLogisticsEntry,
        getPartProgress,
        getPartForecast,
        getMachineTodayProgress,
        getPartsForMachine,
        getPartsByStage,
        getPartsInProgressAtStage,
        getCooperationParts,
        getOwnProductionParts,
        getTasksForPart,
        getTasksForMachine,
        getBlockersForMachine,
        getBlockersForPart,
        getStageFactsForPart,
        getStageFactsForPartAndStage,
        getLogisticsForPart,
        getOverdueTasks,
        getAllBlockers,
        isMissingShiftFact,
        getCurrentStage,
        getStageCompletion,
        getUserById,
        getMachineById,
        getPartById,
        getOperators,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error("useApp must be used within an AppProvider")
  }
  return context
}
