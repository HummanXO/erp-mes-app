// Types for the production control dashboard

export type UserRole = "admin" | "director" | "chief_engineer" | "shop_head" | "supply" | "master" | "operator"

export interface User {
  id: string
  role: UserRole
  name: string
  initials: string // Инициалы: "Колчин А.А."
  username: string
  // Operators can work any shift - no shift assignment
}

// Helper to convert full name to initials format
export function getInitials(fullName: string): string {
  const parts = fullName.split(" ")
  if (parts.length === 1) return parts[0]
  if (parts.length === 2) return `${parts[0]} ${parts[1][0]}.`
  // Фамилия И.О.
  return `${parts[0]} ${parts[1][0]}.${parts[2][0]}.`
}

export type PartStatus = "not_started" | "in_progress" | "done"

// Production stages/departments
export type ProductionStage = 
  | "machining"      // Механообработка (станки)
  | "fitting"        // Слесарка
  | "galvanic"       // Гальваника
  | "heat_treatment" // Термообработка
  | "grinding"       // Шлифовка
  | "qc"             // ОТК (контроль качества)
  | "logistics"      // Логистика

export interface StageStatus {
  stage: ProductionStage
  status: "pending" | "in_progress" | "done" | "skipped"
  operator_id?: string
  started_at?: string
  completed_at?: string
  notes?: string
}

// Logistics entry for tracking materials, tooling, shipping
export type LogisticsType = 
  | "material_in"    // Входящий материал
  | "tooling_in"     // Оснастка входящая
  | "shipping_out"   // Отправка клиенту
  | "coop_out"       // Отправка кооператору
  | "coop_in"        // Получение от кооператора

export type MovementStatus =
  | "sent"
  | "in_transit"
  | "received"
  | "returned"
  | "cancelled"
  // Legacy statuses (backward compatibility).
  | "pending"
  | "completed"

export interface LogisticsEntry {
  id: string
  part_id: string
  status: MovementStatus

  // Movement fields (Option 2).
  from_location?: string
  from_holder?: string
  to_location?: string
  to_holder?: string
  carrier?: string
  tracking_number?: string
  planned_eta?: string
  sent_at?: string
  received_at?: string
  returned_at?: string
  cancelled_at?: string
  qty_sent?: number
  qty_received?: number
  stage_id?: string
  last_tracking_status?: string
  tracking_last_checked_at?: string
  raw_payload?: Record<string, unknown> | null

  // Legacy fields kept for compatibility with historical records/UI.
  type?: LogisticsType
  description?: string
  quantity?: number
  date?: string
  counterparty?: string // Кто (поставщик/кооператор/клиент)
  notes?: string
  created_at?: string
  updated_at?: string
}

export interface JourneyEvent {
  event_type: "movement" | "fact" | string
  occurred_at?: string | null
  description?: string | null
}

export interface JourneySummary {
  part_id: string
  current_location?: string | null
  current_holder?: string | null
  next_required_stage?: ProductionStage | null
  eta?: string | null
  last_movement?: LogisticsEntry | null
  last_event?: JourneyEvent | null
}

// Machine definition
export interface Machine {
  id: string
  name: string
  rate_per_shift: number // expected pieces per shift
  department: ProductionStage // which department this machine belongs to
}

// Part (деталь) - what we manufacture
export interface Part {
  id: string
  code: string // e.g. "01488.900.725"
  base_code?: string // базовый код семейства детали
  variant_suffix?: string // исполнение: 01/02/...
  variant_params?: Record<string, string | number> // параметры исполнения, например L=120
  name: string
  qty_plan: number
  qty_done: number
  deadline: string
  status: PartStatus
  drawing_url?: string // URL to drawing/blueprint
  description?: string
  
  // Production configuration
  is_cooperation: boolean // Кооперация - деталь изготавливается на стороне
  cooperation_partner?: string // Название кооператора
  
  // Which stages this part goes through
  required_stages: ProductionStage[]
  stage_statuses: StageStatus[]
  
  // Machine assignment (if has machining stage)
  machine_id?: string
  
  // Customer info
  customer?: string

  // Part should be created from specification context.
  source_specification_id?: string
}

// Specification/BOM-like entities
export type SpecificationStatus = "draft" | "active" | "closed"
export type SpecItemType = "make" | "coop"
export type SpecItemStatus = "open" | "partial" | "fulfilled" | "blocked" | "canceled"
export type WorkOrderStatus = "backlog" | "queued" | "in_progress" | "blocked" | "done" | "canceled"
export type WorkOrderPriority = "low" | "normal" | "high"
export type AccessEntityType = "specification" | "work_order" | "part"
export type AccessPermission = "view" | "report" | "manage"

