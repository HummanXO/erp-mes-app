/**
 * HTTP API Client for backend communication
 */

import { getApiBaseUrl } from "./env"

const API_BASE_URL = getApiBaseUrl()

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
    
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      ...options.headers,
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
        const errorData = await response.json().catch(() => ({
          error: {
            code: "UNKNOWN_ERROR",
            message: response.statusText,
          },
        }))

        throw new ApiClientError(response.status, errorData.error || errorData)
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

  // Stage Facts
  async createStageFact(partId: string, data: any) {
    return this.request<any>(`/parts/${partId}/facts`, {
      method: "POST",
      body: JSON.stringify(data),
    })
  }

  async getPartFacts(partId: string) {
    return this.request<any>(`/parts/${partId}/facts`)
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

  // System
  async getCurrentShift() {
    return this.request<any>("/system/current-shift")
  }

  async healthCheck() {
    return this.request<any>("/system/health")
  }
}

// Export singleton instance
export const apiClient = new ApiClient(API_BASE_URL)
