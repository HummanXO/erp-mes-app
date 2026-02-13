"use client"

import { useApp } from "@/lib/app-context"
import { ROLE_LABELS } from "@/lib/types"
import type { UserRole } from "@/lib/types"
import * as dataProvider from "@/lib/data-provider-adapter"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Users, Shield, Factory, Wrench, UserCog, Truck } from "lucide-react"

const ROLE_ICONS: Record<UserRole, typeof Shield> = {
  admin: Shield,
  director: UserCog,
  chief_engineer: UserCog,
  shop_head: Factory,
  supply: Truck,
  master: Wrench,
  operator: Users,
}

export function LoginPage() {
  const { users, login } = useApp()
  const demoMode = dataProvider.isDemoMode()

  // Group users by role
  const usersByRole = users.reduce((acc, user) => {
    if (!acc[user.role]) acc[user.role] = []
    acc[user.role].push(user)
    return acc
  }, {} as Record<string, typeof users>)

  const roleOrder: UserRole[] = ["admin", "director", "chief_engineer", "shop_head", "supply", "master", "operator"]

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Контроль производства</CardTitle>
          <CardDescription>Выберите пользователя для входа</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {demoMode && (
            <Alert variant="destructive">
              <AlertTitle className="text-base">
                DEMO MODE: нет реальной аутентификации
              </AlertTitle>
              <AlertDescription className="text-sm">
                Приложение запущено без backend API. Любой пользователь может войти без пароля.
                Никогда не используйте этот режим в продакшене.
              </AlertDescription>
            </Alert>
          )}
          {roleOrder.map(role => {
            const roleUsers = usersByRole[role]
            if (!roleUsers) return null
            const Icon = ROLE_ICONS[role]
            
            return (
              <div key={role} className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Icon className="h-4 w-4" />
                  {ROLE_LABELS[role]}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {roleUsers.map(user => (
                    <Button
                      key={user.id}
                      variant="outline"
                      className="justify-start h-auto py-3 bg-transparent"
                      onClick={() => login(user.id)}
                    >
                      <div className="text-left">
                        <div className="font-medium">{user.initials}</div>
                      </div>
                    </Button>
                  ))}
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
