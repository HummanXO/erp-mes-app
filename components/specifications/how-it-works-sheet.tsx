"use client"

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"

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
      "Доступ выдаётся точечно на выбранную спецификацию, а не на весь модуль.",
      "Оператор видит только выданные спецификации и связанные задания.",
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{content.title}</SheetTitle>
          <SheetDescription>Короткая памятка для текущего блока</SheetDescription>
        </SheetHeader>
        <div className="space-y-3 text-sm pt-4">
          {content.lines.map((line) => (
            <p key={line} className="text-muted-foreground leading-relaxed">
              {line}
            </p>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}
