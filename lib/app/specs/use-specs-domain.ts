import { useCallback } from "react"
import * as dataProvider from "../../data-provider-adapter"
import type {
  AccessEntityType,
  AccessGrant,
  AccessPermission,
  SpecItem,
  Specification,
  SpecItemStatus,
  User,
  WorkOrder,
} from "../../types"

interface Params {
  currentUser: User | null
  specifications: Specification[]
  specItems: SpecItem[]
  workOrders: WorkOrder[]
  accessGrants: AccessGrant[]
  operatorVisibleSpecificationIds: Set<string>
  refreshData: () => Promise<void>
}

export function useSpecsDomain({
  currentUser,
  specifications,
  specItems,
  workOrders,
  accessGrants,
  operatorVisibleSpecificationIds,
  refreshData,
}: Params) {
  const createSpecification = useCallback(async (
    payload: {
      specification: Omit<Specification, "id" | "created_at">
      items: Array<Omit<SpecItem, "id" | "specification_id" | "line_no" | "qty_done" | "status">>
    }
  ) => {
    const specification = await dataProvider.createSpecification(payload)
    await refreshData()
    return specification
  }, [refreshData])

  const createSpecItem = useCallback(async (
    specificationId: string,
    item: Omit<SpecItem, "id" | "specification_id" | "line_no" | "qty_done" | "status">
  ) => {
    const created = await dataProvider.createSpecItem(specificationId, item)
    await refreshData()
    return created
  }, [refreshData])

  const updateSpecification = useCallback(async (specification: Specification) => {
    await dataProvider.updateSpecification(specification)
    await refreshData()
  }, [refreshData])

  const setSpecificationPublished = useCallback(async (specificationId: string, published: boolean) => {
    await dataProvider.setSpecificationPublished(specificationId, published)
    await refreshData()
  }, [refreshData])

  const deleteSpecification = useCallback(async (specificationId: string, deleteLinkedParts = false) => {
    await dataProvider.deleteSpecification(specificationId, deleteLinkedParts)
    await refreshData()
  }, [refreshData])

  const updateSpecItemProgress = useCallback(async (
    specItemId: string,
    qtyDone: number,
    statusOverride?: SpecItemStatus
  ) => {
    await dataProvider.updateSpecItemProgress(specItemId, qtyDone, statusOverride)
    await refreshData()
  }, [refreshData])

  const createWorkOrdersForSpecification = useCallback(async (specificationId: string) => {
    if (!currentUser) return []
    const created = await dataProvider.createWorkOrdersForSpecification(specificationId, currentUser.id)
    await refreshData()
    return created
  }, [currentUser, refreshData])

  const createWorkOrder = useCallback(async (order: Omit<WorkOrder, "id" | "created_at">) => {
    const workOrder = await dataProvider.createWorkOrder(order)
    await refreshData()
    return workOrder
  }, [refreshData])

  const updateWorkOrder = useCallback(async (order: WorkOrder) => {
    await dataProvider.updateWorkOrder(order)
    await refreshData()
  }, [refreshData])

  const queueWorkOrder = useCallback(async (workOrderId: string, machineId: string, queuePos?: number) => {
    await dataProvider.queueWorkOrder(workOrderId, machineId, queuePos)
    await refreshData()
  }, [refreshData])

  const startWorkOrder = useCallback(async (workOrderId: string, operatorId?: string) => {
    await dataProvider.startWorkOrder(workOrderId, operatorId)
    await refreshData()
  }, [refreshData])

  const blockWorkOrder = useCallback(async (workOrderId: string, reason: string) => {
    await dataProvider.blockWorkOrder(workOrderId, reason)
    await refreshData()
  }, [refreshData])

  const reportWorkOrderProgress = useCallback(async (workOrderId: string, qtyGood: number, qtyScrap = 0) => {
    await dataProvider.reportWorkOrderProgress(workOrderId, qtyGood, qtyScrap)
    await refreshData()
  }, [refreshData])

  const completeWorkOrder = useCallback(async (workOrderId: string) => {
    await dataProvider.completeWorkOrder(workOrderId)
    await refreshData()
  }, [refreshData])

  const grantAccess = useCallback(async (
    entityType: AccessEntityType,
    entityId: string,
    userId: string,
    permission: AccessPermission
  ) => {
    if (!currentUser) return null
    const grant = await dataProvider.grantAccess(entityType, entityId, userId, permission, currentUser.id)
    await refreshData()
    return grant
  }, [currentUser, refreshData])

  const revokeAccess = useCallback(async (grantId: string) => {
    await dataProvider.revokeAccess(grantId)
    await refreshData()
  }, [refreshData])

  const getSpecificationsForCurrentUser = useCallback(() => {
    if (!currentUser) return []
    if (currentUser.role !== "operator") return specifications
    return specifications.filter((spec) => operatorVisibleSpecificationIds.has(spec.id))
  }, [currentUser, specifications, operatorVisibleSpecificationIds])

  const getSpecItemsBySpecification = useCallback((specificationId: string) => {
    return specItems
      .filter((item) => item.specification_id === specificationId)
      .sort((a, b) => a.line_no - b.line_no)
  }, [specItems])

  const getWorkOrdersForCurrentUser = useCallback(() => {
    if (!currentUser) return []
    if (currentUser.role !== "operator") return workOrders

    const specGrantIds = new Set(
      accessGrants
        .filter((grant) => grant.user_id === currentUser.id && grant.entity_type === "specification")
        .map((grant) => grant.entity_id)
    )
    const workOrderGrantIds = new Set(
      accessGrants
        .filter((grant) => grant.user_id === currentUser.id && grant.entity_type === "work_order")
        .map((grant) => grant.entity_id)
    )
    const publishedSpecIds = new Set(
      specifications
        .filter((spec) => spec.published_to_operators)
        .map((spec) => spec.id)
    )

    return workOrders.filter((order) =>
      order.assigned_operator_id === currentUser.id ||
      specGrantIds.has(order.specification_id) ||
      publishedSpecIds.has(order.specification_id) ||
      workOrderGrantIds.has(order.id)
    )
  }, [currentUser, workOrders, accessGrants, specifications])

  const getWorkOrdersForSpecification = useCallback((specificationId: string) => {
    return workOrders
      .filter((order) => order.specification_id === specificationId)
      .sort((a, b) => (a.queue_pos ?? 9999) - (b.queue_pos ?? 9999))
  }, [workOrders])

  const getAccessGrantsForSpecification = useCallback((specificationId: string) => {
    return accessGrants.filter(
      (grant) => grant.entity_type === "specification" && grant.entity_id === specificationId
    )
  }, [accessGrants])

  return {
    createSpecification,
    createSpecItem,
    updateSpecification,
    setSpecificationPublished,
    deleteSpecification,
    updateSpecItemProgress,
    createWorkOrdersForSpecification,
    createWorkOrder,
    updateWorkOrder,
    queueWorkOrder,
    startWorkOrder,
    blockWorkOrder,
    reportWorkOrderProgress,
    completeWorkOrder,
    grantAccess,
    revokeAccess,
    getSpecificationsForCurrentUser,
    getSpecItemsBySpecification,
    getWorkOrdersForCurrentUser,
    getWorkOrdersForSpecification,
    getAccessGrantsForSpecification,
  }
}
