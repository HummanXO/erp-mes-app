/**
 * Environment helpers for API configuration.
 */

export const getApiBaseUrl = (): string => {
  const configured =
    (typeof process !== "undefined" && process.env
      ? process.env.NEXT_PUBLIC_API_BASE_URL || process.env.VITE_API_BASE_URL || ""
      : "") || ""

  if (!configured) return ""

  // On HTTPS pages never use explicit HTTP API URL (browser blocks it as mixed content).
  if (
    typeof window !== "undefined" &&
    window.location.protocol === "https:" &&
    configured.startsWith("http://")
  ) {
    try {
      const parsed = new URL(configured)
      return `https://${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}`
    } catch {
      return configured.replace(/^http:\/\//, "https://")
    }
  }

  // Keep relative URLs untouched (recommended: /api/v1)
  if (configured.startsWith("/")) {
    return configured
  }

  if (typeof process !== "undefined" && process.env) {
    return configured
  }
  return configured
}

export const isApiConfigured = (): boolean => {
  return getApiBaseUrl().length > 0
}
