import { useCallback, useEffect, type Dispatch, type SetStateAction } from "react"
import type { User } from "../../types"
import * as dataProvider from "../../data-provider-adapter"
import { ApiClientError } from "../../api-client"
import { awaitCriticalRefresh } from "../shared/refresh-invariants"

interface Params {
  users: User[]
  setCurrentUser: Dispatch<SetStateAction<User | null>>
  setPasswordChangeRequiredUser: Dispatch<SetStateAction<User | null>>
  setDemoDateState: Dispatch<SetStateAction<string>>
  setIsInitialized: Dispatch<SetStateAction<boolean>>
  refreshData: () => Promise<void>
}

export function useAuthDomain({
  users,
  setCurrentUser,
  setPasswordChangeRequiredUser,
  setDemoDateState,
  setIsInitialized,
  refreshData,
}: Params) {
  useEffect(() => {
    let isMounted = true

    const init = async () => {
      dataProvider.initializeData()

      if (dataProvider.isUsingApi()) {
        if (dataProvider.restoreSession) {
          try {
            const user = await dataProvider.restoreSession()
            if (isMounted && user) {
              if (Boolean((user as any).must_change_password)) {
                setPasswordChangeRequiredUser(user)
                setCurrentUser(null)
              } else {
                setPasswordChangeRequiredUser(null)
                setCurrentUser(user)
                if (dataProvider.resolveApiCapabilities) {
                  await dataProvider.resolveApiCapabilities()
                }
                await awaitCriticalRefresh(refreshData, "auth:init:restoreSession")
              }
            }
          } catch (e) {
            if (!(e instanceof ApiClientError && (e.statusCode === 401 || e.statusCode === 403))) {
              console.error("Failed to restore session", e)
            }
          }
        }
      } else {
        setPasswordChangeRequiredUser(null)
        const user = dataProvider.getCurrentUser()
        setCurrentUser(user)
        await awaitCriticalRefresh(refreshData, "auth:init:demoSession")
      }

      const date = dataProvider.getDemoDate()
      setDemoDateState(date)
      setIsInitialized(true)
    }

    void init()

    return () => {
      isMounted = false
    }
    // Preserve existing one-time init behavior.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const login = useCallback((userId: string) => {
    if (dataProvider.isUsingApi()) {
      throw new Error("Direct login by userId is not available in API mode")
    }
    dataProvider.setCurrentUser(userId)
    setPasswordChangeRequiredUser(null)
    setCurrentUser(users.find((u) => u.id === userId) || null)
  }, [setCurrentUser, setPasswordChangeRequiredUser, users])

  const loginWithCredentials = useCallback(async (username: string, password: string) => {
    if (!dataProvider.login) {
      throw new Error("Login not available in localStorage mode")
    }

    const response = await dataProvider.login(username, password)
    const user = response?.user as User | undefined
    const mustChange = Boolean(response?.must_change_password ?? (user as any)?.must_change_password)

    if (!user) {
      throw new Error("Invalid login response")
    }

    if (mustChange) {
      setPasswordChangeRequiredUser(user)
      setCurrentUser(null)
      return
    }

    setPasswordChangeRequiredUser(null)
    setCurrentUser(user)
    if (dataProvider.resolveApiCapabilities) {
      await dataProvider.resolveApiCapabilities()
    }
    await awaitCriticalRefresh(refreshData, "auth:loginWithCredentials")
  }, [refreshData, setCurrentUser, setPasswordChangeRequiredUser])

  const completePasswordChange = useCallback(async (user: User) => {
    setPasswordChangeRequiredUser(null)
    setCurrentUser(user)
    if (dataProvider.resolveApiCapabilities) {
      await dataProvider.resolveApiCapabilities()
    }
    await awaitCriticalRefresh(refreshData, "auth:completePasswordChange")
  }, [refreshData, setCurrentUser, setPasswordChangeRequiredUser])

  const logout = useCallback(async () => {
    if (dataProvider.logout) {
      await dataProvider.logout()
    }
    dataProvider.setCurrentUser(null)
    setPasswordChangeRequiredUser(null)
    setCurrentUser(null)
  }, [setCurrentUser, setPasswordChangeRequiredUser])

  const setDemoDate = useCallback((date: string) => {
    dataProvider.setDemoDate(date)
    setDemoDateState(date)
  }, [setDemoDateState])

  const resetData = useCallback(async () => {
    dataProvider.resetData()
    setPasswordChangeRequiredUser(null)
    setCurrentUser(null)
    setDemoDateState(dataProvider.getDemoDate())
    await awaitCriticalRefresh(refreshData, "auth:resetData")
  }, [refreshData, setCurrentUser, setDemoDateState, setPasswordChangeRequiredUser])

  return {
    login,
    loginWithCredentials,
    completePasswordChange,
    logout,
    setDemoDate,
    resetData,
  }
}
