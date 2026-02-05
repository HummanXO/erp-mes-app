/**
 * Environment helpers for API configuration.
 */

export const getApiBaseUrl = (): string => {
  if (typeof process !== "undefined" && process.env) {
    return (
      process.env.NEXT_PUBLIC_API_BASE_URL ||
      process.env.VITE_API_BASE_URL ||
      ""
    )
  }
  return ""
}

export const isApiConfigured = (): boolean => {
  return getApiBaseUrl().length > 0
}
