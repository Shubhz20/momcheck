"""Demo data: women across India in all 10 supported languages.

All names and phone numbers are synthetic (the numbers are placeholders in the 90000-000xx range).
"""
from __future__ import annotations

from datetime import timedelta

from sqlmodel import Session, func, select

from .models import Beneficiary
from .services.serialize import today

# (name, language, village, category, weeks pregnant / days since delivery, days until next visit, visit type)
DEMO_WOMEN = [
    ("Sunita Devi", "hi-IN", "Barabanki, Uttar Pradesh", "pregnant", 32, 2, "ANC check-up 3"),
    ("Lakshmi Murugan", "ta-IN", "Tiruvannamalai, Tamil Nadu", "pregnant", 24, 5, "ANC check-up 2"),
    ("Rina Das", "bn-IN", "Krishnanagar, West Bengal", "postnatal", 5, 2, "PNC visit (day 7)"),
    ("Anjali Patil", "mr-IN", "Satara, Maharashtra", "pregnant", 36, 1, "ANC check-up 4"),
    ("Kavya Gowda", "kn-IN", "Mandya, Karnataka", "pregnant", 14, 9, "TT-2 injection"),
    ("Sravani Reddy", "te-IN", "Nalgonda, Telangana", "postnatal", 12, 2, "PNC visit (day 14)"),
    ("Fathima Beevi", "ml-IN", "Malappuram, Kerala", "pregnant", 28, 4, "ANC check-up 3"),
    ("Gurpreet Kaur", "pa-IN", "Moga, Punjab", "pregnant", 20, 6, "Anomaly scan"),
    ("Hetal Parmar", "gu-IN", "Anand, Gujarat", "pregnant", 30, 3, "ANC check-up 3"),
    ("Pooja Sharma", "en-IN", "Pune, Maharashtra", "pregnant", 26, 7, "Glucose test"),
]


def seed_demo(session: Session) -> int:
    if session.exec(select(func.count()).select_from(Beneficiary)).one() > 0:
        return 0
    t = today()
    for i, (name, lang, village, category, age, visit_in, visit_type) in enumerate(DEMO_WOMEN, start=1):
        b = Beneficiary(
            name=name,
            phone=f"90000000{i:02d}",
            language=lang,
            village=village,
            category=category,
            next_visit_date=t + timedelta(days=visit_in),
            next_visit_type=visit_type,
        )
        if category == "pregnant":
            b.edd = t + timedelta(weeks=40 - age)
        else:
            b.delivery_date = t - timedelta(days=age)
        session.add(b)
    session.commit()
    return len(DEMO_WOMEN)
