"use client"

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"

export type HowItWorksTopic = "general" | "items" | "queue" | "access"

const TOPIC_CONTENT: Record<HowItWorksTopic, { title: string; lines: string[] }> = {
  general: {
    title: "Как работает модуль",
    lines: [
      "Сначала создаётся спецификация, затем в неё добавляются позиции: собственное производство, кооперация или покупка.",
      "После добавления производственных позиций из них создаются задания и ставятся в очередь по станкам.",
      "Даты старта и финиша не задаются заранее: они фиксируются автоматически при действиях Старт и Завершить.",
    ],
  },
  items: {
    title: "Как работают позиции",
    lines: [
      "Позиция описывает, что именно нужно сделать по этой спецификации и в каком количестве.",
      "Для своих деталей можно выбрать существующую деталь/исполнение или создать новое исполнение прямо из этой формы.",
      "Позиция не требует дат: достаточно типа, количества и комментария.",
    ],
  },
  queue: {
    title: "Как работает очередь",
    lines: [
      "Задания создаются из производственных позиций и попадают в Backlog.",
      "После назначения станка задание переходит в Ready, затем в In progress и Done по действиям пользователя.",
      "Blocked используется только с причиной блокировки.",
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
