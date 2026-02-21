"use client"

import { useRouter } from "next/navigation"
import { AllTasksView } from "@/components/all-tasks-view"
import { getDocAllianceTasksPath } from "@/lib/docalliance-paths"

export default function TasksPage() {
  const router = useRouter()

  return (
    <AllTasksView onSelectTask={(taskId) => router.push(getDocAllianceTasksPath(taskId))} />
  )
}
