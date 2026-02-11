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

export interface LogisticsEntry {
  id: string
  part_id: string
  type: LogisticsType
  description: string
  quantity?: number
  date: string
  status: "pending" | "in_transit" | "received" | "completed"
  tracking_number?: string
  counterparty?: string // Кто (поставщик/кооператор/клиент)
  notes?: string
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
  canCreateTasks: boolean
  canManageUsers: boolean
  canDeleteData: boolean
  canViewReports: boolean
  canCreateParts: boolean // Может создавать детали
  canCreateOwnParts: boolean // Может создавать цеховые детали
  canCreateCoopParts: boolean // Может создавать кооперационные детали
  canEditParts: boolean // Может изменять детали
  canManageLogistics: boolean // Управление логистикой, материалами, оснасткой
  canViewInventory: boolean // Может видеть вкладку Склад
  canManageInventory: boolean // Может изменять склад (движения/редактирование)
}> = {
  admin: {
    canViewAll: true,
    canViewCooperation: true,
    canEditFacts: true,
    canCreateTasks: true,
    canManageUsers: true,
    canDeleteData: true,
    canViewReports: true,
    canCreateParts: true,
    canCreateOwnParts: true,
    canCreateCoopParts: true,
    canEditParts: true,
    canManageLogistics: true,
    canViewInventory: true,
    canManageInventory: true,
  },
  director: {
    canViewAll: true,
    canViewCooperation: true,
    canEditFacts: true,
    canCreateTasks: true,
    canManageUsers: false,
    canDeleteData: false,
    canViewReports: true,
    canCreateParts: true,
    canCreateOwnParts: true,
    canCreateCoopParts: true,
    canEditParts: true,
    canManageLogistics: true,
    canViewInventory: true,
    canManageInventory: true,
  },
  chief_engineer: {
    canViewAll: true,
    canViewCooperation: true,
    canEditFacts: false,
    canCreateTasks: true,
    canManageUsers: false,
    canDeleteData: false,
    canViewReports: true,
    canCreateParts: true,
    canCreateOwnParts: true,
    canCreateCoopParts: true,
    canEditParts: true,
    canManageLogistics: false,
    canViewInventory: true,
    canManageInventory: false,
  },
  shop_head: {
    canViewAll: true,
    canViewCooperation: true,
    canEditFacts: true,
    canCreateTasks: true,
    canManageUsers: false,
    canDeleteData: false,
    canViewReports: true,
    canCreateParts: true,
    canCreateOwnParts: true,
    canCreateCoopParts: true,
    canEditParts: true,
    canManageLogistics: true,
    canViewInventory: true,
    canManageInventory: true,
  },
  supply: {
    canViewAll: true,
    canViewCooperation: true,
    canEditFacts: false, // Снабжение НЕ вносит факты производства
    canCreateTasks: true,
    canManageUsers: false,
    canDeleteData: false,
    canViewReports: true,
    canCreateParts: true,
    canCreateOwnParts: false, // Снабжение НЕ может создавать цеховые детали
    canCreateCoopParts: true, // Снабжение может создавать только кооперацию
    canEditParts: true, // Может изменять кооперационные детали
    canManageLogistics: true, // Основная задача - логистика, материалы, снабжение
    canViewInventory: true,
    canManageInventory: true,
  },
  master: {
    canViewAll: true,
    canViewCooperation: false, // Мастер НЕ видит кооперацию
    canEditFacts: true,
    canCreateTasks: true, // Мастер может создавать задачи операторам по производству
    canManageUsers: false,
    canDeleteData: false,
    canViewReports: true,
    canCreateParts: true,
    canCreateOwnParts: true, // Мастер может создавать только цеховые детали
    canCreateCoopParts: false, // Мастер НЕ может создавать кооперацию
    canEditParts: true,
    canManageLogistics: false,
    canViewInventory: true,
    canManageInventory: false,
  },
  operator: {
    canViewAll: false,
    canViewCooperation: false, // Оператор НЕ видит кооперацию
    canEditFacts: true, // Оператор вносит факты производства
    canCreateTasks: false, // Оператор НЕ может создавать задачи
    canManageUsers: false,
    canDeleteData: false,
    canViewReports: false,
    canCreateParts: false, // Оператор НЕ может создавать детали
    canCreateOwnParts: false,
    canCreateCoopParts: false,
    canEditParts: false,
    canManageLogistics: false,
    canViewInventory: false,
    canManageInventory: false,
  },
}
