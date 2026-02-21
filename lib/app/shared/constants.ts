import { DEFAULT_APP_PERMISSIONS, type ProductionStage } from "../../types"

export const defaultPermissions = DEFAULT_APP_PERMISSIONS

export const RISK_STAGES: ProductionStage[] = [
  "machining",
  "fitting",
  "heat_treatment",
  "galvanic",
  "grinding",
]

export const PROGRESS_STAGES: ProductionStage[] = [
  "machining",
  "fitting",
  "heat_treatment",
  "galvanic",
  "grinding",
  "qc",
]
