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
  SpecItemType,
  SpecItemStatus,
  SpecificationStatus,
  WorkOrder,
  WorkOrderStatus,
  AccessGrant,
  AccessEntityType,
  AccessPermission,
} from "./types"
import type { InventoryMetalItem, InventoryToolingItem, InventoryMovement, Qty } from "./inventory-types"
import { addAuditEntry } from "./audit-log"
import { notifyTaskAccepted, notifyTaskComment, notifyTaskForReview, notifyTaskApproved, notifyTaskReturned } from "./notifications"
import {
  MOCK_USERS,
  MOCK_MACHINES,
  MOCK_PARTS,
  MOCK_STAGE_FACTS,
  MOCK_TASKS,
  MOCK_LOGISTICS,
  MOCK_MACHINE_NORMS,
  MOCK_SPECIFICATIONS,
  MOCK_SPEC_ITEMS,
  MOCK_WORK_ORDERS,
  MOCK_ACCESS_GRANTS,
  MOCK_INVENTORY_METAL,
  MOCK_INVENTORY_TOOLING,
  MOCK_INVENTORY_MOVEMENTS,
  DEFAULT_DEMO_DATE,
  STORAGE_KEYS,
} from "./mock-data"

// Helper to safely parse JSON from localStorage
function safeJsonParse<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback
  try {
    const item = localStorage.getItem(key)
    return item ? JSON.parse(item) : fallback
  } catch {
    return fallback
  }
}

// Helper to save to localStorage
function saveToStorage<T>(key: string, data: T): void {
  if (typeof window === "undefined") return
  localStorage.setItem(key, JSON.stringify(data))
}

function generateAttachmentId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `file_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "")
    reader.onerror = () => reject(new Error("Failed to read file"))
    reader.readAsDataURL(file)
  })
}

export async function uploadAttachment(file: File): Promise<TaskAttachment> {
  const id = generateAttachmentId()
  const name = file.name || `file-${id}`
  const type: TaskAttachment["type"] = file.type.startsWith("image/") ? "image" : "file"
  const url = await readFileAsDataUrl(file)

  return {
    id,
    name,
    url,
    type,
    size: file.size,
  }
}

// Initialize data from localStorage or mock data
export function initializeData(): void {
  if (typeof window === "undefined") return
  
  const existingParts = localStorage.getItem(STORAGE_KEYS.parts)
  const existingTasks = localStorage.getItem(STORAGE_KEYS.tasks)
  const existingUsers = localStorage.getItem(STORAGE_KEYS.users)
  
  // Check if existing data needs migration (old format without stage_statuses or task creator_id)
  let needsReset = !existingParts
  if (existingParts) {
    try {
      const parts = JSON.parse(existingParts)
      // Check if first part has stage_statuses (new format)
      if (parts.length > 0 && !parts[0].stage_statuses) {
        needsReset = true
      }
    } catch {
      needsReset = true
    }
  }
  
  // Check if tasks have new format with creator_id, read_by and assignee_type
  if (existingTasks && !needsReset) {
    try {
      const tasks = JSON.parse(existingTasks)
      if (tasks.length > 0 && (!tasks[0].creator_id || !tasks[0].read_by || !tasks[0].assignee_type)) {
        needsReset = true
      }
    } catch {
      needsReset = true
    }
  }
  
  // Check if users have initials
  if (existingUsers && !needsReset) {
    try {
      const users = JSON.parse(existingUsers)
      if (users.length > 0 && !users[0].initials) {
        needsReset = true
      }
    } catch {
      needsReset = true
    }
  }
  
  // Check if tasks have comments array (new format)
  if (existingTasks && !needsReset) {
    try {
      const tasks = JSON.parse(existingTasks)
      if (tasks.length > 0 && tasks[0].comments === undefined) {
        needsReset = true
      }
    } catch {
      needsReset = true
    }
  }
  
  // Check if p_725 has incorrect qty_done (1620 instead of 1220)
  // This forces a reset to fix the mock data bug
  if (existingParts && !needsReset) {
    try {
      const parts = JSON.parse(existingParts)
      const p725 = parts.find((p: Part) => p.id === "p_725")
      if (p725 && p725.qty_done === 1620) {
        needsReset = true
      }
    } catch {
      needsReset = true
    }
  }
  
  if (needsReset) {
    saveToStorage(STORAGE_KEYS.users, MOCK_USERS)
    saveToStorage(STORAGE_KEYS.machines, MOCK_MACHINES)
    saveToStorage(STORAGE_KEYS.parts, MOCK_PARTS)
    saveToStorage(STORAGE_KEYS.stageFacts, MOCK_STAGE_FACTS)
    saveToStorage(STORAGE_KEYS.tasks, MOCK_TASKS)
    saveToStorage(STORAGE_KEYS.logistics, MOCK_LOGISTICS)
    saveToStorage(STORAGE_KEYS.machineNorms, MOCK_MACHINE_NORMS)
    saveToStorage(STORAGE_KEYS.specifications, MOCK_SPECIFICATIONS)
    saveToStorage(STORAGE_KEYS.specItems, MOCK_SPEC_ITEMS)
    saveToStorage(STORAGE_KEYS.workOrders, MOCK_WORK_ORDERS)
    saveToStorage(STORAGE_KEYS.accessGrants, MOCK_ACCESS_GRANTS)
    saveToStorage(STORAGE_KEYS.inventoryMetal, MOCK_INVENTORY_METAL)
    saveToStorage(STORAGE_KEYS.inventoryTooling, MOCK_INVENTORY_TOOLING)
    saveToStorage(STORAGE_KEYS.inventoryMovements, MOCK_INVENTORY_MOVEMENTS)
    saveToStorage(STORAGE_KEYS.demoDate, DEFAULT_DEMO_DATE)
  }

  // Non-breaking migration: add new entities when older local data already exists
  if (!localStorage.getItem(STORAGE_KEYS.specifications)) {
    saveToStorage(STORAGE_KEYS.specifications, MOCK_SPECIFICATIONS)
  }
  if (!localStorage.getItem(STORAGE_KEYS.specItems)) {
    saveToStorage(STORAGE_KEYS.specItems, MOCK_SPEC_ITEMS)
  }
  if (!localStorage.getItem(STORAGE_KEYS.workOrders)) {
    saveToStorage(STORAGE_KEYS.workOrders, MOCK_WORK_ORDERS)
  }
  if (!localStorage.getItem(STORAGE_KEYS.accessGrants)) {
    saveToStorage(STORAGE_KEYS.accessGrants, MOCK_ACCESS_GRANTS)
  }

  // Migration: remove legacy seeded demo data for specifications/work orders/access.
  // Keep user-created data intact.
  try {
    const specifications = safeJsonParse<Specification[]>(STORAGE_KEYS.specifications, [])
    const specItems = safeJsonParse<SpecItem[]>(STORAGE_KEYS.specItems, [])
    const workOrders = safeJsonParse<WorkOrder[]>(STORAGE_KEYS.workOrders, [])
    const grants = safeJsonParse<AccessGrant[]>(STORAGE_KEYS.accessGrants, [])

    const legacySpecIds = new Set(["spec_1001", "spec_1002"])
    const hasOnlyLegacySpecs =
      specifications.length > 0 &&
      specifications.every(spec => legacySpecIds.has(spec.id))

    if (hasOnlyLegacySpecs) {
      saveToStorage(STORAGE_KEYS.specifications, [])
      saveToStorage(
        STORAGE_KEYS.specItems,
        specItems.filter(item => !legacySpecIds.has(item.specification_id))
      )
      saveToStorage(
        STORAGE_KEYS.workOrders,
        workOrders.filter(order => !legacySpecIds.has(order.specification_id))
      )
      saveToStorage(
        STORAGE_KEYS.accessGrants,
        grants.filter(
          grant => !(grant.entity_type === "specification" && legacySpecIds.has(grant.entity_id))
        )
      )
    }
  } catch {
    // Ignore migration issues, local storage may contain malformed user data.
  }
}

// Reset data to initial mock data
export function resetData(): void {
  if (typeof window === "undefined") return
  
  Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key))
  initializeData()
}

// Users
export function getUsers(): User[] {
  return safeJsonParse(STORAGE_KEYS.users, MOCK_USERS)
}

export function getUserById(id: string): User | undefined {
  return getUsers().find(u => u.id === id)
}

export function getOperators(): User[] {
  return getUsers().filter(u => u.role === "operator")
}

export function getCurrentUser(): User | null {
  const userId = safeJsonParse<string | null>(STORAGE_KEYS.currentUserId, null)
  if (!userId) return null
  return getUserById(userId) || null
}

export function setCurrentUser(userId: string | null): void {
  if (userId) {
    saveToStorage(STORAGE_KEYS.currentUserId, userId)
  } else {
    localStorage.removeItem(STORAGE_KEYS.currentUserId)
  }
}

// Demo Date
export function getDemoDate(): string {
  return safeJsonParse(STORAGE_KEYS.demoDate, DEFAULT_DEMO_DATE)
}

export function setDemoDate(date: string): void {
  saveToStorage(STORAGE_KEYS.demoDate, date)
}

// Machines
export function getMachines(): Machine[] {
  return safeJsonParse(STORAGE_KEYS.machines, MOCK_MACHINES)
}

export function getMachineById(id: string): Machine | undefined {
  return getMachines().find(m => m.id === id)
}

export function getMachinesByDepartment(department: ProductionStage): Machine[] {
  return getMachines().filter(m => m.department === department)
}

// Parts
export function getParts(): Part[] {
  return safeJsonParse(STORAGE_KEYS.parts, MOCK_PARTS)
}

export function getPartById(id: string): Part | undefined {
  return getParts().find(p => p.id === id)
}

export function getPartsForMachine(machineId: string): Part[] {
  return getParts().filter(p => p.machine_id === machineId)
}

export function getCooperationParts(): Part[] {
  return getParts().filter(p => p.is_cooperation)
}

export function getOwnProductionParts(): Part[] {
  return getParts().filter(p => !p.is_cooperation)
}

export function getPartsByStage(stage: ProductionStage): Part[] {
  return getParts().filter(p => {
    const stageStatuses = p.stage_statuses || []
    const stageStatus = stageStatuses.find(s => s.stage === stage)
    return stageStatus && stageStatus.status !== "skipped"
  })
}

export function getPartsInProgressAtStage(stage: ProductionStage): Part[] {
  return getParts().filter(p => {
    const stageStatuses = p.stage_statuses || []
    const stageStatus = stageStatuses.find(s => s.stage === stage)
    return stageStatus && stageStatus.status === "in_progress"
  })
}

export function createPart(part: Omit<Part, "id">): Part {
  if (!part.source_specification_id) {
    throw new Error("Деталь можно создать только из спецификации")
  }

  const parts = getParts()
  const newPart: Part = {
    ...part,
    id: `p_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  }
  parts.push(newPart)
  saveToStorage(STORAGE_KEYS.parts, parts)
  return newPart
}

