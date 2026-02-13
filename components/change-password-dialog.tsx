"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, Loader2 } from "lucide-react"

const PASSWORD_MIN_LENGTH = 12
const PASSWORD_MAX_LENGTH = 256

interface ChangePasswordDialogProps {
  open: boolean
  onPasswordChanged: () => void
  onChangePassword: (oldPassword: string, newPassword: string) => Promise<void>
}

export function ChangePasswordDialog({
  open,
  onPasswordChanged,
  onChangePassword,
}: ChangePasswordDialogProps) {
  const [oldPassword, setOldPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    // Validation
    if (!oldPassword || !newPassword || !confirmPassword) {
      setError("Все поля обязательны")
      return
    }

    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      setError(`Новый пароль должен быть не менее ${PASSWORD_MIN_LENGTH} символов`)
      return
    }

    if (newPassword.length > PASSWORD_MAX_LENGTH) {
      setError(`Новый пароль должен быть не более ${PASSWORD_MAX_LENGTH} символов`)
      return
    }

    if (newPassword !== confirmPassword) {
      setError("Пароли не совпадают")
      return
    }

    if (newPassword === oldPassword) {
      setError("Новый пароль должен отличаться от текущего")
      return
    }

    setLoading(true)

    try {
      await onChangePassword(oldPassword, newPassword)
      onPasswordChanged()
    } catch (err: any) {
      setError(err.message || "Ошибка смены пароля")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Смена пароля обязательна</DialogTitle>
            <DialogDescription>
              Вы входите в систему впервые. Пожалуйста, установите свой личный пароль.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="old-password">Текущий пароль</Label>
              <Input
                id="old-password"
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="Введите текущий пароль"
                disabled={loading}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-password">Новый пароль</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={`Минимум ${PASSWORD_MIN_LENGTH} символов`}
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Подтвердите новый пароль</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Введите пароль ещё раз"
                disabled={loading}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={loading} className="w-full">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Сменить пароль
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
