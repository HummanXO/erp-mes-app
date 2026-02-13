"use client"

import { useEffect, useMemo, useState } from "react"
import { useApp } from "@/lib/app-context"
import { apiClient, ApiClientError } from "@/lib/api-client"
import { ROLE_LABELS } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2, Users } from "lucide-react"
import { ResetPasswordDialog } from "@/components/reset-password-dialog"

type AdminUserRow = {
  id: string
  username: string
  name: string
  initials: string
  role: keyof typeof ROLE_LABELS
  is_active: boolean
  must_change_password?: boolean
}

function mapListError(err: unknown): string {
  if (!(err instanceof ApiClientError)) {
    return err instanceof Error ? err.message : "Не удалось загрузить список пользователей."
  }
  const msg = String(err.error?.message || "")
  if (err.statusCode === 403 && /csrf|origin/i.test(msg)) {
    return "Сервер отклонил запрос из-за CSRF/Origin allowlist. Проверьте настройки ALLOWED_ORIGINS/CSRF_TRUSTED_ORIGINS."
  }
  if (err.statusCode === 403) {
    return "Доступ запрещён: требуются права администратора."
  }
  if (err.statusCode === 401) {
    return "Сессия истекла. Войдите заново."
  }
  if (err.statusCode >= 500) {
    return "Ошибка сервера. Повторите позже."
  }
  return msg || "Не удалось загрузить список пользователей."
}

export function AdminUsersView() {
  const { permissions } = useApp()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [users, setUsers] = useState<AdminUserRow[]>([])
  const [selectedUser, setSelectedUser] = useState<AdminUserRow | null>(null)
  const [resetOpen, setResetOpen] = useState(false)

  const canManage = Boolean(permissions?.canManageUsers)

  const sortedUsers = useMemo(() => {
    const list = [...users]
    list.sort((a, b) => (a.username || "").localeCompare(b.username || ""))
    return list
  }, [users])

  const load = async () => {
    setError("")
    setLoading(true)
    try {
      const resp = await apiClient.getUsersAdmin()
      const list = resp?.data || resp
      setUsers(Array.isArray(list) ? (list as AdminUserRow[]) : [])
    } catch (e) {
      setError(mapListError(e))
      setUsers([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!canManage) {
      setLoading(false)
      return
    }
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage])

  const openReset = (u: AdminUserRow) => {
    setSelectedUser(u)
    setResetOpen(true)
  }

  if (!canManage) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Пользователи
          </CardTitle>
          <CardDescription>Управление пользователями доступно только администраторам.</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTitle>Доступ запрещён</AlertTitle>
            <AlertDescription>Требуются права администратора (canManageUsers).</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader className="space-y-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Пользователи
              </CardTitle>
              <CardDescription>
                Сброс пароля выполняется через временный пароль. Пользователь обязан сменить его при следующем входе.
              </CardDescription>
            </div>
            <Button type="button" variant="outline" onClick={load} disabled={loading}>
              Обновить
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Загрузка пользователей…
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Логин</TableHead>
                  <TableHead>Имя</TableHead>
                  <TableHead>Роль</TableHead>
                  <TableHead>Активен</TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      Пользователи не найдены.
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedUsers.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.username}</TableCell>
                      <TableCell>{u.name}</TableCell>
                      <TableCell>{ROLE_LABELS[u.role] ?? u.role}</TableCell>
                      <TableCell>{u.is_active ? "Да" : "Нет"}</TableCell>
                      <TableCell className="text-right">
                        <Button type="button" variant="outline" size="sm" onClick={() => openReset(u)}>
                          Сбросить пароль
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ResetPasswordDialog
        open={resetOpen}
        user={selectedUser}
        onOpenChange={setResetOpen}
        onResetDone={load}
      />
    </>
  )
}

