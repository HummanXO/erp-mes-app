"use client"

import { useEffect, useMemo, useState } from "react"
import { apiClient, ApiClientError } from "@/lib/api-client"
import { ROLE_LABELS } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2 } from "lucide-react"

type AdminUserRow = {
  id: string
  username: string
  name: string
  initials: string
  role: keyof typeof ROLE_LABELS
  is_active: boolean
}

function mapResetError(err: unknown): string {
  if (!(err instanceof ApiClientError)) {
    return err instanceof Error ? err.message : "Не удалось сбросить пароль."
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
  if (err.statusCode === 400 || err.statusCode === 404 || err.statusCode === 409) {
    // Generic on purpose (avoid enumeration / leaking details).
    return "Не удалось сбросить пароль. Проверьте данные и повторите."
  }

  return msg || "Не удалось сбросить пароль."
}

export function ResetPasswordDialog({
  open,
  user,
  onOpenChange,
  onResetDone,
}: {
  open: boolean
  user: AdminUserRow | null
  onOpenChange: (open: boolean) => void
  onResetDone?: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const displayName = useMemo(() => {
    if (!user) return ""
    const role = ROLE_LABELS[user.role] ?? user.role
    return `${user.username} (${user.initials}, ${role})`
  }, [user])

  useEffect(() => {
    if (open) return
    // Wipe sensitive data on close (one-time display).
    setLoading(false)
    setError("")
    setTemporaryPassword(null)
    setCopied(false)
  }, [open])

  const doClose = () => onOpenChange(false)

  const handleCopy = async () => {
    if (!temporaryPassword) return
    try {
      await navigator.clipboard.writeText(temporaryPassword)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      setCopied(false)
      setError("Не удалось скопировать пароль. Скопируйте вручную.")
    }
  }

  const handleReset = async () => {
    if (!user) return
    setError("")
    setLoading(true)
    try {
      const resp = await apiClient.adminResetPassword(user.username)
      // Do not persist: keep only in memory, wipe on close.
      setTemporaryPassword(String(resp.temporary_password || ""))
      onResetDone?.()
    } catch (e) {
      setError(mapResetError(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Сброс пароля пользователя</DialogTitle>
          <DialogDescription>
            {user ? (
              <span>
                Пользователь: <span className="font-medium">{displayName}</span>
              </span>
            ) : (
              "Выберите пользователя."
            )}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!temporaryPassword ? (
          <div className="space-y-3">
            <Alert>
              <AlertTitle>Подтверждение</AlertTitle>
              <AlertDescription>
                Это действие сбросит пароль пользователя, отзовёт активные сессии и потребует смену пароля при следующем входе.
              </AlertDescription>
            </Alert>
          </div>
        ) : (
          <div className="space-y-3">
            <Alert variant="destructive">
              <AlertTitle>Временный пароль (показывается один раз)</AlertTitle>
              <AlertDescription>
                После закрытия этого окна пароль нельзя будет посмотреть снова. Передайте пароль пользователю по безопасному каналу. Не сохраняйте в заметках/чатах.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label htmlFor="temp-password">Временный пароль</Label>
              <div className="flex gap-2">
                <Input
                  id="temp-password"
                  value={temporaryPassword}
                  readOnly
                  autoFocus
                />
                <Button type="button" variant="outline" onClick={handleCopy}>
                  {copied ? "Скопировано" : "Скопировать"}
                </Button>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {!temporaryPassword ? (
            <>
              <Button type="button" variant="outline" onClick={doClose} disabled={loading}>
                Отмена
              </Button>
              <Button type="button" onClick={handleReset} disabled={loading || !user}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Сбросить пароль
              </Button>
            </>
          ) : (
            <Button type="button" onClick={doClose}>
              Закрыть
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

