import { useCallback } from "react"
import type { Machine, Part, User } from "../../types"

interface Params {
  users: User[]
  machines: Machine[]
  visibleParts: Part[]
}

export function useLookupSelectors({ users, machines, visibleParts }: Params) {
  const getUserById = useCallback((id: string) => {
    return users.find((u) => u.id === id)
  }, [users])

  const getMachineById = useCallback((id: string) => {
    return machines.find((m) => m.id === id)
  }, [machines])

  const getPartById = useCallback((id: string) => {
    return visibleParts.find((p) => p.id === id)
  }, [visibleParts])

  const getOperators = useCallback(() => {
    return users.filter((u) => u.role === "operator")
  }, [users])

  return {
    getUserById,
    getMachineById,
    getPartById,
    getOperators,
  }
}
