"use client"

import React from "react"

import { useState, useEffect } from "react"
import { getAllAuditEntries, getAuditEntriesForPart, AUDIT_ACTION_LABELS, type AuditEntry, type AuditAction, type AuditEntityType } from "@/lib/audit-log"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { 
  ClipboardList,
  CheckCircle,
  MessageSquare,
  FileText,
  Cog,
  User,
  Clock,
  Filter,
  RefreshCw
} from "lucide-react"
import { cn } from "@/lib/utils"

interface AuditLogViewProps {
  partId?: string
  compact?: boolean
}

const ACTION_ICONS: Partial<Record<AuditAction, React.ReactNode>> = {
  task_created: <FileText className="h-4 w-4" />,
  task_status_changed: <RefreshCw className="h-4 w-4" />,
  task_accepted: <CheckCircle className="h-4 w-4" />,
  task_comment_added: <MessageSquare className="h-4 w-4" />,
  task_sent_for_review: <Clock className="h-4 w-4" />,
  task_approved: <CheckCircle className="h-4 w-4" />,
  task_returned: <RefreshCw className="h-4 w-4" />,
  task_attachment_added: <FileText className="h-4 w-4" />,
  fact_added: <Cog className="h-4 w-4" />,
  fact_updated: <Cog className="h-4 w-4" />,
  part_created: <FileText className="h-4 w-4" />,
  part_updated: <RefreshCw className="h-4 w-4" />,
  part_stage_changed: <Cog className="h-4 w-4" />,
  norm_configured: <Cog className="h-4 w-4" />,
}

const ACTION_COLORS: Partial<Record<AuditAction, string>> = {
  task_created: "text-blue-600 bg-blue-100",
  task_status_changed: "text-amber-600 bg-amber-100",
  task_accepted: "text-teal-600 bg-teal-100",
  task_comment_added: "text-purple-600 bg-purple-100",
  task_sent_for_review: "text-amber-600 bg-amber-100",
  task_approved: "text-green-600 bg-green-100",
  task_returned: "text-red-600 bg-red-100",
  task_attachment_added: "text-purple-600 bg-purple-100",
  fact_added: "text-green-600 bg-green-100",
  fact_updated: "text-amber-600 bg-amber-100",
  part_created: "text-blue-600 bg-blue-100",
  part_updated: "text-amber-600 bg-amber-100",
  part_stage_changed: "text-teal-600 bg-teal-100",
  norm_configured: "text-blue-600 bg-blue-100",
}

const ENTITY_TYPE_LABELS: Record<AuditEntityType, string> = {
  task: "Задачи",
  part: "Детали",
  fact: "Факты",
  norm: "Нормы",
  logistics: "Логистика",
}

export function AuditLogView({ partId, compact = false }: AuditLogViewProps) {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [typeFilter, setTypeFilter] = useState<AuditEntityType | "all">("all")
  const [actionFilter, setActionFilter] = useState<"all" | "tasks" | "facts" | "comments">("all")
  
  useEffect(() => {
    loadEntries()
  }, [partId])
  
  const loadEntries = () => {
    const allEntries = partId ? getAuditEntriesForPart(partId) : getAllAuditEntries()
    setEntries(allEntries)
  }
  
  // Filter entries
  let filteredEntries = entries
  
  if (typeFilter !== "all") {
    filteredEntries = filteredEntries.filter(e => e.entity_type === typeFilter)
  }
  
  if (actionFilter === "tasks") {
    filteredEntries = filteredEntries.filter(e => e.action.startsWith("task_"))
  } else if (actionFilter === "facts") {
    filteredEntries = filteredEntries.filter(e => e.action.startsWith("fact_"))
  } else if (actionFilter === "comments") {
    filteredEntries = filteredEntries.filter(e => e.action === "task_comment_added" || e.action === "task_attachment_added")
  }
  
  // Group by date
  const groupedByDate: Record<string, AuditEntry[]> = {}
  for (const entry of filteredEntries) {
    const date = entry.timestamp.split("T")[0]
    if (!groupedByDate[date]) groupedByDate[date] = []
    groupedByDate[date].push(entry)
  }
  
  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit"
    })
  }
  
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("ru-RU", {
      weekday: "short",
      day: "numeric",
      month: "short"
    })
  }
  
  const getDetailsSummary = (entry: AuditEntry): string => {
    const details = entry.details
    if (details.oldStatus && details.newStatus) {
      return `${details.oldStatus} → ${details.newStatus}`
    }
    if (details.message) {
      const msg = String(details.message)
      return msg.length > 50 ? `${msg.slice(0, 50)}...` : msg
    }
    if (details.comment) {
      const com = String(details.comment)
      return com.length > 50 ? `${com.slice(0, 50)}...` : com
    }
    return ""
  }

  if (compact) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Журнал событий
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[200px]">
            {filteredEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Нет событий</p>
            ) : (
              <div className="space-y-2">
                {filteredEntries.slice(0, 10).map(entry => (
                  <div key={entry.id} className="flex items-start gap-2 text-xs">
                    <div className={cn("p-1 rounded", ACTION_COLORS[entry.action] || "bg-muted")}>
                      {ACTION_ICONS[entry.action] || <FileText className="h-3 w-3" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{AUDIT_ACTION_LABELS[entry.action]}</div>
                      <div className="text-muted-foreground truncate">
                        {entry.user_name} - {formatTime(entry.timestamp)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="flex gap-1">
          {(["all", "tasks", "facts", "comments"] as const).map(f => (
            <Button
              key={f}
              size="sm"
              variant={actionFilter === f ? "default" : "outline"}
              className={actionFilter === f ? "" : "bg-transparent"}
              onClick={() => setActionFilter(f)}
            >
              {f === "all" ? "Все" : f === "tasks" ? "Задачи" : f === "facts" ? "Факты" : "Комментарии"}
            </Button>
          ))}
        </div>
        
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as AuditEntityType | "all")}>
          <SelectTrigger className="w-40">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все типы</SelectItem>
            {Object.entries(ENTITY_TYPE_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Button variant="outline" size="sm" onClick={loadEntries} className="bg-transparent">
          <RefreshCw className="h-4 w-4 mr-2" />
          Обновить
        </Button>
      </div>
      
      {/* Entries */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Журнал событий ({filteredEntries.length})
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            История всех действий: факты производства, задачи, комментарии
          </p>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            {filteredEntries.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <ClipboardList className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Нет событий</p>
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(groupedByDate).map(([date, dayEntries]) => (
                  <div key={date}>
                    <div className="sticky top-0 bg-background py-1 mb-2 border-b">
                      <span className="font-medium text-sm">{formatDate(date)}</span>
                    </div>
                    <div className="space-y-2 pl-2">
                      {dayEntries.map(entry => (
                        <div key={entry.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50">
                          <div className={cn("p-2 rounded-lg shrink-0", ACTION_COLORS[entry.action] || "bg-muted")}>
                            {ACTION_ICONS[entry.action] || <FileText className="h-4 w-4" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm">{AUDIT_ACTION_LABELS[entry.action]}</span>
                              {entry.entity_name && (
                                <span className="text-xs text-muted-foreground">"{entry.entity_name}"</span>
                              )}
                              {entry.part_code && (
                                <Badge variant="outline" className="text-xs font-mono">{entry.part_code}</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {entry.user_name}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatTime(entry.timestamp)}
                              </span>
                            </div>
                            {getDetailsSummary(entry) && (
                              <p className="text-xs text-muted-foreground mt-1 italic">
                                {getDetailsSummary(entry)}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}
