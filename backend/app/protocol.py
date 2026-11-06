"""What MomCheck checks on every call, and how urgent each danger sign is.

Danger signs follow India's Mother and Child Protection (MCP) card and the Home-Based Newborn Care (HBNC)
guidelines. Each sign is RED (go to a hospital now, free ambulance 108/102) or AMBER (needs a health worker
within a day). MomCheck screens and escalates; it never diagnoses.
"""
from __future__ import annotations

from dataclasses import dataclass

RED, AMBER = "red", "amber"
LEVEL_RANK = {None: 0, AMBER: 1, RED: 2}

# Checklist states, per item, as the call goes on
OK, CONCERN, DANGER = "ok", "concern", "danger"
STATE_RANK = {None: 0, OK: 1, CONCERN: 2, DANGER: 3}

# Home-Based Newborn Care visit days (days after delivery)
HBNC_DAYS = (3, 7, 14, 21, 28, 42)

TELE_MANAS = "14416"  # national tele mental-health helpline, free, 24x7


@dataclass(frozen=True)
class Item:
    """One row of the live checklist the ASHA watches during a call."""

    id: str
    label: str  # shown to the ASHA
    ask: str  # what MomCheck asks, in English (it speaks her language)
    group: str  # pregnancy | mother | newborn | mood | care
    min_weeks: int = 0  # pregnancy only: ask from this week


@dataclass(frozen=True)
class Sign:
    label: str  # exact English label, stored on calls and alerts
    level: str  # red | amber
    item: str  # checklist row it belongs to
    group: str  # pregnancy | mother | newborn | mood


PREGNANCY_ITEMS = [
    Item("feeling", "How she feels", "How are you feeling today?", "pregnancy"),
    Item("bleeding", "Bleeding", "Any bleeding or spotting from the vagina?", "pregnancy"),
    Item("headache", "Headache or blurred vision", "Any severe headache, blurred vision or dizziness?", "pregnancy"),
    Item("swelling", "Swelling", "Any sudden swelling of the face, hands or feet?", "pregnancy"),
    Item("fever", "Fever", "Any fever?", "pregnancy"),
    Item("belly", "Belly pain or leaking water", "Any severe pain in the belly, or water leaking?", "pregnancy"),
    Item("movement", "Baby's movements", "Is the baby moving in the womb as much as usual?", "pregnancy", min_weeks=20),
    Item("tablets", "Iron and calcium tablets", "Is she taking the iron (IFA) and calcium tablets every day?", "care"),
    Item("next_visit", "Next check-up", "Will she be able to go for her next check-up?", "care"),
]

POSTNATAL_ITEMS = [
    Item("feeling", "How she feels", "How are you feeling since the delivery?", "mother"),
    Item("m_bleeding", "Bleeding", "Is the bleeding heavy (soaking a pad within an hour)?", "mother"),
    Item("m_fever", "Fever or bad-smelling discharge", "Any fever, or bad-smelling discharge?", "mother"),
    Item("m_breast", "Breasts", "Are her breasts painful, hard or swollen?", "mother"),
    Item("mood", "Mood", "Two gentle questions: has she often felt low, sad or like crying in the last two weeks? Does she still enjoy small things?", "mood"),
    Item("b_feeding", "Baby feeding", "Is the baby breastfeeding well?", "newborn"),
    Item("b_breathing", "Baby's breathing", "Is the baby breathing comfortably, not fast or with effort?", "newborn"),
    Item("b_warmth", "Baby hot or cold", "Does the baby feel too hot or too cold?", "newborn"),
    Item("b_yellow", "Yellow skin or eyes", "Are the baby's skin or eyes turning yellow?", "newborn"),
    Item("b_cord", "Cord", "Is the cord stump clean and dry, with no redness or pus?", "newborn"),
    Item("b_active", "Baby active", "Is the baby active, not too sleepy, and no fits?", "newborn"),
    Item("next_visit", "Next visit", "Will she be home for the next home visit?", "care"),
]

