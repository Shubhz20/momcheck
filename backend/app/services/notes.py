"""ASHA voice notes: Prisma STT -> Gemini extraction -> confirmable draft."""
from __future__ import annotations

import logging
from datetime import date
from typing import Any

from sqlmodel import Session, select

from .. import llm, prompts
from ..gnani import speech
from ..models import Beneficiary
from .serialize import today

log = logging.getLogger("notes")


async def draft_note(session: Session, audio: bytes, filename: str, language: str | None) -> dict[str, Any]:
    women = session.exec(select(Beneficiary)).all()
    stt = await speech.transcribe(
        audio,
        filename=filename or "note.wav",
        language_code=language or "indic-auto",
        keyterms=[w.name for w in women] + [w.village for w in women if w.village] + ["ASHA", "PHC", "ANM", "BP", "IFA"],
        topic="An ASHA health worker's note after a home visit to a pregnant woman or new mother.",
    )
    transcript = (stt.get("transcript") or "").strip()
    draft: dict[str, Any] = {
        "transcript": transcript,
        "detected_language": stt.get("detected_language_code") or language,
        "beneficiary_id": None,
        "beneficiary_name": None,
        "action": "",
        "follow_up_date": None,
        "summary": transcript,
    }
    if not transcript:
        return draft
    try:
        result = await llm.complete_json(
            prompts.NOTE_EXTRACTION_PROMPT.format(
                today=today().isoformat(),
                beneficiaries="\n".join(f"{w.id}: {w.name}, {w.village}" for w in women) or "(none)",
                transcript=transcript.replace('"', "'"),
            )
        )
    except llm.LLMError as exc:
        log.warning("Note extraction failed: %s", exc)
        return draft

    bid = result.get("beneficiary_id")
    match = next((w for w in women if str(w.id) == str(bid)), None)
    follow_up = result.get("follow_up_date")
    try:
        follow_up = date.fromisoformat(follow_up).isoformat() if follow_up else None
    except ValueError:
        follow_up = None
    draft.update(
        beneficiary_id=match.id if match else None,
        beneficiary_name=match.name if match else None,
        action=result.get("action") or "",
        follow_up_date=follow_up,
        summary=result.get("summary") or transcript,
    )
    return draft
