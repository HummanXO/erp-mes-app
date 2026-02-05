import type { User, Machine, Part, StageFact, Task, LogisticsEntry, ProductionStage, StageStatus, MachineNorm, TaskComment } from "./types"

export const MOCK_USERS: User[] = [
  // Admin
  { id: "u_admin", role: "admin", name: "Администратор", initials: "Админ", username: "admin" },
  
  // Генеральный директор
  { id: "u_director", role: "director", name: "Горбенко Александр Александрович", initials: "Горбенко А.А.", username: "gorbenko" },
  
  // Главный инженер
  { id: "u_chief_eng", role: "chief_engineer", name: "Шамаев Артур Александрович", initials: "Шамаев А.А.", username: "shamaev" },
  
  // Начальник цеха
  { id: "u_shop_head", role: "shop_head", name: "Бержановский Глеб Валерьевич", initials: "Бержановский Г.В.", username: "berzhanovskiy" },
  
  // Специалисты по снабжению/кооперации
  { id: "u_supply_1", role: "supply", name: "Кузнецов Василий Сергеевич", initials: "Кузнецов В.С.", username: "kuznetsov" },
  { id: "u_supply_2", role: "supply", name: "Колчин Александр Алексеевич", initials: "Колчин А.А.", username: "kolchin" },
  
  // Мастер
  { id: "u_master", role: "master", name: "Козлов Андрей Юрьевич", initials: "Козлов А.Ю.", username: "kozlov_a" },
  
  // Операторы
  { id: "u_op_1", role: "operator", name: "Ильиных Евгений Борисович", initials: "Ильиных Е.Б.", username: "ilinykh" },
  { id: "u_op_2", role: "operator", name: "Шумилов Александр Владимирович", initials: "Шумилов А.В.", username: "shumilov" },
  { id: "u_op_3", role: "operator", name: "Соловьев Александр Сергеевич", initials: "Соловьев А.С.", username: "solovyev" },
  { id: "u_op_4", role: "operator", name: "Вахрушев Александр Вячеславович", initials: "Вахрушев А.В.", username: "vakhrushev" },
]

export const MOCK_MACHINES: Machine[] = [
  { id: "m_tsugami", name: "Tsugami S205A", rate_per_shift: 400, department: "machining" },
  { id: "m_nextturn", name: "NextTurn SA12B", rate_per_shift: 400, department: "machining" },
  { id: "m_grind_1", name: "Шлифовальный КШ-3", rate_per_shift: 200, department: "grinding" },
]

// Helper to create stage statuses
function createStageStatuses(stages: ProductionStage[]): StageStatus[] {
  return stages.map(stage => ({
    stage,
    status: "pending" as const,
  }))
}

