import { useCallback, useRef, type Dispatch, type SetStateAction } from "react"
import * as dataProvider from "../../data-provider-adapter"
import type {
  AccessGrant,
  Machine,
  MachineNorm,
  Part,
  SpecItem,
  Specification,
  StageFact,
  Task,
  User,
  WorkOrder,
  LogisticsEntry,
} from "../../types"
import type { InventoryMetalItem, InventoryMovement, InventoryToolingItem } from "../../inventory-types"

type Setter<T> = Dispatch<SetStateAction<T>>

interface Params {
  setUsers: Setter<User[]>
  setMachines: Setter<Machine[]>
  setParts: Setter<Part[]>
  setStageFacts: Setter<StageFact[]>
  setTasks: Setter<Task[]>
  setLogistics: Setter<LogisticsEntry[]>
  setMachineNorms: Setter<MachineNorm[]>
  setInventoryMetal: Setter<InventoryMetalItem[]>
  setInventoryTooling: Setter<InventoryToolingItem[]>
  setInventoryMovements: Setter<InventoryMovement[]>
  setSpecifications: Setter<Specification[]>
  setSpecItems: Setter<SpecItem[]>
  setWorkOrders: Setter<WorkOrder[]>
  setAccessGrants: Setter<AccessGrant[]>
  setDataError: Setter<string | null>
}

export function useRefreshData({
  setUsers,
  setMachines,
  setParts,
  setStageFacts,
  setTasks,
  setLogistics,
  setMachineNorms,
  setInventoryMetal,
  setInventoryTooling,
  setInventoryMovements,
  setSpecifications,
  setSpecItems,
  setWorkOrders,
  setAccessGrants,
  setDataError,
}: Params) {
  const inFlightRefreshRef = useRef<Promise<void> | null>(null)
  const rerunRequestedRef = useRef(false)

  const runRefreshPass = useCallback(async () => {
    try {
      setDataError(null)
      // API requests for parts/facts/logistics/norms in this refresh path:
      // before: 3N + 4 (N per-part calls for movements + norms + part-facts)
      // now   : 3 fixed calls (parts + facts + parts/batch/related)
      const partsPromise = Promise.resolve(dataProvider.getParts())
      const modeCapabilities = dataProvider.getModeCapabilities()
      const [
        users,
        machines,
        parts,
        facts,
        tasks,
        logistics,
        norms,
        metal,
        tooling,
        movements,
        specifications,
        specItems,
        workOrders,
        accessGrants,
      ] = await Promise.all([
        dataProvider.getUsers(),
        dataProvider.getMachines(),
        partsPromise,
        dataProvider.getStageFacts(),
        dataProvider.getTasks(),
        partsPromise.then((loadedParts: Part[]) => dataProvider.getLogistics(loadedParts)),
        partsPromise.then((loadedParts: Part[]) => dataProvider.getMachineNorms(loadedParts)),
        modeCapabilities.inventory ? dataProvider.getInventoryMetal() : Promise.resolve([]),
        modeCapabilities.inventory ? dataProvider.getInventoryTooling() : Promise.resolve([]),
        modeCapabilities.inventory ? dataProvider.getInventoryMovements() : Promise.resolve([]),
        dataProvider.getSpecifications(),
        dataProvider.getSpecItems(),
        modeCapabilities.workOrders ? dataProvider.getWorkOrders() : Promise.resolve([]),
        dataProvider.getAccessGrants(),
      ])

      setUsers(Array.isArray(users) ? users : [])
      setMachines(Array.isArray(machines) ? machines : [])
      setParts(Array.isArray(parts) ? parts : [])
      setStageFacts(Array.isArray(facts) ? facts : [])
      setTasks(Array.isArray(tasks) ? tasks : [])
      setLogistics(Array.isArray(logistics) ? logistics : [])
      setMachineNorms(Array.isArray(norms) ? norms : [])
      setInventoryMetal(Array.isArray(metal) ? metal : [])
      setInventoryTooling(Array.isArray(tooling) ? tooling : [])
      setInventoryMovements(Array.isArray(movements) ? movements : [])
      setSpecifications(Array.isArray(specifications) ? specifications : [])
      setSpecItems(Array.isArray(specItems) ? specItems : [])
      setWorkOrders(Array.isArray(workOrders) ? workOrders : [])
      setAccessGrants(Array.isArray(accessGrants) ? accessGrants : [])
    } catch (error) {
      console.error("Failed to load data:", error)
      setDataError(error instanceof Error ? error.message : "Failed to load data")
    }
  }, [
    setUsers,
    setMachines,
    setParts,
    setStageFacts,
    setTasks,
    setLogistics,
    setMachineNorms,
    setInventoryMetal,
    setInventoryTooling,
    setInventoryMovements,
    setSpecifications,
    setSpecItems,
    setWorkOrders,
    setAccessGrants,
    setDataError,
  ])

  const refreshData = useCallback(async () => {
    if (inFlightRefreshRef.current) {
      // Coalesce parallel refresh requests into a single extra pass.
      rerunRequestedRef.current = true
      await inFlightRefreshRef.current
      return
    }

    const queuedRun = (async () => {
      do {
        rerunRequestedRef.current = false
        await runRefreshPass()
      } while (rerunRequestedRef.current)
    })()

    inFlightRefreshRef.current = queuedRun

    try {
      await queuedRun
    } finally {
      inFlightRefreshRef.current = null
      rerunRequestedRef.current = false
    }
  }, [runRefreshPass])

  return refreshData
}
