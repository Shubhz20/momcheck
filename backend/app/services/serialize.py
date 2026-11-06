"""Convert database rows into the JSON shapes described in docs/API.md."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlmodel import Session, func, select

from .. import protocol
from ..models import Alert, Beneficiary, Call, Note

IST = timezone(timedelta(hours=5, minutes=30))


def today() -> date:
    """Today's date in India Standard Time."""
    return datetime.now(timezone.utc).astimezone(IST).date()


def iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat().replace("+00:00", "Z")


def weeks_pregnant(b: Beneficiary, ref: date | None = None) -> int | None:
    if b.category != "pregnant" or not b.edd:
        return None
    ref = ref or today()
    weeks = 40 - (b.edd - ref).days // 7
    return max(1, min(weeks, 42))


def days_since_delivery(b: Beneficiary, ref: date | None = None) -> int | None:
    if b.category != "postnatal" or not b.delivery_date:
        return None
    return max(0, ((ref or today()) - b.delivery_date).days)


def call_out(c: Call, b: Beneficiary | None) -> dict[str, Any]:
    keys = ("role", "content", "language", "en", "translation", "translation_language")
    return {
        "id": c.id,
        "beneficiary_id": c.beneficiary_id,
        "beneficiary_name": b.name if b else "",
        "language": c.language,
        "status": c.status,
        "channel": c.channel or "browser",
        "own_voice": bool(c.own_voice),
        "outcome": c.outcome,
        "triage": c.triage,
        "danger_signs": c.danger_signs or [],
        "checklist": protocol.checklist_out(b.category, weeks_pregnant(b), c.checklist) if b else [],
        "summary": c.summary,
        "callback_time": (c.extraction or {}).get("callback_time"),
        "transcript": [{k: t.get(k) for k in keys if t.get(k) is not None} for t in (c.transcript or [])],
        "phone_line": c.phone_line,
        "duration_sec": c.duration_sec,
        "error": c.error,
        "triggered_at": iso(c.triggered_at),
        "completed_at": iso(c.completed_at),
    }


def alert_out(a: Alert, b: Beneficiary) -> dict[str, Any]:
    signs = a.danger_signs or []
    return {
        "id": a.id,
        "beneficiary_id": a.beneficiary_id,
        "beneficiary_name": b.name,
        "phone": b.phone,
        "village": b.village,
        "call_id": a.call_id,
        "severity": a.severity,
        "level": "red" if a.severity == "high" else "amber",
        "groups": protocol.groups_of(signs),
        "reason": a.reason,
        "danger_signs": signs,
        "status": a.status,
        "created_at": iso(a.created_at),
        "acknowledged_at": iso(a.acknowledged_at),
    }


def note_out(n: Note, beneficiary_name: str | None) -> dict[str, Any]:
    return {
        "id": n.id,
        "beneficiary_id": n.beneficiary_id,
        "beneficiary_name": beneficiary_name,
        "transcript": n.transcript,
        "detected_language": n.detected_language,
        "action": n.action,
        "follow_up_date": n.follow_up_date.isoformat() if n.follow_up_date else None,
        "summary": n.summary,
        "created_at": iso(n.created_at),
    }


def beneficiary_out(session: Session, b: Beneficiary) -> dict[str, Any]:
    open_alerts = session.exec(
        select(func.count()).select_from(Alert).where(Alert.beneficiary_id == b.id, Alert.status == "open")
    ).one()
    high_open = session.exec(
        select(func.count()).select_from(Alert).where(
            Alert.beneficiary_id == b.id, Alert.status == "open", Alert.severity == "high"
        )
    ).one()
    last_call = session.exec(
        select(Call).where(Call.beneficiary_id == b.id).order_by(Call.triggered_at.desc()).limit(1)
    ).first()
    if high_open:
        risk = "high"
    elif open_alerts:
        risk = "watch"
    else:
        risk = "normal"
    return {
        "id": b.id,
        "name": b.name,
        "phone": b.phone,
        "language": b.language,
        "village": b.village,
        "category": b.category,
        "edd": b.edd.isoformat() if b.edd else None,
        "delivery_date": b.delivery_date.isoformat() if b.delivery_date else None,
        "weeks_pregnant": weeks_pregnant(b),
        "days_since_delivery": days_since_delivery(b),
        "next_visit_date": b.next_visit_date.isoformat() if b.next_visit_date else None,
        "next_visit_type": b.next_visit_type,
        "notes": b.notes,
        "risk": risk,
        "open_alerts": open_alerts,
        "last_call": call_out(last_call, b) if last_call else None,
        "created_at": iso(b.created_at),
    }
