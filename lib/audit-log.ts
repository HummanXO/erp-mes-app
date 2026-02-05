// Audit log system for tracking all changes
// Records all actions on tasks, facts, parts, etc.

export type AuditAction = 
  | "task_created"
  | "task_status_changed"
  | "task_accepted"
  | "task_comment_added"
  | "task_sent_for_review"
  | "task_approved"
  | "task_returned"
  | "task_attachment_added"
  | "fact_added"
  | "fact_updated"
  | "part_created"
  | "part_updated"
  | "part_stage_changed"
  | "norm_configured"

export type AuditEntityType = "task" | "part" | "fact" | "norm" | "logistics"

export interface AuditEntry {
  id: string
  action: AuditAction
  entity_type: AuditEntityType
  entity_id: string
  entity_name?: string // e.g. task title or part code
  user_id: string
  user_name: string
  timestamp: string
  details: Record<string, unknown>
  part_id?: string // Related part if applicable
  part_code?: string
}

const STORAGE_KEY = "pc.auditLog"

// Helper to safely parse JSON from localStorage
function getAuditLog(): AuditEntry[] {
  if (typeof window === "undefined") return []
  try {
    const item = localStorage.getItem(STORAGE_KEY)
    return item ? JSON.parse(item) : []
  } catch {
    return []
  }
}

function saveAuditLog(entries: AuditEntry[]): void {
  if (typeof window === "undefined") return
  // Keep only last 1000 entries to prevent storage bloat
  const trimmed = entries.slice(-1000)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
}

// Add new audit entry
export function addAuditEntry(
  action: AuditAction,
  entityType: AuditEntityType,
  entityId: string,
  userId: string,
  userName: string,
  details: Record<string, unknown>,
  options?: {
    entityName?: string
    partId?: string
    partCode?: string
  }
): AuditEntry {
  const entry: AuditEntry = {
    id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    action,
    entity_type: entityType,
    entity_id: entityId,
    entity_name: options?.entityName,
    user_id: userId,
    user_name: userName,
    timestamp: new Date().toISOString(),
    details,
    part_id: options?.partId,
    part_code: options?.partCode
  }
  
  const log = getAuditLog()
  log.push(entry)
  saveAuditLog(log)
  
  return entry
}

// Get all audit entries
export function getAllAuditEntries(): AuditEntry[] {
  return getAuditLog().sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}

// Get audit entries for a specific entity
export function getAuditEntriesForEntity(entityType: AuditEntityType, entityId: string): AuditEntry[] {
  return getAuditLog()
    .filter(e => e.entity_type === entityType && e.entity_id === entityId)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}

// Get audit entries for a part (including related tasks, facts, etc.)
export function getAuditEntriesForPart(partId: string): AuditEntry[] {
  return getAuditLog()
    .filter(e => e.part_id === partId || (e.entity_type === "part" && e.entity_id === partId))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}

// Get audit entries by user
export function getAuditEntriesByUser(userId: string): AuditEntry[] {
  return getAuditLog()
    .filter(e => e.user_id === userId)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}

// Get recent audit entries
export function getRecentAuditEntries(limit = 50): AuditEntry[] {
  return getAuditLog()
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, limit)
}

// Filter by action type
export function getAuditEntriesByAction(actions: AuditAction[]): AuditEntry[] {
  return getAuditLog()
    .filter(e => actions.includes(e.action))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}

// Filter by date range
export function getAuditEntriesByDateRange(startDate: string, endDate: string): AuditEntry[] {
  return getAuditLog()
    .filter(e => e.timestamp >= startDate && e.timestamp <= endDate)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}

// Clear old entries (keep only last N days)
export function clearOldAuditEntries(daysToKeep = 30): number {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep)
  const cutoffStr = cutoffDate.toISOString()
  
  const log = getAuditLog()
  const filtered = log.filter(e => e.timestamp >= cutoffStr)
  const removed = log.length - filtered.length
  
  saveAuditLog(filtered)
  return removed
}

// Human-readable action labels
export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  task_created: "Задача создана",
  task_status_changed: "Статус задачи изменён",
  task_accepted: "Задача принята",
  task_comment_added: "Добавлен комментарий",
  task_sent_for_review: "Отправлено на проверку",
  task_approved: "Задача принята (проверка)",
  task_returned: "Задача возвращена",
  task_attachment_added: "Добавлено вложение",
  fact_added: "Внесён факт",
  fact_updated: "Факт обновлён",
  part_created: "Деталь создана",
  part_updated: "Деталь обновлена",
  part_stage_changed: "Этап изменён",
  norm_configured: "Норма настроена"
}
