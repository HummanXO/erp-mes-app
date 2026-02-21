import type { RuntimeMode } from "./runtime-mode"

export class ProviderOperationError extends Error {
  readonly code = "UNSUPPORTED_OPERATION"
  readonly operation: string
  readonly mode: RuntimeMode
  readonly capability?: string

  constructor(params: {
    operation: string
    mode: RuntimeMode
    capability?: string
    message?: string
  }) {
    const capabilityPart = params.capability ? ` (capability: ${params.capability})` : ""
    super(
      params.message ??
      `Operation "${params.operation}" is not supported in ${params.mode.toUpperCase()} mode${capabilityPart}.`
    )
    this.name = "ProviderOperationError"
    this.operation = params.operation
    this.mode = params.mode
    this.capability = params.capability
  }
}
