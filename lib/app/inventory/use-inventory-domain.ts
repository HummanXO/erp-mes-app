import { useCallback } from "react"
import * as dataProvider from "../../data-provider-adapter"
import type { LogisticsEntry } from "../../types"
import type { InventoryMetalItem, InventoryMovement, InventoryToolingItem } from "../../inventory-types"

interface Params {
  logistics: LogisticsEntry[]
  refreshData: () => Promise<void>
}

export function useInventoryDomain({ logistics, refreshData }: Params) {
  const createLogisticsEntry = useCallback(async (entry: Omit<LogisticsEntry, "id">) => {
    const newEntry = await dataProvider.createLogisticsEntry(entry)
    await refreshData()
    return newEntry
  }, [refreshData])

  const updateLogisticsEntry = useCallback(async (entry: LogisticsEntry) => {
    const updated = await dataProvider.updateLogisticsEntry(entry)
    await refreshData()
    return updated
  }, [refreshData])

  const createInventoryMovement = useCallback(async (movement: Omit<InventoryMovement, "id">) => {
    const newMovement = await dataProvider.createInventoryMovement(movement)
    await refreshData()
    return newMovement
  }, [refreshData])

  const createInventoryMetal = useCallback(async (item: Omit<InventoryMetalItem, "id">) => {
    const newItem = await dataProvider.createInventoryMetal(item)
    await refreshData()
    return newItem
  }, [refreshData])

  const updateInventoryMetal = useCallback(async (item: InventoryMetalItem) => {
    await dataProvider.updateInventoryMetal(item)
    await refreshData()
  }, [refreshData])

  const createInventoryTooling = useCallback(async (item: Omit<InventoryToolingItem, "id">) => {
    const newItem = await dataProvider.createInventoryTooling(item)
    await refreshData()
    return newItem
  }, [refreshData])

  const updateInventoryTooling = useCallback(async (item: InventoryToolingItem) => {
    await dataProvider.updateInventoryTooling(item)
    await refreshData()
  }, [refreshData])

  const getLogisticsForPart = useCallback((partId: string) => {
    return logistics.filter((l) => l.part_id === partId)
  }, [logistics])

  const getJourneyForPart = useCallback(async (partId: string) => {
    const getter = (dataProvider as any).getJourneyForPart
    if (typeof getter !== "function") return null
    return await getter(partId)
  }, [])

  return {
    createLogisticsEntry,
    updateLogisticsEntry,
    createInventoryMovement,
    createInventoryMetal,
    updateInventoryMetal,
    createInventoryTooling,
    updateInventoryTooling,
    getLogisticsForPart,
    getJourneyForPart,
  }
}
