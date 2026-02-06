"use client"

import { useState } from "react"
import { useApp } from "@/lib/app-context"
import { apiClient } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2 } from "lucide-react"
import { ChangePasswordDialog } from "./change-password-dialog"

export function LoginPageApi() {
  const { loginWithCredentials } = useApp()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [temporaryPassword, setTemporaryPassword] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const response = await apiClient.login(username, password)
      
      // Check if password change is required
      if (response.must_change_password) {
        setTemporaryPassword(password)
        setShowChangePassword(true)
        setLoading(false)
      } else {
        // Normal login flow
        await loginWithCredentials(username, password)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка авторизации")
      setLoading(false)
    }
  }

  const handlePasswordChanged = async (oldPassword: string, newPassword: string) => {
    await apiClient.changePassword(oldPassword, newPassword)
    // После смены пароля логинимся с новым паролем
    await loginWithCredentials(username, newPassword)
  }

  const onPasswordChangedSuccess = () => {
    setShowChangePassword(false)
    setPassword("")
    setTemporaryPassword("")
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
                placeholder="admin"
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
                placeholder="••••••••"
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
