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

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
    // Load token from localStorage
    if (typeof window !== "undefined") {
      this.accessToken = localStorage.getItem("access_token")
    }
  }

  setAccessToken(token: string | null) {
    this.accessToken = token
    if (typeof window !== "undefined") {
      if (token) {
        localStorage.setItem("access_token", token)
      } else {
        localStorage.removeItem("access_token")
      }
    }
  }

  getAccessToken(): string | null {
    return this.accessToken
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    
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
      const response = await fetch(url, {
        ...options,
        headers,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        throw new ApiClientError(
          response.status,
          normalizeApiError(response.status, errorData, response.statusText || "Request failed")
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

  // Auth
  async login(username: string, password: string) {
    const response = await this.request<any>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    })
    
    // Save tokens
    this.setAccessToken(response.access_token)
    if (response.refresh_token) {
      localStorage.setItem("refresh_token", response.refresh_token)
    }
    
    return response
  }

  async logout() {
    try {
      await this.request("/auth/logout", { method: "POST" })
    } finally {
      this.setAccessToken(null)
      localStorage.removeItem("refresh_token")
    }
  }

  async getMe() {
    return this.request<any>("/auth/me")
  }

  async changePassword(oldPassword: string, newPassword: string) {
    return this.request<any>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
    })
  }

  // Users
  async getUsers() {
    return this.request<any>("/users")
  }

  async getUserById(id: string) {
    return this.request<any>(`/users/${id}`)
  }

  async getOperators() {
    return this.request<any>("/users/operators")
  }

  async getUsersByRole(role: string) {
    return this.request<any>(`/users/by-role/${role}`)
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
    const url = `${this.baseUrl}/attachments/upload`
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
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          error: {
            code: "UNKNOWN_ERROR",
            message: response.statusText,
          },
        }))
        throw new ApiClientError(response.status, errorData.error || errorData)
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
