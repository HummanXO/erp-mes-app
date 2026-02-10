"use client"

import React from "react"
import { Cog, Wrench, Zap, Flame, CircleDot, CheckSquare, Truck } from "lucide-react"
import type { ProductionStage } from "./types"

export const STAGE_ICONS: Record<ProductionStage, React.ReactNode> = {
  machining: <Cog className="h-4 w-4" />,
  fitting: <Wrench className="h-4 w-4" />,
  galvanic: <Zap className="h-4 w-4" />,
  heat_treatment: <Flame className="h-4 w-4" />,
  grinding: <CircleDot className="h-4 w-4" />,
  qc: <CheckSquare className="h-4 w-4" />,
  logistics: <Truck className="h-4 w-4" />,
}
