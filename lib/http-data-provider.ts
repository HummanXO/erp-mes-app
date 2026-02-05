/**
 * HTTP Data Provider - wraps API client with same interface as localStorage provider
 */

import { apiClient, ApiClientError } from "./api-client"
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
} from "./types"

// Transform backend response to frontend format
function transformPart(backendPart: any): Part {
  return {
    id: backendPart.id,
    code: backendPart.code,
    name: backendPart.name,
    qty_plan: backendPart.qty_plan,
    qty_done: backendPart.qty_ready || backendPart.qty_done, // Use qty_ready (alias)
    priority: backendPart.priority,
    deadline: backendPart.deadline,
    status: backendPart.status,
    drawing_url: backendPart.drawing_url,
    description: backendPart.description,
    is_cooperation: backendPart.is_cooperation,
    cooperation_partner: backendPart.cooperation_partner,
    required_stages: backendPart.required_stages,
    stage_statuses: backendPart.stage_statuses || [],
    machine_id: backendPart.machine_id,
    customer: backendPart.customer,
  }
}

function transformTask(backendTask: any): Task {
  return {
    id: backendTask.id,
    part_id: backendTask.part?.id,
    machine_id: backendTask.machine_id,
    stage: backendTask.stage,
    title: backendTask.title,
    description: backendTask.description,
    creator_id: backendTask.creator?.id,
    assignee_type: backendTask.assignee_type,
    assignee_id: backendTask.assignee_id,
    assignee_role: backendTask.assignee_role,
    accepted_by_id: backendTask.accepted_by?.id,
    accepted_at: backendTask.accepted_at,
    status: backendTask.status,
    is_blocker: backendTask.is_blocker,
    due_date: backendTask.due_date,
    category: backendTask.category,
    created_at: backendTask.created_at,
    read_by: backendTask.is_read ? [backendTask.creator?.id] : [], // Transform is_read to array
    comments: backendTask.comments || [],
    review_comment: backendTask.review_comment,
    reviewed_by_id: backendTask.reviewed_by?.id,
    reviewed_at: backendTask.reviewed_at,
  }
}

function transformStageFact(backendFact: any): StageFact {
  return {
    id: backendFact.id,
    date: backendFact.date,
    shift_type: backendFact.shift_type as ShiftType,
    part_id: backendFact.part_id,
    stage: backendFact.stage as ProductionStage,
    machine_id: backendFact.machine_id,
    operator_id: backendFact.operator?.id || backendFact.operator_id,
    qty_good: backendFact.qty_good,
    qty_scrap: backendFact.qty_scrap,
    qty_expected: backendFact.qty_expected,
    comment: backendFact.comment || "",
    deviation_reason: backendFact.deviation_reason,
    created_at: backendFact.created_at,
    attachments: backendFact.attachments || [],
  }
}

// Users
export async function getUsers(): Promise<User[]> {
  const response = await apiClient.getUsers()
  return response.data || response
}

export async function getUserById(id: string): Promise<User | undefined> {
  try {
    return await apiClient.getUserById(id)
  } catch (error) {
    if (error instanceof ApiClientError && error.statusCode === 404) {
      return undefined
    }
    throw error
  }
}

export async function getOperators(): Promise<User[]> {
  const response = await apiClient.getOperators()
  return response.data || response
}

export async function getCurrentUser(): Promise<User | null> {
  try {
    return await apiClient.getMe()
  } catch (error) {
    return null
  }
}

export async function setCurrentUser(userId: string | null): Promise<void> {
  // Token management handled by apiClient
}

// Machines - placeholder (would need backend endpoint)
export async function getMachines(): Promise<Machine[]> {
  // TODO: Implement when backend has machines endpoint
  return []
}

export async function getMachineById(id: string): Promise<Machine | undefined> {
  // TODO: Implement
  return undefined
}

// Parts
export async function getParts(): Promise<Part[]> {
  const response = await apiClient.getParts()
  const parts = response.data || response
  return parts.map(transformPart)
}

export async function getPartById(id: string): Promise<Part | undefined> {
  try {
    const part = await apiClient.getPartById(id)
    return transformPart(part)
  } catch (error) {
    if (error instanceof ApiClientError && error.statusCode === 404) {
      return undefined
    }
    throw error
  }
}

