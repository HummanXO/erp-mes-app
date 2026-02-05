/**
 * Data Provider Adapter - switches between localStorage and HTTP based on env
 */

import * as localStorageProvider from "./data-provider"
import * as httpProvider from "./http-data-provider"
import { getApiBaseUrl, isApiConfigured } from "./env"

// Check if API is configured
const API_BASE_URL = getApiBaseUrl()
const USE_API = isApiConfigured()

// Log which provider is being used
if (typeof window !== "undefined") {
  console.log(
    USE_API 
      ? `🌐 Using HTTP API: ${API_BASE_URL}` 
      : "💾 Using localStorage (no API base URL configured)"
  )
}

// Re-export all functions from the appropriate provider
export const initializeData = USE_API ? (() => {}) : localStorageProvider.initializeData
export const resetData = USE_API ? (() => {}) : localStorageProvider.resetData

// Users
export const getUsers = USE_API ? httpProvider.getUsers : localStorageProvider.getUsers
export const getUserById = USE_API ? httpProvider.getUserById : localStorageProvider.getUserById
export const getOperators = USE_API ? httpProvider.getOperators : localStorageProvider.getOperators
export const getCurrentUser = USE_API ? httpProvider.getCurrentUser : localStorageProvider.getCurrentUser
export const setCurrentUser = USE_API ? httpProvider.setCurrentUser : localStorageProvider.setCurrentUser

// Demo Date
export const getDemoDate = USE_API ? httpProvider.getDemoDate : localStorageProvider.getDemoDate
export const setDemoDate = USE_API ? (() => {}) : localStorageProvider.setDemoDate

// Machines
export const getMachines = USE_API ? httpProvider.getMachines : localStorageProvider.getMachines
export const getMachineById = USE_API ? httpProvider.getMachineById : localStorageProvider.getMachineById
export const getMachinesByDepartment = localStorageProvider.getMachinesByDepartment

// Parts
export const getParts = USE_API ? httpProvider.getParts : localStorageProvider.getParts
export const getPartById = USE_API ? httpProvider.getPartById : localStorageProvider.getPartById
export const getPartsForMachine = USE_API ? httpProvider.getPartsForMachine : localStorageProvider.getPartsForMachine
export const getCooperationParts = USE_API ? httpProvider.getCooperationParts : localStorageProvider.getCooperationParts
export const getOwnProductionParts = USE_API ? httpProvider.getOwnProductionParts : localStorageProvider.getOwnProductionParts
export const getPartsByStage = localStorageProvider.getPartsByStage
export const getPartsInProgressAtStage = localStorageProvider.getPartsInProgressAtStage
export const createPart = USE_API ? httpProvider.createPart : localStorageProvider.createPart
export const updatePart = USE_API ? httpProvider.updatePart : localStorageProvider.updatePart
export const updatePartDrawing = localStorageProvider.updatePartDrawing
export const updatePartStageStatus = localStorageProvider.updatePartStageStatus

// Stage Facts
export const getStageFacts = USE_API ? httpProvider.getStageFacts : localStorageProvider.getStageFacts
export const getStageFactsForDate = localStorageProvider.getStageFactsForDate
export const getStageFactsForPart = USE_API ? httpProvider.getStageFactsForPart : localStorageProvider.getStageFactsForPart
export const getStageFactsForPartAndStage = localStorageProvider.getStageFactsForPartAndStage
export const getStageFactsForMachine = localStorageProvider.getStageFactsForMachine
export const getStageFactForDateShiftAndStage = localStorageProvider.getStageFactForDateShiftAndStage
export const createStageFact = USE_API ? httpProvider.createStageFact : localStorageProvider.createStageFact

// Logistics
export const getLogistics = localStorageProvider.getLogistics
export const getLogisticsForPart = localStorageProvider.getLogisticsForPart
export const createLogisticsEntry = localStorageProvider.createLogisticsEntry
export const updateLogisticsEntry = localStorageProvider.updateLogisticsEntry

// Tasks
export const getTasks = USE_API ? httpProvider.getTasks : localStorageProvider.getTasks
export const getTasksForPart = USE_API ? httpProvider.getTasksForPart : localStorageProvider.getTasksForPart
export const getTasksForMachine = localStorageProvider.getTasksForMachine
export const getTasksForStage = localStorageProvider.getTasksForStage
export const getBlockersForMachine = localStorageProvider.getBlockersForMachine
export const getBlockersForPart = localStorageProvider.getBlockersForPart
export const createTask = USE_API ? httpProvider.createTask : localStorageProvider.createTask
export const markTaskAsRead = USE_API ? httpProvider.markTaskAsRead : localStorageProvider.markTaskAsRead
export const acceptTask = USE_API ? httpProvider.acceptTask : localStorageProvider.acceptTask
export const startTask = USE_API ? httpProvider.startTask : localStorageProvider.startTask
export const isTaskAssignedToUser = USE_API ? httpProvider.isTaskAssignedToUser : localStorageProvider.isTaskAssignedToUser
export const getTasksForUser = USE_API ? httpProvider.getTasksForUser : localStorageProvider.getTasksForUser
export const getUnreadTasksForUser = USE_API ? httpProvider.getUnreadTasksForUser : localStorageProvider.getUnreadTasksForUser
export const getTasksCreatedByUser = localStorageProvider.getTasksCreatedByUser
export const getUsersByRole = localStorageProvider.getUsersByRole
export const updateTask = USE_API ? httpProvider.updateTask : localStorageProvider.updateTask
export const addTaskComment = USE_API ? httpProvider.addTaskComment : localStorageProvider.addTaskComment
export const sendTaskForReview = USE_API ? httpProvider.sendTaskForReview : localStorageProvider.sendTaskForReview
export const reviewTask = USE_API ? httpProvider.reviewTask : localStorageProvider.reviewTask

// Machine Norms
export const getMachineNorms = localStorageProvider.getMachineNorms
export const getMachineNorm = localStorageProvider.getMachineNorm
export const getMachineNormsForPart = localStorageProvider.getMachineNormsForPart
export const setMachineNorm = localStorageProvider.setMachineNorm

// Computed helpers
export const getPartProgress = localStorageProvider.getPartProgress
export const getPartForecast = localStorageProvider.getPartForecast
export const getMachineTodayProgress = localStorageProvider.getMachineTodayProgress
export const getOverdueTasks = localStorageProvider.getOverdueTasks
export const getAllBlockers = localStorageProvider.getAllBlockers
export const isMissingShiftFact = localStorageProvider.isMissingShiftFact
export const getCurrentStage = localStorageProvider.getCurrentStage
export const getStageCompletion = localStorageProvider.getStageCompletion

// Login/Logout for HTTP
export const login = USE_API ? httpProvider.login : undefined
export const logout = USE_API ? httpProvider.logout : undefined

// Check if using API
export const isUsingApi = () => USE_API