export const MOCK_PARTS: Part[] = [
  // Regular parts - full production cycle
  {
    id: "p_725",
    code: "01488.900.725",
    name: "Корпус основной",
    qty_plan: 2450,
    qty_done: 1220, // Сумма фактов механообработки: 380 + 420 + 420 = 1220
    priority: "high",
    deadline: "2026-02-10",
    status: "in_progress",
    description: "Основная деталь корпуса изделия",
    is_cooperation: false,
    required_stages: ["machining", "fitting", "galvanic", "qc"],
    stage_statuses: [
      { stage: "machining", status: "in_progress", operator_id: "u_op_1" }, // Ильиных
      { stage: "fitting", status: "pending" },
      { stage: "galvanic", status: "pending" },
      { stage: "qc", status: "pending" },
    ],
    machine_id: "m_tsugami",
    customer: "ООО Заказчик-1",
  },
  {
    id: "p_725_01",
    code: "01488.900.725-01",
    name: "Втулка опорная",
    qty_plan: 6050,
    qty_done: 2400,
    priority: "medium",
    deadline: "2026-02-20",
    status: "in_progress",
    description: "Втулка для основного узла",
    is_cooperation: false,
    required_stages: ["machining", "heat_treatment", "grinding", "qc"],
    stage_statuses: [
      { stage: "machining", status: "done", operator_id: "u_op_2", completed_at: "2026-01-28" }, // Шумилов
      { stage: "heat_treatment", status: "in_progress" },
      { stage: "grinding", status: "pending" },
      { stage: "qc", status: "pending" },
    ],
    machine_id: "m_tsugami",
    customer: "ООО Заказчик-1",
  },
  {
    id: "p_725_02",
    code: "01488.900.725-02",
    name: "Кольцо уплотнительное",
    qty_plan: 6750,
    qty_done: 0,
    priority: "low",
    deadline: "2026-03-01",
    status: "not_started",
    description: "Кольцо для герметизации",
    is_cooperation: false,
    required_stages: ["machining", "qc"],
    stage_statuses: [
      { stage: "machining", status: "pending" },
      { stage: "qc", status: "pending" },
    ],
    machine_id: "m_tsugami",
    customer: "ООО Заказчик-1",
  },
  // NextTurn parts
  {
    id: "p_229",
    code: "01489.121.229",
    name: "Вал центральный",
    qty_plan: 15900,
    qty_done: 4800,
    priority: "high",
    deadline: "2026-02-25",
    status: "in_progress",
    description: "Основной вал механизма",
    is_cooperation: false,
    required_stages: ["machining", "heat_treatment", "grinding", "fitting", "qc"],
    stage_statuses: [
      { stage: "machining", status: "in_progress", operator_id: "u_op_3" }, // Соловьев
      { stage: "heat_treatment", status: "pending" },
      { stage: "grinding", status: "pending" },
      { stage: "fitting", status: "pending" },
      { stage: "qc", status: "pending" },
    ],
    machine_id: "m_nextturn",
    customer: "АО Промтех",
  },
  {
    id: "p_229_01",
    code: "01489.121.229-01",
    name: "Шестерня ведущая",
    qty_plan: 6350,
    qty_done: 800,
    priority: "medium",
    deadline: "2026-02-28",
    status: "in_progress",
    description: "Шестерня для привода",
    is_cooperation: false,
    required_stages: ["machining", "heat_treatment", "qc"],
    stage_statuses: [
      { stage: "machining", status: "in_progress", operator_id: "u_op_4" }, // Вахрушев
      { stage: "heat_treatment", status: "pending" },
      { stage: "qc", status: "pending" },
    ],
    machine_id: "m_nextturn",
    customer: "АО Промтех",
  },
  
  // COOPERATION parts - manufactured externally
  {
    id: "p_coop_1",
    code: "01490.200.100",
    name: "Корпус литой",
    qty_plan: 500,
    qty_done: 200,
    priority: "high",
    deadline: "2026-02-15",
    status: "in_progress",
    description: "Литой корпус от кооператора, требует гальванику у нас",
    is_cooperation: true,
    cooperation_partner: "ООО Литейщик",
    required_stages: ["logistics", "galvanic", "qc", "logistics"],
    stage_statuses: [
      { stage: "logistics", status: "done", notes: "Получено от кооператора 200 шт" },
      { stage: "galvanic", status: "in_progress" },
      { stage: "qc", status: "pending" },
      { stage: "logistics", status: "pending", notes: "Отправка клиенту" },
    ],
    customer: "ООО Заказчик-2",
  },
  {
    id: "p_coop_2",
    code: "01490.200.101",
    name: "Кронштейн сварной",
    qty_plan: 1000,
    qty_done: 0,
    priority: "medium",
    deadline: "2026-03-01",
    status: "not_started",
    description: "Сварной кронштейн, гальваника у кооператора",
    is_cooperation: true,
    cooperation_partner: "ООО СварМет",
    required_stages: ["logistics", "qc", "logistics", "logistics"],
    stage_statuses: [
      { stage: "logistics", status: "pending", notes: "Ожидание от кооператора" },
      { stage: "qc", status: "pending", notes: "Входной контроль" },
      { stage: "logistics", status: "pending", notes: "Отправка на гальванику к кооператору" },
      { stage: "logistics", status: "pending", notes: "Получение и отправка клиенту" },
    ],
    customer: "АО Промтех",
  },
  {
    id: "p_coop_3",
    code: "01490.200.102",
    name: "Фланец штампованный",
    qty_plan: 2000,
    qty_done: 800,
    priority: "low",
    deadline: "2026-03-15",
    status: "in_progress",
    description: "Штамповка на стороне, у нас только слесарка и ОТК",
    is_cooperation: true,
    cooperation_partner: "ООО Штамповщик",
    required_stages: ["logistics", "fitting", "qc", "logistics"],
    stage_statuses: [
      { stage: "logistics", status: "done", notes: "Получено 800 шт" },
      { stage: "fitting", status: "in_progress", operator_id: "u_op_5" },
      { stage: "qc", status: "pending" },
      { stage: "logistics", status: "pending", notes: "Отправка клиенту" },
    ],
    customer: "ООО Заказчик-1",
  },
]

