/**
 * Data provider adapter.
 *
 * In API mode, avoid importing localStorage provider at module init to prevent
 * client-side TDZ issues from the local/mock graph in production bundles.
 */

import * as httpProvider from "./http-data-provider"
import { getApiBaseUrl } from "./env"

type LocalProvider = typeof import("./data-provider")

const API_BASE_URL = getApiBaseUrl()

const NODE_ENV =
  (typeof process !== "undefined" && process.env ? process.env.NODE_ENV : "") || "development"
const IS_PROD = NODE_ENV === "production"

const DEMO_MODE =
  (
    (typeof process !== "undefined" && process.env
      ? (process.env.NEXT_PUBLIC_DEMO_MODE || process.env.DEMO_MODE || "")
      : "") || ""
  )
    .toLowerCase()
    .trim() === "true"

const HAS_API = API_BASE_URL.length > 0

// Fail closed: never silently fall back to demo auth in production (or dev unless explicitly enabled).
if (!HAS_API) {
  if (IS_PROD) {
    throw new Error(
      "NEXT_PUBLIC_API_BASE_URL is required in production. Refusing to start without API authentication."
    )
  }
  if (!DEMO_MODE) {
    throw new Error(
      "NEXT_PUBLIC_API_BASE_URL is not set. To run in demo mode, explicitly set NEXT_PUBLIC_DEMO_MODE=true."
    )
  }
}

const USE_API = HAS_API

let _local: LocalProvider | null = null
function local(): LocalProvider {
  if (_local) return _local
  // Lazy-load only when local mode is actually used.
  _local = require("./data-provider") as LocalProvider
  return _local
}

if (typeof window !== "undefined") {
  console.log(
    USE_API
      ? `🌐 Using HTTP API: ${API_BASE_URL}`
      : "⚠️ DEMO MODE ENABLED (localStorage). NO real authentication. DO NOT use in production."
  )
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
  return local().getPartsByStage(stage)
}

export function getPartsInProgressAtStage(stage: any) {
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
  return local().updatePartStageStatus(partId, stage, status, operatorId)
}

export function uploadAttachment(file: File) {
  return USE_API ? httpProvider.uploadAttachment(file) : local().uploadAttachment(file)
}

export function getStageFacts() {
  return USE_API ? httpProvider.getStageFacts() : local().getStageFacts()
}

export function getStageFactsForDate(date: string) {
  return local().getStageFactsForDate(date)
}

export function getStageFactsForPart(partId: string) {
  return USE_API ? httpProvider.getStageFactsForPart(partId) : local().getStageFactsForPart(partId)
}

export function getStageFactsForPartAndStage(partId: string, stage: any) {
  return local().getStageFactsForPartAndStage(partId, stage)
}

export function getStageFactsForMachine(machineId: string) {
  return local().getStageFactsForMachine(machineId)
}

