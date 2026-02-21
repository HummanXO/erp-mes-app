import { useMemo } from "react"
import type { AccessGrant, Part, SpecItem, Specification, User } from "../../types"
import type { AppPermissions } from "../context-types"

interface Params {
  currentUser: User | null
  permissions: AppPermissions
  accessGrants: AccessGrant[]
  specifications: Specification[]
  specItems: SpecItem[]
  parts: Part[]
}

export function useVisibility({
  currentUser,
  permissions,
  accessGrants,
  specifications,
  specItems,
  parts,
}: Params) {
  const operatorVisibleSpecificationIds = useMemo(() => {
    if (!currentUser || currentUser.role !== "operator") return new Set<string>()
    const ids = new Set(
      accessGrants
        .filter((grant) => grant.user_id === currentUser.id && grant.entity_type === "specification")
        .map((grant) => grant.entity_id)
    )
    for (const specification of specifications) {
      if (specification.published_to_operators) {
        ids.add(specification.id)
      }
    }
    return ids
  }, [currentUser, accessGrants, specifications])

  const visiblePartIds = useMemo(() => {
    if (!currentUser) return new Set<string>()

    if (permissions.canManageSpecifications) {
      return new Set(parts.map((part) => part.id))
    }

    const specLinkedPartIds = new Set(
      specItems
        .map((item) => item.part_id)
        .filter((partId): partId is string => Boolean(partId))
    )

    if (currentUser.role === "operator") {
      const grantedPartIds = new Set<string>()
      for (const item of specItems) {
        if (!item.part_id) continue
        if (operatorVisibleSpecificationIds.has(item.specification_id)) {
          grantedPartIds.add(item.part_id)
        }
      }
      return grantedPartIds
    }

    if (!permissions.canViewSpecifications) {
      return new Set(parts.filter((part) => !specLinkedPartIds.has(part.id)).map((part) => part.id))
    }

    return new Set(parts.map((part) => part.id))
  }, [
    currentUser,
    permissions.canManageSpecifications,
    permissions.canViewSpecifications,
    parts,
    specItems,
    operatorVisibleSpecificationIds,
  ])

  const visibleParts = useMemo(
    () => parts.filter((part) => visiblePartIds.has(part.id)),
    [parts, visiblePartIds]
  )

  return {
    operatorVisibleSpecificationIds,
    visiblePartIds,
    visibleParts,
  }
}