export async function createPart(part: Omit<Part, "id">): Promise<Part> {
  const response = await apiClient.createPart(part)
  return transformPart(response)
}

export async function updatePart(part: Part): Promise<void> {
  await apiClient.updatePart(part.id, part)
}

export async function getPartsForMachine(machineId: string): Promise<Part[]> {
  const response = await apiClient.getParts({ machine_id: machineId })
  const parts = response.data || response
  return parts.map(transformPart)
}

export async function getCooperationParts(): Promise<Part[]> {
  const response = await apiClient.getParts({ is_cooperation: true })
  const parts = response.data || response
  return parts.map(transformPart)
}

export async function getOwnProductionParts(): Promise<Part[]> {
  const response = await apiClient.getParts({ is_cooperation: false })
  const parts = response.data || response
  return parts.map(transformPart)
}

// Stage Facts
export async function getStageFacts(): Promise<StageFact[]> {
  // Would need to aggregate from all parts
  return []
}

export async function getStageFactsForPart(partId: string): Promise<StageFact[]> {
  const response = await apiClient.getPartFacts(partId)
  const facts = response.data || response
  return facts.map(transformStageFact)
}

export async function createStageFact(
  fact: Omit<StageFact, "id" | "created_at">
): Promise<StageFact> {
  const response = await apiClient.createStageFact(fact.part_id, fact)
  return transformStageFact(response)
}

// Tasks
export async function getTasks(): Promise<Task[]> {
  const response = await apiClient.getTasks()
  const tasks = response.data || response
  return tasks.map(transformTask)
}

export async function getTasksForPart(partId: string): Promise<Task[]> {
  const response = await apiClient.getTasks({ part_id: partId })
  const tasks = response.data || response
  return tasks.map(transformTask)
}

export async function getTasksForUser(userId: string): Promise<Task[]> {
  const response = await apiClient.getTasks({ assigned_to_me: true })
  const tasks = response.data || response
  return tasks.map(transformTask)
}

export async function getUnreadTasksForUser(userId: string): Promise<Task[]> {
  const response = await apiClient.getTasks({ assigned_to_me: true, unread: true })
  const tasks = response.data || response
  return tasks.map(transformTask)
}

export async function createTask(
  task: Omit<Task, "id" | "created_at" | "read_by">
): Promise<Task> {
  const response = await apiClient.createTask(task)
  return transformTask(response)
}

export async function updateTask(task: Task): Promise<void> {
  // TODO: Implement when needed
}

export async function markTaskAsRead(taskId: string, userId: string): Promise<void> {
  await apiClient.markTaskAsRead(taskId)
}

export async function acceptTask(taskId: string, userId?: string): Promise<void> {
  await apiClient.acceptTask(taskId)
}

export async function startTask(taskId: string, userId: string): Promise<void> {
  await apiClient.startTask(taskId)
}

export async function addTaskComment(
  taskId: string,
  userId: string,
  message: string,
  attachments: TaskComment["attachments"] = []
): Promise<TaskComment | null> {
  const response = await apiClient.addTaskComment(taskId, message, attachments)
  return response
}

export async function sendTaskForReview(
  taskId: string,
  userId: string,
  comment?: string
): Promise<void> {
  await apiClient.sendTaskToReview(taskId, comment)
}

export async function reviewTask(
  taskId: string,
  reviewerId: string,
  approved: boolean,
  comment?: string
): Promise<void> {
  await apiClient.reviewTask(taskId, approved, comment)
}

// Helper to check if task is assigned to user
export function isTaskAssignedToUser(task: Task, user: User): boolean {
  if (task.assignee_type === "all") return true
  if (task.assignee_type === "role" && task.assignee_role === user.role) return true
  if (task.assignee_type === "user" && task.assignee_id === user.id) return true
  return false
}

// Get demo date (system date)
export function getDemoDate(): string {
  const today = new Date()
  return today.toISOString().split("T")[0]
}

// Login helper
export async function login(username: string, password: string): Promise<User> {
  const response = await apiClient.login(username, password)
  return response.user
}

// Logout helper
export async function logout(): Promise<void> {
  await apiClient.logout()
}

// Check if API is configured
export function isApiConfigured(): boolean {
  return !!import.meta.env.VITE_API_BASE_URL
}
