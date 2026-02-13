"use client"

import { useState } from "react"
import type { AccessGrant, AccessPermission, User } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { StatusBadge } from "@/components/inventory/status-badge"
import { EmptyStateCard } from "@/components/specifications/empty-state-card"
import { CheckCircle2, Info, ShieldPlus, X } from "lucide-react"

const PERMISSION_LABELS: Record<AccessPermission, string> = {
  view: "Только просмотр",
  report: "Отчёт по факту",
  manage: "Управление",
}

const PERMISSION_HINTS: Record<AccessPermission, string> = {
  view: "Видит спецификацию и позиции, но не может менять данные.",
  report: "Может добавлять факты выполнения по своим этапам.",
  manage: "Может редактировать позиции и управлять доступами внутри спецификации.",
}

const PERMISSION_TONES: Record<AccessPermission, "info" | "success" | "warning" | "danger"> = {
  view: "info",
  report: "warning",
  manage: "success",
}

interface SpecAccessPanelProps {
  grants: AccessGrant[]
  operators: User[]
  getUserName: (userId: string) => string
  canGrantSpecificationAccess: boolean
  onGrant: (userId: string, permission: AccessPermission) => void
  onRevoke: (grantId: string) => void
  actionBusy?: boolean
}

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleString("ru-RU")
}

export function SpecAccessPanel({
  grants,
  operators,
  getUserName,
  canGrantSpecificationAccess,
  onGrant,
  onRevoke,
  actionBusy,
}: SpecAccessPanelProps) {
  const [userId, setUserId] = useState("")
  const [permission, setPermission] = useState<AccessPermission>("view")
  const [grantModalOpen, setGrantModalOpen] = useState(false)

  const hasOperators = operators.length > 0

  const openGrantModal = () => {
    if (!canGrantSpecificationAccess || !hasOperators) return
    setGrantModalOpen(true)
  }

  const handleGrant = () => {
    if (!userId || actionBusy) return
    onGrant(userId, permission)
    setUserId("")
    setPermission("view")
    setGrantModalOpen(false)
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
          <CardTitle className="text-sm">Доступ операторов</CardTitle>
          {canGrantSpecificationAccess && (
            <Button
              variant="outline"
              className="h-11"
              onClick={openGrantModal}
              disabled={!hasOperators || actionBusy}
              aria-label="Открыть окно выдачи доступа"
            >
              <ShieldPlus className="h-4 w-4" aria-hidden="true" />
              Выдать доступ
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {!hasOperators && canGrantSpecificationAccess && (
            <div className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
              Нет пользователей с ролью «Оператор». Создайте оператора, затем выдайте доступ.
            </div>
          )}

          {grants.length === 0 ? (
            <EmptyStateCard
              title="Доступы пока не выданы"
              description={
                canGrantSpecificationAccess
                  ? "Выдайте доступ точечно, чтобы оператор видел только эту спецификацию и её позиции."
                  : "Доступ к этой спецификации пока никому не выдан."
              }
              actionLabel={canGrantSpecificationAccess ? "Выдать доступ" : "Понятно"}
              onAction={() => {
                if (!canGrantSpecificationAccess) return
                openGrantModal()
              }}
              helpLabel="Как это работает"
              disabled={!canGrantSpecificationAccess || !hasOperators}
            />
          ) : (
            <div className="space-y-2">
              {grants.map((grant) => (
                <div key={grant.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
                  <div>
                    <div className="font-medium text-sm">{getUserName(grant.user_id)}</div>
                    <div className="text-xs text-muted-foreground">{formatDateTime(grant.created_at)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge tone={PERMISSION_TONES[grant.permission]}>{PERMISSION_LABELS[grant.permission]}</StatusBadge>
                    {canGrantSpecificationAccess && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-11"
                        onClick={() => onRevoke(grant.id)}
                        disabled={actionBusy}
                        aria-label={`Отозвать доступ ${getUserName(grant.user_id)}`}
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                        Отозвать
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={grantModalOpen} onOpenChange={setGrantModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Выдать доступ оператору</DialogTitle>
            <DialogDescription>
              Если включено «Опубликовать операторам», спецификацию видят все операторы. Здесь — персональный доступ дополнительно.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <Info className="h-4 w-4" aria-hidden="true" />
                Что получит оператор
              </div>
              <div className="space-y-2 text-xs text-muted-foreground">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-[color:var(--status-success-fg)]" aria-hidden="true" />
                  Видит только эту спецификацию и связанные с ней детали.
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-[color:var(--status-success-fg)]" aria-hidden="true" />
                  Доступ можно отозвать в любой момент без удаления данных.
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="grant-operator">Оператор</Label>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger id="grant-operator" className="h-11 w-full" aria-label="Выберите оператора">
                  <SelectValue placeholder="Выберите оператора" />
                </SelectTrigger>
                <SelectContent>
                  {operators.map((operator) => (
                    <SelectItem key={operator.id} value={operator.id}>
                      {operator.initials}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="grant-permission">Уровень доступа</Label>
              <Select value={permission} onValueChange={(value) => setPermission(value as AccessPermission)}>
                <SelectTrigger id="grant-permission" className="h-11 w-full" aria-label="Выберите уровень доступа">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="view">{PERMISSION_LABELS.view}</SelectItem>
                  <SelectItem value="report">{PERMISSION_LABELS.report}</SelectItem>
                  <SelectItem value="manage">{PERMISSION_LABELS.manage}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{PERMISSION_HINTS[permission]}</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" className="h-11" onClick={() => setGrantModalOpen(false)}>
              Отмена
            </Button>
            <Button className="h-11" disabled={!userId || actionBusy} onClick={handleGrant}>
              <ShieldPlus className="h-4 w-4" aria-hidden="true" />
              Выдать доступ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
