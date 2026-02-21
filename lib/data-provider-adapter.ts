/**
 * Data provider adapter.
 *
 * In API mode, avoid importing localStorage provider at module init to prevent
 * client-side TDZ issues from the local/mock graph in production bundles.
 */

import * as httpProvider from "./http-data-provider"
import {
  getModeCapabilities as readModeCapabilities,
  getRuntimeApiBaseUrl,
  getRuntimeMode,
  isUsingApiMode,
  isUsingDemoMode,
  type ProviderCapabilities,
  type ProviderCapability,
} from "./runtime-mode"
import { ProviderOperationError } from "./provider-operation-error"

type LocalProvider = typeof import("./data-provider")

const MODE = getRuntimeMode()
const API_BASE_URL = getRuntimeApiBaseUrl()
const DEFAULT_CAPABILITIES = readModeCapabilities()
const USE_API = isUsingApiMode()

let runtimeCapabilities: ProviderCapabilities = { ...DEFAULT_CAPABILITIES }
let apiCapabilitiesResolved = !USE_API
let capabilitiesResolveInFlight: Promise<ProviderCapabilities> | null = null

function currentCapabilities(): ProviderCapabilities {
  return runtimeCapabilities
}

function assertAdapterInvariants(): void {
  if (USE_API && MODE !== "api") {
    throw new Error("Invariant violation: adapter mode mismatch (USE_API=true but MODE is not api).")
  }
  if (!USE_API && MODE !== "demo") {
    throw new Error("Invariant violation: adapter mode mismatch (USE_API=false but MODE is not demo).")
  }
  if (USE_API && DEFAULT_CAPABILITIES.localDerivedReadModels) {
    throw new Error("Invariant violation: API mode must not expose local-derived capabilities.")
  }
}

function unsupportedInApi(operation: string, capability?: ProviderCapability): never {
  const capabilities = currentCapabilities()
  const resolvedCapability = capability && !capabilities[capability] ? capability : undefined
  throw new ProviderOperationError({
    operation,
    mode: "api",
    capability: resolvedCapability,
    message: `Not supported in API mode: ${operation}. This operation is available in DEMO mode only.`,
  })
}

function requireDemoMode(operation: string): void {
  if (USE_API) {
    unsupportedInApi(operation, "localDerivedReadModels")
  }
}

function requireCapability(capability: ProviderCapability, operation: string): void {
  const capabilities = currentCapabilities()
  if (!capabilities[capability]) {
    if (USE_API) {
      unsupportedInApi(operation, capability)
    }
    throw new ProviderOperationError({
      operation,
      mode: "demo",
      capability,
      message: `Capability "${capability}" is disabled: ${operation}`,
    })
  }
}

let _local: LocalProvider | null = null
function local(): LocalProvider {
  if (USE_API) {
    throw new Error("Invariant violation: attempted to load local provider while API mode is active.")
  }
  if (_local) return _local
  // Lazy-load only when local mode is actually used.
  _local = require("./data-provider") as LocalProvider
  return _local
}

assertAdapterInvariants()

if (typeof window !== "undefined") {
  console.log(
    USE_API
      ? `🌐 Using HTTP API: ${API_BASE_URL}`
      : "⚠️ DEMO MODE ENABLED (localStorage). NO real authentication. DO NOT use in production."
  )
}

async function resolveApiCapabilitiesImpl(): Promise<ProviderCapabilities> {
  if (!USE_API) return currentCapabilities()
  const apiCapabilities = await httpProvider.getApiCapabilities()
  runtimeCapabilities = {
    ...currentCapabilities(),
    inventory: Boolean(apiCapabilities.inventory),
    workOrders: Boolean(apiCapabilities.workOrders),
  }
  apiCapabilitiesResolved = true
  return currentCapabilities()
}

async function ensureApiCapabilitiesResolved(): Promise<ProviderCapabilities> {
  if (!USE_API || apiCapabilitiesResolved) {
    return currentCapabilities()
  }
  if (capabilitiesResolveInFlight) {
    return await capabilitiesResolveInFlight
  }
  capabilitiesResolveInFlight = resolveApiCapabilitiesImpl().finally(() => {
    capabilitiesResolveInFlight = null
  })
  return await capabilitiesResolveInFlight
}

export function initializeData() {
  if (!USE_API) local().initializeData()
}

export function resetData() {
  if (!USE_API) local().resetData()
}

export function getUsers() {
  return USE_API ? httpProvider.getUsers() : local().getUsers()
}

