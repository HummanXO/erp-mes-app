/**
 * Data Provider Adapter - switches between localStorage and HTTP based on env.
 *
 * Important: keep exports as functions (not conditional const bindings) to avoid
 * module-init TDZ issues in minified client bundles.
 */

import * as localStorageProvider from "./data-provider"
import * as httpProvider from "./http-data-provider"
import { getApiBaseUrl, isApiConfigured } from "./env"

const API_BASE_URL = getApiBaseUrl()
const USE_API = isApiConfigured()

if (typeof window !== "undefined") {
  console.log(
    USE_API
      ? `🌐 Using HTTP API: ${API_BASE_URL}`
      : "💾 Using localStorage (no API base URL configured)"
  )
}

function apiOrLocal<T>(apiFn: () => T, localFn: () => T): T {
  return USE_API ? apiFn() : localFn()
}

// Initialization
export function initializeData() {
  if (!USE_API) localStorageProvider.initializeData()
}

export function resetData() {
  if (!USE_API) localStorageProvider.resetData()
}

// Users
export function getUsers() {
  return apiOrLocal(() => httpProvider.getUsers(), () => localStorageProvider.getUsers())
}

export function getUserById(id: string) {
  return apiOrLocal(() => httpProvider.getUserById(id), () => localStorageProvider.getUserById(id))
}

export function getOperators() {
  return apiOrLocal(() => httpProvider.getOperators(), () => localStorageProvider.getOperators())
}

export function getCurrentUser() {
  return apiOrLocal(() => httpProvider.getCurrentUser(), () => localStorageProvider.getCurrentUser())
}

export function setCurrentUser(userId: string | null) {
  return apiOrLocal(
    () => httpProvider.setCurrentUser(userId),
    () => localStorageProvider.setCurrentUser(userId)
  )
}

// Demo date
export function getDemoDate() {
  return apiOrLocal(() => httpProvider.getDemoDate(), () => localStorageProvider.getDemoDate())
}

export function setDemoDate(date: string) {
  if (!USE_API) localStorageProvider.setDemoDate(date)
}

// Machines
export function getMachines() {
  return apiOrLocal(() => httpProvider.getMachines(), () => localStorageProvider.getMachines())
}

export function getMachineById(id: string) {
  return apiOrLocal(() => httpProvider.getMachineById(id), () => localStorageProvider.getMachineById(id))
}

export const getMachinesByDepartment = localStorageProvider.getMachinesByDepartment

// Parts
export function getParts() {
  return apiOrLocal(() => httpProvider.getParts(), () => localStorageProvider.getParts())
}

export function getPartById(id: string) {
  return apiOrLocal(() => httpProvider.getPartById(id), () => localStorageProvider.getPartById(id))
}

export function getPartsForMachine(machineId: string) {
  return apiOrLocal(
    () => httpProvider.getPartsForMachine(machineId),
    () => localStorageProvider.getPartsForMachine(machineId)
  )
}

export function getCooperationParts() {
  return apiOrLocal(
    () => httpProvider.getCooperationParts(),
    () => localStorageProvider.getCooperationParts()
  )
}

export function getOwnProductionParts() {
  return apiOrLocal(
    () => httpProvider.getOwnProductionParts(),
    () => localStorageProvider.getOwnProductionParts()
  )
}

export const getPartsByStage = localStorageProvider.getPartsByStage
export const getPartsInProgressAtStage = localStorageProvider.getPartsInProgressAtStage

export function createPart(part: any) {
  return apiOrLocal(() => httpProvider.createPart(part), () => localStorageProvider.createPart(part))
}

export function updatePart(part: any) {
  return apiOrLocal(() => httpProvider.updatePart(part), () => localStorageProvider.updatePart(part))
}

export const updatePartDrawing = localStorageProvider.updatePartDrawing
export const updatePartStageStatus = localStorageProvider.updatePartStageStatus

// Stage facts
export function getStageFacts() {
  return apiOrLocal(() => httpProvider.getStageFacts(), () => localStorageProvider.getStageFacts())
}

export const getStageFactsForDate = localStorageProvider.getStageFactsForDate

export function getStageFactsForPart(partId: string) {
  return apiOrLocal(
    () => httpProvider.getStageFactsForPart(partId),
    () => localStorageProvider.getStageFactsForPart(partId)
  )
}

export const getStageFactsForPartAndStage = localStorageProvider.getStageFactsForPartAndStage
export const getStageFactsForMachine = localStorageProvider.getStageFactsForMachine
export const getStageFactForDateShiftAndStage = localStorageProvider.getStageFactForDateShiftAndStage

export function createStageFact(fact: any) {
  return apiOrLocal(
    () => httpProvider.createStageFact(fact),
    () => localStorageProvider.createStageFact(fact)
  )
}

