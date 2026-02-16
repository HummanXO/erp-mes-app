/**
 * Environment helpers for API configuration.
 */

function normalizeApiBaseUrl(value: string): string {
  const raw = value.trim()
  if (!raw) return ""

  const stripTrailing = (input: string): string => {
    const stripped = input.replace(/\/+$/, "")
    if (!stripped && input.startsWith("/")) return "/"
    return stripped || input
  }

  // Keep relative URLs (recommended: /api/v1) and just normalize trailing slash.
  if (raw.startsWith("/")) {
    return stripTrailing(raw)
  }

  // Absolute URL: normalize path and drop query/hash from base URL.
  try {
    const parsed = new URL(raw)
    const pathname = stripTrailing(parsed.pathname || "/")
    return `${parsed.origin}${pathname === "/" ? "" : pathname}`
  } catch {
    return stripTrailing(raw)
  }
}

export const getApiBaseUrl = (): string => {
  const configured =
    (typeof process !== "undefined" && process.env
      ? process.env.NEXT_PUBLIC_API_BASE_URL || process.env.VITE_API_BASE_URL || ""
      : "") || ""

  if (!configured) return ""
  const normalized = normalizeApiBaseUrl(configured)

  // On HTTPS pages never use explicit HTTP API URL (browser blocks it as mixed content).
  if (
    typeof window !== "undefined" &&
    window.location.protocol === "https:" &&
    normalized.startsWith("http://")
  ) {
    try {
      const parsed = new URL(normalized)
      const pathname = parsed.pathname && parsed.pathname !== "/" ? parsed.pathname : ""
      return `https://${parsed.host}${pathname}`
    } catch {
      return normalized.replace(/^http:\/\//, "https://")
    }
  }

  if (normalized.startsWith("/")) {
    return normalized
  }

  if (typeof process !== "undefined" && process.env) {
    return normalized
  }
  return normalized
}

export const isApiConfigured = (): boolean => {
  return getApiBaseUrl().length > 0
}
