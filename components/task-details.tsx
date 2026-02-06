"use client"

import React from "react"

import { useState, useRef, useEffect } from "react"
import { useApp } from "@/lib/app-context"
import type { Task, TaskStatus } from "@/lib/types"
import { TASK_STATUS_LABELS, TASK_CATEGORY_LABELS, STAGE_LABELS, ROLE_LABELS, ASSIGNEE_ROLE_GROUPS } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { 
  ArrowLeft,
  Send,
  Paperclip,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  User,
  Users,
  FileImage,
  X,
  Eye,
  MessageSquare,
  UserCheck
} from "lucide-react"
import { cn } from "@/lib/utils"

interface TaskDetailsProps {
  task: Task
  onBack: () => void
}

export function TaskDetails({ task, onBack }: TaskDetailsProps) {
  const { 
    currentUser, 
    users, 
    updateTask, 
    markTaskAsRead,
    addTaskComment,
    sendTaskForReview,
    reviewTask,
    startTask,
    getPartById,
    demoDate,
    isTaskAssignedToUser
  } = useApp()
  
  const [newMessage, setNewMessage] = useState("")
  const [showReviewDialog, setShowReviewDialog] = useState(false)
  const [reviewComment, setReviewComment] = useState("")
  const [isApproving, setIsApproving] = useState(false)
  const [pendingAttachments, setPendingAttachments] = useState<Array<{id: string, name: string, url: string, type: "image" | "file"}>>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const part = task.part_id ? getPartById(task.part_id) : null
  const creator = users.find(u => u.id === task.creator_id)
  const acceptedBy = task.accepted_by_id ? users.find(u => u.id === task.accepted_by_id) : null
  const reviewedBy = task.reviewed_by_id ? users.find(u => u.id === task.reviewed_by_id) : null
  const isOverdue = task.due_date < demoDate && task.status !== "done"
  const isMyTask = currentUser && isTaskAssignedToUser(task, currentUser)
  const isCreator = currentUser?.id === task.creator_id
  
  // Mark as read when opening (only once)
  const hasMarkedAsRead = useRef(false)
  useEffect(() => {
    if (currentUser && !task.read_by.includes(currentUser.id) && !hasMarkedAsRead.current) {
      hasMarkedAsRead.current = true
      markTaskAsRead(task.id)
    }
  }, [task.id, currentUser, markTaskAsRead])
  
  // Scroll to bottom when comments change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [task.comments])
  
  const getAssigneeDisplay = () => {
    if (task.assignee_type === "all") return "Всем"
    if (task.assignee_type === "role" && task.assignee_role) {
      return ASSIGNEE_ROLE_GROUPS[task.assignee_role]
    }
    if (task.assignee_type === "user" && task.assignee_id) {
      const user = users.find(u => u.id === task.assignee_id)
      return user?.initials || "Неизвестно"
    }
    return "Не назначено"
  }
  
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    
    // Mock file upload - in production, upload to storage and get URL
    Array.from(files).forEach(file => {
      const mockUrl = URL.createObjectURL(file)
      const isImage = file.type.startsWith("image/")
      setPendingAttachments(prev => [...prev, {
        id: `att_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: file.name,
        url: mockUrl,
        type: isImage ? "image" : "file"
      }])
    })
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }
  
  const removePendingAttachment = (id: string) => {
    setPendingAttachments(prev => prev.filter(a => a.id !== id))
  }
  
  const handleSendMessage = () => {
    if (!newMessage.trim() && pendingAttachments.length === 0) return
    addTaskComment(task.id, newMessage.trim() || "Вложение", pendingAttachments)
    setNewMessage("")
    setPendingAttachments([])
  }
  
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }
  
  const handleSendForReview = () => {
    sendTaskForReview(task.id, reviewComment || undefined)
    setReviewComment("")
    setShowReviewDialog(false)
  }
  
  const handleReview = (approved: boolean) => {
    setIsApproving(approved)
    setShowReviewDialog(true)
  }
  
  const handleConfirmReview = () => {
    reviewTask(task.id, isApproving, reviewComment || undefined)
    setReviewComment("")
    setShowReviewDialog(false)
  }
  
  const handleStatusChange = (newStatus: TaskStatus) => {
    updateTask({ ...task, status: newStatus })
  }
  
  const getStatusColor = (status: TaskStatus) => {
    switch (status) {
      case "done": return "text-green-600 bg-green-100"
      case "review": return "text-amber-600 bg-amber-100"
      case "in_progress": return "text-blue-600 bg-blue-100"
      case "accepted": return "text-teal-600 bg-teal-100"
      default: return "text-muted-foreground bg-muted"
    }
  }

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-120px)]">
      {/* Header */}
      <div className="flex items-start gap-4 pb-4 border-b">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-semibold">{task.title}</h1>
            {task.is_blocker && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                Блокер
              </Badge>
            )}
            {isOverdue && (
              <Badge variant="outline" className="text-amber-600 border-amber-600">
                Просрочено
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
            {part && <span className="font-mono">{part.code}</span>}
            {task.stage && <Badge variant="outline" className="text-xs">{STAGE_LABELS[task.stage]}</Badge>}
            <Badge variant="secondary" className="text-xs">{TASK_CATEGORY_LABELS[task.category]}</Badge>
          </div>
        </div>
        <Badge className={cn("text-xs", getStatusColor(task.status))}>
          {TASK_STATUS_LABELS[task.status]}
        </Badge>
      </div>
      
      {/* Task Info */}
      <Card className="mt-4">
        <CardContent className="p-4 space-y-3">
          {task.description && (
            <p className="text-sm">{task.description}</p>
          )}
          
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Создал:</span>
              <div className="flex items-center gap-1 mt-1">
                <User className="h-3 w-3" />
                {creator?.initials}
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">Кому:</span>
              <div className="flex items-center gap-1 mt-1">
                {task.assignee_type === "user" ? <User className="h-3 w-3" /> : <Users className="h-3 w-3" />}
                {getAssigneeDisplay()}
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">Срок:</span>
              <div className={cn("mt-1", isOverdue && "text-destructive font-medium")}>
                {new Date(task.due_date).toLocaleDateString("ru-RU")}
              </div>
            </div>
            {acceptedBy && (
              <div>
                <span className="text-muted-foreground">Принял:</span>
                <div className="flex items-center gap-1 mt-1 text-green-600">
                  <UserCheck className="h-3 w-3" />
                  {acceptedBy.initials}
                </div>
              </div>
            )}
            {reviewedBy && (
              <div>
                <span className="text-muted-foreground">Проверил:</span>
                <div className="flex items-center gap-1 mt-1">
                  <Eye className="h-3 w-3" />
                  {reviewedBy.initials}
                </div>
              </div>
            )}
          </div>
          
          {task.review_comment && (
            <div className="p-2 rounded bg-amber-50 border border-amber-200 text-sm">
              <span className="font-medium text-amber-700">Комментарий проверки:</span>
              <p className="text-amber-600 mt-1">{task.review_comment}</p>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Actions */}
      <div className="flex gap-2 mt-4 flex-wrap">
        {task.status === "open" && isMyTask && (
          <Button onClick={() => handleStatusChange("in_progress")}>
            Взять в работу
          </Button>
        )}
        {task.status === "accepted" && isMyTask && (
          <Button onClick={() => startTask(task.id)}>
            Начать работу
          </Button>
        )}
        {task.status === "in_progress" && isMyTask && (
          <Button onClick={() => setShowReviewDialog(true)}>
            <Eye className="h-4 w-4 mr-2" />
            На проверку
          </Button>
        )}
        {task.status === "review" && isCreator && (
          <>
            <Button onClick={() => handleReview(true)} className="bg-green-600 hover:bg-green-700">
              <CheckCircle className="h-4 w-4 mr-2" />
              Принять
            </Button>
            <Button variant="outline" onClick={() => handleReview(false)} className="bg-transparent">
              <XCircle className="h-4 w-4 mr-2" />
              Вернуть
            </Button>
          </>
        )}
        {task.status === "done" && (
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle className="h-5 w-5" />
            <span className="font-medium">Задача завершена</span>
          </div>
        )}
      </div>
      
      <Separator className="my-4" />
      
      {/* Chat / Comments */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center gap-2 mb-2">
          <MessageSquare className="h-4 w-4" />
          <span className="font-medium text-sm">Обсуждение ({task.comments?.length || 0})</span>
        </div>
        
        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-3">
            {(!task.comments || task.comments.length === 0) ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Нет сообщений. Начните обсуждение!
              </p>
            ) : (
              task.comments.map(comment => {
                const author = users.find(u => u.id === comment.user_id)
                const isOwnMessage = currentUser?.id === comment.user_id
                
                return (
                  <div key={comment.id} className={cn("flex gap-2", isOwnMessage && "flex-row-reverse")}>
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="text-xs">
                        {author?.initials?.slice(0, 2) || "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div className={cn(
                      "max-w-[75%] rounded-lg px-3 py-2",
                      isOwnMessage 
                        ? "bg-primary text-primary-foreground" 
                        : "bg-muted"
                    )}>
                      <div className={cn(
                        "text-xs mb-1",
                        isOwnMessage ? "text-primary-foreground/70" : "text-muted-foreground"
                      )}>
                        {author?.initials} - {new Date(comment.created_at).toLocaleString("ru-RU", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit"
                        })}
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{comment.message}</p>
                      {comment.attachments && comment.attachments.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {comment.attachments.map(att => (
                            <a 
                              key={att.id}
                              href={att.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs underline"
                            >
                              <FileImage className="h-3 w-3" />
                              {att.name}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
        
        {/* Message Input */}
        <div className="mt-4 pt-4 border-t space-y-2">
          {/* Pending attachments preview */}
          {pendingAttachments.length > 0 && (
            <div className="flex flex-wrap gap-2 p-2 bg-muted rounded-lg">
              {pendingAttachments.map(att => (
                <div key={att.id} className="flex items-center gap-1 bg-background rounded px-2 py-1 text-xs">
                  <FileImage className="h-3 w-3" />
                  <span className="max-w-[100px] truncate">{att.name}</span>
                  <button 
                    type="button"
                    onClick={() => removePendingAttachment(att.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          
          <div className="flex gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              multiple
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
              className="hidden"
            />
            <Button 
              variant="outline" 
              size="icon" 
              onClick={() => fileInputRef.current?.click()}
              className="bg-transparent shrink-0"
              title="Прикрепить файл"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Input
              placeholder="Написать сообщение..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyPress}
              className="flex-1"
            />
            <Button 
              size="icon" 
              onClick={handleSendMessage} 
              disabled={!newMessage.trim() && pendingAttachments.length === 0}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      
      {/* Review Dialog */}
      <Dialog open={showReviewDialog} onOpenChange={setShowReviewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {task.status === "in_progress" 
                ? "Отправить на проверку" 
                : isApproving 
                  ? "Принять задачу" 
                  : "Вернуть на доработку"
              }
            </DialogTitle>
            <DialogDescription>
              {task.status === "in_progress"
                ? "Задача будет отправлена создателю на проверку"
                : isApproving
                  ? "Задача будет отмечена как выполненная"
                  : "Задача будет возвращена исполнителю"
              }
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Комментарий (необязательно)"
            value={reviewComment}
            onChange={(e) => setReviewComment(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReviewDialog(false)} className="bg-transparent">
              Отмена
            </Button>
            <Button 
              onClick={task.status === "in_progress" ? handleSendForReview : handleConfirmReview}
              className={cn(
                task.status !== "in_progress" && !isApproving && "bg-amber-600 hover:bg-amber-700"
              )}
            >
              {task.status === "in_progress" 
                ? "Отправить" 
                : isApproving 
                  ? "Принять" 
                  : "Вернуть"
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
