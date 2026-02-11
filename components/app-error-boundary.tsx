"use client"

import React from "react"
import { Button } from "@/components/ui/button"

interface AppErrorBoundaryState {
  hasError: boolean
}

interface AppErrorBoundaryProps {
  children: React.ReactNode
}

export class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  constructor(props: AppErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    console.error("Client application error boundary:", error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-lg border p-6 space-y-3 text-center">
            <h2 className="text-lg font-semibold">Ошибка интерфейса</h2>
            <p className="text-sm text-muted-foreground">
              Произошла клиентская ошибка. Обычно помогает обновление страницы.
            </p>
            <Button className="h-11 w-full" onClick={() => window.location.reload()}>
              Обновить страницу
            </Button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
