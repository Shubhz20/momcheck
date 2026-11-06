"""Demo ASHA accounts and their women.

All names and phone numbers are synthetic (phone numbers are placeholders starting 900000).
- Meena Kumari: a rural ASHA in Barabanki, Uttar Pradesh. Her women speak Hindi.
- Savita Jadhav: an urban ASHA (NUHM) in Hadapsar, Pune. Her ward has migrant families from across
  India, so her women speak nine different languages.
"""
from __future__ import annotations

import logging
from datetime import timedelta
from typing import Iterable

from sqlmodel import Session, func, select

from .models import Alert, Asha, Beneficiary, Briefing, Call, Note
from .demo_history import add_history
from .services.serialize import today

log = logging.getLogger("seed")

# (name, language, village, category, weeks pregnant / days since delivery, days until next visit, visit type)
Woman = tuple[str, str, str, str, int, int, str]

MEENA_WOMEN: list[Woman] = [
    ("Sunita Devi", "hi-IN", "Rampur, Barabanki", "pregnant", 32, 2, "ANC check-up 3"),
    ("Rekha Yadav", "hi-IN", "Rampur, Barabanki", "postnatal", 5, 2, "PNC visit (day 7)"),
    ("Kiran Verma", "hi-IN", "Sihali, Barabanki", "pregnant", 36, 1, "ANC check-up 4"),
    ("Shabnam Bano", "hi-IN", "Sihali, Barabanki", "pregnant", 14, 6, "TT-2 injection"),
]

SAVITA_WOMEN: list[Woman] = [
    ("Anjali Patil", "mr-IN", "Sasane Nagar, Hadapsar", "pregnant", 28, 4, "ANC check-up 3"),
    ("Lakshmi Murugan", "ta-IN", "Ramtekdi, Hadapsar", "pregnant", 24, 5, "ANC check-up 2"),
    ("Rina Das", "bn-IN", "Malwadi, Hadapsar", "postnatal", 5, 2, "PNC visit (day 7)"),
    ("Kavya Gowda", "kn-IN", "Gondhale Nagar, Hadapsar", "pregnant", 14, 9, "TT-2 injection"),
    ("Sravani Reddy", "te-IN", "Ramtekdi, Hadapsar", "postnatal", 12, 2, "PNC visit (day 14)"),
    ("Fathima Beevi", "ml-IN", "Satavwadi, Hadapsar", "pregnant", 30, 3, "ANC check-up 3"),
    ("Gurpreet Kaur", "pa-IN", "Magarpatta, Hadapsar", "pregnant", 20, 6, "Anomaly scan"),
    ("Hetal Parmar", "gu-IN", "Sasane Nagar, Hadapsar", "pregnant", 33, 3, "ANC check-up 3"),
    ("Pooja Sharma", "en-IN", "Magarpatta, Hadapsar", "pregnant", 26, 7, "Glucose test"),
]

# Synthetic home positions near each village or locality, for the ASHA's map
COORDS: dict[str, tuple[float, float]] = {
    "Sunita Devi": (26.9884, 81.0961),
    "Rekha Yadav": (26.9902, 81.1003),
    "Kiran Verma": (26.9547, 81.0629),
    "Shabnam Bano": (26.9571, 81.0588),
    "Anjali Patil": (18.4968, 73.9362),
    "Lakshmi Murugan": (18.4986, 73.9151),
    "Rina Das": (18.5041, 73.9328),
    "Kavya Gowda": (18.4929, 73.9391),
    "Sravani Reddy": (18.4979, 73.9166),
    "Fathima Beevi": (18.4993, 73.9447),
    "Gurpreet Kaur": (18.5148, 73.9268),
    "Hetal Parmar": (18.4957, 73.9378),
    "Pooja Sharma": (18.5162, 73.9289),
}

DEMO_ASHAS: list[dict] = [
    {
        "name": "Meena Kumari",
        "phone": "9000000100",
        "area": "Rampur and Sihali, Barabanki (Uttar Pradesh)",
        "language": "hi-IN",
        "women": MEENA_WOMEN,
        "phone_base": 1,
        "facilities": {
            "phc": {"name": "PHC Rampur", "phone": "9000000301", "lat": 26.9851, "lng": 81.1052},
            "hospital": {"name": "District Women Hospital, Barabanki", "phone": "9000000302", "lat": 26.9258, "lng": 81.1869},
            "anm": {"name": "Sushila Verma (ANM)", "phone": "9000000303"},
        },
    },
    {
        "name": "Savita Jadhav",
        "phone": "9000000200",
        "area": "Hadapsar ward, Pune (urban)",
        "language": "mr-IN",
        "women": SAVITA_WOMEN,
        "phone_base": 11,
        "facilities": {
            "phc": {"name": "UPHC Hadapsar", "phone": "9000000311", "lat": 18.5019, "lng": 73.9259},
            "hospital": {"name": "Sassoon General Hospital", "phone": "9000000312", "lat": 18.5268, "lng": 73.8741},
            "anm": {"name": "Rekha Pawar (ANM)", "phone": "9000000313"},
        },
    },
]


