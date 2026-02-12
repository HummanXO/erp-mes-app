"use client"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CircleCheck } from "lucide-react"

export type HowItWorksTopic = "general" | "items" | "queue" | "access"

const TOPIC_CONTENT: Record<HowItWorksTopic, { title: string; lines: string[] }> = {
  general: {
    title: "Как работает модуль",
    lines: [
      "Сначала создаётся спецификация, затем в неё добавляются позиции: детали собственного производства и кооперация.",
      "Позиции сразу связаны с деталями. Отдельного блока очереди и заданий в этом экране больше нет.",
      "Статус детали автоматически переходит в «В работе» при первом плане или первом факте.",
    ],
  },
  items: {
    title: "Как работают позиции",
    lines: [
      "Позиция описывает, что именно нужно сделать по этой спецификации и в каком количестве.",
      "Кнопка «Добавить позицию» открывает ту же форму, что и во вкладке деталей.",
      "В этой форме можно создать обычную деталь или включить кооперацию, позиция добавляется автоматически.",
      "Дедлайн позиции берётся из дедлайна спецификации, отдельно для детали вводить его не нужно.",
    ],
  },
  queue: {
    title: "Как работает очередь",
    lines: [
      "Этот блок в спецификациях отключён.",
      "Запуск и фактическое выполнение ведутся через детали и факты по этапам.",
      "При необходимости очередь можно вернуть как отдельный модуль позже.",
    ],
  },
  access: {
    title: "Как работает доступ операторов",
    lines: [
      "Флаг «Опубликовать операторам» открывает спецификацию всем операторам.",
      "Персональный доступ выдаётся дополнительно, если нужно дать точечный доступ конкретному оператору.",
      "Права можно отозвать в любой момент без удаления данных.",
    ],
  },
}

interface HowItWorksSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  topic: HowItWorksTopic
}

export function HowItWorksSheet({ open, onOpenChange, topic }: HowItWorksSheetProps) {
  const content = TOPIC_CONTENT[topic]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{content.title}</DialogTitle>
          <DialogDescription>Короткая памятка для текущего блока</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 pt-2">
          {content.lines.map((line) => (
            <div key={line} className="flex items-start gap-2 rounded-md border bg-muted/30 px-3 py-2">
              <CircleCheck className="mt-0.5 h-4 w-4 text-[color:var(--status-info-fg)]" aria-hidden="true" />
              <p className="text-sm leading-relaxed text-muted-foreground">{line}</p>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