// Logistics
export const getLogistics = localStorageProvider.getLogistics
export const getLogisticsForPart = localStorageProvider.getLogisticsForPart
export const createLogisticsEntry = localStorageProvider.createLogisticsEntry
export const updateLogisticsEntry = localStorageProvider.updateLogisticsEntry

// Tasks
export function getTasks() {
  return apiOrLocal(() => httpProvider.getTasks(), () => localStorageProvider.getTasks())
}

export function getTasksForPart(partId: string) {
  return apiOrLocal(
    () => httpProvider.getTasksForPart(partId),
    () => localStorageProvider.getTasksForPart(partId)
  )
}

export const getTasksForMachine = localStorageProvider.getTasksForMachine
export const getTasksForStage = localStorageProvider.getTasksForStage
export const getBlockersForMachine = localStorageProvider.getBlockersForMachine
export const getBlockersForPart = localStorageProvider.getBlockersForPart

export function createTask(task: any) {
  return apiOrLocal(() => httpProvider.createTask(task), () => localStorageProvider.createTask(task))
}

export function markTaskAsRead(taskId: string, userId: string) {
  return apiOrLocal(
    () => httpProvider.markTaskAsRead(taskId, userId),
    () => localStorageProvider.markTaskAsRead(taskId, userId)
  )
}

export function acceptTask(taskId: string, userId?: string) {
  return apiOrLocal(
    () => httpProvider.acceptTask(taskId, userId),
    () => localStorageProvider.acceptTask(taskId, userId)
  )
}

export function startTask(taskId: string, userId: string) {
  return apiOrLocal(
    () => httpProvider.startTask(taskId, userId),
    () => localStorageProvider.startTask(taskId, userId)
  )
}

export function isTaskAssignedToUser(task: any, user: any) {
  return apiOrLocal(
    () => httpProvider.isTaskAssignedToUser(task, user),
    () => localStorageProvider.isTaskAssignedToUser(task, user)
  )
}

export function getTasksForUser(userId: string) {
  return apiOrLocal(
    () => httpProvider.getTasksForUser(userId),
    () => localStorageProvider.getTasksForUser(userId)
  )
}

export function getUnreadTasksForUser(userId: string) {
  return apiOrLocal(
    () => httpProvider.getUnreadTasksForUser(userId),
    () => localStorageProvider.getUnreadTasksForUser(userId)
  )
}

export function getTasksCreatedByUser(userId: string) {
  return apiOrLocal(
    () => httpProvider.getTasksCreatedByUser(userId),
    () => localStorageProvider.getTasksCreatedByUser(userId)
  )
}

export function getUsersByRole(role: string) {
  return apiOrLocal(
    () => httpProvider.getUsersByRole(role),
    () => localStorageProvider.getUsersByRole(role)
  )
}

export function updateTask(task: any) {
  return apiOrLocal(() => httpProvider.updateTask(task), () => localStorageProvider.updateTask(task))
}

export function addTaskComment(taskId: string, userId: string, message: string, attachments?: any[]) {
  return apiOrLocal(
    () => httpProvider.addTaskComment(taskId, userId, message, attachments),
    () => localStorageProvider.addTaskComment(taskId, userId, message, attachments)
  )
}

export function sendTaskForReview(taskId: string, userId: string, comment?: string) {
  return apiOrLocal(
    () => httpProvider.sendTaskForReview(taskId, userId, comment),
    () => localStorageProvider.sendTaskForReview(taskId, userId, comment)
  )
}

export function reviewTask(taskId: string, reviewerId: string, approved: boolean, comment?: string) {
  return apiOrLocal(
    () => httpProvider.reviewTask(taskId, reviewerId, approved, comment),
    () => localStorageProvider.reviewTask(taskId, reviewerId, approved, comment)
  )
}

// Machine norms and computed helpers (local-only for now)
export const getMachineNorms = localStorageProvider.getMachineNorms
export const getMachineNorm = localStorageProvider.getMachineNorm
export const getMachineNormsForPart = localStorageProvider.getMachineNormsForPart
export const setMachineNorm = localStorageProvider.setMachineNorm

export const getPartProgress = localStorageProvider.getPartProgress
export const getPartForecast = localStorageProvider.getPartForecast
export const getMachineTodayProgress = localStorageProvider.getMachineTodayProgress
export const getOverdueTasks = localStorageProvider.getOverdueTasks
export const getAllBlockers = localStorageProvider.getAllBlockers
export const isMissingShiftFact = localStorageProvider.isMissingShiftFact
export const getCurrentStage = localStorageProvider.getCurrentStage
export const getStageCompletion = localStorageProvider.getStageCompletion

// HTTP auth/session only when API mode is enabled
export const login = USE_API ? httpProvider.login : undefined
export const logout = USE_API ? httpProvider.logout : undefined
export const loadCurrentUserFromToken = USE_API ? httpProvider.loadCurrentUserFromToken : undefined

export const isUsingApi = () => USE_API