export interface Specification {
  id: string
  number: string
  customer?: string
  deadline?: string
  note?: string
  status: SpecificationStatus
  published_to_operators: boolean
  created_by: string
  created_at: string
}

export interface SpecItem {
  id: string
  specification_id: string
  line_no: number
  item_type: SpecItemType
  part_id?: string
  description: string
  qty_required: number
  qty_done: number
  uom: string
  comment?: string
  status: SpecItemStatus
}

export interface WorkOrder {
  id: string
  specification_id: string
  spec_item_id: string
  part_id: string
  machine_id?: string
  assigned_operator_id?: string
  status: WorkOrderStatus
  queue_pos?: number
  qty_plan: number
  qty_done: number
  qty_scrap: number
  priority: WorkOrderPriority
  due_date?: string
  block_reason?: string
  started_at?: string
  completed_at?: string
  created_by: string
  created_at: string
}

export interface AccessGrant {
  id: string
  entity_type: AccessEntityType
  entity_id: string
  user_id: string
  permission: AccessPermission
  created_by: string
  created_at: string
}

// Shift types
export type ShiftType = "day" | "night" | "none"

// Stage fact - recording work done at each stage
export interface StageFact {
  id: string
  date: string
  shift_type: ShiftType
  part_id: string
  stage: ProductionStage
  machine_id?: string // if applicable
  operator_id: string
  qty_good: number
  qty_scrap: number
  qty_expected?: number // Ожидаемое количество (норма)
  comment: string
  deviation_reason: DeviationReason
  created_at: string
  attachments?: TaskAttachment[] // Фото/файлы к записи
}

// Machine norm configuration - expected output per shift
export interface MachineNorm {
  machine_id: string
  part_id: string
  stage: ProductionStage
  qty_per_shift: number // Норма выработки за смену
  is_configured: boolean // После пусконаладки
  configured_at?: string
  configured_by_id?: string
}

export type DeviationReason = 
  | "setup" 
  | "quality" 
  | "material" 
  | "tooling" 
  | "operator" 
  | "machine" 
  | "external" 
  | "logistics"
  | null

export type TaskStatus = "open" | "accepted" | "in_progress" | "review" | "done"
export type TaskCategory = "tooling" | "quality" | "machine" | "material" | "logistics" | "general"

// Тип назначения задачи
export type TaskAssigneeType = "user" | "role" | "all"

// Группы ролей для назначения задач
// Task comment/attachment for chat functionality
export interface TaskComment {
  id: string
  task_id: string
  user_id: string
  message: string
  attachments: TaskAttachment[]
  created_at: string
}

export interface TaskAttachment {
  id: string
  name: string
  url: string
  type: "image" | "file"
  size?: number
}

export const ASSIGNEE_ROLE_GROUPS: Record<UserRole, string> = {
  admin: "Администраторам",
  director: "Директору",
  chief_engineer: "Главному инженеру",
  shop_head: "Начальнику цеха",
  supply: "Снабжению",
  master: "Мастерам",
  operator: "Операторам",
}

export interface TaskReadInfo {
  user: {
    id: string
    initials: string
  }
  read_at: string
}

export interface Task {
  id: string
  part_id?: string
  machine_id?: string
  stage?: ProductionStage
  title: string
  description: string
  creator_id: string // Кто создал задачу
  
  // Назначение задачи (можно: конкретному пользователю, группе по роли, или всем)
  assignee_type: TaskAssigneeType
  assignee_id?: string // ID пользователя (если assignee_type === "user")
  assignee_role?: UserRole // Роль (если assignee_type === "role")
  
  accepted_by_id?: string // Кто принял задачу (для подтверждения)
  accepted_at?: string // Когда принял
  status: TaskStatus
  is_blocker: boolean
  due_date: string
  category: TaskCategory
  created_at: string
  read_by: string[] // ID пользователей, которые прочитали задачу
  read_by_users?: TaskReadInfo[] // Детальная информация о прочтении (кто и когда)
  
  // Review/comments system
  comments: TaskComment[] // История комментариев/чата
  review_comment?: string // Комментарий при отправке на проверку или возврате
  reviewed_by_id?: string // Кто проверил
  reviewed_at?: string // Когда проверено
}

// Status labels in Russian
export const PART_STATUS_LABELS: Record<PartStatus, string> = {
  not_started: "Не начато",
  in_progress: "В работе",
  done: "Завершено",
}

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  open: "Открыта",
  accepted: "Принята",
  in_progress: "В работе",
  review: "На проверке",
  done: "Завершено",
}

