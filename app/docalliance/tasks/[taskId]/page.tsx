"use client"

import { useParams, useRouter } from "next/navigation"
import { AllTasksView } from "@/components/all-tasks-view"
import { getDocAllianceTasksPath } from "@/lib/docalliance-paths"

export default function TaskDetailPage() {
  const router = useRouter()
  const params = useParams<{ taskId: string }>()
  const taskId = String(params.taskId)

  const handleBack = () => {
    if (window.history.length > 1) {
      router.back()
    } else {
      router.push(getDocAllianceTasksPath())
    }
  }

  return (
    <AllTasksView
      selectedTaskId={taskId}
      onBack={handleBack}
      onSelectTask={(nextTaskId) => router.push(getDocAllianceTasksPath(nextTaskId))}
    />
  )
}
