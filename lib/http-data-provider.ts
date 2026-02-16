/**
 * HTTP Data Provider - wraps API client with same interface as localStorage provider
 */

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
  WorkOrder,
  AccessGrant,
  AccessEntityType,
  AccessPermission,
  SpecItemStatus,
  JourneySummary,
} from "./types"
import type { InventoryMetalItem, InventoryToolingItem, InventoryMovement } from "./inventory-types"
import { apiClient, ApiClientError, type TokenResponse } from "./api-client"
import { getApiBaseUrl, isApiConfigured as isApiConfiguredEnv } from "./env"

// Helper to check if user is authenticated
function isAuthenticated(): boolean {
  return !!apiClient.getAccessToken()
}

// Transform backend response to frontend format
function transformPart(backendPart: any): Part {
  return {
    id: backendPart.id,
    code: backendPart.code,
    name: backendPart.name,
    qty_plan: backendPart.qty_plan,
    qty_done: backendPart.qty_ready || backendPart.qty_done, // Use qty_ready (alias)
    deadline: backendPart.deadline,
    status: backendPart.status,
    drawing_url: backendPart.drawing_url ? resolveUploadUrl(String(backendPart.drawing_url)) : undefined,
    description: backendPart.description,
    is_cooperation: backendPart.is_cooperation,
    cooperation_partner: backendPart.cooperation_partner,
    cooperation_due_date: backendPart.cooperation_due_date ?? undefined,
    cooperation_qc_status: backendPart.cooperation_qc_status ?? undefined,
    cooperation_qc_checked_at: backendPart.cooperation_qc_checked_at ?? undefined,
    cooperation_qc_comment: backendPart.cooperation_qc_comment ?? undefined,
    required_stages: backendPart.required_stages,
    stage_statuses: backendPart.stage_statuses || [],
    machine_id: backendPart.machine_id,
    customer: backendPart.customer,
  }
}

function transformComment(backendComment: any, taskId?: string): TaskComment {
  return {
    id: backendComment.id,
    task_id: taskId ?? backendComment.task_id,
    user_id: backendComment.user?.id,
    message: backendComment.message,
    attachments: (backendComment.attachments || []).map((a: any) => ({
      ...a,
      url: resolveUploadUrl(String(a?.url || "")),
    })),
    created_at: backendComment.created_at,
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
    read_by: backendTask.read_by_users?.map((r: any) => r.user.id) || [],
    read_by_users: backendTask.read_by_users || [],
    comments: (backendTask.comments || []).map((c: any) => transformComment(c, backendTask.id)),
    review_comment: backendTask.review_comment,
    reviewed_by_id: backendTask.reviewed_by?.id,
    reviewed_at: backendTask.reviewed_at,
  }
}

function transformStageFact(
  backendFact: any,
  fallbackPartId?: string,
  fallbackMachineId?: string
): StageFact {
  return {
    id: backendFact.id,
    date: backendFact.date,
    shift_type: backendFact.shift_type as ShiftType,
    part_id: backendFact.part_id || fallbackPartId || "",
    stage: backendFact.stage as ProductionStage,
    machine_id: backendFact.machine_id || fallbackMachineId,
    operator_id: backendFact.operator?.id || backendFact.operator_id,
    qty_good: backendFact.qty_good,
    qty_scrap: backendFact.qty_scrap,
    qty_expected: backendFact.qty_expected,
    comment: backendFact.comment || "",
    deviation_reason: backendFact.deviation_reason,
    created_at: backendFact.created_at,
    attachments: (backendFact.attachments || []).map((a: any) => ({
      ...a,
      url: resolveUploadUrl(String(a?.url || "")),
    })),
  }
}

function transformMachineNorm(backendNorm: any): MachineNorm {
  return {
    machine_id: backendNorm.machine_id,
    part_id: backendNorm.part_id,
    stage: backendNorm.stage as ProductionStage,
    qty_per_shift: backendNorm.qty_per_shift,
    is_configured: backendNorm.is_configured,
    configured_at: backendNorm.configured_at,
    configured_by_id: backendNorm.configured_by_id,
  }
}