export function getUserById(id: string) {
  return USE_API ? httpProvider.getUserById(id) : local().getUserById(id)
}

export function getOperators() {
  return USE_API ? httpProvider.getOperators() : local().getOperators()
}

export function getCurrentUser() {
  return USE_API ? httpProvider.getCurrentUser() : local().getCurrentUser()
}

export function setCurrentUser(userId: string | null) {
  return USE_API ? httpProvider.setCurrentUser(userId) : local().setCurrentUser(userId)
}

export function getDemoDate() {
  return USE_API ? httpProvider.getDemoDate() : local().getDemoDate()
}

export function setDemoDate(date: string) {
  if (!USE_API) local().setDemoDate(date)
}

export function getMachines() {
  return USE_API ? httpProvider.getMachines() : local().getMachines()
}

export function getMachineById(id: string) {
  return USE_API ? httpProvider.getMachineById(id) : local().getMachineById(id)
}

export function getMachinesByDepartment(department: any) {
  requireDemoMode("getMachinesByDepartment")
  return local().getMachinesByDepartment(department)
}

export function getParts() {
  return USE_API ? httpProvider.getParts() : local().getParts()
}

export function getPartById(id: string) {
  return USE_API ? httpProvider.getPartById(id) : local().getPartById(id)
}

export function getPartsForMachine(machineId: string) {
  return USE_API ? httpProvider.getPartsForMachine(machineId) : local().getPartsForMachine(machineId)
}

export function getCooperationParts() {
  return USE_API ? httpProvider.getCooperationParts() : local().getCooperationParts()
}

export function getOwnProductionParts() {
  return USE_API ? httpProvider.getOwnProductionParts() : local().getOwnProductionParts()
}

export function getPartsByStage(stage: any) {
  requireDemoMode("getPartsByStage")
  return local().getPartsByStage(stage)
}

export function getPartsInProgressAtStage(stage: any) {
  requireDemoMode("getPartsInProgressAtStage")
  return local().getPartsInProgressAtStage(stage)
}

export function createPart(part: any) {
  if (!part?.source_specification_id) {
    throw new Error("Деталь можно создать только из спецификации")
  }
  return USE_API ? httpProvider.createPart(part) : local().createPart(part)
}

export function updatePart(part: any) {
  return USE_API ? httpProvider.updatePart(part) : local().updatePart(part)
}

export function deletePart(partId: string) {
  return USE_API ? httpProvider.deletePart(partId) : local().deletePart(partId)
}

export function updatePartDrawing(partId: string, drawingUrl: string) {
  if (USE_API) {
    return httpProvider.updatePartDrawing(partId, drawingUrl)
  }
  return Promise.resolve(local().updatePartDrawing(partId, drawingUrl))
}

export function updatePartStageStatus(partId: string, stage: any, status: any, operatorId?: string) {
  requireDemoMode("updatePartStageStatus")
  return local().updatePartStageStatus(partId, stage, status, operatorId)
}

export function uploadAttachment(file: File) {
  return USE_API ? httpProvider.uploadAttachment(file) : local().uploadAttachment(file)
}

export function getStageFacts() {
  return USE_API ? httpProvider.getStageFacts() : local().getStageFacts()
}

export function getStageFactsForDate(date: string) {
  requireDemoMode("getStageFactsForDate")
  return local().getStageFactsForDate(date)
}

export function getStageFactsForPart(partId: string) {
  return USE_API ? httpProvider.getStageFactsForPart(partId) : local().getStageFactsForPart(partId)
}

export function getStageFactsForPartAndStage(partId: string, stage: any) {
  requireDemoMode("getStageFactsForPartAndStage")
  return local().getStageFactsForPartAndStage(partId, stage)
}

export function getStageFactsForMachine(machineId: string) {
  requireDemoMode("getStageFactsForMachine")
  return local().getStageFactsForMachine(machineId)
}

export function getStageFactForDateShiftAndStage(date: string, shiftType: any, partId: string, stage: any) {
  requireDemoMode("getStageFactForDateShiftAndStage")
  return local().getStageFactForDateShiftAndStage(date, shiftType, partId, stage)
}

export function createStageFact(fact: any) {
  return USE_API ? httpProvider.createStageFact(fact) : local().createStageFact(fact)
}

export function updateStageFact(factId: string, data: any) {
  return USE_API ? httpProvider.updateStageFact(factId, data) : local().updateStageFact(factId, data)
}

