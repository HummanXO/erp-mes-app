# Runtime Modes (Single Source of Truth)

Режим приложения выбирается строго в `lib/runtime-mode.ts`.

## Правила выбора режима

1. `NEXT_PUBLIC_API_BASE_URL` задан и не пустой -> режим `API`.
2. `NEXT_PUBLIC_API_BASE_URL` пустой и `NEXT_PUBLIC_DEMO_MODE=true` -> режим `DEMO`.
3. Если заданы оба (`NEXT_PUBLIC_API_BASE_URL` и `NEXT_PUBLIC_DEMO_MODE=true`) -> ошибка конфигурации (приложение не стартует).
4. Если не задано ни одно -> ошибка конфигурации (приложение не стартует).
5. В `production` DEMO-режим запрещён.

## Capabilities

- `inventory`:
  - `DEMO`: поддержано
  - `API`: поддерживается только при явном backend signal
    (`GET /api/v1/inventory/capabilities` возвращает `inventory=true`)
- `workOrders`:
  - `DEMO`: поддержано
  - `API`: отключено, пока backend возвращает `workOrders=false` в capabilities
- `taskManualStatusUpdate` (прямой перевод статуса через `updateTask`):
  - `DEMO`: поддержано
  - `API`: не поддержано, используйте workflow-эндпоинты (`accept/start/send-to-review/review`)
- `localDerivedReadModels` (локальные вычислители и выборки из demo provider):
  - `DEMO`: поддержано
  - `API`: не поддержано

## Важный инвариант

В API-режиме локальный провайдер не может быть загружен:
`lib/data-provider-adapter.ts` выбрасывает ошибку при попытке обращения к local provider в API mode.

Для capabilities в API-режиме действует двухступенчатая модель:
1. Базовая матрица из `lib/runtime-mode.ts` (без local-derived фич).
2. Runtime уточнение из backend endpoint `GET /api/v1/inventory/capabilities`.