function transformSpecification(backendSpecification: any): Specification {
  return {
    id: backendSpecification.id,
    number: backendSpecification.number,
    customer: backendSpecification.customer ?? undefined,
    deadline: backendSpecification.deadline ?? undefined,
    note: backendSpecification.note ?? undefined,
    status: backendSpecification.status,
    published_to_operators: backendSpecification.published_to_operators,
    created_by: backendSpecification.created_by,
    created_at: backendSpecification.created_at,
  }
}

function transformSpecItem(backendItem: any): SpecItem {
  return {
    id: backendItem.id,
    specification_id: backendItem.specification_id,
    line_no: backendItem.line_no,
    item_type: backendItem.item_type,
    part_id: backendItem.part_id ?? undefined,
    description: backendItem.description,
    qty_required: backendItem.qty_required,
    qty_done: backendItem.qty_done,
    uom: backendItem.uom,
    comment: backendItem.comment ?? undefined,
    status: backendItem.status,
  }
}

function transformAccessGrant(backendGrant: any): AccessGrant {
  return {
    id: backendGrant.id,
    entity_type: backendGrant.entity_type,
    entity_id: backendGrant.entity_id,
    user_id: backendGrant.user_id,
    permission: backendGrant.permission,
    created_by: backendGrant.created_by,
    created_at: backendGrant.created_at,
  }
}

function normalizeMovementStatus(status: string | undefined): LogisticsEntry["status"] {
  if (!status) return "pending"
  return status as LogisticsEntry["status"]
}

function transformMovement(backendMovement: any): LogisticsEntry {
  return {
    id: backendMovement.id,
    part_id: backendMovement.part_id,
    status: normalizeMovementStatus(backendMovement.status),
    from_location: backendMovement.from_location ?? undefined,
    from_holder: backendMovement.from_holder ?? undefined,
    to_location: backendMovement.to_location ?? undefined,
    to_holder: backendMovement.to_holder ?? undefined,
    carrier: backendMovement.carrier ?? undefined,
    tracking_number: backendMovement.tracking_number ?? undefined,
    planned_eta: backendMovement.planned_eta ?? undefined,
    sent_at: backendMovement.sent_at ?? undefined,
    received_at: backendMovement.received_at ?? undefined,
    returned_at: backendMovement.returned_at ?? undefined,
    cancelled_at: backendMovement.cancelled_at ?? undefined,
    qty_sent: backendMovement.qty_sent ?? undefined,
    qty_received: backendMovement.qty_received ?? undefined,
    stage_id: backendMovement.stage_id ?? undefined,
    last_tracking_status: backendMovement.last_tracking_status ?? undefined,
    tracking_last_checked_at: backendMovement.tracking_last_checked_at ?? undefined,
    raw_payload: backendMovement.raw_payload ?? null,
    notes: backendMovement.notes ?? undefined,
    created_at: backendMovement.created_at ?? undefined,
    updated_at: backendMovement.updated_at ?? undefined,
    // Legacy mirror fields for compatibility with old UI fragments.
    type: backendMovement.type ?? undefined,
    description: backendMovement.description ?? undefined,
    quantity: backendMovement.quantity ?? backendMovement.qty_sent ?? undefined,
    date: backendMovement.date ?? undefined,
    counterparty: backendMovement.counterparty ?? backendMovement.to_holder ?? backendMovement.to_location ?? undefined,
  }
}

function transformJourney(backendJourney: any): JourneySummary {
  return {
    part_id: backendJourney.part_id,
    current_location: backendJourney.current_location ?? null,
    current_holder: backendJourney.current_holder ?? null,
    next_required_stage: backendJourney.next_required_stage ?? null,
    eta: backendJourney.eta ?? null,
    last_movement: backendJourney.last_movement ? transformMovement(backendJourney.last_movement) : null,
    last_event: backendJourney.last_event
      ? {
          event_type: backendJourney.last_event.event_type,
          occurred_at: backendJourney.last_event.occurred_at ?? null,
          description: backendJourney.last_event.description ?? null,
        }
      : null,
  }
}

