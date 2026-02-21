/**
 * Single source of truth for runtime mode and feature capabilities.
 *
 * Mode selection is strict:
 * - API mode: NEXT_PUBLIC_API_BASE_URL is set (non-empty)
 * - DEMO mode: NEXT_PUBLIC_DEMO_MODE=true and API base URL is empty
 * - Anything else is a configuration error
 */

import { getApiBaseUrl } from "./env"

export type RuntimeMode = "api" | "demo"

export type ProviderCapability =
  | "inventory"
  | "workOrders"
  | "taskManualStatusUpdate"
  | "localDerivedReadModels"

export type ProviderCapabilities = Record<ProviderCapability, boolean>

const NODE_ENV =
  (typeof process !== "undefined" && process.env ? process.env.NODE_ENV : "") || "development"
const IS_PRODUCTION = NODE_ENV === "production"

function readDemoFlag(): boolean {
  const raw =
    (typeof process !== "undefined" && process.env
      ? process.env.NEXT_PUBLIC_DEMO_MODE || process.env.DEMO_MODE || ""
      : "") || ""
  return raw.trim().toLowerCase() === "true"
}

const API_BASE_URL = getApiBaseUrl()
const DEMO_FLAG = readDemoFlag()
const HAS_API = API_BASE_URL.length > 0

if (HAS_API && DEMO_FLAG) {
  throw new Error(
    "Ambiguous runtime mode: both NEXT_PUBLIC_API_BASE_URL and NEXT_PUBLIC_DEMO_MODE=true are set. Configure only one mode."
  )
}

if (!HAS_API) {
  if (!DEMO_FLAG) {
    throw new Error(
      "Runtime mode is not configured. Set NEXT_PUBLIC_API_BASE_URL for API mode or set NEXT_PUBLIC_DEMO_MODE=true for DEMO mode."
    )
  }
  if (IS_PRODUCTION) {
    throw new Error("DEMO mode is forbidden in production. Configure NEXT_PUBLIC_API_BASE_URL.")
  }
}

const MODE: RuntimeMode = HAS_API ? "api" : "demo"

const CAPABILITIES_BY_MODE: Record<RuntimeMode, ProviderCapabilities> = {
  api: {
    inventory: false,
    workOrders: false,
    taskManualStatusUpdate: false,
    localDerivedReadModels: false,
  },
  demo: {
    inventory: true,
    workOrders: true,
    taskManualStatusUpdate: true,
    localDerivedReadModels: true,
  },
}

const CAPABILITIES = CAPABILITIES_BY_MODE[MODE]

function assertRuntimeModeInvariants(): void {
  if (MODE === "api" && CAPABILITIES_BY_MODE.api.localDerivedReadModels) {
    throw new Error("Invariant violation: API mode must not expose local-derived read models.")
  }
  if (MODE === "api" && CAPABILITIES_BY_MODE.api.inventory) {
    throw new Error("Invariant violation: inventory capability must be disabled in API mode.")
  }
  if (MODE === "api" && CAPABILITIES_BY_MODE.api.workOrders) {
    throw new Error("Invariant violation: workOrders capability must be disabled in API mode.")
  }
}

assertRuntimeModeInvariants()

export function getRuntimeMode(): RuntimeMode {
  return MODE
}

export function isUsingApiMode(): boolean {
  return MODE === "api"
}

export function isUsingDemoMode(): boolean {
  return MODE === "demo"
}

export function getRuntimeApiBaseUrl(): string {
  return API_BASE_URL
}

export function getModeCapabilities(): ProviderCapabilities {
  return CAPABILITIES
}

export function isCapabilitySupported(capability: ProviderCapability): boolean {
  return CAPABILITIES[capability]
}