export function updatePart(part: Part): void {
  const parts = getParts()
  const index = parts.findIndex(p => p.id === part.id)
  if (index !== -1) {
    parts[index] = part
    saveToStorage(STORAGE_KEYS.parts, parts)
  }
}

export function deletePart(partId: string): void {
  const parts = getParts().filter(p => p.id !== partId)
  saveToStorage(STORAGE_KEYS.parts, parts)

  const facts = getStageFacts().filter(f => f.part_id !== partId)
  saveToStorage(STORAGE_KEYS.stageFacts, facts)

  const tasks = getTasks().filter(t => t.part_id !== partId)
  saveToStorage(STORAGE_KEYS.tasks, tasks)

  const logistics = getLogistics().filter(l => l.part_id !== partId)
  saveToStorage(STORAGE_KEYS.logistics, logistics)

  const norms = getMachineNorms().filter(n => n.part_id !== partId)
  saveToStorage(STORAGE_KEYS.machineNorms, norms)
}

export function updatePartDrawing(partId: string, drawingUrl: string): void {
  const parts = getParts()
  const part = parts.find(p => p.id === partId)
  if (part) {
    part.drawing_url = drawingUrl
    saveToStorage(STORAGE_KEYS.parts, parts)
  }
}

export function updatePartStageStatus(partId: string, stage: ProductionStage, status: StageStatus["status"], operatorId?: string): void {
  const parts = getParts()
  const part = parts.find(p => p.id === partId)
  if (part && part.stage_statuses) {
    const stageStatus = part.stage_statuses.find(s => s.stage === stage)
    if (stageStatus) {
      stageStatus.status = status
      if (operatorId) stageStatus.operator_id = operatorId
      if (status === "in_progress") stageStatus.started_at = new Date().toISOString()
      if (status === "done") stageStatus.completed_at = new Date().toISOString()
    }
    saveToStorage(STORAGE_KEYS.parts, parts)
  }
}

// Stage Facts
export function getStageFacts(): StageFact[] {
  return safeJsonParse(STORAGE_KEYS.stageFacts, MOCK_STAGE_FACTS)
}

export function getStageFactsForDate(date: string): StageFact[] {
  return getStageFacts().filter(f => f.date === date)
}

export function getStageFactsForPart(partId: string): StageFact[] {
  return getStageFacts().filter(f => f.part_id === partId)
}

export function getStageFactsForPartAndStage(partId: string, stage: ProductionStage): StageFact[] {
  return getStageFacts().filter(f => f.part_id === partId && f.stage === stage)
}

export function getStageFactsForMachine(machineId: string): StageFact[] {
  return getStageFacts().filter(f => f.machine_id === machineId)
}

export function getStageFactForDateShiftAndStage(date: string, shiftType: ShiftType, partId: string, stage: ProductionStage): StageFact | undefined {
  return getStageFacts().find(f => 
    f.date === date && 
    f.shift_type === shiftType && 
    f.part_id === partId &&
    f.stage === stage
  )
}

