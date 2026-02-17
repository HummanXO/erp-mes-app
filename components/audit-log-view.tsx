"use client"

import React from "react"

import { useEffect, useMemo, useState } from "react"
import {
  AUDIT_ACTION_LABELS,
  getAllAuditEntries,
  getAuditEntriesForPart,
  type AuditAction,
  type AuditEntityType,
  type AuditEntry,
} from "@/lib/audit-log"
import { isUsingApi } from "@/lib/data-provider-adapter"
import { apiClient } from "@/lib/api-client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Filter, RefreshCw, Search } from "lucide-react"
import { cn } from "@/lib/utils"

interface AuditLogViewProps {
  partId?: string
  compact?: boolean
}

type ActionFilter = "all" | "tasks" | "facts" | "comments" | "logistics"

type GroupKey = "today" | "this_week" | "older"

const GROUP_LABELS: Record<GroupKey, string> = {
  today: "Today",
  this_week: "This week",
  older: "Older",
}

const ENTITY_TYPE_LABELS: Record<AuditEntityType, string> = {
  task: "Задачи",
  part: "Детали",
  fact: "Факты",
  norm: "Нормы",
  logistics: "Логистика",
}

function formatDate(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return "—"
  return parsed.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "short",
    weekday: "short",
  })
}

function formatTime(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return "—"
  return parsed.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

function getGroupKey(timestamp: string): GroupKey {
  const now = new Date()
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return "older"

  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const dayDiff = Math.floor((nowDay - dateDay) / (24 * 60 * 60 * 1000))

  if (dayDiff <= 0) return "today"
  if (dayDiff <= 7) return "this_week"
  return "older"
}

function getDetailsSummary(entry: AuditEntry): string {
  const details = entry.details || {}
  if (details.oldStatus && details.newStatus) {
    return `${details.oldStatus} -> ${details.newStatus}`
  }
  if (details.message) return String(details.message)
  if (details.comment) return String(details.comment)
  return ""
}

function actionFilterMatches(action: AuditAction, filter: ActionFilter): boolean {
  if (filter === "all") return true
  if (filter === "tasks") return action.startsWith("task_")
  if (filter === "facts") return action.startsWith("fact_")
  if (filter === "comments") return action === "task_comment_added" || action === "task_attachment_added"
  if (filter === "logistics") return action.includes("logistic") || action.includes("movement")
  return true
}

export function AuditLogView({ partId, compact = false }: AuditLogViewProps) {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState<AuditEntityType | "all">("all")
  const [actionFilter, setActionFilter] = useState<ActionFilter>("all")

  const loadEntries = async () => {
    if (isUsingApi()) {
      try {
        const response = await apiClient.getAuditEvents({
          part_id: partId,
          limit: 500,
        })
        const apiRows = (response.data || response || []) as AuditEntry[]
        setEntries(apiRows.filter((entry) => Boolean(entry.timestamp)))
        return
      } catch (error) {
        console.error("Failed to load audit events from API", error)
      }
    }

    const localRows = partId ? getAuditEntriesForPart(partId) : getAllAuditEntries()
    setEntries(localRows)
  }

  useEffect(() => {
    void loadEntries()
  }, [partId])

  const filteredEntries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    return entries
      .filter((entry) => {
        if (typeFilter !== "all" && entry.entity_type !== typeFilter) return false
        if (!actionFilterMatches(entry.action, actionFilter)) return false

        if (!query) return true

        return [
          entry.user_name,
          entry.entity_name,
          entry.part_code,
          AUDIT_ACTION_LABELS[entry.action],
          getDetailsSummary(entry),
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query))
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  }, [entries, searchQuery, typeFilter, actionFilter])

  const grouped = useMemo(() => {
    const byGroup: Record<GroupKey, AuditEntry[]> = {
      today: [],
      this_week: [],
      older: [],
    }

    for (const entry of filteredEntries) {
      byGroup[getGroupKey(entry.timestamp)].push(entry)
    }

    return byGroup
  }, [filteredEntries])

  const content = (
    <div className="space-y-4">
      {!compact ? (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Поиск по событиям"
              className="pl-9"
            />
          </div>

          <Select value={actionFilter} onValueChange={(value) => setActionFilter(value as ActionFilter)}>
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="Категория" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все действия</SelectItem>
              <SelectItem value="tasks">Задачи</SelectItem>
              <SelectItem value="facts">Факты</SelectItem>
              <SelectItem value="comments">Комментарии</SelectItem>
              <SelectItem value="logistics">Логистика</SelectItem>
            </SelectContent>
          </Select>

          <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as AuditEntityType | "all")}> 
            <SelectTrigger className="w-[170px]">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Тип" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все типы</SelectItem>
              {Object.entries(ENTITY_TYPE_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" className="bg-transparent" onClick={() => void loadEntries()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Обновить
          </Button>
        </div>
      ) : null}

      <Card className="gap-0 border shadow-none py-0">
        <CardHeader className="px-4 py-4 sm:px-6 sm:py-5">
          <CardTitle className="text-sm font-semibold">
            Журнал событий ({filteredEntries.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-5 sm:px-6">
          {filteredEntries.length === 0 ? (
            <div className="rounded-md bg-muted/40 px-4 py-8 text-center text-sm text-muted-foreground">
              События появятся здесь после действий по партии.
            </div>
          ) : (
            <ScrollArea className={cn(compact ? "h-[240px]" : "h-[520px]")}>
              <div className="space-y-6 pr-4">
                {(Object.keys(GROUP_LABELS) as GroupKey[]).map((groupKey) => {
                  const rows = grouped[groupKey]
                  if (rows.length === 0) return null

                  return (
                    <div key={groupKey} className="space-y-3">
                      <div className="sticky top-0 z-10 bg-card/95 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground backdrop-blur">
                        {GROUP_LABELS[groupKey]}
                      </div>

                      <div className="divide-y">
                        {rows.map((entry) => {
                          const details = getDetailsSummary(entry)

                          return (
                            <div key={entry.id} className="py-3">
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-sm font-medium">{AUDIT_ACTION_LABELS[entry.action]}</div>
                                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                    <span>{entry.user_name}</span>
                                    <span>•</span>
                                    <span>{formatDate(entry.timestamp)}</span>
                                    <span>•</span>
                                    <span>{formatTime(entry.timestamp)}</span>
                                    {entry.entity_name ? (
                                      <>
                                        <span>•</span>
                                        <span>{entry.entity_name}</span>
                                      </>
                                    ) : null}
                                  </div>
                                </div>

                                <div className="flex shrink-0 items-center gap-2">
                                  {entry.part_code ? (
                                    <Badge variant="outline" className="bg-transparent font-mono text-xs">
                                      {entry.part_code}
                                    </Badge>
                                  ) : null}
                                  <Badge variant="outline" className="bg-transparent text-xs">
                                    {ENTITY_TYPE_LABELS[entry.entity_type] || entry.entity_type}
                                  </Badge>
                                </div>
                              </div>

                              {details ? (
                                <p className="mt-2 text-xs text-muted-foreground">{details}</p>
                              ) : null}
                            </div>
                          )
                        })}
                      </div>

                      <Separator />
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  )

  return content
}