export const SPEC_STATUS_LABELS: Record<SpecificationStatus, string> = {
  draft: "Черновик",
  active: "Активна",
  closed: "Закрыта",
}

export const SPEC_ITEM_TYPE_LABELS: Record<SpecItemType, string> = {
  make: "Деталь",
  coop: "Кооперация",
}

export const SPEC_ITEM_STATUS_LABELS: Record<SpecItemStatus, string> = {
  open: "Открыта",
  partial: "Частично",
  fulfilled: "Выполнена",
  blocked: "Заблокирована",
  canceled: "Отменена",
}

export const WORK_ORDER_STATUS_LABELS: Record<WorkOrderStatus, string> = {
  backlog: "Бэклог",
  queued: "В очереди",
  in_progress: "В работе",
  blocked: "Блок",
  done: "Готово",
  canceled: "Отменено",
}

export const DEVIATION_REASON_LABELS: Record<string, string> = {
  setup: "Наладка",
  quality: "Качество",
  material: "Материал",
  tooling: "Оснастка",
  operator: "Оператор",
  machine: "Оборудование",
  external: "Внешние факторы",
  logistics: "Логистика",
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Администратор",
  director: "Генеральный директор",
  chief_engineer: "Главный инженер",
  shop_head: "Начальник цеха",
  supply: "Снабжение/Кооперация",
  master: "Мастер",
  operator: "Оператор",
}

export const SHIFT_LABELS: Record<ShiftType, string> = {
  day: "Дневная",
  night: "Ночная",
  none: "Без смены",
}

export const STAGE_LABELS: Record<ProductionStage, string> = {
  machining: "Мехобработка",
  fitting: "Слесарка",
  galvanic: "Гальваника",
  heat_treatment: "Термообработка",
  grinding: "Шлифовка",
  qc: "ОТК",
  logistics: "Логистика",
}

export const STAGE_ICONS: Record<ProductionStage, string> = {
  machining: "Cog",
  fitting: "Wrench",
  galvanic: "Zap",
  heat_treatment: "Flame",
  grinding: "CircleDot",
  qc: "CheckSquare",
  logistics: "Truck",
}

export const LOGISTICS_TYPE_LABELS: Record<LogisticsType, string> = {
  material_in: "Материал (вход)",
  tooling_in: "Оснастка (вход)",
  shipping_out: "Отправка клиенту",
  coop_out: "Отправка кооператору",
  coop_in: "Получение от кооператора",
}

export const TASK_CATEGORY_LABELS: Record<TaskCategory, string> = {
  tooling: "Оснастка",
  quality: "Качество",
  machine: "Оборудование",
  material: "Материал",
  logistics: "Логистика",
  general: "Общее",
}

