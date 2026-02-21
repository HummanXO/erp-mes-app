"use client"

import React, { createContext, useContext, useMemo, useState } from "react"
import type {
  AccessGrant,
  Machine,
  MachineNorm,
  Part,
  SpecItem,
  Specification,
  StageFact,
  Task,
  User,
  WorkOrder,
  LogisticsEntry,
} from "./types"
import { ROLE_UI_HINTS } from "./types"
import type { InventoryMetalItem, InventoryMovement, InventoryToolingItem } from "./inventory-types"
import * as dataProvider from "./data-provider-adapter"
import type { AppContextType } from "./app/context-types"
import { defaultPermissions } from "./app/shared/constants"
import { useRefreshData } from "./app/shared/use-refresh-data"
import { useAuthDomain } from "./app/auth/use-auth-domain"
import { useVisibility } from "./app/shared/use-visibility"
import { usePartsDomain } from "./app/parts/use-parts-domain"
import { useTasksDomain } from "./app/tasks/use-tasks-domain"
import { useInventoryDomain } from "./app/inventory/use-inventory-domain"
import { useSpecsDomain } from "./app/specs/use-specs-domain"
import { useLookupSelectors } from "./app/shared/use-lookup-selectors"

const AppContext = createContext<AppContextType | null>(null)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [passwordChangeRequiredUser, setPasswordChangeRequiredUser] = useState<User | null>(null)
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

  const refreshData = useRefreshData({
    setUsers,
    setMachines,
    setParts,
    setStageFacts,
    setTasks,
    setLogistics,
    setMachineNorms,
    setInventoryMetal,
    setInventoryTooling,
    setInventoryMovements,
    setSpecifications,
    setSpecItems,
    setWorkOrders,
    setAccessGrants,
    setDataError,
  })

  const authDomain = useAuthDomain({
    users,
    setCurrentUser,
    setPasswordChangeRequiredUser,
    setDemoDateState,
    setIsInitialized,
    refreshData,
  })

  const permissions = useMemo(() => {
    if (!currentUser) return defaultPermissions

    if (dataProvider.isUsingApi()) {
      return {
        ...defaultPermissions,
        ...(currentUser.permissions || {}),
      }
    }

    return ROLE_UI_HINTS[currentUser.role] ?? defaultPermissions
  }, [currentUser])

  const { operatorVisibleSpecificationIds, visibleParts } = useVisibility({
    currentUser,
    permissions,
    accessGrants,
    specifications,
    specItems,
    parts,
  })

  const partsDomain = usePartsDomain({
    refreshData,
    visibleParts,
    stageFacts,
    machines,
    machineNorms,
    demoDate,
  })

  const tasksDomain = useTasksDomain({
    currentUser,
    users,
    tasks,
    demoDate,
    refreshData,
    setTasks,
    setDataError,
  })

  const inventoryDomain = useInventoryDomain({
    logistics,
    refreshData,
  })

  const specsDomain = useSpecsDomain({
    currentUser,
    specifications,
    specItems,
    workOrders,
    accessGrants,
    operatorVisibleSpecificationIds,
    refreshData,
  })

  const lookupSelectors = useLookupSelectors({
    users,
    machines,
    visibleParts,
  })

  if (!isInitialized) {
    return null
  }

  const value: AppContextType = {
    currentUser,
    passwordChangeRequiredUser,
    login: authDomain.login,
    loginWithCredentials: authDomain.loginWithCredentials,
    completePasswordChange: authDomain.completePasswordChange,
    logout: authDomain.logout,
    permissions,
    demoDate,
    setDemoDate: authDomain.setDemoDate,

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
    resetData: authDomain.resetData,

    createPart: partsDomain.createPart,
    updatePart: partsDomain.updatePart,
    deletePart: partsDomain.deletePart,
    updatePartDrawing: partsDomain.updatePartDrawing,
    uploadAttachment: partsDomain.uploadAttachment,
    updatePartStageStatus: partsDomain.updatePartStageStatus,
    createStageFact: partsDomain.createStageFact,
    updateStageFact: partsDomain.updateStageFact,
    deleteStageFact: partsDomain.deleteStageFact,

    createTask: tasksDomain.createTask,
    updateTask: tasksDomain.updateTask,
    markTaskAsRead: tasksDomain.markTaskAsRead,
    acceptTask: tasksDomain.acceptTask,
    startTask: tasksDomain.startTask,
    getTasksForUser: tasksDomain.getTasksForUser,
    getUnreadTasksForUser: tasksDomain.getUnreadTasksForUser,
    getTasksCreatedByUser: tasksDomain.getTasksCreatedByUser,
    getUnreadTasksCount: tasksDomain.getUnreadTasksCount,
    isTaskAssignedToUser: tasksDomain.isTaskAssignedToUser,
    getUsersByRole: tasksDomain.getUsersByRole,

    addTaskComment: tasksDomain.addTaskComment,
    sendTaskForReview: tasksDomain.sendTaskForReview,
    reviewTask: tasksDomain.reviewTask,

    machineNorms,
    getMachineNorm: partsDomain.getMachineNorm,
    getMachineNormsForPart: partsDomain.getMachineNormsForPart,
    setMachineNorm: partsDomain.setMachineNorm,

    createLogisticsEntry: inventoryDomain.createLogisticsEntry,
    updateLogisticsEntry: inventoryDomain.updateLogisticsEntry,
    createInventoryMovement: inventoryDomain.createInventoryMovement,
    createInventoryMetal: inventoryDomain.createInventoryMetal,
    updateInventoryMetal: inventoryDomain.updateInventoryMetal,
    createInventoryTooling: inventoryDomain.createInventoryTooling,
    updateInventoryTooling: inventoryDomain.updateInventoryTooling,

    createSpecification: specsDomain.createSpecification,
    createSpecItem: specsDomain.createSpecItem,
    deleteSpecItem: specsDomain.deleteSpecItem,
    updateSpecification: specsDomain.updateSpecification,
    setSpecificationPublished: specsDomain.setSpecificationPublished,
    deleteSpecification: specsDomain.deleteSpecification,
    updateSpecItemProgress: specsDomain.updateSpecItemProgress,
    createWorkOrdersForSpecification: specsDomain.createWorkOrdersForSpecification,
    createWorkOrder: specsDomain.createWorkOrder,
    updateWorkOrder: specsDomain.updateWorkOrder,
    queueWorkOrder: specsDomain.queueWorkOrder,
    startWorkOrder: specsDomain.startWorkOrder,
    blockWorkOrder: specsDomain.blockWorkOrder,
    reportWorkOrderProgress: specsDomain.reportWorkOrderProgress,
    completeWorkOrder: specsDomain.completeWorkOrder,
    grantAccess: specsDomain.grantAccess,
    revokeAccess: specsDomain.revokeAccess,

    getPartProgress: partsDomain.getPartProgress,
    getPartForecast: partsDomain.getPartForecast,
    getMachineTodayProgress: partsDomain.getMachineTodayProgress,
    getPartsForMachine: partsDomain.getPartsForMachine,
    getPartsByStage: partsDomain.getPartsByStage,
    getPartsInProgressAtStage: partsDomain.getPartsInProgressAtStage,
    getCooperationParts: partsDomain.getCooperationParts,
    getOwnProductionParts: partsDomain.getOwnProductionParts,

    getTasksForPart: tasksDomain.getTasksForPart,
    getTasksForMachine: tasksDomain.getTasksForMachine,
    getBlockersForMachine: tasksDomain.getBlockersForMachine,
    getBlockersForPart: tasksDomain.getBlockersForPart,

    getStageFactsForPart: partsDomain.getStageFactsForPart,
    getStageFactsForPartAndStage: partsDomain.getStageFactsForPartAndStage,
    getLogisticsForPart: inventoryDomain.getLogisticsForPart,
    getJourneyForPart: inventoryDomain.getJourneyForPart,

    getOverdueTasks: tasksDomain.getOverdueTasks,
    getAllBlockers: tasksDomain.getAllBlockers,

    isMissingShiftFact: partsDomain.isMissingShiftFact,
    getCurrentStage: partsDomain.getCurrentStage,
    getStageCompletion: partsDomain.getStageCompletion,

    getUserById: lookupSelectors.getUserById,
    getMachineById: lookupSelectors.getMachineById,
    getPartById: lookupSelectors.getPartById,
    getOperators: lookupSelectors.getOperators,

    getSpecificationsForCurrentUser: specsDomain.getSpecificationsForCurrentUser,
    getSpecItemsBySpecification: specsDomain.getSpecItemsBySpecification,
    getWorkOrdersForCurrentUser: specsDomain.getWorkOrdersForCurrentUser,
    getWorkOrdersForSpecification: specsDomain.getWorkOrdersForSpecification,
    getAccessGrantsForSpecification: specsDomain.getAccessGrantsForSpecification,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error("useApp must be used within an AppProvider")
  }
  return context
}
