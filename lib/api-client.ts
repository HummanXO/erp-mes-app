/**
 * HTTP API Client for backend communication
 */

import { getApiBaseUrl } from "./env"

// Lazy initialization to avoid circular dependency issues
let _API_BASE_URL: string | null = null
function getBaseUrl(): string {
  if (_API_BASE_URL === null) {
    _API_BASE_URL = getApiBaseUrl()
  }
  return _API_BASE_URL
}

export interface ApiError {
  code: string
  message: string
  details?: any
}

export interface TokenResponse {
  access_token: string
  refresh_token?: string | null
  expires_in: number
  user: any
  must_change_password?: boolean
}

export interface AdminResetPasswordResponse {
  user: any
  temporary_password: string
  must_change_password?: boolean
  warning?: string
}

export class ApiClientError extends Error {
  constructor(
    public statusCode: number,
    public error: ApiError
  ) {
    super(error.message)
    this.name = "ApiClientError"
  }
}

function normalizeApiError(statusCode: number, payload: any, fallbackMessage: string): ApiError {
  // Backend custom shape: { error: { code, message, details } }
  if (payload?.error && typeof payload.error === "object") {
    const code = String(payload.error.code || `HTTP_${statusCode}`)
    const message = String(payload.error.message || fallbackMessage)
    return { code, message, details: payload.error.details }
  }

  // FastAPI common shape: { detail: "..." } or { detail: [{loc,msg,type}, ...] }
  if (typeof payload?.detail === "string") {
    return {
      code: `HTTP_${statusCode}`,
      message: payload.detail,
      details: payload,
    }
  }

  if (Array.isArray(payload?.detail)) {
    const detailMessages = payload.detail
      .map((item: any) => {
        const loc = Array.isArray(item?.loc) ? item.loc.join(".") : ""
        const msg = typeof item?.msg === "string" ? item.msg : "Validation error"
        return loc ? `${loc}: ${msg}` : msg
      })
      .join("; ")

    return {
      code: `HTTP_${statusCode}`,
      message: detailMessages || fallbackMessage,
      details: payload,
    }
  }

  if (typeof payload?.message === "string" && payload.message.trim().length > 0) {
    return {
      code: `HTTP_${statusCode}`,
      message: payload.message,
      details: payload,
    }
  }

  return {
    code: `HTTP_${statusCode}`,
    message: fallbackMessage,
    details: payload,
  }
}

class ApiClient {
  private baseUrl: string
  private accessToken: string | null = null
  private refreshInFlight: Promise<boolean> | null = null

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  setAccessToken(token: string | null) {
    this.accessToken = token
  }

  getAccessToken(): string | null {
    return this.accessToken
  }

  private shouldAttemptRefresh(endpoint: string): boolean {
    // Never refresh while calling auth endpoints, to avoid recursion loops.
    return endpoint !== "/auth/login" && endpoint !== "/auth/refresh"
  }

