// Notification adapter - abstraction layer for sending notifications
// Currently uses mock/console logging, but designed to be easily replaced with
// Telegram bot, email, or other notification services

export type NotificationType = 
  | "task_created"
  | "task_accepted"
  | "task_comment"
  | "task_for_review"
  | "task_approved"
  | "task_returned"
  | "task_assigned"
  | "fact_added"

export interface NotificationPayload {
  type: NotificationType
  taskId?: string
  taskTitle?: string
  partCode?: string
  userId: string // who triggered the notification
  userName: string
  targetUserIds: string[] // who should receive
  message: string
  timestamp: string
  metadata?: Record<string, unknown>
}

// Notification history (stored in memory for now, can be persisted)
const notificationHistory: NotificationPayload[] = []

// Notification outbox - for external delivery tracking
export interface NotificationOutboxEntry {
  id: string
  payload: NotificationPayload
  status: "pending" | "sent" | "failed"
  retries: number
  created_at: string
  sent_at?: string
}

const OUTBOX_STORAGE_KEY = "pc.notificationOutbox"

function getOutbox(): NotificationOutboxEntry[] {
  if (typeof window === "undefined") return []
  try {
    const item = localStorage.getItem(OUTBOX_STORAGE_KEY)
    return item ? JSON.parse(item) : []
  } catch {
    return []
  }
}

function saveOutbox(entries: NotificationOutboxEntry[]): void {
  if (typeof window === "undefined") return
  // Keep only last 200 entries
  const trimmed = entries.slice(-200)
  localStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(trimmed))
}

export function addToOutbox(payload: NotificationPayload): NotificationOutboxEntry {
  const entry: NotificationOutboxEntry = {
    id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    payload,
    status: "pending",
    retries: 0,
    created_at: new Date().toISOString(),
  }
  const outbox = getOutbox()
  outbox.push(entry)
  saveOutbox(outbox)
  return entry
}

export function getNotificationOutbox(limit = 50): NotificationOutboxEntry[] {
  return getOutbox().slice(-limit).reverse()
}

export function getNotificationOutboxForUser(userId: string, limit = 50): NotificationOutboxEntry[] {
  return getOutbox()
    .filter(e => e.payload.targetUserIds.includes(userId))
    .slice(-limit)
    .reverse()
}

export function markNotificationSent(id: string): void {
  const outbox = getOutbox()
  const entry = outbox.find(e => e.id === id)
  if (entry) {
    entry.status = "sent"
    entry.sent_at = new Date().toISOString()
    saveOutbox(outbox)
  }
}

// Adapter interface - implement this for different channels
export interface NotificationAdapter {
  send(payload: NotificationPayload): Promise<void>
  getName(): string
}

// Console/Mock adapter for development
class ConsoleNotificationAdapter implements NotificationAdapter {
  getName() {
    return "Console"
  }
  
  async send(payload: NotificationPayload) {
    console.log(`[Notification][${payload.type}] ${payload.message}`)
    console.log(`  From: ${payload.userName}`)
    console.log(`  To: ${payload.targetUserIds.join(", ")}`)
    if (payload.taskId) console.log(`  Task: ${payload.taskId}`)
    if (payload.partCode) console.log(`  Part: ${payload.partCode}`)
  }
}

// Telegram adapter placeholder
class TelegramNotificationAdapter implements NotificationAdapter {
  private botToken: string
  
  constructor(botToken: string) {
    this.botToken = botToken
  }
  
  getName() {
    return "Telegram"
  }
  
  async send(payload: NotificationPayload) {
    // TODO: Implement actual Telegram API call
    // Example:
    // const chatId = await this.getChatIdForUser(userId)
    // await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ chat_id: chatId, text: payload.message })
    // })
    console.log(`[Telegram Mock] Would send: ${payload.message}`)
  }
}

// Email adapter placeholder
class EmailNotificationAdapter implements NotificationAdapter {
  private smtpConfig: { host: string; port: number }
  
  constructor(config: { host: string; port: number }) {
    this.smtpConfig = config
  }
  
  getName() {
    return "Email"
  }
  
  async send(payload: NotificationPayload) {
    // TODO: Implement actual email sending
    // Example with nodemailer or similar
    console.log(`[Email Mock] Would send to ${payload.targetUserIds.join(", ")}: ${payload.message}`)
  }
}

// Main notification service
class NotificationService {
  private adapters: NotificationAdapter[] = []
  
  constructor() {
    // Default to console adapter
    this.adapters.push(new ConsoleNotificationAdapter())
  }
  
  addAdapter(adapter: NotificationAdapter) {
    this.adapters.push(adapter)
  }
  
