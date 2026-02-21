import type {
  AccessEntityType,
  AccessGrant,
  AccessPermission,
  JourneySummary,
  LogisticsEntry,
  Machine,
  MachineNorm,
  Part,
  ProductionStage,
  ShiftType,
  Specification,
  SpecItem,
  SpecItemStatus,
  StageFact,
  StageStatus,
  Task,
  TaskAttachment,
  TaskComment,
  User,
  WorkOrder,
  AppPermissions,
} from "../types"
import type { InventoryMetalItem, InventoryMovement, InventoryToolingItem } from "../inventory-types"
import * as dataProvider from "../data-provider-adapter"

export type { AppPermissions }

export interface AppContextType {
  // Auth
  currentUser: User | null
  // When user is authenticated but must change password, keep them out of the app UI.
  passwordChangeRequiredUser: User | null
  login: (userId: string) => void
  loginWithCredentials: (username: string, password: string) => Promise<void>
  completePasswordChange: (user: User) => Promise<void>
  logout: () => void
  permissions: AppPermissions

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
  updatePartStageStatus: (
    partId: string,
    stage: ProductionStage,
    status: StageStatus["status"],
    operatorId?: string
  ) => void

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
  createLogisticsEntry: (entry: Omit<LogisticsEntry, "id">) => Promise<LogisticsEntry>
  updateLogisticsEntry: (entry: LogisticsEntry) => Promise<LogisticsEntry | void>

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
  deleteSpecItem: (specificationId: string, specItemId: string) => Promise<void>
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
  getJourneyForPart: (partId: string) => Promise<JourneySummary | null>
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