export function deleteStageFact(factId: string) {
  return USE_API ? httpProvider.deleteStageFact(factId) : local().deleteStageFact(factId)
}

export function getLogistics(preloadedParts?: any[]) {
  return USE_API ? httpProvider.getLogistics(preloadedParts) : local().getLogistics()
}

export function getLogisticsForPart(partId: string) {
  return USE_API ? httpProvider.getLogisticsForPart(partId) : local().getLogisticsForPart(partId)
}

export function createLogisticsEntry(entry: any) {
  return USE_API ? httpProvider.createLogisticsEntry(entry) : local().createLogisticsEntry(entry)
}

export function updateLogisticsEntry(entry: any) {
  return USE_API ? httpProvider.updateLogisticsEntry(entry) : local().updateLogisticsEntry(entry)
}

export function getJourneyForPart(partId: string) {
  if (USE_API) return httpProvider.getJourneyForPart(partId)
  const provider = local() as any
  if (typeof provider.getJourneyForPart === "function") {
    return Promise.resolve(provider.getJourneyForPart(partId))
  }
  return Promise.resolve(null)
}

export function getSpecifications() {
  return USE_API ? httpProvider.getSpecifications() : local().getSpecifications()
}

export function getSpecificationsForUser(userId: string) {
  return USE_API ? httpProvider.getSpecificationsForUser(userId) : local().getSpecificationsForUser(userId)
}

export function getSpecificationById(specificationId: string) {
  return USE_API ? httpProvider.getSpecificationById(specificationId) : local().getSpecificationById(specificationId)
}

export function createSpecification(payload: any) {
  return USE_API ? httpProvider.createSpecification(payload) : local().createSpecification(payload)
}

export function createSpecItem(specificationId: string, item: any) {
  return USE_API ? httpProvider.createSpecItem(specificationId, item) : local().createSpecItem(specificationId, item)
}

export function deleteSpecItem(specificationId: string, specItemId: string) {
  return USE_API ? httpProvider.deleteSpecItem(specificationId, specItemId) : local().deleteSpecItem(specificationId, specItemId)
}

export function updateSpecification(specification: any) {
  return USE_API ? httpProvider.updateSpecification(specification) : local().updateSpecification(specification)
}

export function setSpecificationPublished(specificationId: string, published: boolean) {
  return USE_API ? httpProvider.setSpecificationPublished(specificationId, published) : local().setSpecificationPublished(specificationId, published)
}

export function deleteSpecification(specificationId: string, deleteLinkedParts = false) {
  return USE_API
    ? httpProvider.deleteSpecification(specificationId, deleteLinkedParts)
    : local().deleteSpecification(specificationId, deleteLinkedParts)
}

export function getSpecItems() {
  return USE_API ? httpProvider.getSpecItems() : local().getSpecItems()
}

export function getSpecItemsBySpecification(specificationId: string) {
  return USE_API ? httpProvider.getSpecItemsBySpecification(specificationId) : local().getSpecItemsBySpecification(specificationId)
}

export function updateSpecItemProgress(specItemId: string, qtyDone: number, statusOverride?: any) {
  return USE_API ? httpProvider.updateSpecItemProgress(specItemId, qtyDone, statusOverride) : local().updateSpecItemProgress(specItemId, qtyDone, statusOverride)
}

export function createWorkOrdersForSpecification(specificationId: string, createdBy: string) {
  requireCapability("workOrders", "createWorkOrdersForSpecification")
  return local().createWorkOrdersForSpecification(specificationId, createdBy)
}

export function getWorkOrders() {
  requireCapability("workOrders", "getWorkOrders")
  return local().getWorkOrders()
}

export function getWorkOrdersForUser(userId: string) {
  requireCapability("workOrders", "getWorkOrdersForUser")
  return local().getWorkOrdersForUser(userId)
}

export function getWorkOrdersForSpecification(specificationId: string) {
  requireCapability("workOrders", "getWorkOrdersForSpecification")
  return local().getWorkOrdersForSpecification(specificationId)
}

export function createWorkOrder(order: any) {
  requireCapability("workOrders", "createWorkOrder")
  return local().createWorkOrder(order)
}

export function updateWorkOrder(order: any) {
  requireCapability("workOrders", "updateWorkOrder")
  return local().updateWorkOrder(order)
}

export function queueWorkOrder(workOrderId: string, machineId: string, queuePos?: number) {
  requireCapability("workOrders", "queueWorkOrder")
  return local().queueWorkOrder(workOrderId, machineId, queuePos)
}

