/**
 * Data provider adapter.
 *
 * In API mode, avoid importing localStorage provider at module init to prevent
 * client-side TDZ issues from the local/mock graph in production bundles.
 */

import * as httpProvider from "./http-data-provider"
import { getApiBaseUrl, isApiConfigured } from "./env"

type LocalProvider = typeof import("./data-provider")

const API_BASE_URL = getApiBaseUrl()
const USE_API = isApiConfigured()

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
      : "💾 Using localStorage (no API base URL configured)"
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
export const loadCurrentUserFromToken = USE_API ? httpProvider.loadCurrentUserFromToken : undefined

export const isUsingApi = () => USE_API