export function createStageFact(fact: Omit<StageFact, "id" | "created_at">): StageFact {
  const facts = getStageFacts()
  const newFact: StageFact = {
    ...fact,
    id: `sf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    created_at: new Date().toISOString(),
  }
  facts.push(newFact)
  saveToStorage(STORAGE_KEYS.stageFacts, facts)
  
  // Update part qty_done and stage status
  const parts = getParts()
  const part = parts.find(p => p.id === fact.part_id)
  if (part) {
    part.qty_done += fact.qty_good
    
    // Update stage status
    if (part.stage_statuses) {
      const stageStatus = part.stage_statuses.find(s => s.stage === fact.stage)
      if (stageStatus && stageStatus.status === "pending") {
        stageStatus.status = "in_progress"
        stageStatus.started_at = new Date().toISOString()
        if (fact.operator_id) stageStatus.operator_id = fact.operator_id
      }
    }
    
    // Update part overall status
    if (part.qty_done >= part.qty_plan) {
      part.status = "done"
    } else if (part.status === "not_started") {
      part.status = "in_progress"
    }
    saveToStorage(STORAGE_KEYS.parts, parts)
  }
  
  // Audit log for fact creation
  const operator = getUserById(fact.operator_id)
  if (operator && part) {
    addAuditEntry(
      "fact_added",
      "fact",
      newFact.id,
      fact.operator_id,
      operator.initials,
      { 
        stage: fact.stage, 
        shift: fact.shift_type, 
        qtyGood: fact.qty_good, 
        qtyScrap: fact.qty_scrap,
        date: fact.date
      },
      { partId: fact.part_id, partCode: part.code }
    )
  }
  
  return newFact
}

export function updateStageFact(
  factId: string,
  data: Omit<StageFact, "id" | "created_at" | "part_id" | "stage" | "date" | "shift_type">
): StageFact {
  const facts = getStageFacts()
  const factIndex = facts.findIndex(f => f.id === factId)
  if (factIndex === -1) {
    throw new Error("Факт не найден")
  }

  const existing = facts[factIndex]
  const updated: StageFact = {
    ...existing,
    ...data,
  }
  facts[factIndex] = updated
  saveToStorage(STORAGE_KEYS.stageFacts, facts)

  const parts = getParts()
  const part = parts.find(p => p.id === existing.part_id)
  if (part) {
    const deltaGood = updated.qty_good - existing.qty_good
    part.qty_done = Math.max(0, part.qty_done + deltaGood)

    const factsForPart = facts.filter(f => f.part_id === part.id)
    if (part.qty_done >= part.qty_plan) {
      part.status = "done"
    } else if (factsForPart.length > 0) {
      part.status = "in_progress"
    } else {
      part.status = "not_started"
    }
    saveToStorage(STORAGE_KEYS.parts, parts)
  }

  return updated
}

// Logistics
export function getLogistics(): LogisticsEntry[] {
  return safeJsonParse(STORAGE_KEYS.logistics, MOCK_LOGISTICS)
}

export function getLogisticsForPart(partId: string): LogisticsEntry[] {
  return getLogistics().filter(l => l.part_id === partId)
}

export function createLogisticsEntry(entry: Omit<LogisticsEntry, "id">): LogisticsEntry {
  const logistics = getLogistics()
  const newEntry: LogisticsEntry = {
    ...entry,
    id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  }
  logistics.push(newEntry)
  saveToStorage(STORAGE_KEYS.logistics, logistics)
  return newEntry
}

export function updateLogisticsEntry(entry: LogisticsEntry): void {
  const logistics = getLogistics()
  const index = logistics.findIndex(l => l.id === entry.id)
  if (index !== -1) {
    logistics[index] = entry
    saveToStorage(STORAGE_KEYS.logistics, logistics)
  }
}

// Specifications and work orders
function recomputeSpecItemStatus(specItem: SpecItem, hasBlockedOrder: boolean): SpecItemStatus {
  if (specItem.qty_done <= 0) return "open"
  if (specItem.qty_done >= specItem.qty_required) return "fulfilled"
  if (hasBlockedOrder) return "blocked"
  return "partial"
}

function recomputeSpecificationStatus(specificationId: string): void {
  const specifications = getSpecifications()
  const specItems = getSpecItemsBySpecification(specificationId)
  const specification = specifications.find(s => s.id === specificationId)
  if (!specification) return

  const allDone = specItems.length > 0 && specItems.every(item => item.status === "fulfilled" || item.status === "canceled")
  const hasWork = specItems.some(item => item.qty_done > 0 || item.status === "partial" || item.status === "blocked")
  let status: SpecificationStatus = specification.status

  if (allDone) {
    status = "closed"
  } else if (specification.status !== "closed" && (specification.published_to_operators || hasWork)) {
    status = "active"
  }

  if (status !== specification.status) {
    const index = specifications.findIndex(s => s.id === specificationId)
    if (index !== -1) {
      specifications[index] = { ...specification, status }
      saveToStorage(STORAGE_KEYS.specifications, specifications)
    }
  }
}

function syncSpecItemProgressFromWorkOrders(specItemId: string): void {
  const specItems = getSpecItems()
  const workOrders = getWorkOrders().filter(wo => wo.spec_item_id === specItemId && wo.status !== "canceled")
  const index = specItems.findIndex(item => item.id === specItemId)
  if (index === -1) return

  const specItem = specItems[index]
  const qtyDone = workOrders.reduce((sum, wo) => sum + wo.qty_done, 0)
  const hasBlocked = workOrders.some(wo => wo.status === "blocked")
  const updated: SpecItem = {
    ...specItem,
    qty_done: qtyDone,
    status: recomputeSpecItemStatus({ ...specItem, qty_done: qtyDone }, hasBlocked),
  }
  specItems[index] = updated
  saveToStorage(STORAGE_KEYS.specItems, specItems)
  recomputeSpecificationStatus(updated.specification_id)
}

export function getSpecifications(): Specification[] {
  return safeJsonParse(STORAGE_KEYS.specifications, MOCK_SPECIFICATIONS)
}

export function getSpecificationsForUser(userId: string): Specification[] {
  const user = getUserById(userId)
  if (!user) return []

  const specifications = getSpecifications()
  if (user.role !== "operator") {
    return specifications
  }

  const grants = getAccessGrants().filter(
    grant => grant.user_id === userId && grant.entity_type === "specification"
  )
  const grantedSpecIds = new Set(grants.map(grant => grant.entity_id))
  const assignedWorkOrders = getWorkOrders().filter(wo => wo.assigned_operator_id === userId)

  for (const wo of assignedWorkOrders) {
    grantedSpecIds.add(wo.specification_id)
  }

  return specifications.filter(spec => grantedSpecIds.has(spec.id))
}

export function getSpecificationById(specificationId: string): Specification | undefined {
  return getSpecifications().find(spec => spec.id === specificationId)
}

export function createSpecification(
  payload: {
    specification: Omit<Specification, "id" | "created_at">
    items: Array<Omit<SpecItem, "id" | "specification_id" | "line_no" | "qty_done" | "status">>
  }
): Specification {
  const specifications = getSpecifications()
  const specItems = getSpecItems()
  const now = new Date().toISOString()
  const specification: Specification = {
    ...payload.specification,
    id: `spec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    created_at: now,
  }
  specifications.unshift(specification)
  saveToStorage(STORAGE_KEYS.specifications, specifications)

  const newItems: SpecItem[] = payload.items.map((item, index) => ({
    ...item,
    id: `spec_item_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 7)}`,
    specification_id: specification.id,
    line_no: index + 1,
    qty_done: 0,
    status: "open",
  }))

  saveToStorage(STORAGE_KEYS.specItems, [...newItems, ...specItems])

  const makerItems = newItems.filter(item => item.item_type === "make" && !!item.part_id)
  if (makerItems.length > 0) {
    const workOrders = getWorkOrders()
    const createdWorkOrders: WorkOrder[] = makerItems.map(item => ({
      id: `wo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      specification_id: specification.id,
      spec_item_id: item.id,
      part_id: item.part_id as string,
      status: "backlog",
      qty_plan: item.qty_required,
      qty_done: 0,
      qty_scrap: 0,
      priority: "normal",
      created_by: specification.created_by,
      created_at: now,
    }))
    saveToStorage(STORAGE_KEYS.workOrders, [...createdWorkOrders, ...workOrders])
  }

  return specification
}

export function updateSpecification(specification: Specification): void {
  const specifications = getSpecifications()
  const index = specifications.findIndex(spec => spec.id === specification.id)
  if (index !== -1) {
    specifications[index] = specification
    saveToStorage(STORAGE_KEYS.specifications, specifications)
    recomputeSpecificationStatus(specification.id)
  }
}

export function setSpecificationPublished(specificationId: string, published: boolean): void {
  const specification = getSpecificationById(specificationId)
  if (!specification) return
  updateSpecification({
    ...specification,
    published_to_operators: published,
    status: published && specification.status === "draft" ? "active" : specification.status,
  })
}

export function deleteSpecification(specificationId: string, deleteLinkedParts = false): void {
  const existing = getSpecificationById(specificationId)
  if (!existing) return

  const allSpecItems = getSpecItems()
  const allWorkOrders = getWorkOrders()
  const allGrants = getAccessGrants()

  const removedSpecItems = allSpecItems.filter(item => item.specification_id === specificationId)
  const removedWorkOrders = allWorkOrders.filter(order => order.specification_id === specificationId)
  const removedWorkOrderIds = new Set(removedWorkOrders.map(order => order.id))

  const nextSpecifications = getSpecifications().filter(spec => spec.id !== specificationId)
  const nextSpecItems = allSpecItems.filter(item => item.specification_id !== specificationId)
  const nextWorkOrders = allWorkOrders.filter(order => order.specification_id !== specificationId)
  const nextGrants = allGrants.filter(grant => {
    if (grant.entity_type === "specification" && grant.entity_id === specificationId) return false
    if (grant.entity_type === "work_order" && removedWorkOrderIds.has(grant.entity_id)) return false
    return true
  })

  saveToStorage(STORAGE_KEYS.specifications, nextSpecifications)
  saveToStorage(STORAGE_KEYS.specItems, nextSpecItems)
  saveToStorage(STORAGE_KEYS.workOrders, nextWorkOrders)
  saveToStorage(STORAGE_KEYS.accessGrants, nextGrants)

  if (!deleteLinkedParts) return

  const candidatePartIds = Array.from(
    new Set(removedSpecItems.map(item => item.part_id).filter((partId): partId is string => !!partId))
  )
  if (candidatePartIds.length === 0) return

  const protectedPartIds = new Set<string>([
    ...nextSpecItems.map(item => item.part_id).filter((partId): partId is string => !!partId),
    ...nextWorkOrders.map(order => order.part_id),
  ])

  for (const partId of candidatePartIds) {
    if (!protectedPartIds.has(partId)) {
      deletePart(partId)
    }
  }
}

export function getSpecItems(): SpecItem[] {
  return safeJsonParse(STORAGE_KEYS.specItems, MOCK_SPEC_ITEMS)
}

export function getSpecItemsBySpecification(specificationId: string): SpecItem[] {
  return getSpecItems()
    .filter(item => item.specification_id === specificationId)
    .sort((a, b) => a.line_no - b.line_no)
}

export function updateSpecItemProgress(
  specItemId: string,
  qtyDone: number,
  statusOverride?: SpecItemStatus
): void {
  const specItems = getSpecItems()
  const index = specItems.findIndex(item => item.id === specItemId)
  if (index === -1) return
  const existing = specItems[index]
  const boundedQty = Math.max(0, qtyDone)
  const updated: SpecItem = {
    ...existing,
    qty_done: boundedQty,
    status: statusOverride ?? (boundedQty >= existing.qty_required ? "fulfilled" : boundedQty > 0 ? "partial" : "open"),
  }
  specItems[index] = updated
  saveToStorage(STORAGE_KEYS.specItems, specItems)
  recomputeSpecificationStatus(existing.specification_id)
}

export function getWorkOrders(): WorkOrder[] {
  return safeJsonParse(STORAGE_KEYS.workOrders, MOCK_WORK_ORDERS)
}

export function getWorkOrdersForUser(userId: string): WorkOrder[] {
  const user = getUserById(userId)
  if (!user) return []
  if (user.role !== "operator") return getWorkOrders()

  const grants = getAccessGrants().filter(grant => grant.user_id === userId)
  const specIds = new Set(
    grants.filter(grant => grant.entity_type === "specification").map(grant => grant.entity_id)
  )
  const woIds = new Set(
    grants.filter(grant => grant.entity_type === "work_order").map(grant => grant.entity_id)
  )

  return getWorkOrders().filter(wo =>
    wo.assigned_operator_id === userId ||
    specIds.has(wo.specification_id) ||
    woIds.has(wo.id)
  )
}

export function getWorkOrdersForSpecification(specificationId: string): WorkOrder[] {
  return getWorkOrders()
    .filter(wo => wo.specification_id === specificationId)
    .sort((a, b) => (a.queue_pos ?? 9999) - (b.queue_pos ?? 9999))
}

export function createWorkOrder(order: Omit<WorkOrder, "id" | "created_at">): WorkOrder {
  const workOrders = getWorkOrders()
  const newOrder: WorkOrder = {
    ...order,
    id: `wo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    created_at: new Date().toISOString(),
  }
  workOrders.unshift(newOrder)
  saveToStorage(STORAGE_KEYS.workOrders, workOrders)
  syncSpecItemProgressFromWorkOrders(newOrder.spec_item_id)
  return newOrder
}

export function updateWorkOrder(order: WorkOrder): void {
  const workOrders = getWorkOrders()
  const index = workOrders.findIndex(wo => wo.id === order.id)
  if (index === -1) return
  workOrders[index] = order
  saveToStorage(STORAGE_KEYS.workOrders, workOrders)
  syncSpecItemProgressFromWorkOrders(order.spec_item_id)
}

export function queueWorkOrder(workOrderId: string, machineId: string, queuePos?: number): void {
  const workOrders = getWorkOrders()
  const index = workOrders.findIndex(wo => wo.id === workOrderId)
  if (index === -1) return

  const sameMachineCount = workOrders.filter(wo => wo.machine_id === machineId && wo.status === "queued").length
  const position = queuePos ?? (sameMachineCount + 1)
  const order = workOrders[index]
  workOrders[index] = {
    ...order,
    machine_id: machineId,
    queue_pos: position,
    status: "queued",
    block_reason: undefined,
  }

  saveToStorage(STORAGE_KEYS.workOrders, workOrders)
}

export function startWorkOrder(workOrderId: string, operatorId?: string): void {
  const workOrders = getWorkOrders()
  const index = workOrders.findIndex(wo => wo.id === workOrderId)
  if (index === -1) return
  const order = workOrders[index]
  workOrders[index] = {
    ...order,
    status: "in_progress",
    assigned_operator_id: operatorId ?? order.assigned_operator_id,
    started_at: order.started_at || new Date().toISOString(),
    block_reason: undefined,
  }
  saveToStorage(STORAGE_KEYS.workOrders, workOrders)
}

export function blockWorkOrder(workOrderId: string, reason: string): void {
  const workOrders = getWorkOrders()
  const index = workOrders.findIndex(wo => wo.id === workOrderId)
  if (index === -1) return
  const order = workOrders[index]
  workOrders[index] = {
    ...order,
    status: "blocked",
    block_reason: reason,
  }
  saveToStorage(STORAGE_KEYS.workOrders, workOrders)
  syncSpecItemProgressFromWorkOrders(order.spec_item_id)
}

export function reportWorkOrderProgress(workOrderId: string, qtyGood: number, qtyScrap = 0): void {
  const workOrders = getWorkOrders()
  const index = workOrders.findIndex(wo => wo.id === workOrderId)
  if (index === -1) return
  const order = workOrders[index]
  const done = Math.max(0, order.qty_done + qtyGood)
  const scrap = Math.max(0, order.qty_scrap + qtyScrap)
  const status: WorkOrderStatus = done >= order.qty_plan ? "done" : order.status === "blocked" ? "in_progress" : order.status
  workOrders[index] = {
    ...order,
    qty_done: done,
    qty_scrap: scrap,
    status,
    completed_at: done >= order.qty_plan ? new Date().toISOString() : undefined,
  }
  saveToStorage(STORAGE_KEYS.workOrders, workOrders)
  syncSpecItemProgressFromWorkOrders(order.spec_item_id)
}

export function completeWorkOrder(workOrderId: string): void {
  const workOrders = getWorkOrders()
  const index = workOrders.findIndex(wo => wo.id === workOrderId)
  if (index === -1) return
  const order = workOrders[index]
  workOrders[index] = {
    ...order,
    status: "done",
    qty_done: Math.max(order.qty_done, order.qty_plan),
    completed_at: new Date().toISOString(),
  }
  saveToStorage(STORAGE_KEYS.workOrders, workOrders)
  syncSpecItemProgressFromWorkOrders(order.spec_item_id)
}

export function getAccessGrants(): AccessGrant[] {
  return safeJsonParse(STORAGE_KEYS.accessGrants, MOCK_ACCESS_GRANTS)
}

export function getAccessGrantsForEntity(entityType: AccessEntityType, entityId: string): AccessGrant[] {
  return getAccessGrants().filter(grant => grant.entity_type === entityType && grant.entity_id === entityId)
}

export function grantAccess(
  entityType: AccessEntityType,
  entityId: string,
  userId: string,
  permission: AccessPermission,
  createdBy: string
): AccessGrant {
  const existing = getAccessGrants().find(
    grant => grant.entity_type === entityType && grant.entity_id === entityId && grant.user_id === userId
  )
  if (existing) {
    const grants = getAccessGrants()
    const index = grants.findIndex(grant => grant.id === existing.id)
    const updated = { ...existing, permission }
    if (index !== -1) {
      grants[index] = updated
      saveToStorage(STORAGE_KEYS.accessGrants, grants)
    }
    return updated
  }

  const grants = getAccessGrants()
  const grant: AccessGrant = {
    id: `grant_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    entity_type: entityType,
    entity_id: entityId,
    user_id: userId,
    permission,
    created_by: createdBy,
    created_at: new Date().toISOString(),
  }
  grants.unshift(grant)
  saveToStorage(STORAGE_KEYS.accessGrants, grants)
  return grant
}

export function revokeAccess(grantId: string): void {
  const grants = getAccessGrants()
  const filtered = grants.filter(grant => grant.id !== grantId)
  saveToStorage(STORAGE_KEYS.accessGrants, filtered)
}

// Inventory helpers
function normalizeQty(qty: Qty): Required<Qty> {
  return {
    pcs: qty.pcs ?? 0,
    kg: qty.kg ?? 0,
  }
}

function addQty(base: Qty, delta: Qty): Qty {
  const baseNorm = normalizeQty(base)
  const deltaNorm = normalizeQty(delta)
  return {
    pcs: baseNorm.pcs + deltaNorm.pcs,
    kg: baseNorm.kg + deltaNorm.kg,
  }
}

function subtractQty(base: Qty, delta: Qty): Qty {
  const baseNorm = normalizeQty(base)
  const deltaNorm = normalizeQty(delta)
  return {
    pcs: baseNorm.pcs - deltaNorm.pcs,
    kg: baseNorm.kg - deltaNorm.kg,
  }
}

function isPartialQty(available: Qty, requested: Qty): boolean {
  const a = normalizeQty(available)
  const r = normalizeQty(requested)
  return (r.pcs > 0 && r.pcs < a.pcs) || (r.kg > 0 && r.kg < a.kg)
}

// Inventory - Metal
export function getInventoryMetal(): InventoryMetalItem[] {
  return safeJsonParse(STORAGE_KEYS.inventoryMetal, MOCK_INVENTORY_METAL)
}

export function createInventoryMetal(item: Omit<InventoryMetalItem, "id">): InventoryMetalItem {
  const items = getInventoryMetal()
  const newItem: InventoryMetalItem = {
    ...item,
    id: `metal_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
  }
  items.unshift(newItem)
  saveToStorage(STORAGE_KEYS.inventoryMetal, items)
  return newItem
}

export function updateInventoryMetal(item: InventoryMetalItem): void {
  const items = getInventoryMetal()
  const index = items.findIndex(i => i.id === item.id)
  if (index !== -1) {
    items[index] = item
    saveToStorage(STORAGE_KEYS.inventoryMetal, items)
  }
}

// Inventory - Tooling
export function getInventoryTooling(): InventoryToolingItem[] {
  return safeJsonParse(STORAGE_KEYS.inventoryTooling, MOCK_INVENTORY_TOOLING)
}

export function createInventoryTooling(item: Omit<InventoryToolingItem, "id">): InventoryToolingItem {
  const items = getInventoryTooling()
  const newItem: InventoryToolingItem = {
    ...item,
    id: `tool_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
  }
  items.unshift(newItem)
  saveToStorage(STORAGE_KEYS.inventoryTooling, items)
  return newItem
}

export function updateInventoryTooling(item: InventoryToolingItem): void {
  const items = getInventoryTooling()
  const index = items.findIndex(i => i.id === item.id)
  if (index !== -1) {
    items[index] = item
    saveToStorage(STORAGE_KEYS.inventoryTooling, items)
  }
}

// Inventory - Movements
export function getInventoryMovements(): InventoryMovement[] {
  return safeJsonParse(STORAGE_KEYS.inventoryMovements, MOCK_INVENTORY_MOVEMENTS)
}

export function createInventoryMovement(movement: Omit<InventoryMovement, "id">): InventoryMovement {
  const movements = getInventoryMovements()
  const newMovement: InventoryMovement = {
    ...movement,
    id: `im_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
  }

  movements.push(newMovement)
  saveToStorage(STORAGE_KEYS.inventoryMovements, movements)

  if (movement.item_ref.type === "metal") {
    const items = getInventoryMetal()
    const index = items.findIndex(i => i.id === movement.item_ref.id)
    if (index !== -1) {
      const item = items[index]
      const qty = movement.qty

      if (movement.type === "transfer") {
        const transferQty = normalizeQty(qty)
        if (isPartialQty(item.qty, transferQty)) {
          const updated = { ...item, qty: subtractQty(item.qty, transferQty) }
          const newItem: InventoryMetalItem = {
            ...item,
            id: `metal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            qty: transferQty,
            location: movement.to_location || item.location,
            status: item.status,
          }
          items[index] = updated
          items.unshift(newItem)
        } else {
          items[index] = {
            ...item,
            location: movement.to_location || item.location,
          }
        }
      } else if (movement.type === "issue") {
        items[index] = { ...item, qty: subtractQty(item.qty, qty) }
      } else if (movement.type === "receipt") {
        items[index] = { ...item, qty: addQty(item.qty, qty) }
      } else {
        items[index] = { ...item, qty: addQty(item.qty, qty) }
      }

      saveToStorage(STORAGE_KEYS.inventoryMetal, items)
    }
  } else if (movement.item_ref.type === "tooling") {
    const items = getInventoryTooling()
    const index = items.findIndex(i => i.id === movement.item_ref.id)
    if (index !== -1) {
      const item = items[index]
      const qty = normalizeQty(movement.qty).pcs
      const delta = qty ?? 0
      if (movement.type === "transfer") {
        if (delta > 0 && delta < item.qty) {
          const updated = { ...item, qty: item.qty - delta }
          const newItem: InventoryToolingItem = {
            ...item,
            id: `tool_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            qty: delta,
            location: movement.to_location || item.location,
          }
          items[index] = updated
          items.unshift(newItem)
        } else {
          items[index] = { ...item, location: movement.to_location || item.location }
        }
      } else if (movement.type === "issue") {
        items[index] = { ...item, qty: item.qty - delta }
      } else if (movement.type === "receipt") {
        items[index] = { ...item, qty: item.qty + delta }
      } else {
        items[index] = { ...item, qty: item.qty + delta }
      }
      saveToStorage(STORAGE_KEYS.inventoryTooling, items)
    }
  }

  return newMovement
}

// Tasks
export function getTasks(): Task[] {
  return safeJsonParse(STORAGE_KEYS.tasks, MOCK_TASKS)
}

export function getTasksForPart(partId: string): Task[] {
  return getTasks().filter(t => t.part_id === partId)
}

export function getTasksForMachine(machineId: string): Task[] {
  return getTasks().filter(t => t.machine_id === machineId)
}

export function getTasksForStage(stage: ProductionStage): Task[] {
  return getTasks().filter(t => t.stage === stage)
}

export function getBlockersForMachine(machineId: string): Task[] {
  return getTasks().filter(t => t.machine_id === machineId && t.is_blocker && t.status !== "done")
}

export function getBlockersForPart(partId: string): Task[] {
  return getTasks().filter(t => t.part_id === partId && t.is_blocker && t.status !== "done")
}

export function createTask(task: Omit<Task, "id" | "created_at" | "read_by">): Task {
  const tasks = getTasks()
  const newTask: Task = {
    ...task,
    id: `t_${Date.now()}`,
    created_at: new Date().toISOString(),
    read_by: [task.creator_id], // Создатель автоматически прочитал
  }
  tasks.push(newTask)
  saveToStorage(STORAGE_KEYS.tasks, tasks)
  return newTask
}

// Отметить задачу как прочитанную
export function markTaskAsRead(taskId: string, userId: string): void {
  const tasks = getTasks()
  const task = tasks.find(t => t.id === taskId)
  if (task && !task.read_by.includes(userId)) {
    task.read_by.push(userId)
    saveToStorage(STORAGE_KEYS.tasks, tasks)
  }
}

// Принять задачу (для снабжения и подобных ролей)
export function acceptTask(taskId: string, userId: string): void {
  const tasks = getTasks()
  const task = tasks.find(t => t.id === taskId)
  const user = getUserById(userId)
  if (task && !task.accepted_by_id && user) {
    const oldStatus = task.status
    task.accepted_by_id = userId
    task.accepted_at = new Date().toISOString()
    task.status = "accepted"
    if (!task.read_by.includes(userId)) {
      task.read_by.push(userId)
    }
    saveToStorage(STORAGE_KEYS.tasks, tasks)
    
    // Audit log
    addAuditEntry(
      "task_accepted",
      "task",
      taskId,
      userId,
      user.initials,
      { oldStatus, newStatus: "accepted" },
      { entityName: task.title, partId: task.part_id }
    )
    
    // Notification to creator
    notifyTaskAccepted(taskId, task.title, userId, user.initials, task.creator_id)
  }
}

// Начать работу над задачей (accepted -> in_progress)
export function startTask(taskId: string, userId: string): void {
  const tasks = getTasks()
  const task = tasks.find(t => t.id === taskId)
  const user = getUserById(userId)
  if (task && task.status === "accepted" && user) {
    const oldStatus = task.status
    task.status = "in_progress"
    saveToStorage(STORAGE_KEYS.tasks, tasks)
    
    // Audit log
    addAuditEntry(
      "task_status_changed",
      "task",
      taskId,
      userId,
      user.initials,
      { oldStatus, newStatus: "in_progress" },
      { entityName: task.title, partId: task.part_id }
    )
  }
}

// Проверить, назначена ли задача пользователю (учитывая группы)
export function isTaskAssignedToUser(task: Task, user: User): boolean {
  if (task.assignee_type === "all") return true
  if (task.assignee_type === "role" && task.assignee_role === user.role) return true
  if (task.assignee_type === "user" && task.assignee_id === user.id) return true
  return false
}

// Получить задачи для пользователя (включая групповые)
export function getTasksForUser(userId: string): Task[] {
  const user = getUserById(userId)
  if (!user) return []
  return getTasks().filter(t => isTaskAssignedToUser(t, user))
}

// Получить непрочитанные задачи для пользователя (включая групповые)
export function getUnreadTasksForUser(userId: string): Task[] {
  const user = getUserById(userId)
  if (!user) return []
  return getTasks().filter(t => 
    isTaskAssignedToUser(t, user) && 
    !t.read_by.includes(userId) &&
    t.status !== "done"
  )
}

// Получить задачи созданные пользователем
export function getTasksCreatedByUser(userId: string): Task[] {
  return getTasks().filter(t => t.creator_id === userId)
}

// Получить пользователей по роли
export function getUsersByRole(role: string): User[] {
  return getUsers().filter(u => u.role === role)
}

export function updateTask(task: Task): void {
  const tasks = getTasks()
  const index = tasks.findIndex(t => t.id === task.id)
  if (index !== -1) {
    tasks[index] = task
    saveToStorage(STORAGE_KEYS.tasks, tasks)
  }
}

// Add comment to task
export function addTaskComment(taskId: string, userId: string, message: string, attachments: TaskComment["attachments"] = []): TaskComment | null {
  const tasks = getTasks()
  const task = tasks.find(t => t.id === taskId)
  const user = getUserById(userId)
  if (!task || !user) return null
  
  const comment: TaskComment = {
    id: `c_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    task_id: taskId,
    user_id: userId,
    message,
    attachments,
    created_at: new Date().toISOString(),
  }
  
  if (!task.comments) task.comments = []
  task.comments.push(comment)
  saveToStorage(STORAGE_KEYS.tasks, tasks)
  
  // Audit log
  addAuditEntry(
    attachments.length > 0 ? "task_attachment_added" : "task_comment_added",
    "task",
    taskId,
    userId,
    user.initials,
    { message: message.slice(0, 100), attachmentCount: attachments.length },
    { entityName: task.title, partId: task.part_id }
  )
  
  // Notify relevant parties (creator and executor)
  const targetIds = [task.creator_id]
  if (task.accepted_by_id && task.accepted_by_id !== userId) {
    targetIds.push(task.accepted_by_id)
  }
  notifyTaskComment(taskId, task.title, userId, user.initials, targetIds, message)
  
  return comment
}

// Send task for review
export function sendTaskForReview(taskId: string, userId: string, comment?: string): void {
  const tasks = getTasks()
  const task = tasks.find(t => t.id === taskId)
  const user = getUserById(userId)
  if (task && user) {
    const oldStatus = task.status
    task.status = "review"
    if (comment) {
      task.review_comment = comment
      // Also add as a comment
      addTaskComment(taskId, userId, `На проверку: ${comment}`)
    }
    saveToStorage(STORAGE_KEYS.tasks, tasks)
    
    // Audit log
    addAuditEntry(
      "task_sent_for_review",
      "task",
      taskId,
      userId,
      user.initials,
      { oldStatus, newStatus: "review", comment },
      { entityName: task.title, partId: task.part_id }
    )
    
    // Notify creator (reviewer)
    notifyTaskForReview(taskId, task.title, userId, user.initials, task.creator_id, comment)
  }
}

// Review task - approve or return
export function reviewTask(taskId: string, reviewerId: string, approved: boolean, comment?: string): void {
  const tasks = getTasks()
  const task = tasks.find(t => t.id === taskId)
  const reviewer = getUserById(reviewerId)
  if (task && reviewer) {
    const oldStatus = task.status
    task.reviewed_by_id = reviewerId
    task.reviewed_at = new Date().toISOString()
    
    const executorId = task.accepted_by_id || task.assignee_id
    
    if (approved) {
      task.status = "done"
      if (comment) {
        addTaskComment(taskId, reviewerId, `Принято: ${comment}`)
      }
      
      // Audit and notify
      addAuditEntry(
        "task_approved",
        "task",
        taskId,
        reviewerId,
        reviewer.initials,
        { oldStatus, newStatus: "done", comment },
        { entityName: task.title, partId: task.part_id }
      )
      if (executorId) {
        notifyTaskApproved(taskId, task.title, reviewerId, reviewer.initials, executorId, comment)
      }
    } else {
      task.status = "in_progress"
      if (comment) {
        task.review_comment = comment
        addTaskComment(taskId, reviewerId, `Возвращено: ${comment}`)
      }
      
      // Audit and notify
      addAuditEntry(
        "task_returned",
        "task",
        taskId,
        reviewerId,
        reviewer.initials,
        { oldStatus, newStatus: "in_progress", comment },
        { entityName: task.title, partId: task.part_id }
      )
      if (executorId) {
        notifyTaskReturned(taskId, task.title, reviewerId, reviewer.initials, executorId, comment)
      }
    }
    saveToStorage(STORAGE_KEYS.tasks, tasks)
  }
}

// Machine Norms
export function getMachineNorms(): MachineNorm[] {
  return safeJsonParse(STORAGE_KEYS.machineNorms, MOCK_MACHINE_NORMS)
}

export function getMachineNorm(machineId: string, partId: string, stage: ProductionStage): MachineNorm | undefined {
  return getMachineNorms().find(n => n.machine_id === machineId && n.part_id === partId && n.stage === stage)
}

export function getMachineNormsForPart(partId: string): MachineNorm[] {
  return getMachineNorms().filter(n => n.part_id === partId)
}

export function setMachineNorm(norm: Omit<MachineNorm, "configured_at"> & { configured_at?: string }): MachineNorm {
  const norms = getMachineNorms()
  const existingIndex = norms.findIndex(n => 
    n.machine_id === norm.machine_id && 
    n.part_id === norm.part_id && 
    n.stage === norm.stage
  )
  
  const newNorm: MachineNorm = {
    ...norm,
    configured_at: norm.configured_at || new Date().toISOString(),
  }
  
  if (existingIndex !== -1) {
    norms[existingIndex] = newNorm
  } else {
    norms.push(newNorm)
  }
  
  saveToStorage(STORAGE_KEYS.machineNorms, norms)
  return newNorm
}

// Computed helpers

// Calculate progress for a part
export function getPartProgress(partId: string): {
  qtyDone: number
  qtyPlan: number
  percent: number
  qtyScrap: number
  stageProgress: Array<{ stage: ProductionStage; percent: number; qtyDone: number }>
} {
  const part = getPartById(partId)
  if (!part) return { qtyDone: 0, qtyPlan: 0, percent: 0, qtyScrap: 0, stageProgress: [] }
  
  const facts = getStageFactsForPart(partId)
  const qtyScrap = facts.reduce((sum, f) => sum + f.qty_scrap, 0)
  
  // Calculate progress for each active stage
  const stageStatuses = part.stage_statuses || []
  const activeStages = stageStatuses.filter(s => s.status !== "skipped")
  
  const stageProgress = activeStages.map(stageStatus => {
    const stageFacts = facts.filter(f => f.stage === stageStatus.stage)
    const totalGood = stageFacts.reduce((sum, f) => sum + f.qty_good, 0)
    const percent = part.qty_plan > 0 
      ? Math.min(100, Math.round((totalGood / part.qty_plan) * 100))
      : 0
    return {
      stage: stageStatus.stage,
      percent: stageStatus.status === "done" ? 100 : percent,
      qtyDone: totalGood,
    }
  })
  
  // Overall progress = average of all stages (same formula as part-details.tsx)
  const overallPercent = stageProgress.length > 0
    ? Math.round(stageProgress.reduce((sum, sp) => sum + sp.percent, 0) / stageProgress.length)
    : 0
  
  // qtyDone based on overall progress (for display consistency)
  const qtyDone = Math.round((overallPercent / 100) * part.qty_plan)
  
  return {
    qtyDone,
    qtyPlan: part.qty_plan,
    percent: overallPercent,
    qtyScrap,
    stageProgress,
  }
}

// Calculate if we're on track to meet deadline
export function getPartForecast(partId: string, demoDate: string): {
  daysRemaining: number
  shiftsRemaining: number
  qtyRemaining: number
  avgPerShift: number
  willFinishOnTime: boolean
  estimatedFinishDate: string
  shiftsNeeded: number
  stageForecasts: Array<{
    stage: ProductionStage
    qtyRemaining: number
    shiftsNeeded: number
    willFinishOnTime: boolean
  }>
} {
  const part = getPartById(partId)
  const machine = part?.machine_id ? getMachineById(part.machine_id) : undefined
  
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
  
  const facts = getStageFactsForPart(partId)
  const stageStatuses = part.stage_statuses || []
  const activeStages = stageStatuses.filter(s => s.status !== "skipped")
  
  // Days until deadline
  const deadline = new Date(part.deadline)
  const today = new Date(demoDate)
  const daysRemaining = Math.max(0, Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)))
  const shiftsRemaining = daysRemaining * 2 // 2 shifts per day
  
  // Calculate forecast for each active stage
  const stageForecasts = activeStages.map(stageStatus => {
    const stageFacts = facts.filter(f => f.stage === stageStatus.stage)
    const totalDone = stageFacts.reduce((sum, f) => sum + f.qty_good, 0)
    const qtyRemaining = Math.max(0, part.qty_plan - totalDone)
    
    // Default rates per shift for different stages (can be customized)
    const defaultRates: Record<ProductionStage, number> = {
      machining: machine?.rate_per_shift || 400,
      fitting: 500,    // Slesar faster
      galvanic: 800,   // Batch processing
      heat_treatment: 600,
      grinding: 400,
      qc: 1000,        // QC fastest
      logistics: 2000, // Just packaging
    }
    
    // Use actual average if we have facts, otherwise use default
    const avgPerShift = stageFacts.length > 0
      ? stageFacts.reduce((sum, f) => sum + f.qty_good, 0) / stageFacts.length
      : defaultRates[stageStatus.stage]
    
    const shiftsNeeded = avgPerShift > 0 ? Math.ceil(qtyRemaining / avgPerShift) : 999
    
    return {
      stage: stageStatus.stage,
      qtyRemaining,
      shiftsNeeded,
      willFinishOnTime: shiftsNeeded <= shiftsRemaining,
    }
  })
  
  // Calculate total shifts needed across all stages (they run sequentially)
  const totalShiftsNeeded = stageForecasts.reduce((sum, sf) => sum + sf.shiftsNeeded, 0)
  
  // Overall average per shift (use machining as primary indicator)
  const machiningFacts = facts.filter(f => f.stage === "machining")
  const avgPerShift = machiningFacts.length > 0
    ? machiningFacts.reduce((sum, f) => sum + f.qty_good, 0) / machiningFacts.length
    : (machine?.rate_per_shift || 100)
  
  // Total remaining across current stage (for display)
  const currentStage = activeStages.find(s => s.status === "in_progress") || activeStages[0]
  const currentStageForecast = stageForecasts.find(sf => sf.stage === currentStage?.stage)
  const qtyRemaining = currentStageForecast?.qtyRemaining || 0
  
  // Estimated finish date considering all stages
  const daysNeeded = Math.ceil(totalShiftsNeeded / 2)
  const estimatedFinish = new Date(today)
  estimatedFinish.setDate(estimatedFinish.getDate() + daysNeeded)
  
  // Will finish on time only if ALL stages can complete in time
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
}

// Get today's progress for a machine
export function getMachineTodayProgress(machineId: string, demoDate: string): {
  dayShift: StageFact | null
  nightShift: StageFact | null
  totalGood: number
  totalScrap: number
  targetPerShift: number
} {
  const machine = getMachineById(machineId)
  const todayFacts = getStageFactsForDate(demoDate).filter(f => f.machine_id === machineId)
  
  const dayShift = todayFacts.find(f => f.shift_type === "day") || null
  const nightShift = todayFacts.find(f => f.shift_type === "night") || null
  
  return {
    dayShift,
    nightShift,
    totalGood: (dayShift?.qty_good || 0) + (nightShift?.qty_good || 0),
    totalScrap: (dayShift?.qty_scrap || 0) + (nightShift?.qty_scrap || 0),
    targetPerShift: machine?.rate_per_shift || 400,
  }
}

// Get all overdue tasks
export function getOverdueTasks(demoDate: string): Task[] {
  return getTasks().filter(t => t.status !== "done" && t.due_date < demoDate)
}

// Get all blockers
export function getAllBlockers(): Task[] {
  return getTasks().filter(t => t.is_blocker && t.status !== "done")
}

// Check if shift fact is missing for today
export function isMissingShiftFact(machineId: string, shiftType: ShiftType, demoDate: string): boolean {
  const facts = getStageFactsForDate(demoDate).filter(f => f.machine_id === machineId && f.shift_type === shiftType)
  return facts.length === 0
}

// Get current stage for a part
export function getCurrentStage(partId: string): ProductionStage | null {
  const part = getPartById(partId)
  if (!part || !part.stage_statuses) return null
  
  const inProgress = part.stage_statuses.find(s => s.status === "in_progress")
  if (inProgress) return inProgress.stage
  
  const pending = part.stage_statuses.find(s => s.status === "pending")
  if (pending) return pending.stage
  
  return null
}

// Get stage completion percentage
export function getStageCompletion(partId: string): { completed: number; total: number; percent: number } {
  const part = getPartById(partId)
  if (!part || !part.stage_statuses) return { completed: 0, total: 0, percent: 0 }
  
  const completed = part.stage_statuses.filter(s => s.status === "done").length
  const total = part.stage_statuses.filter(s => s.status !== "skipped").length
  
  return {
    completed,
    total,
    percent: total > 0 ? Math.round((completed / total) * 100) : 0,
  }
}