export function startWorkOrder(workOrderId: string, operatorId?: string) {
  requireCapability("workOrders", "startWorkOrder")
  return local().startWorkOrder(workOrderId, operatorId)
}

export function blockWorkOrder(workOrderId: string, reason: string) {
  requireCapability("workOrders", "blockWorkOrder")
  return local().blockWorkOrder(workOrderId, reason)
}

export function reportWorkOrderProgress(workOrderId: string, qtyGood: number, qtyScrap?: number) {
  requireCapability("workOrders", "reportWorkOrderProgress")
  return local().reportWorkOrderProgress(workOrderId, qtyGood, qtyScrap)
}

export function completeWorkOrder(workOrderId: string) {
  requireCapability("workOrders", "completeWorkOrder")
  return local().completeWorkOrder(workOrderId)
}

export function getAccessGrants() {
  return USE_API ? httpProvider.getAccessGrants() : local().getAccessGrants()
}

export function getAccessGrantsForEntity(entityType: any, entityId: string) {
  return USE_API ? httpProvider.getAccessGrantsForEntity(entityType, entityId) : local().getAccessGrantsForEntity(entityType, entityId)
}

export function grantAccess(entityType: any, entityId: string, userId: string, permission: any, createdBy: string) {
  return USE_API
    ? httpProvider.grantAccess(entityType, entityId, userId, permission, createdBy)
    : local().grantAccess(entityType, entityId, userId, permission, createdBy)
}

export function revokeAccess(grantId: string) {
  return USE_API ? httpProvider.revokeAccess(grantId) : local().revokeAccess(grantId)
}

// Inventory
export function getInventoryMetal() {
  requireCapability("inventory", "getInventoryMetal")
  return USE_API ? httpProvider.getInventoryMetal() : local().getInventoryMetal()
}

export function createInventoryMetal(item: any) {
  requireCapability("inventory", "createInventoryMetal")
  return USE_API ? httpProvider.createInventoryMetal(item) : local().createInventoryMetal(item)
}

export function updateInventoryMetal(item: any) {
  requireCapability("inventory", "updateInventoryMetal")
  return USE_API ? httpProvider.updateInventoryMetal(item) : local().updateInventoryMetal(item)
}

export function getInventoryTooling() {
  requireCapability("inventory", "getInventoryTooling")
  return USE_API ? httpProvider.getInventoryTooling() : local().getInventoryTooling()
}

export function createInventoryTooling(item: any) {
  requireCapability("inventory", "createInventoryTooling")
  return USE_API ? httpProvider.createInventoryTooling(item) : local().createInventoryTooling(item)
}

export function updateInventoryTooling(item: any) {
  requireCapability("inventory", "updateInventoryTooling")
  return USE_API ? httpProvider.updateInventoryTooling(item) : local().updateInventoryTooling(item)
}

export function getInventoryMovements() {
  requireCapability("inventory", "getInventoryMovements")
  return USE_API ? httpProvider.getInventoryMovements() : local().getInventoryMovements()
}

export function createInventoryMovement(movement: any) {
  requireCapability("inventory", "createInventoryMovement")
  return USE_API ? httpProvider.createInventoryMovement(movement) : local().createInventoryMovement(movement)
}

export function getTasks() {
  return USE_API ? httpProvider.getTasks() : local().getTasks()
}

export function getTasksForPart(partId: string) {
  return USE_API ? httpProvider.getTasksForPart(partId) : local().getTasksForPart(partId)
}

export function getTasksForMachine(machineId: string) {
  requireDemoMode("getTasksForMachine")
  return local().getTasksForMachine(machineId)
}

export function getTasksForStage(stage: any) {
  requireDemoMode("getTasksForStage")
  return local().getTasksForStage(stage)
}

export function getBlockersForMachine(machineId: string) {
  requireDemoMode("getBlockersForMachine")
  return local().getBlockersForMachine(machineId)
}

export function getBlockersForPart(partId: string) {
  requireDemoMode("getBlockersForPart")
  return local().getBlockersForPart(partId)
}

export function createTask(task: any) {
  return USE_API ? httpProvider.createTask(task) : local().createTask(task)
}

export function markTaskAsRead(taskId: string, userId: string) {
  return USE_API ? httpProvider.markTaskAsRead(taskId, userId) : local().markTaskAsRead(taskId, userId)
}