// Role permissions
export const ROLE_PERMISSIONS: Record<UserRole, {
  canViewAll: boolean
  canViewCooperation: boolean // Может видеть кооперацию
  canEditFacts: boolean
  canRollbackFacts: boolean // Может откатывать (удалять) факты
  canCreateTasks: boolean
  canManageUsers: boolean
  canDeleteData: boolean
  canViewReports: boolean
  canViewAudit: boolean
  canCreateParts: boolean // Может создавать детали
  canCreateOwnParts: boolean // Может создавать цеховые детали
  canCreateCoopParts: boolean // Может создавать кооперационные детали
  canEditParts: boolean // Может изменять детали
  canManageLogistics: boolean // Управление логистикой, материалами, оснасткой
  canViewInventory: boolean // Может видеть вкладку Склад
  canManageInventory: boolean // Может изменять склад (движения/редактирование)
  canViewSpecifications: boolean // Может видеть спецификации и задания
  canManageSpecifications: boolean // Может создавать/редактировать спецификации
  canGrantSpecificationAccess: boolean // Может выдавать операторам доступ к спецификации/деталям
  canManageWorkOrders: boolean // Может управлять очередью и запуском заданий
}> = {
  admin: {
    canViewAll: true,
    canViewCooperation: true,
    canEditFacts: true,
    canRollbackFacts: true,
    canCreateTasks: true,
    canManageUsers: true,
    canDeleteData: true,
    canViewReports: true,
    canViewAudit: true,
    canCreateParts: true,
    canCreateOwnParts: true,
    canCreateCoopParts: true,
    canEditParts: true,
    canManageLogistics: true,
    canViewInventory: true,
    canManageInventory: true,
    canViewSpecifications: true,
    canManageSpecifications: true,
    canGrantSpecificationAccess: true,
    canManageWorkOrders: true,
  },
  director: {
    canViewAll: true,
    canViewCooperation: true,
    canEditFacts: true,
    canRollbackFacts: true,
    canCreateTasks: true,
    canManageUsers: false,
    canDeleteData: false,
    canViewReports: true,
    canViewAudit: true,
    canCreateParts: true,
    canCreateOwnParts: true,
    canCreateCoopParts: true,
    canEditParts: true,
    canManageLogistics: true,
    canViewInventory: true,
    canManageInventory: true,
    canViewSpecifications: true,
    canManageSpecifications: true,
    canGrantSpecificationAccess: true,
    canManageWorkOrders: true,
  },
  chief_engineer: {
    canViewAll: true,
    canViewCooperation: true,
    canEditFacts: false,
    canRollbackFacts: false,
    canCreateTasks: true,
    canManageUsers: false,
    canDeleteData: false,
    canViewReports: true,
    canViewAudit: true,
    canCreateParts: true,
    canCreateOwnParts: true,
    canCreateCoopParts: true,
    canEditParts: true,
    canManageLogistics: false,
    canViewInventory: true,
    canManageInventory: false,
    canViewSpecifications: true,
    // Главный инженер может видеть спецификации (включая черновики), но не должен создавать/редактировать/публиковать.
    canManageSpecifications: false,
    canGrantSpecificationAccess: false,
    canManageWorkOrders: true,
  },
  shop_head: {
    canViewAll: true,
    canViewCooperation: true,
    canEditFacts: true,
    canRollbackFacts: true,
    canCreateTasks: true,
    canManageUsers: false,
    canDeleteData: false,
    canViewReports: true,
    canViewAudit: true,
    canCreateParts: true,
    canCreateOwnParts: true,
    canCreateCoopParts: true,
    canEditParts: true,
    canManageLogistics: true,
    canViewInventory: true,
    canManageInventory: true,
    canViewSpecifications: true,
    canManageSpecifications: true,
    canGrantSpecificationAccess: true,
    canManageWorkOrders: true,
  },
  supply: {
    canViewAll: true,
    canViewCooperation: true,
    canEditFacts: false, // Снабжение НЕ вносит факты производства
    canRollbackFacts: false,
    canCreateTasks: true,
    canManageUsers: false,
    canDeleteData: false,
    canViewReports: true,
    canViewAudit: true,
    canCreateParts: true,
    canCreateOwnParts: false, // Снабжение НЕ может создавать цеховые детали
    canCreateCoopParts: true, // Снабжение может создавать только кооперацию
    canEditParts: true, // Может изменять кооперационные детали
    canManageLogistics: true, // Основная задача - логистика, материалы, снабжение
    canViewInventory: true,
    canManageInventory: true,
    canViewSpecifications: true,
    // Снабжение может видеть спецификации (включая черновики), но не должно создавать/редактировать/публиковать.
    canManageSpecifications: false,
    canGrantSpecificationAccess: false,
    canManageWorkOrders: false,
  },
  master: {
    canViewAll: true,
    canViewCooperation: false, // Мастер НЕ видит кооперацию
    canEditFacts: true,
    canRollbackFacts: true,
    canCreateTasks: true, // Мастер может создавать задачи операторам по производству
    canManageUsers: false,
    canDeleteData: false,
    canViewReports: true,
    canViewAudit: true,
    canCreateParts: true,
    canCreateOwnParts: true, // Мастер может создавать только цеховые детали
    canCreateCoopParts: false, // Мастер НЕ может создавать кооперацию
    canEditParts: true,
    canManageLogistics: false,
    canViewInventory: true,
    canManageInventory: false,
    canViewSpecifications: true,
    canManageSpecifications: false,
    canGrantSpecificationAccess: true,
    canManageWorkOrders: true,
  },
  operator: {
    canViewAll: false,
    canViewCooperation: false, // Оператор НЕ видит кооперацию
    canEditFacts: true, // Оператор вносит факты производства
    canRollbackFacts: false,
    canCreateTasks: false, // Оператор НЕ может создавать задачи
    canManageUsers: false,
    canDeleteData: false,
    canViewReports: false,
    canViewAudit: false,
    canCreateParts: false, // Оператор НЕ может создавать детали
    canCreateOwnParts: false,
    canCreateCoopParts: false,
    canEditParts: false,
    canManageLogistics: false,
    canViewInventory: false,
    canManageInventory: false,
    canViewSpecifications: true,
    canManageSpecifications: false,
    canGrantSpecificationAccess: false,
    canManageWorkOrders: false,
  },
}
