"use client"

import { useEffect, useState } from "react"
import { useApp } from "@/lib/app-context"
import { apiClient, ApiClientError } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2 } from "lucide-react"
import { ChangePasswordDialog } from "./change-password-dialog"

export function LoginPageApi() {
  const { loginWithCredentials, passwordChangeRequiredUser, completePasswordChange } = useApp()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [showChangePassword, setShowChangePassword] = useState(false)

  useEffect(() => {
    if (passwordChangeRequiredUser) {
      // User is authenticated but blocked until password change.
      setUsername(passwordChangeRequiredUser.username)
      setShowChangePassword(true)
    } else {
      setShowChangePassword(false)
    }
  }, [passwordChangeRequiredUser])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      // Single login call (no duplicate POST /auth/login).
      await loginWithCredentials(username, password)
    } catch (err) {
      if (err instanceof ApiClientError) {
        const msg = String(err.error?.message || "")
        if (err.statusCode === 403 && /csrf|origin/i.test(msg)) {
          setError(
            "Сервер отклонил запрос из-за CSRF/Origin allowlist. Проверьте ALLOWED_ORIGINS/CSRF_TRUSTED_ORIGINS на бэкенде."
          )
        } else if (err.statusCode === 401) {
          setError("Неверный логин или пароль")
        } else {
          setError(msg || "Ошибка авторизации")
        }
      } else {
        setError(err instanceof Error ? err.message : "Ошибка авторизации")
      }
    } finally {
      setLoading(false)
    }
  }

  const handlePasswordChanged = async (oldPassword: string, newPassword: string) => {
    const response = await apiClient.changePassword(oldPassword, newPassword)
    await completePasswordChange(response.user)
  }

  const onPasswordChangedSuccess = () => {
    setShowChangePassword(false)
    setPassword("")
  }

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Контроль производства</CardTitle>
          <CardDescription>Войдите в систему</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Логин</Label>
              <Input
                id="username"
                type="text"
                placeholder="Логин"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Пароль</Label>
              <Input
                id="password"
                type="password"
                placeholder="Пароль"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                required
              />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Войти
            </Button>
          </form>
        </CardContent>
      </Card>
      
      {/* Change password dialog */}
      <ChangePasswordDialog
        open={showChangePassword}
        onPasswordChanged={onPasswordChangedSuccess}
        onChangePassword={handlePasswordChanged}
      />
    </div>
  )
}
