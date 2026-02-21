"use client"

import { useParams, useRouter } from "next/navigation"
import { PartsView } from "@/components/parts-view"
import {
  getDocAlliancePartTaskPath,
  getDocAlliancePartsPath,
} from "@/lib/docalliance-paths"

export default function PartTaskDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string; taskId: string }>()
  const partId = String(params.id)
  const taskId = String(params.taskId)

  const handlePartBack = () => {
    if (window.history.length > 1) {
      router.back()
    } else {
      router.push(getDocAlliancePartsPath())
    }
  }

  const handleTaskBack = () => {
    if (window.history.length > 1) {
      router.back()
    } else {
      router.push(getDocAlliancePartsPath(partId, "tasks"))
    }
  }

  const handleTabChange = (nextTab: string) => {
    if (nextTab === "tasks") {
      router.replace(getDocAlliancePartsPath(partId, "tasks"), { scroll: false })
      return
    }
    if (nextTab === "overview") {
      router.replace(getDocAlliancePartsPath(partId), { scroll: false })
      return
    }
    router.replace(getDocAlliancePartsPath(partId, nextTab), { scroll: false })
  }

  return (
    <PartsView
      selectedPartId={partId}
      selectedTaskId={taskId}
      onBack={handlePartBack}
      onTaskBack={handleTaskBack}
      detailTab="tasks"
      onDetailTabChange={handleTabChange}
      onSelectTask={(nextTaskId) => router.push(getDocAlliancePartTaskPath(partId, nextTaskId))}
    />
  )
}
