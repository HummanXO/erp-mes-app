import { useCallback } from "react"
import * as dataProvider from "../../data-provider-adapter"
import type {
  Machine,
  MachineNorm,
  Part,
  ProductionStage,
  ShiftType,
  StageFact,
  StageStatus,
  TaskAttachment,
} from "../../types"
import { PROGRESS_STAGES, RISK_STAGES } from "../shared/constants"
import { awaitCriticalRefresh } from "../shared/refresh-invariants"

interface Params {
  refreshData: () => Promise<void>
  visibleParts: Part[]
  stageFacts: StageFact[]
  machines: Machine[]
  machineNorms: MachineNorm[]
  demoDate: string
}

export function usePartsDomain({
  refreshData,
  visibleParts,
  stageFacts,
  machines,
  machineNorms,
  demoDate,
}: Params) {
  const createPart = useCallback(async (part: Omit<Part, "id">) => {
    const newPart = await dataProvider.createPart(part)
    await awaitCriticalRefresh(refreshData, "parts:createPart")
    return newPart
  }, [refreshData])

  const updatePart = useCallback(async (part: Part) => {
    await dataProvider.updatePart(part)
    await awaitCriticalRefresh(refreshData, "parts:updatePart")
  }, [refreshData])

  const deletePart = useCallback(async (partId: string) => {
    await dataProvider.deletePart(partId)
    await awaitCriticalRefresh(refreshData, "parts:deletePart")
  }, [refreshData])

  const updatePartDrawing = useCallback(async (partId: string, drawingUrl: string) => {
    await dataProvider.updatePartDrawing(partId, drawingUrl)
    await awaitCriticalRefresh(refreshData, "parts:updatePartDrawing")
  }, [refreshData])

  const uploadAttachment = useCallback(async (file: File): Promise<TaskAttachment> => {
    return dataProvider.uploadAttachment(file)
  }, [])

  const updatePartStageStatus = useCallback(async (
    partId: string,
    stage: ProductionStage,
    status: StageStatus["status"],
    operatorId?: string
  ) => {
    dataProvider.updatePartStageStatus(partId, stage, status, operatorId)
    await awaitCriticalRefresh(refreshData, "parts:updatePartStageStatus")
  }, [refreshData])

  const createStageFact = useCallback(async (fact: Omit<StageFact, "id" | "created_at">) => {
    const newFact = await dataProvider.createStageFact(fact)
    await awaitCriticalRefresh(refreshData, "parts:createStageFact")
    return newFact
  }, [refreshData])

  const updateStageFact = useCallback(async (
    factId: string,
    data: Omit<StageFact, "id" | "created_at" | "part_id" | "stage" | "date" | "shift_type">
  ) => {
    const updatedFact = await dataProvider.updateStageFact(factId, data)
    await awaitCriticalRefresh(refreshData, "parts:updateStageFact")
    return updatedFact
  }, [refreshData])

  const deleteStageFact = useCallback(async (factId: string) => {
    await dataProvider.deleteStageFact(factId)
    await awaitCriticalRefresh(refreshData, "parts:deleteStageFact")
  }, [refreshData])

  const getMachineNorm = useCallback((machineId: string, partId: string, stage: ProductionStage) => {
    return machineNorms.find((n) => n.machine_id === machineId && n.part_id === partId && n.stage === stage)
  }, [machineNorms])

  const getMachineNormsForPart = useCallback((partId: string) => {
    return machineNorms.filter((n) => n.part_id === partId)
  }, [machineNorms])

  const setMachineNorm = useCallback(async (norm: Omit<MachineNorm, "configured_at">) => {
    const newNorm = await dataProvider.setMachineNorm(norm)
    await awaitCriticalRefresh(refreshData, "parts:setMachineNorm")
    return newNorm
  }, [refreshData])

  const getPartProgress = useCallback((partId: string) => {
    const part = visibleParts.find((p) => p.id === partId)
    if (!part) return { qtyDone: 0, qtyPlan: 0, percent: 0, qtyScrap: 0, stageProgress: [] }

    const facts = stageFacts.filter((f) => f.part_id === partId)
    const factsScrap = facts.reduce((sum, f) => sum + f.qty_scrap, 0)

    const stageStatuses = part.stage_statuses || []
    const activeStages = stageStatuses.filter((s) => s.status !== "skipped" && PROGRESS_STAGES.includes(s.stage))

    const stageProgress = activeStages.map((stageStatus) => {
      const backendQtyGood = typeof stageStatus.qty_good === "number" ? stageStatus.qty_good : null
      const stageFactsForStage = facts.filter((f) => f.stage === stageStatus.stage)
      const totalGood = backendQtyGood ?? stageFactsForStage.reduce((sum, f) => sum + f.qty_good, 0)
      const backendPercent = typeof stageStatus.percent === "number" ? stageStatus.percent : null
      const percent = backendPercent ?? (
        part.qty_plan > 0
          ? Math.min(100, Math.round((totalGood / part.qty_plan) * 100))
          : 0
      )
      return {
        stage: stageStatus.stage,
        percent: stageStatus.status === "done" ? 100 : percent,
        qtyDone: totalGood,
      }
    })

    const backendStatusScrap = stageStatuses.reduce(
      (sum, stageStatus) => sum + (typeof stageStatus.qty_scrap === "number" ? stageStatus.qty_scrap : 0),
      0
    )
    const qtyScrap = Math.max(factsScrap, backendStatusScrap)
    const backendStageQtyDone = activeStages.reduce(
      (max, stageStatus) =>
        Math.max(max, typeof stageStatus.qty_good === "number" ? stageStatus.qty_good : 0),
      0
    )
    const factsStageTotals = new Map<ProductionStage, number>()
    for (const fact of facts) {
      if (!PROGRESS_STAGES.includes(fact.stage)) continue
      factsStageTotals.set(fact.stage, (factsStageTotals.get(fact.stage) || 0) + fact.qty_good)
    }
    const factsQtyDone = Math.max(0, ...Array.from(factsStageTotals.values()))
    const qtyDone = Math.max(part.qty_done, backendStageQtyDone, factsQtyDone)
    const overallPercent = part.qty_plan > 0
      ? Math.min(100, Math.max(0, Math.round((qtyDone / part.qty_plan) * 100)))
      : 0

    return {
      qtyDone,
      qtyPlan: part.qty_plan,
      percent: overallPercent,
      qtyScrap,
      stageProgress,
    }
  }, [visibleParts, stageFacts])

  const getPartForecast = useCallback((partId: string) => {
    const part = visibleParts.find((p) => p.id === partId)
    const machine = part?.machine_id ? machines.find((m) => m.id === part.machine_id) : undefined

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

    const facts = stageFacts.filter((f) => f.part_id === partId)
    const stageStatuses = part.stage_statuses || []
    const activeStages = stageStatuses.filter((s) => s.status !== "skipped" && RISK_STAGES.includes(s.stage))
    const machiningNorm = part.machine_id
      ? machineNorms.find(
          (n) => n.machine_id === part.machine_id && n.part_id === part.id && n.stage === "machining"
        )
      : undefined
    const hasForecastInput = facts.length > 0 || !!machiningNorm?.is_configured

    const deadline = new Date(part.deadline)
    const today = new Date(demoDate)
    const daysRemaining = Math.max(0, Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)))
    const shiftsRemaining = daysRemaining * 2

    const stageForecasts = activeStages.map((stageStatus) => {
      const stageFactsForStage = facts.filter((f) => f.stage === stageStatus.stage)
      const totalDone = stageFactsForStage.reduce((sum, f) => sum + f.qty_good, 0)
      const qtyRemaining = Math.max(0, part.qty_plan - totalDone)

      const defaultRates: Record<ProductionStage, number> = {
        machining: machiningNorm?.qty_per_shift || machine?.rate_per_shift || 400,
        fitting: 500,
        galvanic: 800,
        heat_treatment: 600,
        grinding: 400,
        qc: 1000,
        logistics: 2000,
      }

      const avgPerShift = stageFactsForStage.length > 0
        ? stageFactsForStage.reduce((sum, f) => sum + f.qty_good, 0) / stageFactsForStage.length
        : defaultRates[stageStatus.stage]

      const shiftsNeeded = avgPerShift > 0 ? Math.ceil(qtyRemaining / avgPerShift) : 999

      return {
        stage: stageStatus.stage,
        qtyRemaining,
        shiftsNeeded,
        willFinishOnTime: shiftsNeeded <= shiftsRemaining,
      }
    })

    if (!hasForecastInput) {
      return {
        daysRemaining,
        shiftsRemaining,
        qtyRemaining: part.qty_plan,
        avgPerShift: machiningNorm?.qty_per_shift || machine?.rate_per_shift || 0,
        willFinishOnTime: true,
        estimatedFinishDate: part.deadline,
        shiftsNeeded: 0,
        stageForecasts,
      }
    }

    const totalShiftsNeeded = stageForecasts.reduce((sum, sf) => sum + sf.shiftsNeeded, 0)
    const machiningFacts = facts.filter((f) => f.stage === "machining")
    const avgPerShift = machiningFacts.length > 0
      ? machiningFacts.reduce((sum, f) => sum + f.qty_good, 0) / machiningFacts.length
      : (machiningNorm?.qty_per_shift || machine?.rate_per_shift || 100)

    const currentStage = activeStages.find((s) => s.status === "in_progress") || activeStages[0]
    const currentStageForecast = stageForecasts.find((sf) => sf.stage === currentStage?.stage)
    const qtyRemaining = currentStageForecast?.qtyRemaining || 0

    const daysNeeded = Math.ceil(totalShiftsNeeded / 2)
    const estimatedFinish = new Date(today)
    estimatedFinish.setDate(estimatedFinish.getDate() + daysNeeded)
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
  }, [visibleParts, machines, stageFacts, machineNorms, demoDate])

  const getMachineTodayProgress = useCallback((machineId: string) => {
    const machine = machines.find((m) => m.id === machineId)
    const todayFacts = stageFacts.filter((f) => f.date === demoDate && f.machine_id === machineId)
    const dayShift = todayFacts.find((f) => f.shift_type === "day") || null
    const nightShift = todayFacts.find((f) => f.shift_type === "night") || null

    return {
      dayShift,
      nightShift,
      totalGood: (dayShift?.qty_good || 0) + (nightShift?.qty_good || 0),
      totalScrap: (dayShift?.qty_scrap || 0) + (nightShift?.qty_scrap || 0),
      targetPerShift: machine?.rate_per_shift || 400,
    }
  }, [machines, stageFacts, demoDate])

  const getPartsForMachine = useCallback((machineId: string) => {
    return visibleParts.filter((p) => p.machine_id === machineId)
  }, [visibleParts])

  const getPartsByStage = useCallback((stage: ProductionStage) => {
    return visibleParts.filter((p) => {
      const stageStatuses = p.stage_statuses || []
      const stageStatus = stageStatuses.find((s) => s.stage === stage)
      return stageStatus && stageStatus.status !== "skipped"
    })
  }, [visibleParts])

  const getPartsInProgressAtStage = useCallback((stage: ProductionStage) => {
    return visibleParts.filter((p) => {
      const stageStatuses = p.stage_statuses || []
      const stageStatus = stageStatuses.find((s) => s.stage === stage)
      return stageStatus && stageStatus.status === "in_progress"
    })
  }, [visibleParts])

  const getCooperationParts = useCallback(() => {
    return visibleParts.filter((p) => p.is_cooperation)
  }, [visibleParts])

  const getOwnProductionParts = useCallback(() => {
    return visibleParts.filter((p) => !p.is_cooperation)
  }, [visibleParts])

  const getStageFactsForPart = useCallback((partId: string) => {
    return stageFacts.filter((f) => f.part_id === partId)
  }, [stageFacts])

  const getStageFactsForPartAndStage = useCallback((partId: string, stage: ProductionStage) => {
    return stageFacts.filter((f) => f.part_id === partId && f.stage === stage)
  }, [stageFacts])

  const isMissingShiftFact = useCallback((machineId: string, shiftType: ShiftType) => {
    return stageFacts.filter(
      (f) => f.date === demoDate && f.machine_id === machineId && f.shift_type === shiftType
    ).length === 0
  }, [stageFacts, demoDate])

  const getCurrentStage = useCallback((partId: string) => {
    const part = visibleParts.find((p) => p.id === partId)
    if (!part || !part.stage_statuses) return null

    const inProgress = part.stage_statuses.find((s) => s.status === "in_progress")
    if (inProgress) return inProgress.stage

    const pending = part.stage_statuses.find((s) => s.status === "pending")
    if (pending) return pending.stage

    return null
  }, [visibleParts])

  const getStageCompletion = useCallback((partId: string) => {
    const part = visibleParts.find((p) => p.id === partId)
    if (!part || !part.stage_statuses) return { completed: 0, total: 0, percent: 0 }

    const completed = part.stage_statuses.filter((s) => s.status === "done").length
    const total = part.stage_statuses.filter((s) => s.status !== "skipped").length

    return {
      completed,
      total,
      percent: total > 0 ? Math.round((completed / total) * 100) : 0,
    }
  }, [visibleParts])

  return {
    createPart,
    updatePart,
    deletePart,
    updatePartDrawing,
    uploadAttachment,
    updatePartStageStatus,
    createStageFact,
    updateStageFact,
    deleteStageFact,
    getMachineNorm,
    getMachineNormsForPart,
    setMachineNorm,
    getPartProgress,
    getPartForecast,
    getMachineTodayProgress,
    getPartsForMachine,
    getPartsByStage,
    getPartsInProgressAtStage,
    getCooperationParts,
    getOwnProductionParts,
    getStageFactsForPart,
    getStageFactsForPartAndStage,
    isMissingShiftFact,
    getCurrentStage,
    getStageCompletion,
  }
}
