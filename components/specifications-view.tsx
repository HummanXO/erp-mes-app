"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useApp } from "@/lib/app-context"
import type { AccessPermission, SpecificationStatus, WorkOrder } from "@/lib/types"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { SpecListPane } from "@/components/specifications/spec-list-pane"
import { SpecDetailHeader } from "@/components/specifications/spec-detail-header"
import { SpecItemsPanel } from "@/components/specifications/spec-items-panel"
import { SpecQueuePanel } from "@/components/specifications/spec-queue-panel"
import { SpecAccessPanel } from "@/components/specifications/spec-access-panel"
import { SpecItemDialog } from "@/components/specifications/spec-item-dialog"
import { HowItWorksSheet } from "@/components/specifications/how-it-works-sheet"
import type { HowItWorksTopic } from "@/components/specifications/how-it-works-sheet"
import { Plus } from "lucide-react"

export function SpecificationsView() {
  const {
    currentUser,
    permissions,
    users,
    machines,
    dataError,
    createSpecification,
    setSpecificationPublished,
    deleteSpecification,
    createWorkOrdersForSpecification,
    queueWorkOrder,
    startWorkOrder,
    blockWorkOrder,
    reportWorkOrderProgress,
    completeWorkOrder,
    grantAccess,
    revokeAccess,
    getSpecificationsForCurrentUser,
    getSpecItemsBySpecification,
    getWorkOrdersForSpecification,
    getWorkOrdersForCurrentUser,
    getAccessGrantsForSpecification,
    getPartById,
    getMachineById,
    getUserById,
  } = useApp()

  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<SpecificationStatus | "all">("all")
  const [selectedSpecificationId, setSelectedSpecificationId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [newSpecNumber, setNewSpecNumber] = useState("")
  const [newSpecCustomer, setNewSpecCustomer] = useState("")
  const [newSpecDeadline, setNewSpecDeadline] = useState("")
  const [newSpecNote, setNewSpecNote] = useState("")

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteLinkedParts, setDeleteLinkedParts] = useState(false)

  const [addItemOpen, setAddItemOpen] = useState(false)

  const [howItWorksOpen, setHowItWorksOpen] = useState(false)
  const [howItWorksTopic, setHowItWorksTopic] = useState<HowItWorksTopic>("general")

  const queueRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 180)
    return () => clearTimeout(timer)
  }, [])

  const runAction = async (callback: () => Promise<void>) => {
    try {
      setActionError(null)
      setActionBusy(true)
      await callback()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Операция не выполнена")
    } finally {
      setActionBusy(false)
    }
  }

  const allSpecifications = useMemo(() => getSpecificationsForCurrentUser(), [getSpecificationsForCurrentUser])

  const filteredSpecifications = useMemo(() => {
    let list = [...allSpecifications]
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      list = list.filter((specification) =>
        [specification.number, specification.customer, specification.note]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(query))
      )
    }
    if (statusFilter !== "all") {
      list = list.filter((specification) => specification.status === statusFilter)
    }
    return list.sort((a, b) => b.created_at.localeCompare(a.created_at))
  }, [allSpecifications, searchQuery, statusFilter])

  useEffect(() => {
    if (filteredSpecifications.length === 0) {
      setSelectedSpecificationId(null)
      return
    }
    if (!selectedSpecificationId || !filteredSpecifications.some((specification) => specification.id === selectedSpecificationId)) {
      setSelectedSpecificationId(filteredSpecifications[0].id)
    }
  }, [filteredSpecifications, selectedSpecificationId])

  const selectedSpecification = useMemo(
    () => filteredSpecifications.find((specification) => specification.id === selectedSpecificationId) ?? null,
    [filteredSpecifications, selectedSpecificationId]
  )

  const selectedSpecItems = useMemo(
    () => (selectedSpecification ? getSpecItemsBySpecification(selectedSpecification.id) : []),
    [selectedSpecification, getSpecItemsBySpecification]
  )

  const selectedWorkOrders = useMemo(() => {
    if (!selectedSpecification) return []
    if (currentUser?.role === "operator") {
      const allowed = new Set(getWorkOrdersForCurrentUser().map((order) => order.id))
      return getWorkOrdersForSpecification(selectedSpecification.id).filter((order) => allowed.has(order.id))
    }
    return getWorkOrdersForSpecification(selectedSpecification.id)
  }, [selectedSpecification, currentUser?.role, getWorkOrdersForCurrentUser, getWorkOrdersForSpecification])

  const selectedGrants = useMemo(
    () => (selectedSpecification ? getAccessGrantsForSpecification(selectedSpecification.id) : []),
    [selectedSpecification, getAccessGrantsForSpecification]
  )

  const canManageSpecifications = permissions.canManageSpecifications
  const canManageWorkOrders = permissions.canManageWorkOrders
  const isOperator = currentUser?.role === "operator"

  const canStartOrder = (order: WorkOrder): boolean => {
    if (canManageWorkOrders) return true
    if (!isOperator || !currentUser) return false
    if (order.status !== "queued" && order.status !== "backlog") return false
    return !order.assigned_operator_id || order.assigned_operator_id === currentUser.id
  }

  const canReportOrder = (order: WorkOrder): boolean => {
    if (canManageWorkOrders) return true
    if (!isOperator || !currentUser) return false
    if (order.status !== "in_progress") return false
    return !order.assigned_operator_id || order.assigned_operator_id === currentUser.id
  }

  const openPartDetails = (partId: string) => {
    sessionStorage.setItem("pc.navigate.partId", partId)
    window.dispatchEvent(new CustomEvent("pc-open-part", { detail: { partId } }))
  }

  const handleCreateSpecification = async () => {
    if (!currentUser || !newSpecNumber.trim()) {
      setActionError("Укажите номер спецификации")
      return
    }

    await runAction(async () => {
      const created = await createSpecification({
        specification: {
          number: newSpecNumber.trim(),
          customer: newSpecCustomer.trim() || undefined,
          deadline: newSpecDeadline || undefined,
          note: newSpecNote.trim() || undefined,
          status: "draft",
          published_to_operators: false,
          created_by: currentUser.id,
        },
        items: [],
      })

      setSelectedSpecificationId(created.id)
      setCreateOpen(false)
      setNewSpecNumber("")
      setNewSpecCustomer("")
      setNewSpecDeadline("")
      setNewSpecNote("")
    })
  }

  const handleCreateJobs = async () => {
    if (!selectedSpecification) return
    await runAction(async () => {
      await createWorkOrdersForSpecification(selectedSpecification.id)
    })
  }

  const handleTogglePublished = (published: boolean) => {
    if (!selectedSpecification) return
    void runAction(async () => {
      await setSpecificationPublished(selectedSpecification.id, published)
    })
  }

  const handleDeleteSpecification = () => {
    if (!selectedSpecification) return
    const targetId = selectedSpecification.id
    void runAction(async () => {
      await deleteSpecification(targetId, deleteLinkedParts)
      setDeleteOpen(false)
      setDeleteLinkedParts(false)
      const next = filteredSpecifications.find((specification) => specification.id !== targetId)
      setSelectedSpecificationId(next?.id ?? null)
    })
  }

  const handleOpenQueue = () => {
    queueRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const handleSetReady = (orderId: string, machineId: string) => {
    void runAction(async () => {
      await queueWorkOrder(orderId, machineId)
    })
  }

  const handleStart = (orderId: string) => {
    void runAction(async () => {
      await startWorkOrder(orderId, currentUser?.id)
    })
  }

  const handleReport = (orderId: string) => {
    const goodRaw = window.prompt("Сколько годных добавить?", "0")
    if (goodRaw === null) return
    const qtyGood = Number(goodRaw.replace(",", "."))
    if (!Number.isFinite(qtyGood) || qtyGood < 0) {
      setActionError("Количество годных должно быть числом >= 0")
      return
    }

    const scrapRaw = window.prompt("Сколько брака добавить?", "0")
    if (scrapRaw === null) return
    const qtyScrap = Number(scrapRaw.replace(",", "."))
    if (!Number.isFinite(qtyScrap) || qtyScrap < 0) {
      setActionError("Количество брака должно быть числом >= 0")
      return
    }

    void runAction(async () => {
      await reportWorkOrderProgress(orderId, qtyGood, qtyScrap)
    })
  }

  const handleBlock = (orderId: string) => {
    const reason = window.prompt("Причина блокировки")
    if (!reason || !reason.trim()) return
    void runAction(async () => {
      await blockWorkOrder(orderId, reason.trim())
    })
  }

  const handleComplete = (orderId: string) => {
    void runAction(async () => {
      await completeWorkOrder(orderId)
    })
  }

  const openHowItWorks = (topic: HowItWorksTopic) => {
    setHowItWorksTopic(topic)
    setHowItWorksOpen(true)
  }

  if (!permissions.canViewSpecifications) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          У вас нет доступа к разделу спецификаций
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Спецификации</h1>
          <p className="text-sm text-muted-foreground">
            Сначала добавьте позиции, затем создайте задания и запустите очередь без обязательных дат
          </p>
        </div>
        {canManageSpecifications && (
          <Button className="h-11" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Новая спецификация
          </Button>
        )}
      </div>

      {actionError && (
        <div className="rounded-md border border-[color:var(--status-danger-border)] bg-[color:var(--status-danger-bg)] px-3 py-2 text-sm text-[color:var(--status-danger-fg)]" aria-live="polite">
          {actionError}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <SpecListPane
          specifications={filteredSpecifications}
          selectedId={selectedSpecificationId}
          onSelect={setSelectedSpecificationId}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          isLoading={isLoading}
          error={dataError}
        />

        <div className="space-y-4">
          {!selectedSpecification ? (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                Выберите спецификацию в списке или создайте новую
              </CardContent>
            </Card>
          ) : (
            <>
              <SpecDetailHeader
                specification={selectedSpecification}
                itemCount={selectedSpecItems.length}
                workOrderCount={selectedWorkOrders.length}
                canManageSpecifications={canManageSpecifications}
                actionBusy={actionBusy}
                onTogglePublished={handleTogglePublished}
                onAddItem={() => setAddItemOpen(true)}
                onCreateJobs={() => void handleCreateJobs()}
                onOpenQueue={handleOpenQueue}
                onDelete={() => setDeleteOpen(true)}
              />

              <SpecItemsPanel
                items={selectedSpecItems}
                onAddItem={() => setAddItemOpen(true)}
                onHelp={() => openHowItWorks("items")}
                onOpenPart={openPartDetails}
              />

              <div ref={queueRef}>
                <SpecQueuePanel
                  workOrders={selectedWorkOrders}
                  machines={machines}
                  getPartTitle={(partId) => {
                    const part = getPartById(partId)
                    return part ? `${part.code} ${part.name}` : partId
                  }}
                  getMachineName={(machineId) => {
                    const machine = machineId ? getMachineById(machineId) : undefined
                    return machine?.name ?? "Не назначен"
                  }}
                  getOperatorName={(operatorId) => {
                    const user = operatorId ? getUserById(operatorId) : undefined
                    return user?.initials ?? "Не назначен"
                  }}
                  onCreateOrders={() => void handleCreateJobs()}
                  onHelp={() => openHowItWorks("queue")}
                  onSetReady={handleSetReady}
                  onStart={handleStart}
                  onReport={handleReport}
                  onBlock={handleBlock}
                  onComplete={handleComplete}
                  canManageWorkOrders={canManageWorkOrders}
                  canStartOrder={canStartOrder}
                  canReportOrder={canReportOrder}
                  actionBusy={actionBusy}
                />
              </div>

              <SpecAccessPanel
                grants={selectedGrants}
                operators={users.filter((user) => user.role === "operator")}
                getUserName={(userId) => getUserById(userId)?.initials ?? userId}
                canManageSpecifications={canManageSpecifications}
                onGrant={(userId, permission) => {
                  if (!selectedSpecification) return
                  void runAction(async () => {
                    await grantAccess("specification", selectedSpecification.id, userId, permission)
                  })
                }}
                onRevoke={(grantId) => {
                  void runAction(async () => {
                    await revokeAccess(grantId)
                  })
                }}
                onHelp={() => openHowItWorks("access")}
                actionBusy={actionBusy}
              />
            </>
          )}
        </div>
      </div>

      {selectedSpecification && (
        <SpecItemDialog
          open={addItemOpen}
          onOpenChange={setAddItemOpen}
          specificationId={selectedSpecification.id}
          defaultCustomer={selectedSpecification.customer}
          defaultDeadline={selectedSpecification.deadline}
        />
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Новая спецификация</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-2">
              <Label htmlFor="spec-number">Номер *</Label>
              <Input
                id="spec-number"
                className="h-11"
                placeholder="SP-2026-003"
                value={newSpecNumber}
                onChange={(event) => setNewSpecNumber(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="spec-customer">Клиент</Label>
              <Input
                id="spec-customer"
                className="h-11"
                placeholder="ООО Заказчик"
                value={newSpecCustomer}
                onChange={(event) => setNewSpecCustomer(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="spec-deadline">Дедлайн спецификации</Label>
              <Input
                id="spec-deadline"
                className="h-11"
                type="date"
                value={newSpecDeadline}
                onChange={(event) => setNewSpecDeadline(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="spec-note">Примечание</Label>
              <Textarea
                id="spec-note"
                rows={2}
                placeholder="Комментарий к заказу"
                value={newSpecNote}
                onChange={(event) => setNewSpecNote(event.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" className="h-11" onClick={() => setCreateOpen(false)}>
              Отмена
            </Button>
            <Button className="h-11" onClick={() => void handleCreateSpecification()} disabled={actionBusy}>
              Создать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open)
          if (!open) setDeleteLinkedParts(false)
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Удалить спецификацию</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-sm text-muted-foreground">
              Спецификация <span className="font-medium text-foreground">{selectedSpecification?.number ?? "—"}</span> будет удалена вместе с позициями, заданиями и доступами операторов.
            </p>
            <div className="rounded-md border p-3">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="delete-linked-parts"
                  checked={deleteLinkedParts}
                  onCheckedChange={(checked) => setDeleteLinkedParts(Boolean(checked))}
                />
                <div className="space-y-1">
                  <Label htmlFor="delete-linked-parts" className="text-sm font-medium">
                    Удалить связанные детали каскадом
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Удаляются только детали, которые больше не используются в других спецификациях/заданиях.
                  </p>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-11" onClick={() => setDeleteOpen(false)}>
              Отмена
            </Button>
            <Button className="h-11" onClick={handleDeleteSpecification} disabled={actionBusy}>
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <HowItWorksSheet open={howItWorksOpen} onOpenChange={setHowItWorksOpen} topic={howItWorksTopic} />
    </div>
  )
}