export const MOCK_STAGE_FACTS: StageFact[] = [
  // Machining facts
  { id: "sf_1", date: "2026-01-30", shift_type: "day", part_id: "p_725", stage: "machining", machine_id: "m_tsugami", operator_id: "u_op_1", qty_good: 380, qty_scrap: 5, comment: "Норма", deviation_reason: null, created_at: "2026-01-30T18:00:00Z" },
  { id: "sf_2", date: "2026-01-30", shift_type: "night", part_id: "p_725", stage: "machining", machine_id: "m_tsugami", operator_id: "u_op_3", qty_good: 420, qty_scrap: 3, comment: "Хороший темп", deviation_reason: null, created_at: "2026-01-31T06:00:00Z" },
  { id: "sf_3", date: "2026-01-30", shift_type: "day", part_id: "p_229", stage: "machining", machine_id: "m_nextturn", operator_id: "u_op_2", qty_good: 350, qty_scrap: 10, comment: "Наладка после обеда", deviation_reason: "setup", created_at: "2026-01-30T18:00:00Z" },
  { id: "sf_4", date: "2026-01-30", shift_type: "night", part_id: "p_229", stage: "machining", machine_id: "m_nextturn", operator_id: "u_op_4", qty_good: 410, qty_scrap: 2, comment: "", deviation_reason: null, created_at: "2026-01-31T06:00:00Z" },
  { id: "sf_5", date: "2026-01-31", shift_type: "day", part_id: "p_725", stage: "machining", machine_id: "m_tsugami", operator_id: "u_op_1", qty_good: 420, qty_scrap: 2, comment: "Стабильно", deviation_reason: null, created_at: "2026-01-31T18:00:00Z" },
  { id: "sf_6", date: "2026-01-31", shift_type: "day", part_id: "p_229", stage: "machining", machine_id: "m_nextturn", operator_id: "u_op_2", qty_good: 280, qty_scrap: 15, comment: "Проблемы с резцом", deviation_reason: "tooling", created_at: "2026-01-31T18:00:00Z" },
  
  // Fitting facts
  { id: "sf_7", date: "2026-01-31", shift_type: "day", part_id: "p_coop_3", stage: "fitting", operator_id: "u_op_5", qty_good: 150, qty_scrap: 2, comment: "Зачистка заусенцев", deviation_reason: null, created_at: "2026-01-31T18:00:00Z" },
  
  // Galvanic facts
  { id: "sf_8", date: "2026-01-31", shift_type: "day", part_id: "p_coop_1", stage: "galvanic", operator_id: "u_op_3", qty_good: 100, qty_scrap: 0, comment: "Цинкование", deviation_reason: null, created_at: "2026-01-31T18:00:00Z" },
]

export const MOCK_LOGISTICS: LogisticsEntry[] = [
  {
    id: "log_1",
    part_id: "p_coop_1",
    type: "coop_in",
    description: "Получение литых корпусов от кооператора",
    quantity: 200,
    date: "2026-01-28",
    status: "completed",
    counterparty: "ООО Литейщик",
    notes: "Партия 1 из 3",
  },
  {
    id: "log_2",
    part_id: "p_coop_3",
    type: "coop_in",
    description: "Получение штампованных фланцев",
    quantity: 800,
    date: "2026-01-25",
    status: "completed",
    counterparty: "ООО Штамповщик",
  },
  {
    id: "log_3",
    part_id: "p_725",
    type: "material_in",
    description: "Пруток Д16Т ø25",
    quantity: 500,
    date: "2026-01-20",
    status: "completed",
    counterparty: "ООО Металлопрокат",
  },
  {
    id: "log_4",
    part_id: "p_725",
    type: "tooling_in",
    description: "Резцы CNMG 120408",
    quantity: 20,
    date: "2026-01-29",
    status: "completed",
    counterparty: "Sandvik",
  },
  {
    id: "log_5",
    part_id: "p_coop_2",
    type: "coop_in",
    description: "Ожидание кронштейнов от сварщика",
    quantity: 1000,
    date: "2026-02-10",
    status: "pending",
    counterparty: "ООО СварМет",
    notes: "Плановая дата поставки",
  },
]