function resolveUploadUrl(url: string): string {
  if (!url) return url
  if (url.startsWith("/uploads/")) {
    const filename = url.split("/").pop()
    if (!filename) return url
    const apiBase = getApiBaseUrl()
    if (!apiBase) return `/api/v1/attachments/serve/${filename}`
    if (apiBase.startsWith("/")) {
      return `${apiBase.replace(/\/$/, "")}/attachments/serve/${filename}`
    }
    try {
      return new URL(`${apiBase.replace(/\/$/, "")}/attachments/serve/${filename}`).toString()
    } catch {
      return url
    }
  }
  if (!url.startsWith("/")) return url
  const apiBase = getApiBaseUrl()
  if (!apiBase || apiBase.startsWith("/")) return url
  try {
    return new URL(url, apiBase).toString()
  } catch {
    return url
  }
}

// Users
export async function getUsers(): Promise<User[]> {
  if (!isAuthenticated()) return []
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
  const data = (response as any)?.data ?? response
  return Array.isArray(data) ? (data as User[]) : []
}

// Get current user synchronously (checks if token exists)
export function getCurrentUser(): User | null {
  // In API mode, user is restored via token on app init
  return null
}

// API mode: user is managed via JWT, no explicit setter
export function setCurrentUser(userId: string | null): void {
  // No-op
}

export async function getMachines(): Promise<Machine[]> {
  const response = await apiClient.getMachines()
  const machines = response.data || response
  return machines as Machine[]
}

export async function getMachineById(id: string): Promise<Machine | undefined> {
  try {
    const machine = await apiClient.getMachineById(id)
    return machine as Machine
  } catch (error) {
    if (error instanceof ApiClientError && error.statusCode === 404) {
      return undefined
    }
    throw error
  }
}

// Parts
async function fetchAllParts(filters?: {
  status?: string
  is_cooperation?: boolean
  machine_id?: string
}): Promise<any[]> {
  const pageSize = 100
  let offset = 0
  const collected: any[] = []

  while (true) {
    const response = await apiClient.getParts({ ...(filters || {}), limit: pageSize, offset })
    const page = (response as any)?.data ?? response
    const items = Array.isArray(page) ? page : []
    collected.push(...items)
    if (items.length < pageSize) break
    offset += pageSize
  }

  return collected
}

