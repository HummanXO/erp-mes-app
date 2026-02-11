"use client"

import { useState } from "react"
import type { AccessGrant, AccessPermission, User } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { StatusBadge } from "@/components/inventory/status-badge"
import { EmptyStateCard } from "@/components/specifications/empty-state-card"
import { ShieldPlus, X } from "lucide-react"

const PERMISSION_LABELS: Record<AccessPermission, string> = {
  view: "Только просмотр",
  report: "Отчёт по факту",
  manage: "Управление",
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
  canManageSpecifications: boolean
  onGrant: (userId: string, permission: AccessPermission) => void
  onRevoke: (grantId: string) => void
  onHelp: () => void
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
  canManageSpecifications,
  onGrant,
  onRevoke,
  onHelp,
  actionBusy,
}: SpecAccessPanelProps) {
  const [userId, setUserId] = useState("")
  const [permission, setPermission] = useState<AccessPermission>("view")

  if (grants.length === 0 && !canManageSpecifications) {
    return (
      <EmptyStateCard
        title="Доступы операторов не выданы"
        description="Здесь можно выдать доступ к этой спецификации для конкретных операторов."
        actionLabel="Как работает"
        onAction={onHelp}
        onHelp={onHelp}
      />
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Доступ операторов</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {canManageSpecifications && (
          <div className="grid gap-2 rounded-lg border p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger className="h-11 w-full">
                <SelectValue placeholder="Оператор" />
              </SelectTrigger>
              <SelectContent>
                {operators.map((operator) => (
                  <SelectItem key={operator.id} value={operator.id}>
                    {operator.initials}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={permission} onValueChange={(value) => setPermission(value as AccessPermission)}>
              <SelectTrigger className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="view">{PERMISSION_LABELS.view}</SelectItem>
                <SelectItem value="report">{PERMISSION_LABELS.report}</SelectItem>
                <SelectItem value="manage">{PERMISSION_LABELS.manage}</SelectItem>
              </SelectContent>
            </Select>

            <Button
              className="h-11"
              disabled={!userId || actionBusy}
              onClick={() => {
                onGrant(userId, permission)
                setUserId("")
                setPermission("view")
              }}
            >
              <ShieldPlus className="h-4 w-4" aria-hidden="true" />
              Выдать
            </Button>
          </div>
        )}

        {grants.length === 0 ? (
          <EmptyStateCard
            title="Доступы операторов не выданы"
            description="Выдавайте доступ точечно, чтобы оператор видел только нужные задания."
            actionLabel={canManageSpecifications ? "Выдать доступ" : "Понятно"}
            onAction={() => {
              if (!canManageSpecifications) return
            }}
            onHelp={onHelp}
            disabled={!canManageSpecifications}
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
                  {canManageSpecifications && (
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
  )
}