export function acceptTask(taskId: string, userId?: string) {
  if (USE_API) {
    return httpProvider.acceptTask(taskId, userId)
  }
  if (!userId) {
    throw new Error("acceptTask requires userId in DEMO mode")
  }
  return local().acceptTask(taskId, userId)
}

export function startTask(taskId: string, userId: string) {
  return USE_API ? httpProvider.startTask(taskId, userId) : local().startTask(taskId, userId)
}

export function isTaskAssignedToUser(task: any, user: any) {
  return USE_API ? httpProvider.isTaskAssignedToUser(task, user) : local().isTaskAssignedToUser(task, user)
}

export function getTasksForUser(userId?: string) {
  return USE_API ? httpProvider.getTasksForUser(userId) : local().getTasksForUser(userId)
}

export function getUnreadTasksForUser(userId?: string) {
  return USE_API ? httpProvider.getUnreadTasksForUser(userId) : local().getUnreadTasksForUser(userId)
}

export function getTasksCreatedByUser(userId: string) {
  return USE_API ? httpProvider.getTasksCreatedByUser(userId) : local().getTasksCreatedByUser(userId)
}

export function getUsersByRole(role: string) {
  return USE_API ? httpProvider.getUsersByRole(role) : local().getUsersByRole(role)
}

export function updateTask(task: any) {
  return USE_API ? httpProvider.updateTask(task) : local().updateTask(task)
}

export function addTaskComment(taskId: string, userId: string, message: string, attachments?: any[]) {
  return USE_API
    ? httpProvider.addTaskComment(taskId, userId, message, attachments)
    : local().addTaskComment(taskId, userId, message, attachments)
}

export function sendTaskForReview(taskId: string, userId: string, comment?: string) {
  return USE_API
    ? httpProvider.sendTaskForReview(taskId, userId, comment)
    : local().sendTaskForReview(taskId, userId, comment)
}

export function reviewTask(taskId: string, reviewerId: string, approved: boolean, comment?: string) {
  return USE_API
    ? httpProvider.reviewTask(taskId, reviewerId, approved, comment)
    : local().reviewTask(taskId, reviewerId, approved, comment)
}

export function getMachineNorms(preloadedParts?: any[]) {
  return USE_API ? httpProvider.getMachineNorms(preloadedParts) : local().getMachineNorms()
}

export function getMachineNorm(machineId: string, partId: string, stage: any) {
  requireDemoMode("getMachineNorm")
  return local().getMachineNorm(machineId, partId, stage)
}

export function getMachineNormsForPart(partId: string) {
  requireDemoMode("getMachineNormsForPart")
  return local().getMachineNormsForPart(partId)
}

export function setMachineNorm(norm: any) {
  return USE_API ? httpProvider.setMachineNorm(norm) : local().setMachineNorm(norm)
}

export function getPartProgress(partId: string) {
  requireDemoMode("getPartProgress")
  return local().getPartProgress(partId)
}

export function getPartForecast(partId: string, currentDate?: string) {
  requireDemoMode("getPartForecast")
  return local().getPartForecast(partId, currentDate ?? local().getDemoDate())
}

export function getMachineTodayProgress(machineId: string, currentDate?: string) {
  requireDemoMode("getMachineTodayProgress")
  return local().getMachineTodayProgress(machineId, currentDate ?? local().getDemoDate())
}

export function getOverdueTasks(currentDate?: string) {
  requireDemoMode("getOverdueTasks")
  return local().getOverdueTasks(currentDate ?? local().getDemoDate())
}

export function getAllBlockers() {
  requireDemoMode("getAllBlockers")
  return local().getAllBlockers()
}

export function isMissingShiftFact(machineId: string, shiftType: any, currentDate?: string) {
  requireDemoMode("isMissingShiftFact")
  return local().isMissingShiftFact(machineId, shiftType, currentDate ?? local().getDemoDate())
}

export function getCurrentStage(partId: string) {
  requireDemoMode("getCurrentStage")
  return local().getCurrentStage(partId)
}

export function getStageCompletion(partId: string) {
  requireDemoMode("getStageCompletion")
  return local().getStageCompletion(partId)
}

export const login = USE_API ? httpProvider.login : undefined
export const logout = USE_API ? httpProvider.logout : undefined
export const restoreSession = USE_API ? httpProvider.restoreSession : undefined

export const isUsingApi = () => USE_API
export const isDemoMode = () => isUsingDemoMode()
export const getDataMode = () => MODE
export const getModeCapabilities = () => ({ ...currentCapabilities() })
export const isCapabilitySupported = (capability: ProviderCapability) =>
  currentCapabilities()[capability]
