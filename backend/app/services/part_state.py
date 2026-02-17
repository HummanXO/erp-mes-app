"""Helpers for keeping Part.qty_done/status and stage statuses consistent with facts and movements."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models import LogisticsEntry, Part, PartStageStatus, StageFact


PROGRESS_STAGES: tuple[str, ...] = (
    "machining",
    "fitting",
    "heat_treatment",
    "galvanic",
    "grinding",
    "qc",
)

INTERNAL_FACT_STAGES: tuple[str, ...] = ("machining", "fitting", "qc")
EXTERNAL_MOVEMENT_STAGES: tuple[str, ...] = ("heat_treatment", "galvanic", "grinding")
RECEIVED_MOVEMENT_STATUSES: tuple[str, ...] = ("received", "completed")


STAGE_LABELS_RU: dict[str, str] = {
    "machining": "Механообработка",
    "fitting": "Слесарка",
    "galvanic": "Гальваника",
    "heat_treatment": "Термообработка",
    "grinding": "Шлифовка",
    "qc": "ОТК",
    "logistics": "Логистика",
}


@dataclass(frozen=True)
class StageTotals:
    good: int = 0
    scrap: int = 0
    facts_count: int = 0
    first_at: Optional[object] = None
    last_at: Optional[object] = None

    @property
    def processed(self) -> int:
        return int(self.good or 0) + int(self.scrap or 0)


def stage_prerequisites(part: Part, stage: str) -> list[str]:
    """Return immediate prerequisite stages that limit the available input quantity for `stage`."""
    required_stages = set(part.required_stages or [])

    if part.is_cooperation:
        if stage == "heat_treatment":
            return []
        if stage == "galvanic":
            if "heat_treatment" in required_stages:
                return ["heat_treatment"]
            return []
        if stage == "grinding":
            if "galvanic" in required_stages:
                return ["galvanic"]
            if "heat_treatment" in required_stages:
                return ["heat_treatment"]
            return []
        if stage == "qc":
            return [s for s in ("heat_treatment", "galvanic", "grinding") if s in required_stages]
        return []

    if stage == "fitting":
        return ["machining"] if "machining" in required_stages else []
    if stage == "heat_treatment":
        return ["fitting"] if "fitting" in required_stages else []
    if stage == "galvanic":
        if "heat_treatment" in required_stages:
            return ["heat_treatment"]
        return ["fitting"] if "fitting" in required_stages else []
    if stage == "grinding":
        if "galvanic" in required_stages:
            return ["galvanic"]
        if "heat_treatment" in required_stages:
            return ["heat_treatment"]
        return ["fitting"] if "fitting" in required_stages else []
    if stage == "qc":
        prereq: list[str] = ["fitting"] if "fitting" in required_stages else []
        prereq += [s for s in ("heat_treatment", "galvanic", "grinding") if s in required_stages]
        return prereq
    return []


def compute_stage_totals(db: Session, *, part: Part) -> dict[str, StageTotals]:
    fact_rows = (
        db.query(
            StageFact.stage.label("stage"),
            func.coalesce(func.sum(StageFact.qty_good), 0).label("good"),
            func.coalesce(func.sum(StageFact.qty_scrap), 0).label("scrap"),
            func.count(StageFact.id).label("facts_count"),
            func.min(StageFact.created_at).label("first_at"),
            func.max(StageFact.created_at).label("last_at"),
        )
        .filter(
            StageFact.part_id == part.id,
            StageFact.org_id == part.org_id,
        )
        .group_by(StageFact.stage)
        .all()
    )

    totals: dict[str, StageTotals] = {}
    for row in fact_rows:
        totals[str(row.stage)] = StageTotals(
            good=int(row.good or 0),
            scrap=int(row.scrap or 0),
            facts_count=int(row.facts_count or 0),
            first_at=row.first_at,
            last_at=row.last_at,
        )

    movement_rows = (
        db.query(
            PartStageStatus.stage.label("stage"),
            func.coalesce(
                func.sum(
                    func.coalesce(
                        LogisticsEntry.qty_received,
                        LogisticsEntry.qty_sent,
                        LogisticsEntry.quantity,
                        0,
                    )
                ),
                0,
            ).label("good"),
            func.count(LogisticsEntry.id).label("events_count"),
            func.min(
                func.coalesce(
                    LogisticsEntry.received_at,
                    LogisticsEntry.updated_at,
                    LogisticsEntry.sent_at,
                    LogisticsEntry.created_at,
                )
            ).label("first_at"),
            func.max(
                func.coalesce(
                    LogisticsEntry.received_at,
                    LogisticsEntry.updated_at,
                    LogisticsEntry.sent_at,
                    LogisticsEntry.created_at,
                )
            ).label("last_at"),
        )
        .join(
            PartStageStatus,
            PartStageStatus.id == LogisticsEntry.stage_id,
        )
        .filter(
            LogisticsEntry.part_id == part.id,
            LogisticsEntry.org_id == part.org_id,
            LogisticsEntry.stage_id.isnot(None),
            LogisticsEntry.status.in_(RECEIVED_MOVEMENT_STATUSES),
            PartStageStatus.part_id == part.id,
            PartStageStatus.stage.in_(EXTERNAL_MOVEMENT_STAGES),
        )
        .group_by(PartStageStatus.stage)
        .all()
    )

    for row in movement_rows:
        totals[str(row.stage)] = StageTotals(
            good=int(row.good or 0),
            scrap=0,
            facts_count=int(row.events_count or 0),
            first_at=row.first_at,
            last_at=row.last_at,
        )

    if part.is_cooperation:
        qc_status = (part.cooperation_qc_status or "pending").strip().lower()
        checked_at = part.cooperation_qc_checked_at
        if qc_status == "accepted":
            totals["qc"] = StageTotals(
                good=int(part.qty_plan or 0),
                scrap=0,
                facts_count=1,
                first_at=checked_at,
                last_at=checked_at,
            )
        elif qc_status == "rejected":
            totals["qc"] = StageTotals(
                good=0,
                scrap=0,
                facts_count=1,
                first_at=checked_at,
                last_at=checked_at,
            )
        elif "qc" not in totals:
            totals["qc"] = StageTotals()

    return totals


def validate_stage_flow(part: Part, stage_totals: dict[str, StageTotals]) -> Optional[str]:
    """Validate that downstream stages never process more than available input from prerequisites."""
    required_stages = set(part.required_stages or [])

    for stage in required_stages:
        if stage in {"machining", "logistics"}:
            continue

        prereq = stage_prerequisites(part, stage)
        if not prereq:
            continue

        available = min(stage_totals.get(s, StageTotals()).good for s in prereq) if prereq else 0
        processed = stage_totals.get(stage, StageTotals()).processed
        if processed > available:
            stage_label = STAGE_LABELS_RU.get(stage, stage)
            prereq_labels = ", ".join(STAGE_LABELS_RU.get(s, s) for s in prereq)
            return (
                f"Нельзя зафиксировать такой объём по этапу «{stage_label}»: "
                f"уже обработано {processed} шт (годные+брак), "
                f"но доступно после этапов ({prereq_labels}) только {available} шт."
            )

    return None


def recompute_part_state(
    db: Session,
    *,
    part: Part,
    stage_totals: Optional[dict[str, StageTotals]] = None,
) -> dict[str, StageTotals]:
    """Recalculate Part.qty_done/status and stage statuses from facts and movements.

    - Part.qty_done is treated as "ready quantity" after all production stages (machining..qc),
      i.e. bottleneck MIN across PROGRESS_STAGES included for the part.
    - Part.status becomes "done" only when ready qty >= plan.
    """
    totals = stage_totals or compute_stage_totals(db, part=part)

    stage_statuses = (
        db.query(PartStageStatus)
        .filter(PartStageStatus.part_id == part.id)
        .all()
    )

    for stage_status in stage_statuses:
        if stage_status.status == "skipped":
            continue

        stage = stage_status.stage
        stage_total = totals.get(stage, StageTotals())
        has_stage_activity = bool(stage_total.facts_count > 0 or stage_total.processed > 0)

        if stage == "qc" and part.is_cooperation:
            qc_status = (part.cooperation_qc_status or "pending").strip().lower()
            if qc_status == "pending" and not has_stage_activity:
                stage_status.status = "pending"
                stage_status.started_at = None
                stage_status.completed_at = None
                stage_status.operator_id = None
                continue

            if stage_status.started_at is None:
                stage_status.started_at = stage_total.first_at or func.now()

            stage_status.operator_id = None
            if qc_status == "accepted":
                stage_status.status = "done"
                stage_status.completed_at = (
                    part.cooperation_qc_checked_at
                    or stage_total.last_at
                    or func.now()
                )
            elif qc_status == "rejected":
                stage_status.status = "in_progress"
                stage_status.completed_at = None
            else:
                if stage_total.good >= part.qty_plan:
                    stage_status.status = "done"
                    if stage_status.completed_at is None:
                        stage_status.completed_at = stage_total.last_at or func.now()
                else:
                    stage_status.status = "in_progress"
                    stage_status.completed_at = None
            continue

        if not has_stage_activity:
            stage_status.status = "pending"
            stage_status.started_at = None
            stage_status.completed_at = None
            stage_status.operator_id = None
            continue

        if stage_status.started_at is None:
            stage_status.started_at = stage_total.first_at or func.now()

        if stage_status.operator_id is None and stage in INTERNAL_FACT_STAGES:
            last_operator_id = (
                db.query(StageFact.operator_id)
                .filter(
                    StageFact.part_id == part.id,
                    StageFact.org_id == part.org_id,
                    StageFact.stage == stage,
                    StageFact.operator_id.isnot(None),
                )
                .order_by(StageFact.created_at.desc())
                .first()
            )
            if last_operator_id and last_operator_id[0]:
                stage_status.operator_id = last_operator_id[0]
        if stage in EXTERNAL_MOVEMENT_STAGES:
            stage_status.operator_id = None

        # For logistics we currently don't have production facts, but keep the stage visible.
        if stage == "logistics":
            stage_status.status = "in_progress" if has_stage_activity else "pending"
            stage_status.completed_at = None
            continue

        good = stage_total.good
        if good >= part.qty_plan:
            stage_status.status = "done"
            if stage_status.completed_at is None:
                stage_status.completed_at = stage_total.last_at or func.now()
        else:
            stage_status.status = "in_progress"
            stage_status.completed_at = None

    progress_stages_present = [
        s.stage
        for s in stage_statuses
        if s.status != "skipped" and s.stage in PROGRESS_STAGES
    ]

    if progress_stages_present:
        ready_qty = min(totals.get(stage, StageTotals()).good for stage in progress_stages_present)
    else:
        ready_qty = 0

    part.qty_done = max(0, int(ready_qty))

    facts_total = sum((stage_total.facts_count for stage_total in totals.values()), 0)
    has_started = facts_total > 0 or any(
        stage_status.status in {"in_progress", "done"}
        for stage_status in stage_statuses
        if stage_status.status != "skipped"
    )
    if part.qty_done >= part.qty_plan:
        part.status = "done"
    elif has_started:
        part.status = "in_progress"
    else:
        part.status = "not_started"

    return totals