export async function getParts(): Promise<Part[]> {
  if (!isAuthenticated()) return []
  const parts = await fetchAllParts()
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

export async function updatePartDrawing(partId: string, drawingUrl: string): Promise<void> {
  await apiClient.updatePart(partId, { drawing_url: drawingUrl })
}

export async function deletePart(partId: string): Promise<void> {
  await apiClient.deletePart(partId)
}

export async function uploadAttachment(file: File): Promise<TaskAttachment> {
  const response = await apiClient.uploadAttachment(file)
  return {
    id: response.id,
    name: response.name,
    url: resolveUploadUrl(response.url),
    type: response.type,
    size: response.size,
  }
}

export async function getPartsForMachine(machineId: string): Promise<Part[]> {
  const parts = await fetchAllParts({ machine_id: machineId })
  return parts.map(transformPart)
}

export async function getCooperationParts(): Promise<Part[]> {
  const parts = await fetchAllParts({ is_cooperation: true })
  return parts.map(transformPart)
}

export async function getOwnProductionParts(): Promise<Part[]> {
  const parts = await fetchAllParts({ is_cooperation: false })
  return parts.map(transformPart)
}

// Movements / logistics journal
export async function getLogistics(): Promise<LogisticsEntry[]> {
  if (!isAuthenticated()) return []
  const parts = await getParts()
  if (parts.length === 0) return []

  const byPart = await Promise.all(
    parts.map(async (part) => {
      try {
        const response = await apiClient.getPartMovements(part.id)
        const movements = (response as any)?.data ?? response
        return Array.isArray(movements) ? movements.map(transformMovement) : []
      } catch {
        return []
      }
    })
  )
  return byPart.flat()
}

export async function getLogisticsForPart(partId: string): Promise<LogisticsEntry[]> {
  const response = await apiClient.getPartMovements(partId)
  const movements = (response as any)?.data ?? response
  return Array.isArray(movements) ? movements.map(transformMovement) : []
}

export async function createLogisticsEntry(entry: Omit<LogisticsEntry, "id">): Promise<LogisticsEntry> {
  const payload = {
    from_location: entry.from_location,
    from_holder: entry.from_holder,
    to_location: entry.to_location,
    to_holder: entry.to_holder ?? entry.counterparty,
    carrier: entry.carrier,
    tracking_number: entry.tracking_number,
    planned_eta: entry.planned_eta,
    qty_sent: entry.qty_sent ?? entry.quantity,
    qty_received: entry.qty_received,
    stage_id: entry.stage_id,
    notes: entry.notes,
    description: entry.description,
    type: entry.type,
    allow_parallel: false,
  }
  const created = await apiClient.createMovement(entry.part_id, payload)
  return transformMovement(created)
}

export async function updateLogisticsEntry(entry: LogisticsEntry): Promise<LogisticsEntry> {
  const payload = {
    status: entry.status,
    from_location: entry.from_location,
    from_holder: entry.from_holder,
    to_location: entry.to_location,
    to_holder: entry.to_holder ?? entry.counterparty,
    carrier: entry.carrier,
    tracking_number: entry.tracking_number,
    planned_eta: entry.planned_eta,
    qty_sent: entry.qty_sent ?? entry.quantity,
    qty_received: entry.qty_received,
    stage_id: entry.stage_id,
    notes: entry.notes,
    description: entry.description,
  }
  const updated = await apiClient.updateMovement(entry.id, payload)
  return transformMovement(updated)
}

export async function getJourneyForPart(partId: string): Promise<JourneySummary | null> {
  try {
    const response = await apiClient.getPartJourney(partId)
    return transformJourney(response)
  } catch (error) {
    if (error instanceof ApiClientError && error.statusCode === 404) {
      return null
    }
    throw error
  }
}

// Stage Facts
export async function getStageFacts(): Promise<StageFact[]> {
  if (!isAuthenticated()) return []

  const parts = await getParts()
  if (parts.length === 0) return []

  const factsByPart = await Promise.all(
    parts.map(async (part) => {
      try {
        const response = await apiClient.getPartFacts(part.id)
        const facts = response.data || response
        return facts.map((fact: any) =>
          transformStageFact(fact, part.id, part.machine_id)
        )
      } catch {
        return []
      }
    })
  )

  return factsByPart.flat()
}

export async function getStageFactsForPart(partId: string): Promise<StageFact[]> {
  const response = await apiClient.getPartFacts(partId)
  const facts = response.data || response
  return facts.map((fact: any) => transformStageFact(fact, partId))
}

export async function createStageFact(
  fact: Omit<StageFact, "id" | "created_at">
): Promise<StageFact> {
  const response = await apiClient.createStageFact(fact.part_id, fact)
  return transformStageFact(response, fact.part_id, fact.machine_id)
}

export async function updateStageFact(
  factId: string,
  data: Omit<StageFact, "id" | "created_at" | "part_id" | "stage" | "date" | "shift_type">
): Promise<StageFact> {
  const response = await apiClient.updateStageFact(factId, data)
  return transformStageFact(response)
}

export async function deleteStageFact(factId: string): Promise<void> {
  await apiClient.deleteStageFact(factId)
}

// Machine norms
export async function getMachineNorms(): Promise<MachineNorm[]> {
  if (!isAuthenticated()) return []

  const parts = await getParts()
  if (parts.length === 0) return []

  const normsByPart = await Promise.all(
    parts.map(async (part) => {
      try {
        const response = await apiClient.getPartNorms(part.id)
        const norms = response.data || response
        return norms.map((norm: any) => transformMachineNorm(norm))
      } catch {
        return []
      }
    })
  )

  return normsByPart.flat()
}

export async function setMachineNorm(
  norm: Omit<MachineNorm, "configured_at">
): Promise<MachineNorm> {
  const response = await apiClient.upsertPartNorm(norm.part_id, norm)
  return transformMachineNorm(response)
}

// Tasks
export async function getTasks(): Promise<Task[]> {
  if (!isAuthenticated()) return []
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
  return transformComment(response, taskId)
}

// Try to restore current user from existing access token (for session persistence)
export async function restoreSession(): Promise<User | null> {
  // Access token is memory-only; restore by refreshing via HttpOnly cookie.
  const refreshed = await apiClient.refresh()
  if (!refreshed) return null
  try {
    const me = await apiClient.getMe()
    return me as User
  } catch (error) {
    if (error instanceof ApiClientError && (error.statusCode === 401 || error.statusCode === 403)) {
      apiClient.setAccessToken(null)
      return null
    }
    throw error
  }
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
export async function login(username: string, password: string): Promise<TokenResponse> {
  return apiClient.login(username, password)
}

// Logout helper
export async function logout(): Promise<void> {
  await apiClient.logout()
}

// Check if API is configured
export function isApiConfigured(): boolean {
  return isApiConfiguredEnv()
}

// Specifications
export async function getSpecifications(): Promise<Specification[]> {
  const response = await apiClient.getSpecifications()
  const data = response.data || response
  return (Array.isArray(data) ? data : []).map(transformSpecification)
}

export async function getSpecificationsForUser(_userId: string): Promise<Specification[]> {
  // Backend returns data already scoped to current user.
  return getSpecifications()
}

export async function getSpecificationById(specificationId: string): Promise<Specification | undefined> {
  try {
    const response = await apiClient.getSpecificationById(specificationId)
    return transformSpecification(response)
  } catch (error) {
    if (error instanceof ApiClientError && error.statusCode === 404) {
      return undefined
    }
    throw error
  }
}

export async function createSpecification(
  payload: {
    specification: Omit<Specification, "id" | "created_at">
    items: Array<Omit<SpecItem, "id" | "specification_id" | "line_no" | "qty_done" | "status">>
  }
): Promise<Specification> {
  const createdSpecification = await apiClient.createSpecification(payload.specification)

  const specificationId = createdSpecification.id
  for (const item of payload.items) {
    await apiClient.createSpecItem(specificationId, item)
  }

  return transformSpecification(createdSpecification)
}

export async function createSpecItem(
  specificationId: string,
  item: Omit<SpecItem, "id" | "specification_id" | "line_no" | "qty_done" | "status">
): Promise<SpecItem> {
  const response = await apiClient.createSpecItem(specificationId, item)
  return transformSpecItem(response)
}

export async function updateSpecification(specification: Specification): Promise<void> {
  await apiClient.updateSpecification(specification.id, specification)
}

export async function setSpecificationPublished(specificationId: string, published: boolean): Promise<void> {
  await apiClient.setSpecificationPublished(specificationId, published)
}

export async function deleteSpecification(specificationId: string, deleteLinkedParts = false): Promise<void> {
  await apiClient.deleteSpecification(specificationId, deleteLinkedParts)
}

export async function getSpecItems(): Promise<SpecItem[]> {
  const response = await apiClient.getSpecItems()
  const data = response.data || response
  return (Array.isArray(data) ? data : []).map(transformSpecItem)
}

export async function getSpecItemsBySpecification(specificationId: string): Promise<SpecItem[]> {
  const response = await apiClient.getSpecItemsBySpecification(specificationId)
  const data = response.data || response
  return (Array.isArray(data) ? data : []).map(transformSpecItem)
}

export async function updateSpecItemProgress(
  specItemId: string,
  qtyDone: number,
  statusOverride?: SpecItemStatus
): Promise<void> {
  await apiClient.updateSpecItemProgress(specItemId, qtyDone, statusOverride)
}

export async function getWorkOrders(): Promise<WorkOrder[]> {
  return []
}

export async function getWorkOrdersForUser(_userId: string): Promise<WorkOrder[]> {
  return []
}

export async function getWorkOrdersForSpecification(_specificationId: string): Promise<WorkOrder[]> {
  return []
}

export async function createWorkOrder(_order: Omit<WorkOrder, "id" | "created_at">): Promise<WorkOrder> {
  throw new Error("Work order API is not implemented")
}

export async function updateWorkOrder(_order: WorkOrder): Promise<void> {
  throw new Error("Work order API is not implemented")
}

export async function queueWorkOrder(_workOrderId: string, _machineId: string, _queuePos?: number): Promise<void> {
  throw new Error("Work order API is not implemented")
}

export async function startWorkOrder(_workOrderId: string, _operatorId?: string): Promise<void> {
  throw new Error("Work order API is not implemented")
}

export async function blockWorkOrder(_workOrderId: string, _reason: string): Promise<void> {
  throw new Error("Work order API is not implemented")
}

export async function reportWorkOrderProgress(_workOrderId: string, _qtyGood: number, _qtyScrap = 0): Promise<void> {
  throw new Error("Work order API is not implemented")
}

export async function completeWorkOrder(_workOrderId: string): Promise<void> {
  throw new Error("Work order API is not implemented")
}

export async function getAccessGrants(): Promise<AccessGrant[]> {
  const response = await apiClient.getAccessGrants()
  const data = response.data || response
  return (Array.isArray(data) ? data : []).map(transformAccessGrant)
}

export async function getAccessGrantsForEntity(entityType: AccessEntityType, entityId: string): Promise<AccessGrant[]> {
  const response = await apiClient.getAccessGrants({
    entity_type: entityType,
    entity_id: entityId,
  })
  const data = response.data || response
  return (Array.isArray(data) ? data : []).map(transformAccessGrant)
}

export async function grantAccess(
  entityType: AccessEntityType,
  entityId: string,
  userId: string,
  permission: AccessPermission,
  _createdBy: string
): Promise<AccessGrant> {
  const response = await apiClient.grantAccess({
    entity_type: entityType,
    entity_id: entityId,
    user_id: userId,
    permission,
  })
  return transformAccessGrant(response)
}

export async function revokeAccess(grantId: string): Promise<void> {
  await apiClient.revokeAccess(grantId)
}

// Inventory (API not implemented yet)
export async function getInventoryMetal(): Promise<InventoryMetalItem[]> {
  return []
}

export async function createInventoryMetal(_item: Omit<InventoryMetalItem, "id">): Promise<InventoryMetalItem> {
  throw new Error("Inventory API is not implemented")
}

export async function updateInventoryMetal(_item: InventoryMetalItem): Promise<void> {
  throw new Error("Inventory API is not implemented")
}

export async function getInventoryTooling(): Promise<InventoryToolingItem[]> {
  return []
}

export async function createInventoryTooling(_item: Omit<InventoryToolingItem, "id">): Promise<InventoryToolingItem> {
  throw new Error("Inventory API is not implemented")
}

export async function updateInventoryTooling(_item: InventoryToolingItem): Promise<void> {
  throw new Error("Inventory API is not implemented")
}

export async function getInventoryMovements(): Promise<InventoryMovement[]> {
  return []
}

export async function createInventoryMovement(_movement: Omit<InventoryMovement, "id">): Promise<InventoryMovement> {
  throw new Error("Inventory API is not implemented")
}

// Helper functions (fallbacks for localStorage-specific features)
export function getTasksCreatedByUser(userId: string): Task[] {
  // Not implemented in API mode - return empty array
  return []
}

export function getUsersByRole(role: string): User[] {
  // Not implemented in API mode - return empty array
  return []
}