  private buildUrl(endpoint: string): string {
    const base = this.baseUrl.replace(/\/+$/, "")
    const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`
    return `${base}${path}`
  }

  private async withCrossTabRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
    // Prefer Web Locks API for cross-tab synchronization (prevents refresh-token reuse across tabs).
    const locks = typeof navigator !== "undefined" ? (navigator as any).locks : null
    if (locks && typeof locks.request === "function") {
      return await locks.request("pc.auth.refresh", { mode: "exclusive" }, fn)
    }
    return await fn()
  }

  async refresh(): Promise<boolean> {
    // Single-flight within this tab.
    if (this.refreshInFlight) return await this.refreshInFlight

    this.refreshInFlight = this.withCrossTabRefreshLock(async () => {
      try {
        const refreshUrl = this.buildUrl("/auth/refresh")
        const refreshResponse = await fetch(refreshUrl, {
          method: "POST",
          credentials: "include",
        })

        if (!refreshResponse.ok) {
          // Refresh failed; clear access token to avoid infinite retry.
          this.setAccessToken(null)
          return false
        }

        const refreshed = (await refreshResponse.json()) as TokenResponse
        if (refreshed?.access_token) this.setAccessToken(refreshed.access_token)
        return Boolean(refreshed?.access_token)
      } catch {
        this.setAccessToken(null)
        return false
      }
    })

    try {
      return await this.refreshInFlight
    } finally {
      this.refreshInFlight = null
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = this.buildUrl(endpoint)
    
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    }
    if (options.headers) {
      if (options.headers instanceof Headers) {
        options.headers.forEach((value, key) => {
          headers[key] = value
        })
      } else if (Array.isArray(options.headers)) {
        options.headers.forEach(([key, value]) => {
          headers[key] = value
        })
      } else {
        Object.entries(options.headers as Record<string, string>).forEach(([key, value]) => {
          headers[key] = value
        })
      }
    }

    if (this.accessToken) {
      headers["Authorization"] = `Bearer ${this.accessToken}`
    }

    try {
      const doFetch = () =>
        fetch(url, {
          ...options,
          headers,
          credentials: "include",
        })

      let response = await doFetch()

      // If access token expired, attempt refresh once and retry the original request.
      if (
        response.status === 401 &&
        this.shouldAttemptRefresh(endpoint) &&
        true
      ) {
        const refreshed = await this.refresh()
        if (refreshed) {
          if (this.accessToken) {
            headers["Authorization"] = `Bearer ${this.accessToken}`
          } else {
            delete headers["Authorization"]
          }
          response = await doFetch()
        }
      }

      if (!response.ok) {
        const contentType = response.headers.get("content-type") || ""
        const isJson = contentType.includes("application/json")
        const errorData = isJson ? await response.json().catch(() => null) : null
        const errorText = isJson ? "" : await response.text().catch(() => "")
        const fallback = response.statusText || `HTTP ${response.status}`
        const normalized = errorData
          ? normalizeApiError(response.status, errorData, fallback)
          : {
              code: `HTTP_${response.status}`,
              message: (errorText || fallback || "Request failed").slice(0, 500),
              details: errorText ? { raw: errorText.slice(0, 1000) } : undefined,
            }
        throw new ApiClientError(
          response.status,
          normalized
        )
      }

      // Handle 204 No Content
      if (response.status === 204) {
        return {} as T
      }

      return await response.json()
    } catch (error) {
      if (error instanceof ApiClientError) {
        throw error
      }
      
      // Network or other errors
      throw new ApiClientError(0, {
        code: "NETWORK_ERROR",
        message: error instanceof Error ? error.message : "Network error",
      })
    }
  }

  private apiOrigin(): string | null {
    if (this.baseUrl.startsWith("http://") || this.baseUrl.startsWith("https://")) {
      try {
        return new URL(this.baseUrl).origin
      } catch {
        return null
      }
    }
    return null
  }

  private normalizeAttachmentUrl(rawUrl: string): string {
    if (!rawUrl) return rawUrl
    if (rawUrl.startsWith("data:") || rawUrl.startsWith("blob:")) return rawUrl

    // Rewrite legacy /uploads/* to the authenticated endpoint.
    const rewriteUploadsPath = (pathname: string): string | null => {
      if (!pathname.startsWith("/uploads/")) return null
      const filename = pathname.split("/").pop()
      if (!filename) return null
      return `/api/v1/attachments/serve/${filename}`
    }

    if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
      try {
        const u = new URL(rawUrl)
        const rewritten = rewriteUploadsPath(u.pathname)
        if (rewritten) {
          u.pathname = rewritten
          u.search = ""
          u.hash = ""
          return u.toString()
        }
      } catch {
        return rawUrl
      }
      return rawUrl
    }

    if (rawUrl.startsWith("/uploads/")) {
      const rewritten = rewriteUploadsPath(rawUrl)
      return rewritten || rawUrl
    }

    return rawUrl
  }

  private resolveResourceUrl(rawUrl: string): string {
    const normalized = this.normalizeAttachmentUrl(rawUrl)
    if (!normalized) return normalized
    if (normalized.startsWith("http://") || normalized.startsWith("https://")) return normalized
    if (!normalized.startsWith("/")) return normalized
    const origin = this.apiOrigin()
    return origin ? `${origin}${normalized}` : normalized
  }

  async fetchBlob(rawUrl: string): Promise<Blob> {
    const url = this.resolveResourceUrl(rawUrl)
    if (!url) throw new ApiClientError(0, { code: "INVALID_URL", message: "Invalid attachment URL" })

    const headers: Record<string, string> = {}
    if (this.accessToken) headers["Authorization"] = `Bearer ${this.accessToken}`

    const doFetch = () =>
      fetch(url, {
        method: "GET",
        headers,
        credentials: "include",
      })

    let response = await doFetch()

    if (response.status === 401) {
      const refreshed = await this.refresh()
      if (refreshed && this.accessToken) {
        headers["Authorization"] = `Bearer ${this.accessToken}`
        response = await doFetch()
      }
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "")
      throw new ApiClientError(response.status, {
        code: `HTTP_${response.status}`,
        message: text || response.statusText || "Failed to fetch attachment",
        details: { url },
      })
    }

    return await response.blob()
  }

  // Auth
  async login(username: string, password: string): Promise<TokenResponse> {
    const response = await this.request<TokenResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    })
    
    // Save access token in-memory only (no localStorage/sessionStorage).
    this.setAccessToken(response.access_token)
    
    return response
  }

  async logout() {
    try {
      await this.request("/auth/logout", { method: "POST" })
    } finally {
      this.setAccessToken(null)
    }
  }

  async getMe() {
    return this.request<any>("/auth/me")
  }

  async changePassword(oldPassword: string, newPassword: string): Promise<TokenResponse> {
    const response = await this.request<TokenResponse>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
    })
    // Password change revokes old tokens; save the new tokens from response.
    this.setAccessToken(response.access_token)
    return response
  }

  // Users
  async getUsers() {
    return this.request<any>("/directory/users")
  }

  async getUsersAdmin() {
    return this.request<any>("/users")
  }

  async getUserById(id: string) {
    return this.request<any>(`/directory/users/${id}`)
  }

  async getOperators() {
    const users = await this.request<any>("/directory/users")
    const list = users.data || users
    return Array.isArray(list) ? list.filter((u: any) => u?.role === "operator") : []
  }

  async getUsersByRole(role: string) {
    const users = await this.request<any>("/directory/users")
    const list = users.data || users
    return Array.isArray(list) ? list.filter((u: any) => u?.role === role) : []
  }

  async adminResetPassword(username: string): Promise<AdminResetPasswordResponse> {
    const uname = (username || "").trim()
    return this.request<AdminResetPasswordResponse>("/auth/admin/reset-password", {
      method: "POST",
      body: JSON.stringify({ username: uname }),
    })
  }

  // Machines
  async getMachines() {
    return this.request<any>("/machines")
  }

  async getMachineById(id: string) {
    return this.request<any>(`/machines/${id}`)
  }

  // Parts
  async getParts(filters?: {
    status?: string
    is_cooperation?: boolean
    machine_id?: string
    limit?: number
    offset?: number
  }) {
    const params = new URLSearchParams()
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params.append(key, String(value))
        }
      })
    }
    const query = params.toString()
      return this.request<any>(`/parts${query ? `?${query}` : ""}`)
  }

  async getPartById(id: string) {
    return this.request<any>(`/parts/${id}`)
  }

  async getPartMovements(partId: string) {
    return this.request<any>(`/parts/${partId}/movements`)
  }

  async createMovement(partId: string, data: any) {
    return this.request<any>(`/parts/${partId}/movements`, {
      method: "POST",
      body: JSON.stringify(data),
    })
  }

  async updateMovement(movementId: string, data: any) {
    return this.request<any>(`/movements/${movementId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    })
  }

  async getPartJourney(partId: string) {
    return this.request<any>(`/parts/${partId}/journey`)
  }

  async createPart(data: any) {
    return this.request<any>("/parts", {
      method: "POST",
      body: JSON.stringify(data),
    })
  }

  async updatePart(id: string, data: any) {
    return this.request<any>(`/parts/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    })
  }

  async uploadAttachment(file: File) {
    const url = this.buildUrl("/attachments/upload")
    const headers: HeadersInit = {}

    if (this.accessToken) {
      headers["Authorization"] = `Bearer ${this.accessToken}`
    }

    const formData = new FormData()
    formData.append("file", file)

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: formData,
        credentials: "include",
      })

      if (!response.ok) {
        const contentType = response.headers.get("content-type") || ""
        const isJson = contentType.includes("application/json")
        const errorData = isJson ? await response.json().catch(() => null) : null
        const errorText = isJson ? "" : await response.text().catch(() => "")
        if (response.status === 413) {
          throw new ApiClientError(413, {
            code: "PAYLOAD_TOO_LARGE",
            message: "Файл слишком большой для сервера (лимит загрузки). Уменьшите размер файла.",
            details: errorText ? { raw: errorText.slice(0, 1000) } : undefined,
          })
        }
        const normalized = errorData
          ? normalizeApiError(response.status, errorData, response.statusText || `HTTP ${response.status}`)
          : {
              code: `HTTP_${response.status}`,
              message: (errorText || response.statusText || "Upload failed").slice(0, 500),
              details: errorText ? { raw: errorText.slice(0, 1000) } : undefined,
            }
        throw new ApiClientError(response.status, normalized)
      }

      return await response.json()
    } catch (error) {
      if (error instanceof ApiClientError) {
        throw error
      }
      throw new ApiClientError(0, {
        code: "NETWORK_ERROR",
        message: error instanceof Error ? error.message : "Network error",
      })
    }
  }

  async deletePart(id: string) {
    return this.request<void>(`/parts/${id}`, {
      method: "DELETE",
    })
  }

  // Specifications
  async getSpecifications() {
    return this.request<any>("/specifications")
  }

  async getSpecificationById(id: string) {
    return this.request<any>(`/specifications/${id}`)
  }

  async createSpecification(data: any) {
    return this.request<any>("/specifications", {
      method: "POST",
      body: JSON.stringify(data),
    })
  }

  async updateSpecification(id: string, data: any) {
    return this.request<any>(`/specifications/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    })
  }

  async setSpecificationPublished(id: string, published: boolean) {
    return this.request<any>(`/specifications/${id}/publish`, {
      method: "POST",
      body: JSON.stringify({ published }),
    })
  }

  async deleteSpecification(id: string, deleteLinkedParts = false) {
    const query = deleteLinkedParts ? "?delete_linked_parts=true" : ""
    return this.request<void>(`/specifications/${id}${query}`, {
      method: "DELETE",
    })
  }

  async getSpecItems() {
    return this.request<any>("/spec-items")
  }

  async getSpecItemsBySpecification(specificationId: string) {
    return this.request<any>(`/specifications/${specificationId}/items`)
  }

  async createSpecItem(specificationId: string, data: any) {
    return this.request<any>(`/specifications/${specificationId}/items`, {
      method: "POST",
      body: JSON.stringify(data),
    })
  }

  async updateSpecItemProgress(specItemId: string, qtyDone: number, statusOverride?: string) {
    return this.request<any>(`/spec-items/${specItemId}/progress`, {
      method: "PATCH",
      body: JSON.stringify({
        qty_done: qtyDone,
        status_override: statusOverride,
      }),
    })
  }

  async getAccessGrants(filters?: { entity_type?: string; entity_id?: string; user_id?: string }) {
    const params = new URLSearchParams()
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params.append(key, String(value))
        }
      })
    }
    const query = params.toString()
    return this.request<any>(`/access-grants${query ? `?${query}` : ""}`)
  }

  async grantAccess(data: any) {
    return this.request<any>("/access-grants", {
      method: "POST",
      body: JSON.stringify(data),
    })
  }

  async revokeAccess(grantId: string) {
    return this.request<void>(`/access-grants/${grantId}`, {
      method: "DELETE",
    })
  }

  // Stage Facts
  async createStageFact(partId: string, data: any) {
    return this.request<any>(`/parts/${partId}/facts`, {
      method: "POST",
      body: JSON.stringify(data),
    })
  }

  async updateStageFact(factId: string, data: any) {
    return this.request<any>(`/facts/${factId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    })
  }

  async deleteStageFact(factId: string) {
    return this.request<void>(`/facts/${factId}`, { method: "DELETE" })
  }

  async getPartFacts(partId: string) {
    return this.request<any>(`/parts/${partId}/facts`)
  }

  async getPartNorms(partId: string) {
    return this.request<any>(`/parts/${partId}/norms`)
  }

  async upsertPartNorm(partId: string, data: any) {
    return this.request<any>(`/parts/${partId}/norms`, {
      method: "PUT",
      body: JSON.stringify(data),
    })
  }

  // Tasks
  async getTasks(filters?: {
    status?: string
    assigned_to_me?: boolean
    created_by_me?: boolean
    is_blocker?: boolean
    part_id?: string
    unread?: boolean
    limit?: number
    offset?: number
  }) {
    const params = new URLSearchParams()
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params.append(key, String(value))
        }
      })
    }
    const query = params.toString()
    return this.request<any>(`/tasks${query ? `?${query}` : ""}`)
  }

  async getTaskById(id: string) {
    return this.request<any>(`/tasks/${id}`)
  }

  async createTask(data: any) {
    return this.request<any>("/tasks", {
      method: "POST",
      body: JSON.stringify(data),
    })
  }

  async acceptTask(id: string) {
    return this.request<any>(`/tasks/${id}/accept`, { method: "POST" })
  }

  async startTask(id: string) {
    return this.request<any>(`/tasks/${id}/start`, { method: "POST" })
  }

  async sendTaskToReview(id: string, comment?: string) {
    return this.request<any>(`/tasks/${id}/send-to-review`, {
      method: "POST",
      body: JSON.stringify({ comment }),
    })
  }

  async reviewTask(id: string, approved: boolean, comment?: string) {
    return this.request<any>(`/tasks/${id}/review`, {
      method: "POST",
      body: JSON.stringify({ approved, comment }),
    })
  }

  async addTaskComment(id: string, message: string, attachments: any[] = []) {
    return this.request<any>(`/tasks/${id}/comments`, {
      method: "POST",
      body: JSON.stringify({ message, attachments }),
    })
  }

  async markTaskAsRead(id: string) {
    return this.request<any>(`/tasks/${id}/read`, { method: "POST" })
  }

  // Audit
  async getAuditEvents(filters?: { part_id?: string; limit?: number }) {
    const params = new URLSearchParams()
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params.append(key, String(value))
        }
      })
    }
    const query = params.toString()
    return this.request<any>(`/audit-events${query ? `?${query}` : ""}`)
  }

  // System
  async getCurrentShift() {
    return this.request<any>("/system/current-shift")
  }

  async healthCheck() {
    return this.request<any>("/system/health")
  }
}

// Export lazy singleton instance
let _apiClient: ApiClient | null = null

function getApiClientInstance(): ApiClient {
  if (_apiClient === null) {
    _apiClient = new ApiClient(getBaseUrl())
  }
  return _apiClient
}

// Export as object with getters to enable lazy initialization
export const apiClient = new Proxy({} as ApiClient, {
  get: (target, prop) => {
    const instance = getApiClientInstance()
    const value = (instance as any)[prop]
    return typeof value === 'function' ? value.bind(instance) : value
  }
})
