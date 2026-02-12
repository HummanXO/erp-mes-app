"use client"

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react"
import type {
  User,
  Machine,
  Part,
  StageFact,
  Task,
  LogisticsEntry,
  ShiftType,
  ProductionStage,
  StageStatus,
  TaskComment,
  MachineNorm,
  TaskAttachment,
  Specification,
  SpecItem,
  SpecItemStatus,
  WorkOrder,
  AccessGrant,
  AccessEntityType,
  AccessPermission,
} from "./types"
import type { InventoryMetalItem, InventoryToolingItem, InventoryMovement } from "./inventory-types"
import { ROLE_PERMISSIONS } from "./types"
import * as dataProvider from "./data-provider-adapter"
import { ApiClientError } from "./api-client"

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
  inventoryMetal: InventoryMetalItem[]
  inventoryTooling: InventoryToolingItem[]
  inventoryMovements: InventoryMovement[]
  specifications: Specification[]
  specItems: SpecItem[]
  workOrders: WorkOrder[]
  accessGrants: AccessGrant[]
  dataError: string | null
  
  // Actions
  refreshData: () => void
  resetData: () => void
  
  // Part operations
  createPart: (part: Omit<Part, "id">) => Promise<Part>
  updatePart: (part: Part) => Promise<void>
  deletePart: (partId: string) => Promise<void>
  updatePartDrawing: (partId: string, drawingUrl: string) => Promise<void>
  uploadAttachment: (file: File) => Promise<TaskAttachment>
  updatePartStageStatus: (partId: string, stage: ProductionStage, status: StageStatus["status"], operatorId?: string) => void
  
  // Stage fact operations
  createStageFact: (fact: Omit<StageFact, "id" | "created_at">) => Promise<StageFact>
  updateStageFact: (
    factId: string,
    data: Omit<StageFact, "id" | "created_at" | "part_id" | "stage" | "date" | "shift_type">
  ) => Promise<StageFact>
  deleteStageFact: (factId: string) => Promise<void>
  
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
  setMachineNorm: (norm: Omit<MachineNorm, "configured_at">) => Promise<MachineNorm>
  
  // Logistics operations
  createLogisticsEntry: (entry: Omit<LogisticsEntry, "id">) => LogisticsEntry
  updateLogisticsEntry: (entry: LogisticsEntry) => void

  // Inventory operations
  createInventoryMovement: (movement: Omit<InventoryMovement, "id">) => Promise<InventoryMovement>
  createInventoryMetal: (item: Omit<InventoryMetalItem, "id">) => Promise<InventoryMetalItem>
  updateInventoryMetal: (item: InventoryMetalItem) => Promise<void>
  createInventoryTooling: (item: Omit<InventoryToolingItem, "id">) => Promise<InventoryToolingItem>
  updateInventoryTooling: (item: InventoryToolingItem) => Promise<void>

  // Specification/work order operations
  createSpecification: (payload: {
    specification: Omit<Specification, "id" | "created_at">
    items: Array<Omit<SpecItem, "id" | "specification_id" | "line_no" | "qty_done" | "status">>
  }) => Promise<Specification>
  createSpecItem: (
    specificationId: string,
    item: Omit<SpecItem, "id" | "specification_id" | "line_no" | "qty_done" | "status">
  ) => Promise<SpecItem>
  updateSpecification: (specification: Specification) => Promise<void>
  setSpecificationPublished: (specificationId: string, published: boolean) => Promise<void>
  deleteSpecification: (specificationId: string, deleteLinkedParts?: boolean) => Promise<void>
  updateSpecItemProgress: (specItemId: string, qtyDone: number, statusOverride?: SpecItemStatus) => Promise<void>
  createWorkOrdersForSpecification: (specificationId: string) => Promise<WorkOrder[]>
  createWorkOrder: (order: Omit<WorkOrder, "id" | "created_at">) => Promise<WorkOrder>
  updateWorkOrder: (order: WorkOrder) => Promise<void>
  queueWorkOrder: (workOrderId: string, machineId: string, queuePos?: number) => Promise<void>
  startWorkOrder: (workOrderId: string, operatorId?: string) => Promise<void>
  blockWorkOrder: (workOrderId: string, reason: string) => Promise<void>
  reportWorkOrderProgress: (workOrderId: string, qtyGood: number, qtyScrap?: number) => Promise<void>
  completeWorkOrder: (workOrderId: string) => Promise<void>
  grantAccess: (
    entityType: AccessEntityType,
    entityId: string,
    userId: string,
    permission: AccessPermission
  ) => Promise<AccessGrant | null>
  revokeAccess: (grantId: string) => Promise<void>
  
  // Computed
  getPartProgress: (partId: string) => {
    qtyDone: number
    qtyPlan: number
    percent: number
    qtyScrap: number
    stageProgress: Array<{ stage: ProductionStage; percent: number; qtyDone: number }>
  }
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
  getSpecificationsForCurrentUser: () => Specification[]
  getSpecItemsBySpecification: (specificationId: string) => SpecItem[]
  getWorkOrdersForCurrentUser: () => WorkOrder[]
  getWorkOrdersForSpecification: (specificationId: string) => WorkOrder[]
  getAccessGrantsForSpecification: (specificationId: string) => AccessGrant[]
}