export const resolveApiCapabilities = USE_API ? ensureApiCapabilitiesResolved : undefined

// Explicit API-mode contract for AppContext wiring.
const KNOWN_CONTEXT_OPERATIONS = Object.freeze([
  "login",
  "loginWithCredentials",
  "completePasswordChange",
  "logout",
  "setDemoDate",
  "refreshData",
  "resetData",
  "createPart",
  "updatePart",
  "deletePart",
  "updatePartDrawing",
  "uploadAttachment",
  "updatePartStageStatus",
  "createStageFact",
  "updateStageFact",
  "deleteStageFact",
  "createTask",
  "updateTask",
  "markTaskAsRead",
  "acceptTask",
  "startTask",
  "getTasksForUser",
  "getUnreadTasksForUser",
  "getTasksCreatedByUser",
  "getUnreadTasksCount",
  "isTaskAssignedToUser",
  "getUsersByRole",
  "addTaskComment",
  "sendTaskForReview",
  "reviewTask",
  "getMachineNorm",
  "getMachineNormsForPart",
  "setMachineNorm",
  "createLogisticsEntry",
  "updateLogisticsEntry",
  "createInventoryMovement",
  "createInventoryMetal",
  "updateInventoryMetal",
  "createInventoryTooling",
  "updateInventoryTooling",
  "createSpecification",
  "createSpecItem",
  "deleteSpecItem",
  "updateSpecification",
  "setSpecificationPublished",
  "deleteSpecification",
  "updateSpecItemProgress",
  "createWorkOrdersForSpecification",
  "createWorkOrder",
  "updateWorkOrder",
  "queueWorkOrder",
  "startWorkOrder",
  "blockWorkOrder",
  "reportWorkOrderProgress",
  "completeWorkOrder",
  "grantAccess",
  "revokeAccess",
  "getPartProgress",
  "getPartForecast",
  "getMachineTodayProgress",
  "getPartsForMachine",
  "getPartsByStage",
  "getPartsInProgressAtStage",
  "getCooperationParts",
  "getOwnProductionParts",
  "getTasksForPart",
  "getTasksForMachine",
  "getBlockersForMachine",
  "getBlockersForPart",
  "getStageFactsForPart",
  "getStageFactsForPartAndStage",
  "getLogisticsForPart",
  "getJourneyForPart",
  "getOverdueTasks",
  "getAllBlockers",
  "isMissingShiftFact",
  "getCurrentStage",
  "getStageCompletion",
  "getUserById",
  "getMachineById",
  "getPartById",
  "getOperators",
  "getSpecificationsForCurrentUser",
  "getSpecItemsBySpecification",
  "getWorkOrdersForCurrentUser",
  "getWorkOrdersForSpecification",
  "getAccessGrantsForSpecification",
])

const API_MODE_UNSUPPORTED_CONTEXT_OPERATIONS = Object.freeze([
  "updatePartStageStatus",
  "getPartsByStage",
  "getPartsInProgressAtStage",
  "getTasksForMachine",
  "getBlockersForMachine",
  "getBlockersForPart",
  "getStageFactsForPartAndStage",
  "createWorkOrdersForSpecification",
  "createWorkOrder",
  "updateWorkOrder",
  "queueWorkOrder",
  "startWorkOrder",
  "blockWorkOrder",
  "reportWorkOrderProgress",
  "completeWorkOrder",
  "getMachineNorm",
  "getMachineNormsForPart",
  "createInventoryMetal",
  "updateInventoryMetal",
  "createInventoryTooling",
  "updateInventoryTooling",
  "getPartProgress",
  "getPartForecast",
  "getMachineTodayProgress",
  "getOverdueTasks",
  "getAllBlockers",
  "isMissingShiftFact",
  "getCurrentStage",
  "getStageCompletion",
])

export const getApiModeUnsupportedContextOperations = () => [...API_MODE_UNSUPPORTED_CONTEXT_OPERATIONS]
export const getApiModeSupportedContextOperations = () =>
  KNOWN_CONTEXT_OPERATIONS.filter((operation) => !API_MODE_UNSUPPORTED_CONTEXT_OPERATIONS.includes(operation))
export const isContextOperationSupportedInApi = (operation: string) =>
  !API_MODE_UNSUPPORTED_CONTEXT_OPERATIONS.includes(operation)