  removeAdapter(name: string) {
    this.adapters = this.adapters.filter(a => a.getName() !== name)
  }
  
async notify(payload: NotificationPayload) {
  // Store in history
  notificationHistory.push(payload)
  
  // Add to outbox for tracking
  const outboxEntry = addToOutbox(payload)
  
  // Send to all adapters
  for (const adapter of this.adapters) {
  try {
  await adapter.send(payload)
  // Mark as sent after successful delivery
  markNotificationSent(outboxEntry.id)
  } catch (error) {
  console.error(`[NotificationService] Error in ${adapter.getName()}:`, error)
  }
    }
  }
  
  getHistory(limit = 50): NotificationPayload[] {
    return notificationHistory.slice(-limit)
  }
  
  getHistoryForUser(userId: string, limit = 50): NotificationPayload[] {
    return notificationHistory
      .filter(n => n.targetUserIds.includes(userId))
      .slice(-limit)
  }
}

// Singleton instance
export const notificationService = new NotificationService()

// Helper functions for common notifications
export function notifyTaskCreated(
  taskId: string,
  taskTitle: string,
  creatorId: string,
  creatorName: string,
  targetUserIds: string[],
  partCode?: string
) {
  notificationService.notify({
    type: "task_created",
    taskId,
    taskTitle,
    partCode,
    userId: creatorId,
    userName: creatorName,
    targetUserIds,
    message: `Новая задача: "${taskTitle}"${partCode ? ` (${partCode})` : ""}`,
    timestamp: new Date().toISOString()
  })
}

export function notifyTaskAccepted(
  taskId: string,
  taskTitle: string,
  acceptorId: string,
  acceptorName: string,
  creatorId: string
) {
  notificationService.notify({
    type: "task_accepted",
    taskId,
    taskTitle,
    userId: acceptorId,
    userName: acceptorName,
    targetUserIds: [creatorId],
    message: `${acceptorName} принял задачу: "${taskTitle}"`,
    timestamp: new Date().toISOString()
  })
}

export function notifyTaskComment(
  taskId: string,
  taskTitle: string,
  commenterId: string,
  commenterName: string,
  targetUserIds: string[],
  commentPreview: string
) {
  notificationService.notify({
    type: "task_comment",
    taskId,
    taskTitle,
    userId: commenterId,
    userName: commenterName,
    targetUserIds: targetUserIds.filter(id => id !== commenterId),
    message: `${commenterName} написал в "${taskTitle}": ${commentPreview.slice(0, 50)}${commentPreview.length > 50 ? "..." : ""}`,
    timestamp: new Date().toISOString()
  })
}

export function notifyTaskForReview(
  taskId: string,
  taskTitle: string,
  senderId: string,
  senderName: string,
  reviewerId: string,
  comment?: string
) {
  notificationService.notify({
    type: "task_for_review",
    taskId,
    taskTitle,
    userId: senderId,
    userName: senderName,
    targetUserIds: [reviewerId],
    message: `${senderName} отправил на проверку: "${taskTitle}"${comment ? ` - ${comment}` : ""}`,
    timestamp: new Date().toISOString()
  })
}

export function notifyTaskApproved(
  taskId: string,
  taskTitle: string,
  reviewerId: string,
  reviewerName: string,
  executorId: string,
  comment?: string
) {
  notificationService.notify({
    type: "task_approved",
    taskId,
    taskTitle,
    userId: reviewerId,
    userName: reviewerName,
    targetUserIds: [executorId],
    message: `${reviewerName} принял задачу: "${taskTitle}"${comment ? ` - ${comment}` : ""}`,
    timestamp: new Date().toISOString()
  })
}

export function notifyTaskReturned(
  taskId: string,
  taskTitle: string,
  reviewerId: string,
  reviewerName: string,
  executorId: string,
  comment?: string
) {
  notificationService.notify({
    type: "task_returned",
    taskId,
    taskTitle,
    userId: reviewerId,
    userName: reviewerName,
    targetUserIds: [executorId],
    message: `${reviewerName} вернул задачу: "${taskTitle}"${comment ? ` - ${comment}` : ""}`,
    timestamp: new Date().toISOString()
  })
}

export function notifyFactAdded(
  partCode: string,
  stage: string,
  operatorId: string,
  operatorName: string,
  targetUserIds: string[],
  qtyGood: number,
  shiftType: string
) {
  notificationService.notify({
    type: "fact_added",
    partCode,
    userId: operatorId,
    userName: operatorName,
    targetUserIds,
    message: `${operatorName} внёс факт: ${partCode}, ${stage}, ${shiftType}: ${qtyGood} шт`,
    timestamp: new Date().toISOString()
  })
}
