"use client"

import { useEffect, useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { InventoryOverview } from "@/components/inventory/inventory-overview"
import { InventoryMetal } from "@/components/inventory/inventory-metal"
import { InventoryTooling } from "@/components/inventory/inventory-tooling"
import { InventoryMovements } from "@/components/inventory/inventory-movements"
import { useApp } from "@/lib/app-context"
import * as dataProvider from "@/lib/data-provider-adapter"
import { Card, CardContent } from "@/components/ui/card"

export function InventoryView() {
  const { permissions } = useApp()
  const inventorySupported = dataProvider.isCapabilitySupported("inventory")
  const usingApi = dataProvider.isUsingApi()
  const fullInventoryTabs = !usingApi
  const [tab, setTab] = useState(fullInventoryTabs ? "overview" : "movements")

  useEffect(() => {
    if (!fullInventoryTabs && tab !== "movements") {
      setTab("movements")
    }
  }, [fullInventoryTabs, tab])

  if (!inventorySupported) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          {usingApi
            ? "Раздел Склад недоступен: backend не подтвердил inventory capability для API-режима."
            : "Раздел Склад недоступен в текущем режиме."}
        </CardContent>
      </Card>
    )
  }

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
          {usingApi ? "Журнал движений и операции склада через API" : "Учёт металла, оснастки и движений"}
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <div className="overflow-x-auto overflow-y-hidden py-1">
          <TabsList className="h-10 md:h-9 w-max min-w-full justify-start">
            {fullInventoryTabs && <TabsTrigger value="overview" className="flex-none shrink-0">Обзор</TabsTrigger>}
            {fullInventoryTabs && <TabsTrigger value="metal" className="flex-none shrink-0">Металл</TabsTrigger>}
            {fullInventoryTabs && <TabsTrigger value="tooling" className="flex-none shrink-0">Оснастка</TabsTrigger>}
            <TabsTrigger value="movements" className="flex-none shrink-0">Движения</TabsTrigger>
          </TabsList>
        </div>

        {fullInventoryTabs && (
          <TabsContent value="overview">
            <InventoryOverview />
          </TabsContent>
        )}
        {fullInventoryTabs && (
          <TabsContent value="metal">
            <InventoryMetal />
          </TabsContent>
        )}
        {fullInventoryTabs && (
          <TabsContent value="tooling">
            <InventoryTooling />
          </TabsContent>
        )}
        <TabsContent value="movements">
          <InventoryMovements />
        </TabsContent>
      </Tabs>
    </div>
  )
}