const defaultPermissions = ROLE_PERMISSIONS["operator"]
const RISK_STAGES: ProductionStage[] = ["machining", "fitting", "galvanic", "heat_treatment", "grinding"]
const PROGRESS_STAGES: ProductionStage[] = ["machining", "fitting", "galvanic", "heat_treatment", "grinding", "qc"]

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
  const [inventoryMetal, setInventoryMetal] = useState<InventoryMetalItem[]>([])
  const [inventoryTooling, setInventoryTooling] = useState<InventoryToolingItem[]>([])
  const [inventoryMovements, setInventoryMovements] = useState<InventoryMovement[]>([])
  const [specifications, setSpecifications] = useState<Specification[]>([])
  const [specItems, setSpecItems] = useState<SpecItem[]>([])
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  const [accessGrants, setAccessGrants] = useState<AccessGrant[]>([])
  const [machineNorms, setMachineNorms] = useState<MachineNorm[]>([])
  const [dataError, setDataError] = useState<string | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)

  async function refreshData() {
    try {
      setDataError(null)
      // Load data (async in API mode, sync in localStorage mode)
      const [
        users,
        machines,
        parts,
        facts,
        tasks,
        logistics,
        norms,
        metal,
        tooling,
        movements,
        specifications,
        specItems,
        workOrders,
        accessGrants,
      ] = await Promise.all([
        dataProvider.getUsers(),
        dataProvider.getMachines(),
        dataProvider.getParts(),
        dataProvider.getStageFacts(),
        dataProvider.getTasks(),
        dataProvider.getLogistics(),
        dataProvider.getMachineNorms(),
        dataProvider.getInventoryMetal(),
        dataProvider.getInventoryTooling(),
        dataProvider.getInventoryMovements(),
        dataProvider.getSpecifications(),
        dataProvider.getSpecItems(),
        dataProvider.getWorkOrders(),
        dataProvider.getAccessGrants(),
      ])
      
      setUsers(Array.isArray(users) ? users : [])
      setMachines(Array.isArray(machines) ? machines : [])
      setParts(Array.isArray(parts) ? parts : [])
      setStageFacts(Array.isArray(facts) ? facts : [])
      setTasks(Array.isArray(tasks) ? tasks : [])
      setLogistics(Array.isArray(logistics) ? logistics : [])
      setMachineNorms(Array.isArray(norms) ? norms : [])
      setInventoryMetal(Array.isArray(metal) ? metal : [])
      setInventoryTooling(Array.isArray(tooling) ? tooling : [])
      setInventoryMovements(Array.isArray(movements) ? movements : [])
      setSpecifications(Array.isArray(specifications) ? specifications : [])
      setSpecItems(Array.isArray(specItems) ? specItems : [])
      setWorkOrders(Array.isArray(workOrders) ? workOrders : [])
      setAccessGrants(Array.isArray(accessGrants) ? accessGrants : [])
    } catch (error) {
      console.error("Failed to load data:", error)
      setDataError(error instanceof Error ? error.message : "Failed to load data")
    }
  }

  useEffect(() => {
    let isMounted = true

    const init = async () => {
      dataProvider.initializeData()

      if (dataProvider.isUsingApi()) {
        // API mode: попробуем восстановить пользователя по токену
        if (dataProvider.loadCurrentUserFromToken) {
          try {
            const user = await dataProvider.loadCurrentUserFromToken()
            if (isMounted && user) {
              setCurrentUser(user)
              await refreshData()
            }
          } catch (e) {
            // 401/403 on /auth/me is expected when an old token remains in browser storage.
            if (!(e instanceof ApiClientError && (e.statusCode === 401 || e.statusCode === 403))) {
              console.error("Failed to restore user from token", e)
            }
          }
        }
      } else {
        // LocalStorage mode: старая логика
        const user = dataProvider.getCurrentUser()
        setCurrentUser(user)
        await refreshData()
      }

      const date = dataProvider.getDemoDate()
      setDemoDateState(date)
      setIsInitialized(true)
    }

    void init()

    return () => {
      isMounted = false
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

  const operatorVisibleSpecificationIds = useMemo(() => {
    if (!currentUser || currentUser.role !== "operator") return new Set<string>()
    const ids = new Set(
      accessGrants
        .filter(grant => grant.user_id === currentUser.id && grant.entity_type === "specification")
        .map(grant => grant.entity_id)
    )
    for (const specification of specifications) {
      if (specification.published_to_operators) {
        ids.add(specification.id)
      }
    }
    return ids
  }, [currentUser, accessGrants, specifications])

  const visiblePartIds = useMemo(() => {
    if (!currentUser) return new Set<string>()

    if (permissions.canManageSpecifications) {
      return new Set(parts.map(part => part.id))
    }

    const specLinkedPartIds = new Set(
      specItems
        .map(item => item.part_id)
        .filter((partId): partId is string => Boolean(partId))
    )

    if (currentUser.role === "operator") {
      const grantedPartIds = new Set<string>()
      for (const item of specItems) {
        if (!item.part_id) continue
        if (operatorVisibleSpecificationIds.has(item.specification_id)) {
          grantedPartIds.add(item.part_id)
        }
      }
      return grantedPartIds
    }

    if (!permissions.canViewSpecifications) {
      return new Set(parts.filter(part => !specLinkedPartIds.has(part.id)).map(part => part.id))
    }

    return new Set(parts.map(part => part.id))
  }, [
    currentUser,
    permissions.canManageSpecifications,
    permissions.canViewSpecifications,
    parts,
    specItems,
    operatorVisibleSpecificationIds,
  ])

  const visibleParts = useMemo(
    () => parts.filter(part => visiblePartIds.has(part.id)),
    [parts, visiblePartIds]
  )

  const createPart = useCallback(async (part: Omit<Part, "id">) => {
    const newPart = await dataProvider.createPart(part)
    await refreshData()
    return newPart
  }, [refreshData])

  const updatePart = useCallback(async (part: Part) => {
    await dataProvider.updatePart(part)
    await refreshData()
  }, [refreshData])

  const deletePart = useCallback(async (partId: string) => {
    await dataProvider.deletePart(partId)
    await refreshData()
  }, [refreshData])

  const updatePartDrawing = useCallback(async (partId: string, drawingUrl: string) => {
    await dataProvider.updatePartDrawing(partId, drawingUrl)
    await refreshData()
  }, [refreshData])

  const uploadAttachment = useCallback(async (file: File) => {
    return dataProvider.uploadAttachment(file)
  }, [])

  const updatePartStageStatus = useCallback((partId: string, stage: ProductionStage, status: StageStatus["status"], operatorId?: string) => {
    dataProvider.updatePartStageStatus(partId, stage, status, operatorId)
    refreshData()
  }, [refreshData])

  const createStageFact = useCallback(async (fact: Omit<StageFact, "id" | "created_at">) => {
    const newFact = await dataProvider.createStageFact(fact)
    await refreshData()
    return newFact
  }, [refreshData])

  const updateStageFact = useCallback(async (
    factId: string,
    data: Omit<StageFact, "id" | "created_at" | "part_id" | "stage" | "date" | "shift_type">
  ) => {
    const updatedFact = await dataProvider.updateStageFact(factId, data)
    await refreshData()
    return updatedFact
  }, [refreshData])

  const deleteStageFact = useCallback(async (factId: string) => {
    await dataProvider.deleteStageFact(factId)
    await refreshData()
  }, [refreshData])

  const createTask = useCallback(async (task: Omit<Task, "id" | "created_at" | "read_by">) => {
    // Создаем задачу на сервере
    const newTask = await dataProvider.createTask(task)

    // Мгновенно добавляем в локальное состояние, чтобы не было задержки
    setTasks(prev => [newTask, ...prev])

    // Фоновое обновление всех данных (не блокируем UI)
    refreshData()

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
    return machineNorms.find(n => n.machine_id === machineId && n.part_id === partId && n.stage === stage)
  }, [machineNorms])

  const getMachineNormsForPartCb = useCallback((partId: string) => {
    return machineNorms.filter(n => n.part_id === partId)
  }, [machineNorms])

  const setMachineNormCb = useCallback(async (norm: Omit<MachineNorm, "configured_at">) => {
    const newNorm = await dataProvider.setMachineNorm(norm)
    await refreshData()
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

  const createInventoryMovement = useCallback(async (movement: Omit<InventoryMovement, "id">) => {
    const newMovement = await dataProvider.createInventoryMovement(movement)
    await refreshData()
    return newMovement
  }, [refreshData])

  const createInventoryMetal = useCallback(async (item: Omit<InventoryMetalItem, "id">) => {
    const newItem = await dataProvider.createInventoryMetal(item)
    await refreshData()
    return newItem
  }, [refreshData])

  const updateInventoryMetal = useCallback(async (item: InventoryMetalItem) => {
    await dataProvider.updateInventoryMetal(item)
    await refreshData()
  }, [refreshData])

  const createInventoryTooling = useCallback(async (item: Omit<InventoryToolingItem, "id">) => {
    const newItem = await dataProvider.createInventoryTooling(item)
    await refreshData()
    return newItem
  }, [refreshData])

  const updateInventoryTooling = useCallback(async (item: InventoryToolingItem) => {
    await dataProvider.updateInventoryTooling(item)
    await refreshData()
  }, [refreshData])

  const createSpecification = useCallback(async (
    payload: {
      specification: Omit<Specification, "id" | "created_at">
      items: Array<Omit<SpecItem, "id" | "specification_id" | "line_no" | "qty_done" | "status">>
    }
  ) => {
    const specification = await dataProvider.createSpecification(payload)
    await refreshData()
    return specification
  }, [refreshData])

  const createSpecItem = useCallback(async (
    specificationId: string,
    item: Omit<SpecItem, "id" | "specification_id" | "line_no" | "qty_done" | "status">
  ) => {
    const created = await dataProvider.createSpecItem(specificationId, item)
    await refreshData()
    return created
  }, [refreshData])

  const updateSpecification = useCallback(async (specification: Specification) => {
    await dataProvider.updateSpecification(specification)
    await refreshData()
  }, [refreshData])

  const setSpecificationPublished = useCallback(async (specificationId: string, published: boolean) => {
    await dataProvider.setSpecificationPublished(specificationId, published)
    await refreshData()
  }, [refreshData])

  const deleteSpecification = useCallback(async (specificationId: string, deleteLinkedParts = false) => {
    await dataProvider.deleteSpecification(specificationId, deleteLinkedParts)
    await refreshData()
  }, [refreshData])

  const updateSpecItemProgress = useCallback(async (specItemId: string, qtyDone: number, statusOverride?: SpecItemStatus) => {
    await dataProvider.updateSpecItemProgress(specItemId, qtyDone, statusOverride)
    await refreshData()
  }, [refreshData])

  const createWorkOrdersForSpecification = useCallback(async (specificationId: string) => {
    if (!currentUser) return []
    const created = await dataProvider.createWorkOrdersForSpecification(specificationId, currentUser.id)
    await refreshData()
    return created
  }, [currentUser, refreshData])

  const createWorkOrder = useCallback(async (order: Omit<WorkOrder, "id" | "created_at">) => {
    const workOrder = await dataProvider.createWorkOrder(order)
    await refreshData()
    return workOrder
  }, [refreshData])

  const updateWorkOrder = useCallback(async (order: WorkOrder) => {
    await dataProvider.updateWorkOrder(order)
    await refreshData()
  }, [refreshData])

  const queueWorkOrder = useCallback(async (workOrderId: string, machineId: string, queuePos?: number) => {
    await dataProvider.queueWorkOrder(workOrderId, machineId, queuePos)
    await refreshData()
  }, [refreshData])

  const startWorkOrder = useCallback(async (workOrderId: string, operatorId?: string) => {
    await dataProvider.startWorkOrder(workOrderId, operatorId)
    await refreshData()
  }, [refreshData])

  const blockWorkOrder = useCallback(async (workOrderId: string, reason: string) => {
    await dataProvider.blockWorkOrder(workOrderId, reason)
    await refreshData()
  }, [refreshData])

  const reportWorkOrderProgress = useCallback(async (workOrderId: string, qtyGood: number, qtyScrap = 0) => {
    await dataProvider.reportWorkOrderProgress(workOrderId, qtyGood, qtyScrap)
    await refreshData()
  }, [refreshData])

  const completeWorkOrder = useCallback(async (workOrderId: string) => {
    await dataProvider.completeWorkOrder(workOrderId)
    await refreshData()
  }, [refreshData])

  const grantAccess = useCallback(async (
    entityType: AccessEntityType,
    entityId: string,
    userId: string,
    permission: AccessPermission
  ) => {
    if (!currentUser) return null
    const grant = await dataProvider.grantAccess(entityType, entityId, userId, permission, currentUser.id)
    await refreshData()
    return grant
  }, [currentUser, refreshData])

  const revokeAccess = useCallback(async (grantId: string) => {
    await dataProvider.revokeAccess(grantId)
    await refreshData()
  }, [refreshData])

  const getPartProgress = useCallback((partId: string) => {
    const part = visibleParts.find(p => p.id === partId)
    if (!part) return { qtyDone: 0, qtyPlan: 0, percent: 0, qtyScrap: 0, stageProgress: [] }

    const facts = stageFacts.filter(f => f.part_id === partId)
    const qtyScrap = facts.reduce((sum, f) => sum + f.qty_scrap, 0)

    const stageStatuses = part.stage_statuses || []
    const activeStages = stageStatuses.filter(
      s => s.status !== "skipped" && PROGRESS_STAGES.includes(s.stage)
    )

    const stageProgress = activeStages.map(stageStatus => {
      const stageFactsForStage = facts.filter(f => f.stage === stageStatus.stage)
      const totalGood = stageFactsForStage.reduce((sum, f) => sum + f.qty_good, 0)
      const percent = part.qty_plan > 0
        ? Math.min(100, Math.round((totalGood / part.qty_plan) * 100))
        : 0
      return {
        stage: stageStatus.stage,
        percent: stageStatus.status === "done" ? 100 : percent,
        qtyDone: totalGood,
      }
    })

    const qtyDone = stageProgress.length > 0
      ? Math.min(...stageProgress.map(sp => sp.qtyDone))
      : 0
    const overallPercent = part.qty_plan > 0
      ? Math.min(100, Math.round((qtyDone / part.qty_plan) * 100))
      : 0

    return {
      qtyDone,
      qtyPlan: part.qty_plan,
      percent: overallPercent,
      qtyScrap,
      stageProgress,
    }
  }, [visibleParts, stageFacts])

  const getPartForecast = useCallback((partId: string) => {
    const part = visibleParts.find(p => p.id === partId)
    const machine = part?.machine_id ? machines.find(m => m.id === part.machine_id) : undefined

    if (!part) {
      return {
        daysRemaining: 0,
        shiftsRemaining: 0,
        qtyRemaining: 0,
        avgPerShift: 0,
        willFinishOnTime: false,
        estimatedFinishDate: demoDate,
        shiftsNeeded: 0,
        stageForecasts: [],
      }
    }

    const facts = stageFacts.filter(f => f.part_id === partId)
    const stageStatuses = part.stage_statuses || []
    const activeStages = stageStatuses.filter(
      s => s.status !== "skipped" && RISK_STAGES.includes(s.stage)
    )
    const machiningNorm = part.machine_id
      ? machineNorms.find(
          n => n.machine_id === part.machine_id && n.part_id === part.id && n.stage === "machining"
        )
      : undefined
    const hasForecastInput = facts.length > 0 || !!machiningNorm?.is_configured

    const deadline = new Date(part.deadline)
    const today = new Date(demoDate)
    const daysRemaining = Math.max(0, Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)))
    const shiftsRemaining = daysRemaining * 2

    const stageForecasts = activeStages.map(stageStatus => {
      const stageFactsForStage = facts.filter(f => f.stage === stageStatus.stage)
      const totalDone = stageFactsForStage.reduce((sum, f) => sum + f.qty_good, 0)
      const qtyRemaining = Math.max(0, part.qty_plan - totalDone)

      const defaultRates: Record<ProductionStage, number> = {
        machining: machiningNorm?.qty_per_shift || machine?.rate_per_shift || 400,
        fitting: 500,
        galvanic: 800,
        heat_treatment: 600,
        grinding: 400,
        qc: 1000,
        logistics: 2000,
      }

      const avgPerShift = stageFactsForStage.length > 0
        ? stageFactsForStage.reduce((sum, f) => sum + f.qty_good, 0) / stageFactsForStage.length
        : defaultRates[stageStatus.stage]

      const shiftsNeeded = avgPerShift > 0 ? Math.ceil(qtyRemaining / avgPerShift) : 999

      return {
        stage: stageStatus.stage,
        qtyRemaining,
        shiftsNeeded,
        willFinishOnTime: shiftsNeeded <= shiftsRemaining,
      }
    })

    // For brand-new parts without facts and norm, don't show artificial risk
    if (!hasForecastInput) {
      return {
        daysRemaining,
        shiftsRemaining,
        qtyRemaining: part.qty_plan,
        avgPerShift: machiningNorm?.qty_per_shift || machine?.rate_per_shift || 0,
        willFinishOnTime: true,
        estimatedFinishDate: part.deadline,
        shiftsNeeded: 0,
        stageForecasts,
      }
    }

    const totalShiftsNeeded = stageForecasts.reduce((sum, sf) => sum + sf.shiftsNeeded, 0)
    const machiningFacts = facts.filter(f => f.stage === "machining")
    const avgPerShift = machiningFacts.length > 0
      ? machiningFacts.reduce((sum, f) => sum + f.qty_good, 0) / machiningFacts.length
      : (machiningNorm?.qty_per_shift || machine?.rate_per_shift || 100)

    const currentStage = activeStages.find(s => s.status === "in_progress") || activeStages[0]
    const currentStageForecast = stageForecasts.find(sf => sf.stage === currentStage?.stage)
    const qtyRemaining = currentStageForecast?.qtyRemaining || 0

    const daysNeeded = Math.ceil(totalShiftsNeeded / 2)
    const estimatedFinish = new Date(today)
    estimatedFinish.setDate(estimatedFinish.getDate() + daysNeeded)
    const willFinishOnTime = totalShiftsNeeded <= shiftsRemaining

    return {
      daysRemaining,
      shiftsRemaining,
      qtyRemaining,
      avgPerShift: Math.round(avgPerShift),
      willFinishOnTime,
      estimatedFinishDate: estimatedFinish.toISOString().split("T")[0],
      shiftsNeeded: totalShiftsNeeded,
      stageForecasts,
    }
  }, [visibleParts, machines, stageFacts, machineNorms, demoDate])

  const getMachineTodayProgress = useCallback((machineId: string) => {
    const machine = machines.find(m => m.id === machineId)
    const todayFacts = stageFacts.filter(f => f.date === demoDate && f.machine_id === machineId)
    const dayShift = todayFacts.find(f => f.shift_type === "day") || null
    const nightShift = todayFacts.find(f => f.shift_type === "night") || null

    return {
      dayShift,
      nightShift,
      totalGood: (dayShift?.qty_good || 0) + (nightShift?.qty_good || 0),
      totalScrap: (dayShift?.qty_scrap || 0) + (nightShift?.qty_scrap || 0),
      targetPerShift: machine?.rate_per_shift || 400,
    }
  }, [machines, stageFacts, demoDate])

  const getPartsForMachine = useCallback((machineId: string) => {
    return visibleParts.filter(p => p.machine_id === machineId)
  }, [visibleParts])

  const getPartsByStage = useCallback((stage: ProductionStage) => {
    return visibleParts.filter(p => {
      const stageStatuses = p.stage_statuses || []
      const stageStatus = stageStatuses.find(s => s.stage === stage)
      return stageStatus && stageStatus.status !== "skipped"
    })
  }, [visibleParts])

  const getPartsInProgressAtStage = useCallback((stage: ProductionStage) => {
    return visibleParts.filter(p => {
      const stageStatuses = p.stage_statuses || []
      const stageStatus = stageStatuses.find(s => s.stage === stage)
      return stageStatus && stageStatus.status === "in_progress"
    })
  }, [visibleParts])

  const getCooperationParts = useCallback(() => {
    return visibleParts.filter(p => p.is_cooperation)
  }, [visibleParts])

  const getOwnProductionParts = useCallback(() => {
    return visibleParts.filter(p => !p.is_cooperation)
  }, [visibleParts])

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
    return stageFacts.filter(
      f => f.date === demoDate && f.machine_id === machineId && f.shift_type === shiftType
    ).length === 0
  }, [stageFacts, demoDate])

  const getCurrentStage = useCallback((partId: string) => {
    const part = visibleParts.find(p => p.id === partId)
    if (!part || !part.stage_statuses) return null

    const inProgress = part.stage_statuses.find(s => s.status === "in_progress")
    if (inProgress) return inProgress.stage

    const pending = part.stage_statuses.find(s => s.status === "pending")
    if (pending) return pending.stage

    return null
  }, [visibleParts])

  const getStageCompletion = useCallback((partId: string) => {
    const part = visibleParts.find(p => p.id === partId)
    if (!part || !part.stage_statuses) return { completed: 0, total: 0, percent: 0 }

    const completed = part.stage_statuses.filter(s => s.status === "done").length
    const total = part.stage_statuses.filter(s => s.status !== "skipped").length

    return {
      completed,
      total,
      percent: total > 0 ? Math.round((completed / total) * 100) : 0,
    }
  }, [visibleParts])

  const getSpecificationsForCurrentUser = useCallback(() => {
    if (!currentUser) return []
    if (currentUser.role !== "operator") return specifications
    return specifications.filter(spec => operatorVisibleSpecificationIds.has(spec.id))
  }, [currentUser, specifications, operatorVisibleSpecificationIds])

  const getSpecItemsBySpecification = useCallback((specificationId: string) => {
    return specItems
      .filter(item => item.specification_id === specificationId)
      .sort((a, b) => a.line_no - b.line_no)
  }, [specItems])

  const getWorkOrdersForCurrentUser = useCallback(() => {
    if (!currentUser) return []
    if (currentUser.role !== "operator") return workOrders

    const specGrantIds = new Set(
      accessGrants
        .filter(grant => grant.user_id === currentUser.id && grant.entity_type === "specification")
        .map(grant => grant.entity_id)
    )
    const workOrderGrantIds = new Set(
      accessGrants
        .filter(grant => grant.user_id === currentUser.id && grant.entity_type === "work_order")
        .map(grant => grant.entity_id)
    )
    const publishedSpecIds = new Set(
      specifications
        .filter(spec => spec.published_to_operators)
        .map(spec => spec.id)
    )
    return workOrders.filter(order =>
      order.assigned_operator_id === currentUser.id ||
      specGrantIds.has(order.specification_id) ||
      publishedSpecIds.has(order.specification_id) ||
      workOrderGrantIds.has(order.id)
    )
  }, [currentUser, workOrders, accessGrants, specifications])

  const getWorkOrdersForSpecification = useCallback((specificationId: string) => {
    return workOrders
      .filter(order => order.specification_id === specificationId)
      .sort((a, b) => (a.queue_pos ?? 9999) - (b.queue_pos ?? 9999))
  }, [workOrders])

  const getAccessGrantsForSpecification = useCallback((specificationId: string) => {
    return accessGrants.filter(
      grant => grant.entity_type === "specification" && grant.entity_id === specificationId
    )
  }, [accessGrants])

  const getUserById = useCallback((id: string) => {
    return users.find(u => u.id === id)
  }, [users])

  const getMachineById = useCallback((id: string) => {
    return machines.find(m => m.id === id)
  }, [machines])

  const getPartById = useCallback((id: string) => {
    return visibleParts.find(p => p.id === id)
  }, [visibleParts])

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
        parts: visibleParts,
        stageFacts,
        tasks,
        logistics,
        inventoryMetal,
        inventoryTooling,
        inventoryMovements,
        specifications,
        specItems,
        workOrders,
        accessGrants,
        dataError,
        refreshData,
        resetData,
        createPart,
        updatePart,
        deletePart,
        updatePartDrawing,
        uploadAttachment,
        updatePartStageStatus,
        createStageFact,
        updateStageFact,
        deleteStageFact,
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
        createInventoryMovement,
        createInventoryMetal,
        updateInventoryMetal,
        createInventoryTooling,
        updateInventoryTooling,
        createSpecification,
        createSpecItem,
        updateSpecification,
        setSpecificationPublished,
        deleteSpecification,
        updateSpecItemProgress,
        createWorkOrdersForSpecification,
        createWorkOrder,
        updateWorkOrder,
        queueWorkOrder,
        startWorkOrder,
        blockWorkOrder,
        reportWorkOrderProgress,
        completeWorkOrder,
        grantAccess,
        revokeAccess,
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
        getSpecificationsForCurrentUser,
        getSpecItemsBySpecification,
        getWorkOrdersForCurrentUser,
        getWorkOrdersForSpecification,
        getAccessGrantsForSpecification,
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