export function getStageFactForDateShiftAndStage(date: string, shiftType: any, stage: any, machineId?: string) {
  return local().getStageFactForDateShiftAndStage(date, shiftType, stage, machineId)
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

export function getLogistics() {
  return local().getLogistics()
}

export function getLogisticsForPart(partId: string) {
  return local().getLogisticsForPart(partId)
}

export function createLogisticsEntry(entry: any) {
  return local().createLogisticsEntry(entry)
}

export function updateLogisticsEntry(entry: any) {
  return local().updateLogisticsEntry(entry)
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
  return local().createWorkOrdersForSpecification(specificationId, createdBy)
}

export function getWorkOrders() {
  return local().getWorkOrders()
}

export function getWorkOrdersForUser(userId: string) {
  return local().getWorkOrdersForUser(userId)
}

export function getWorkOrdersForSpecification(specificationId: string) {
  return local().getWorkOrdersForSpecification(specificationId)
}

export function createWorkOrder(order: any) {
  return local().createWorkOrder(order)
}

export function updateWorkOrder(order: any) {
  return local().updateWorkOrder(order)
}

export function queueWorkOrder(workOrderId: string, machineId: string, queuePos?: number) {
  return local().queueWorkOrder(workOrderId, machineId, queuePos)
}

export function startWorkOrder(workOrderId: string, operatorId?: string) {
  return local().startWorkOrder(workOrderId, operatorId)
}

export function blockWorkOrder(workOrderId: string, reason: string) {
  return local().blockWorkOrder(workOrderId, reason)
}

export function reportWorkOrderProgress(workOrderId: string, qtyGood: number, qtyScrap?: number) {
  return local().reportWorkOrderProgress(workOrderId, qtyGood, qtyScrap)
}

export function completeWorkOrder(workOrderId: string) {
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
  return USE_API ? httpProvider.getInventoryMetal() : local().getInventoryMetal()
}

export function createInventoryMetal(item: any) {
  return USE_API ? httpProvider.createInventoryMetal(item) : local().createInventoryMetal(item)
}

export function updateInventoryMetal(item: any) {
  return USE_API ? httpProvider.updateInventoryMetal(item) : local().updateInventoryMetal(item)
}

export function getInventoryTooling() {
  return USE_API ? httpProvider.getInventoryTooling() : local().getInventoryTooling()
}

export function createInventoryTooling(item: any) {
  return USE_API ? httpProvider.createInventoryTooling(item) : local().createInventoryTooling(item)
}

export function updateInventoryTooling(item: any) {
  return USE_API ? httpProvider.updateInventoryTooling(item) : local().updateInventoryTooling(item)
}

export function getInventoryMovements() {
  return USE_API ? httpProvider.getInventoryMovements() : local().getInventoryMovements()
}

export function createInventoryMovement(movement: any) {
  return USE_API ? httpProvider.createInventoryMovement(movement) : local().createInventoryMovement(movement)
}

export function getTasks() {
  return USE_API ? httpProvider.getTasks() : local().getTasks()
}

export function getTasksForPart(partId: string) {
  return USE_API ? httpProvider.getTasksForPart(partId) : local().getTasksForPart(partId)
}

export function getTasksForMachine(machineId: string) {
  return local().getTasksForMachine(machineId)
}

export function getTasksForStage(stage: any) {
  return local().getTasksForStage(stage)
}

export function getBlockersForMachine(machineId: string) {
  return local().getBlockersForMachine(machineId)
}

export function getBlockersForPart(partId: string) {
  return local().getBlockersForPart(partId)
}

export function createTask(task: any) {
  return USE_API ? httpProvider.createTask(task) : local().createTask(task)
}

export function markTaskAsRead(taskId: string, userId: string) {
  return USE_API ? httpProvider.markTaskAsRead(taskId, userId) : local().markTaskAsRead(taskId, userId)
}

export function acceptTask(taskId: string, userId?: string) {
  return USE_API ? httpProvider.acceptTask(taskId, userId) : local().acceptTask(taskId, userId)
}

export function startTask(taskId: string, userId: string) {
  return USE_API ? httpProvider.startTask(taskId, userId) : local().startTask(taskId, userId)
}

export function isTaskAssignedToUser(task: any, user: any) {
  return USE_API ? httpProvider.isTaskAssignedToUser(task, user) : local().isTaskAssignedToUser(task, user)
}

export function getTasksForUser(userId: string) {
  return USE_API ? httpProvider.getTasksForUser(userId) : local().getTasksForUser(userId)
}

export function getUnreadTasksForUser(userId: string) {
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

export function getMachineNorms() {
  return USE_API ? httpProvider.getMachineNorms() : local().getMachineNorms()
}

export function getMachineNorm(machineId: string, partId: string, stage: any) {
  return USE_API ? undefined : local().getMachineNorm(machineId, partId, stage)
}

export function getMachineNormsForPart(partId: string) {
  return USE_API ? [] : local().getMachineNormsForPart(partId)
}

export function setMachineNorm(norm: any) {
  return USE_API ? httpProvider.setMachineNorm(norm) : local().setMachineNorm(norm)
}

export function getPartProgress(partId: string) {
  return local().getPartProgress(partId)
}

export function getPartForecast(partId: string, currentDate?: string) {
  return local().getPartForecast(partId, currentDate)
}

export function getMachineTodayProgress(machineId: string, currentDate?: string) {
  return local().getMachineTodayProgress(machineId, currentDate)
}

export function getOverdueTasks(currentDate?: string) {
  return local().getOverdueTasks(currentDate)
}

export function getAllBlockers() {
  return local().getAllBlockers()
}

export function isMissingShiftFact(machineId: string, shiftType: any, currentDate?: string) {
  return local().isMissingShiftFact(machineId, shiftType, currentDate)
}

export function getCurrentStage(partId: string) {
  return local().getCurrentStage(partId)
}

export function getStageCompletion(partId: string) {
  return local().getStageCompletion(partId)
}

export const login = USE_API ? httpProvider.login : undefined
export const logout = USE_API ? httpProvider.logout : undefined
export const restoreSession = USE_API ? httpProvider.restoreSession : undefined

export const isUsingApi = () => USE_API
export const isDemoMode = () => !USE_API