export const MOCK_TASKS: Task[] = [
  {
    id: "t_1",
    part_id: "p_725",
    machine_id: "m_tsugami",
    stage: "machining",
    title: "Заказать резцы",
    description: "Запас резцов на исходе, нужно заказать до конца недели",
    creator_id: "u_master",
    assignee_type: "role", // Задача снабжению (группе)
    assignee_role: "supply",
    accepted_by_id: "u_supply_1",
    accepted_at: "2026-01-30T12:00:00Z",
    status: "in_progress",
    is_blocker: false,
    due_date: "2026-02-05",
    category: "tooling",
    created_at: "2026-01-30T10:00:00Z",
    read_by: ["u_master", "u_supply_1", "u_shop_head"],
    comments: [
      { id: "c_1", task_id: "t_1", user_id: "u_master", message: "Нужны CNMG 120408 - 20 шт", attachments: [], created_at: "2026-01-30T10:05:00Z" },
      { id: "c_2", task_id: "t_1", user_id: "u_supply_1", message: "Понял, заказал у Sandvik", attachments: [], created_at: "2026-01-30T14:00:00Z" },
      { id: "c_3", task_id: "t_1", user_id: "u_master", message: "Когда примерно придут?", attachments: [], created_at: "2026-01-30T15:30:00Z" },
    ],
  },
  {
    id: "t_2",
    part_id: "p_229",
    machine_id: "m_nextturn",
    stage: "machining",
    title: "Проверить базирование",
    description: "После смены оснастки уводит размер",
    creator_id: "u_shop_head",
    assignee_type: "user",
    assignee_id: "u_op_2",
    status: "in_progress",
    is_blocker: true,
    due_date: "2026-02-01",
    category: "quality",
    created_at: "2026-01-31T11:20:00Z",
    read_by: ["u_shop_head", "u_op_2"],
    comments: [
      { id: "c_4", task_id: "t_2", user_id: "u_shop_head", message: "Срочно! Уводит на 0.05мм", attachments: [], created_at: "2026-01-31T11:25:00Z" },
      { id: "c_5", task_id: "t_2", user_id: "u_op_2", message: "Проверил, проблема в патроне. Нужна замена", attachments: [], created_at: "2026-01-31T13:00:00Z" },
    ],
  },
  {
    id: "t_3",
    machine_id: "m_nextturn",
    stage: "machining",
    title: "Плановое ТО станка",
    description: "Замена СОЖ и проверка шпинделя",
    creator_id: "u_shop_head",
    assignee_type: "user",
    assignee_id: "u_master",
    status: "open",
    is_blocker: false,
    due_date: "2026-02-10",
    category: "machine",
    created_at: "2026-01-28T09:00:00Z",
    read_by: ["u_shop_head"],
    comments: [],
  },
  {
    id: "t_4",
    part_id: "p_coop_1",
    stage: "logistics",
    title: "Уточнить сроки поставки",
    description: "Связаться с ООО Литейщик по срокам следующей партии",
    creator_id: "u_shop_head",
    assignee_type: "role", // Задача снабжению (группе)
    assignee_role: "supply",
    status: "open",
    is_blocker: false,
    due_date: "2026-02-03",
    category: "logistics",
    created_at: "2026-01-30T14:00:00Z",
    read_by: ["u_shop_head"],
    comments: [],
  },
  {
    id: "t_5",
    part_id: "p_coop_2",
    stage: "logistics",
    title: "Организовать доставку от СварМет",
    description: "Заказать транспорт для получения кронштейнов",
    creator_id: "u_director",
    assignee_type: "user",
    assignee_id: "u_supply_1",
    accepted_by_id: "u_supply_1",
    accepted_at: "2026-01-31T10:00:00Z",
    status: "in_progress",
    is_blocker: true,
    due_date: "2026-02-08",
    category: "logistics",
    created_at: "2026-01-31T09:00:00Z",
    read_by: ["u_director", "u_supply_1", "u_supply_2"],
    comments: [],
  },
  {
    id: "t_6",
    title: "Подготовить отчет по браку",
    description: "Сводка по браку за январь для совещания",
    creator_id: "u_shop_head",
    assignee_type: "role", // Всем операторам
    assignee_role: "operator",
    status: "open",
    is_blocker: false,
    due_date: "2026-02-05",
    category: "general",
    created_at: "2026-01-31T15:00:00Z",
    read_by: ["u_shop_head"],
    comments: [],
  },
  {
    id: "t_7",
    title: "Общее собрание цеха",
    description: "Собрание в 14:00 в конференц-зале",
    creator_id: "u_director",
    assignee_type: "all", // Всем
    status: "open",
    is_blocker: false,
    due_date: "2026-02-03",
    category: "general",
    created_at: "2026-01-31T16:00:00Z",
    read_by: ["u_director"],
    comments: [],
  },
]

export const MOCK_MACHINE_NORMS: MachineNorm[] = [
  { machine_id: "m_tsugami", part_id: "p_725", stage: "machining", qty_per_shift: 400, is_configured: true, configured_at: "2026-01-15", configured_by_id: "u_chief_eng" },
  { machine_id: "m_tsugami", part_id: "p_725_01", stage: "machining", qty_per_shift: 380, is_configured: true, configured_at: "2026-01-20", configured_by_id: "u_chief_eng" },
  { machine_id: "m_nextturn", part_id: "p_229", stage: "machining", qty_per_shift: 420, is_configured: true, configured_at: "2026-01-18", configured_by_id: "u_shop_head" },
  { machine_id: "m_nextturn", part_id: "p_229_01", stage: "machining", qty_per_shift: 350, is_configured: false }, // Not yet configured
]

export const DEFAULT_DEMO_DATE = "2026-01-31"

export const STORAGE_KEYS = {
  users: "pc.users",
  machines: "pc.machines",
  parts: "pc.parts",
  stageFacts: "pc.stageFacts",
  tasks: "pc.tasks",
  logistics: "pc.logistics",
  machineNorms: "pc.machineNorms",
  currentUserId: "pc.currentUserId",
  demoDate: "pc.demoDate",
} as const