def _add_women(session: Session, asha: Asha, women: Iterable[Woman], phone_base: int) -> int:
    t = today()
    count = 0
    for i, (name, lang, village, category, age, visit_in, visit_type) in enumerate(women, start=phone_base):
        b = Beneficiary(
            asha_id=asha.id,
            name=name,
            phone=f"90000000{i:02d}",
            language=lang,
            village=village,
            category=category,
            next_visit_date=t + timedelta(days=visit_in),
            next_visit_type=visit_type,
            lat=COORDS.get(name, (None, None))[0],
            lng=COORDS.get(name, (None, None))[1],
        )
        if category == "pregnant":
            b.edd = t + timedelta(weeks=40 - age)
        else:
            b.delivery_date = t - timedelta(days=age)
        session.add(b)
        count += 1
    session.commit()
    return count


def delete_women(session: Session, women: Iterable[Beneficiary]) -> None:
    """Delete women together with their calls, alerts and notes."""
    for b in women:
        for model in (Alert, Note):
            for row in session.exec(select(model).where(model.beneficiary_id == b.id)).all():
                session.delete(row)
        session.flush()
        for row in session.exec(select(Call).where(Call.beneficiary_id == b.id)).all():
            session.delete(row)
        session.flush()
        session.delete(b)
    session.commit()


def _spec_for(asha: Asha) -> dict | None:
    return next((s for s in DEMO_ASHAS if s["phone"] == asha.phone), None) if asha.is_demo else None


def _setup_demo(session: Session, asha: Asha, spec: dict) -> int:
    asha.facilities = spec["facilities"]
    session.add(asha)
    session.commit()
    count = _add_women(session, asha, spec["women"], spec["phone_base"])
    add_history(session, asha)
    return count


def ensure_demo_accounts(session: Session) -> None:
    """Create the demo ASHAs (with their women) if they don't exist yet."""
    existing = {a.phone: a for a in session.exec(select(Asha).where(Asha.is_demo == True)).all()}  # noqa: E712
    created = False
    for spec in DEMO_ASHAS:
        asha = existing.get(spec["phone"])
        if asha is not None:
            if not asha.facilities:  # created before facilities, map and history existed: rebuild once
                reset_demo(session, asha)
                log.info("Upgraded demo ASHA %s", asha.name)
            continue
        asha = Asha(name=spec["name"], phone=spec["phone"], area=spec["area"], language=spec["language"], is_demo=True)
        session.add(asha)
        session.commit()
        session.refresh(asha)
        _setup_demo(session, asha, spec)
        log.info("Created demo ASHA %s", asha.name)
        created = True
    if created:
        # Demo women from before ASHA accounts existed (no owner, placeholder numbers) are replaced.
        legacy = session.exec(
            select(Beneficiary).where(Beneficiary.asha_id == None, Beneficiary.phone.startswith("90000000"))  # noqa: E711
        ).all()
        if legacy:
            delete_women(session, legacy)
            log.info("Removed %d legacy demo women", len(legacy))


def reset_demo(session: Session, asha: Asha) -> int:
    """Put a demo account back to its starting state (removes calls, alerts, notes and a recorded voice)."""
    spec = _spec_for(asha)
    if spec is None:
        raise ValueError("Only demo accounts can be reset")
    delete_women(session, session.exec(select(Beneficiary).where(Beneficiary.asha_id == asha.id)).all())
    for model in (Note, Briefing):
        for row in session.exec(select(model).where(model.asha_id == asha.id)).all():
            session.delete(row)
    asha.voice_embedding, asha.voice_consent_at, asha.use_own_voice = None, None, True
    session.add(asha)
    session.commit()
    return _setup_demo(session, asha, spec)


def seed_sample(session: Session, asha: Asha) -> int:
    """Give an empty account some sample women (the multilingual set) to try MomCheck with."""
    if session.exec(select(func.count()).select_from(Beneficiary).where(Beneficiary.asha_id == asha.id)).one() > 0:
        return 0
    spec = _spec_for(asha)
    if spec:
        return _setup_demo(session, asha, spec)
    return _add_women(session, asha, SAVITA_WOMEN, 11)
