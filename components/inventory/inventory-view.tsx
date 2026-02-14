"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { InventoryOverview } from "@/components/inventory/inventory-overview"
import { InventoryMetal } from "@/components/inventory/inventory-metal"
import { InventoryTooling } from "@/components/inventory/inventory-tooling"
import { InventoryMovements } from "@/components/inventory/inventory-movements"
import { useApp } from "@/lib/app-context"
import { Card, CardContent } from "@/components/ui/card"

export function InventoryView() {
  const { permissions } = useApp()
  const [tab, setTab] = useState("overview")

  if (!permissions.canViewInventory) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          У вас нет доступа к разделу Склад
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Склад</h1>
        <p className="text-sm text-muted-foreground">
          Учёт металла, оснастки и движений
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <div className="overflow-x-auto overflow-y-hidden py-1">
          <TabsList className="h-10 md:h-9 w-max min-w-full justify-start">
            <TabsTrigger value="overview" className="flex-none shrink-0">Обзор</TabsTrigger>
            <TabsTrigger value="metal" className="flex-none shrink-0">Металл</TabsTrigger>
            <TabsTrigger value="tooling" className="flex-none shrink-0">Оснастка</TabsTrigger>
            <TabsTrigger value="movements" className="flex-none shrink-0">Движения</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview">
          <InventoryOverview />
        </TabsContent>
        <TabsContent value="metal">
          <InventoryMetal />
        </TabsContent>
        <TabsContent value="tooling">
          <InventoryTooling />
        </TabsContent>
        <TabsContent value="movements">
          <InventoryMovements />
        </TabsContent>
      </Tabs>
    </div>
  )
}
