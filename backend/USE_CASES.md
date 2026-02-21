# Backend use-cases (router thinness)

HTTP routers keep transport concerns only: input parsing, dependency wiring, and response mapping.

Domain/use-case logic moved here:

- `app/use_cases/task_transitions.py`
  - `accept_task_use_case`
  - `start_task_use_case`
  - `send_to_review_use_case`
  - `review_task_use_case`
- `app/use_cases/part_lifecycle.py`
  - `delete_part_use_case`
- `app/use_cases/movements_use_cases.py`
  - `create_movement_use_case`
  - `update_movement_use_case`

Router wiring:

- `app/routers/tasks.py` calls task transition use-cases, then maps with `task_to_response(...)`.
- `app/routers/parts.py` calls `delete_part_use_case(...)` for part deletion flow.
- `app/routers/movements.py` calls movement use-cases for create/update logistics flows.

This split keeps API contracts in routers unchanged while making business branches testable without HTTP.