PREGNANCY_SIGNS = [
    Sign("Bleeding from the vagina", RED, "bleeding", "pregnancy"),
    Sign("Severe headache, blurred vision or dizziness", RED, "headache", "pregnancy"),
    Sign("Fits or convulsions", RED, "headache", "pregnancy"),
    Sign("Severe pain in the abdomen", RED, "belly", "pregnancy"),
    Sign("Leaking of water or fluid", RED, "belly", "pregnancy"),
    Sign("Baby moving less than usual or not moving", RED, "movement", "pregnancy"),
    Sign("Difficulty in breathing", RED, "feeling", "pregnancy"),
    Sign("Sudden swelling of face, hands or feet", AMBER, "swelling", "pregnancy"),
    Sign("High fever", AMBER, "fever", "pregnancy"),
]

POSTNATAL_SIGNS = [
    Sign("Heavy bleeding after delivery", RED, "m_bleeding", "mother"),
    Sign("Severe headache, blurred vision or fits", RED, "feeling", "mother"),
    Sign("Thoughts of harming herself or the baby", RED, "mood", "mood"),
    Sign("Baby not feeding well", RED, "b_feeding", "newborn"),
    Sign("Baby breathing fast or with difficulty", RED, "b_breathing", "newborn"),
    Sign("Baby has fever or feels cold", RED, "b_warmth", "newborn"),
    Sign("Baby very sleepy, not moving or having fits", RED, "b_active", "newborn"),
    Sign("Fever in the mother", AMBER, "m_fever", "mother"),
    Sign("Foul-smelling discharge", AMBER, "m_fever", "mother"),
    Sign("Painful, swollen breasts with fever", AMBER, "m_breast", "mother"),
    Sign("Feeling very low or hopeless", AMBER, "mood", "mood"),
    Sign("Baby's skin or eyes turning yellow", AMBER, "b_yellow", "newborn"),
    Sign("Redness or pus at baby's umbilical cord", AMBER, "b_cord", "newborn"),
]

ALL_SIGNS = {s.label: s for s in [*PREGNANCY_SIGNS, *POSTNATAL_SIGNS]}


def items_for(category: str, weeks: int | None = None) -> list[Item]:
    if category == "postnatal":
        return POSTNATAL_ITEMS
    return [i for i in PREGNANCY_ITEMS if not i.min_weeks or (weeks or 0) >= i.min_weeks]


def signs_for(category: str) -> list[Sign]:
    return POSTNATAL_SIGNS if category == "postnatal" else PREGNANCY_SIGNS


def level_of(signs: list[str]) -> str | None:
    """Most urgent level among the reported signs (signs not in the catalogue count as amber)."""
    level = None
    for label in signs:
        lv = ALL_SIGNS[label].level if label in ALL_SIGNS else AMBER
        if LEVEL_RANK[lv] > LEVEL_RANK[level]:
            level = lv
    return level


def severity_of(signs: list[str]) -> str:
    """Alert severity as stored on the Alert table."""
    return "high" if level_of(signs) == RED else "medium"


def groups_of(signs: list[str]) -> list[str]:
    return sorted({ALL_SIGNS[s].group for s in signs if s in ALL_SIGNS})


def merge_checklist(current: dict | None, update: dict | None, signs: list[str], items: list[Item]) -> dict[str, str]:
    """Combine what's known so far with this turn's update. A worse state always wins; danger signs mark their row."""
    valid = {i.id for i in items}
    out = {k: v for k, v in (current or {}).items() if k in valid and v in STATE_RANK}
    proposals = [(k, v) for k, v in (update or {}).items() if k in valid and v in (OK, CONCERN, DANGER)]
    for label in signs:
        s = ALL_SIGNS.get(label)
        if s and s.item in valid:
            proposals.append((s.item, DANGER if s.level == RED else CONCERN))
    for k, v in proposals:
        if STATE_RANK[v] > STATE_RANK[out.get(k)]:
            out[k] = v
    return out


def triage(signs: list[str], checklist: dict | None) -> str | None:
    """red / amber / green for the risk meter; None while too little is known."""
    level = level_of(signs)
    if level:
        return level
    states = list((checklist or {}).values())
    if CONCERN in states:
        return AMBER
    if sum(1 for s in states if s == OK) >= 3:
        return "green"
    return None


def checklist_out(category: str, weeks: int | None, checklist: dict | None) -> list[dict]:
    return [{"id": i.id, "label": i.label, "group": i.group, "state": (checklist or {}).get(i.id)} for i in items_for(category, weeks)]


def next_hbnc_day(days_since_delivery: int | None) -> int | None:
    if days_since_delivery is None:
        return None
    return next((d for d in HBNC_DAYS if d >= days_since_delivery), None)
