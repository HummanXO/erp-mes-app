"use client"

import { useEffect, useMemo, useState } from "react"
import { useApp } from "@/lib/app-context"
import type { SpecificationStatus } from "@/lib/types"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { SpecListPane } from "@/components/specifications/spec-list-pane"
import { SpecDetailHeader } from "@/components/specifications/spec-detail-header"
import { SpecItemsPanel } from "@/components/specifications/spec-items-panel"
import { SpecAccessPanel } from "@/components/specifications/spec-access-panel"
import { HowItWorksSheet } from "@/components/specifications/how-it-works-sheet"
import type { HowItWorksTopic } from "@/components/specifications/how-it-works-sheet"
import { DeleteConfirmationModal } from "@/components/specifications/modals/delete-confirmation-modal"
import { NewPositionModal } from "@/components/specifications/modals/new-position-modal"
import { NewSpecificationModal } from "@/components/specifications/modals/new-specification-modal"
import { Plus } from "lucide-react"

interface SpecificationsViewProps {
  selectedSpecificationId?: string | null
  onSelectSpecification?: (id: string) => void
  onOpenPart?: (partId: string) => void
}

export function SpecificationsView({
  selectedSpecificationId: controlledSelectedSpecificationId,
  onSelectSpecification,
  onOpenPart,
}: SpecificationsViewProps = {}) {
  const {
    currentUser,
    permissions,
    users,
    dataError,
    createSpecification,
    setSpecificationPublished,
    deleteSpecification,
    deleteSpecItem,
    grantAccess,
    revokeAccess,
    getSpecificationsForCurrentUser,
    getSpecItemsBySpecification,
    getPartById,
    getAccessGrantsForSpecification,
    getUserById,
  } = useApp()

  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<SpecificationStatus | "all">("all")
  const [internalSelectedSpecificationId, setInternalSelectedSpecificationId] = useState<string | null>(null)
  const isControlled = controlledSelectedSpecificationId !== undefined
  const selectedSpecificationId = isControlled ? controlledSelectedSpecificationId : internalSelectedSpecificationId
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
  const [deleteItemOpen, setDeleteItemOpen] = useState(false)
  const [deleteItemTarget, setDeleteItemTarget] = useState<{ id: string; label: string } | null>(null)

  const [addItemOpen, setAddItemOpen] = useState(false)

  const [howItWorksOpen, setHowItWorksOpen] = useState(false)
  const [howItWorksTopic, setHowItWorksTopic] = useState<HowItWorksTopic>("general")

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
      if (!isControlled) {
        setInternalSelectedSpecificationId(null)
      }
      return
    }
    if (!selectedSpecificationId || !filteredSpecifications.some((specification) => specification.id === selectedSpecificationId)) {
      const nextId = filteredSpecifications[0].id
      if (isControlled) {
        if (onSelectSpecification) {
          onSelectSpecification(nextId)
        }
      } else {
        setInternalSelectedSpecificationId(nextId)
      }
    }
  }, [filteredSpecifications, selectedSpecificationId, isControlled, onSelectSpecification])

  const selectedSpecification = useMemo(
    () => filteredSpecifications.find((specification) => specification.id === selectedSpecificationId) ?? null,
    [filteredSpecifications, selectedSpecificationId]
  )

  const selectedSpecItems = useMemo(
    () => (selectedSpecification ? getSpecItemsBySpecification(selectedSpecification.id) : []),
    [selectedSpecification, getSpecItemsBySpecification]
  )
  const isOperator = currentUser?.role === "operator"
  const isMaster = currentUser?.role === "master"
  const isSupply = currentUser?.role === "supply"
  const selectedSpecItemsForView = useMemo(() => {
    if (permissions.canViewCooperation) return selectedSpecItems
    return selectedSpecItems.filter((item) => {
      if (item.item_type === "coop") return false
      if (!item.part_id) return false
      const part = getPartById(item.part_id)
      return Boolean(part && !part.is_cooperation)
    })
  }, [getPartById, permissions.canViewCooperation, selectedSpecItems])

  const selectedGrants = useMemo(
    () => (selectedSpecification ? getAccessGrantsForSpecification(selectedSpecification.id) : []),
    [selectedSpecification, getAccessGrantsForSpecification]
  )

  const canManageSpecifications = permissions.canManageSpecifications
  const canGrantSpecificationAccess = permissions.canGrantSpecificationAccess

  const pageTitle = isOperator ? "Мои задачи" : isSupply ? "Кооперация" : "Спецификации"
  const pageDescription = isOperator
    ? "Позиции в работе"
    : isSupply
      ? "Контроль внешних поставщиков"
      : isMaster
        ? "Мониторинг производства"
        : "Управление производственными спецификациями"

  const handleSelectSpecification = (id: string | null) => {
    if (!id) {
      if (!isControlled) {
        setInternalSelectedSpecificationId(null)
      }
      return
    }
    if (onSelectSpecification) {
      onSelectSpecification(id)
      return
    }
    setInternalSelectedSpecificationId(id)
  }

  const openPartDetails = (partId: string) => {
    if (onOpenPart) {
      onOpenPart(partId)
      return
    }
    sessionStorage.setItem("pc.navigate.partId", partId)
    sessionStorage.setItem("pc.navigate.sourceView", "specifications")
    window.dispatchEvent(new CustomEvent("pc-open-part", { detail: { partId, sourceView: "specifications" } }))
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

      handleSelectSpecification(created.id)
      setCreateOpen(false)
      setNewSpecNumber("")
      setNewSpecCustomer("")
      setNewSpecDeadline("")
      setNewSpecNote("")
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
      handleSelectSpecification(next?.id ?? null)
    })
  }

  const handleDeleteSpecItem = () => {
    if (!selectedSpecification || !deleteItemTarget) return

    void runAction(async () => {
      await deleteSpecItem(selectedSpecification.id, deleteItemTarget.id)
      setDeleteItemOpen(false)
      setDeleteItemTarget(null)
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
    <>
      <div className="min-h-[70vh] rounded-lg bg-gray-50">
        <div className="flex h-full flex-col overflow-hidden lg:flex-row">
          <div className="w-full border-b border-gray-200 bg-white p-4 lg:w-96 lg:border-b-0 lg:border-r lg:p-6 xl:w-[28rem]">
            <div className="space-y-4 lg:space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 lg:text-3xl">{pageTitle}</h1>
                <p className="text-sm text-gray-600">{pageDescription}</p>
              </div>

              {canManageSpecifications && (
                <Button className="h-11 w-full" onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Новая спецификация
                </Button>
              )}

              <SpecListPane
                specifications={filteredSpecifications}
                selectedId={selectedSpecificationId}
                onSelect={handleSelectSpecification}
                showFilters
                searchQuery={searchQuery}
                onSearchQueryChange={setSearchQuery}
                statusFilter={statusFilter}
                onStatusFilterChange={setStatusFilter}
                isLoading={isLoading}
                error={dataError}
                getItemCount={(specificationId) => getSpecItemsBySpecification(specificationId).length}
              />
            </div>
          </div>

          <main className="flex-1 overflow-y-auto p-4 lg:p-6 xl:p-8">
            <div className="mx-auto max-w-7xl space-y-4 lg:space-y-6">
              {actionError && (
                <div className="rounded-md border border-[color:var(--status-danger-border)] bg-[color:var(--status-danger-bg)] px-3 py-2 text-sm text-[color:var(--status-danger-fg)]" aria-live="polite">
                  {actionError}
                </div>
              )}

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
                    itemCount={selectedSpecItemsForView.length}
                    canManageSpecifications={canManageSpecifications}
                    actionBusy={actionBusy}
                    onTogglePublished={handleTogglePublished}
                    onAddItem={() => setAddItemOpen(true)}
                    onDelete={() => setDeleteOpen(true)}
                  />

                  <SpecItemsPanel
                    items={selectedSpecItemsForView}
                    canManageSpecifications={canManageSpecifications}
                    showFilters
                    onAddItem={() => setAddItemOpen(true)}
                    onHelp={() => openHowItWorks("items")}
                    onOpenPart={openPartDetails}
                    onDeleteItem={(specItemId, partCode) => {
                      setDeleteItemTarget({ id: specItemId, label: partCode })
                      setDeleteItemOpen(true)
                    }}
                  />

                  {!isOperator && canGrantSpecificationAccess && (
                    <SpecAccessPanel
                      grants={selectedGrants}
                      operators={users.filter((user) => user.role === "operator")}
                      getUserName={(userId) => getUserById(userId)?.initials ?? userId}
                      canGrantSpecificationAccess={canGrantSpecificationAccess}
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
                      actionBusy={actionBusy}
                    />
                  )}
                </>
              )}
            </div>
          </main>
        </div>
      </div>

      {selectedSpecification && (
        <NewPositionModal
          open={addItemOpen}
          onOpenChange={setAddItemOpen}
          specificationId={selectedSpecification.id}
          defaultCustomer={selectedSpecification.customer}
          defaultDeadline={selectedSpecification.deadline}
          enabled={canManageSpecifications}
        />
      )}

      <NewSpecificationModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        number={newSpecNumber}
        customer={newSpecCustomer}
        deadline={newSpecDeadline}
        note={newSpecNote}
        onNumberChange={setNewSpecNumber}
        onCustomerChange={setNewSpecCustomer}
        onDeadlineChange={setNewSpecDeadline}
        onNoteChange={setNewSpecNote}
        onCreate={() => void handleCreateSpecification()}
        busy={actionBusy}
      />

      <DeleteConfirmationModal
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open)
          if (!open) setDeleteLinkedParts(false)
        }}
        title="Удалить спецификацию?"
        description="Это действие нельзя отменить. Спецификация будет удалена вместе с позициями и доступами операторов."
        itemName={selectedSpecification?.number}
        withCascadeOption
        cascadeChecked={deleteLinkedParts}
        onCascadeCheckedChange={setDeleteLinkedParts}
        onConfirm={handleDeleteSpecification}
        busy={actionBusy}
      />

      <DeleteConfirmationModal
        open={deleteItemOpen}
        onOpenChange={(open) => {
          setDeleteItemOpen(open)
          if (!open) setDeleteItemTarget(null)
        }}
        title="Удалить позицию?"
        description="Это действие нельзя отменить. Позиция будет удалена из спецификации."
        itemName={deleteItemTarget?.label}
        onConfirm={handleDeleteSpecItem}
        busy={actionBusy}
      />

      <HowItWorksSheet open={howItWorksOpen} onOpenChange={setHowItWorksOpen} topic={howItWorksTopic} />
    </>
  )
}
