"""A week of synthetic history for the demo ASHAs, so the impact panel and call history aren't empty.

Every conversation here is invented. Greetings come from prompts.py; the women's replies reuse the
synthetic sentences of the noise evaluation (eval/noise_eval.py).
"""
from __future__ import annotations

from datetime import datetime, timedelta

from sqlmodel import Session, select

from . import prompts
from .models import Alert, Asha, Beneficiary, Call, Note
from .services.serialize import today

# "No, I'm fine, I take the iron tablet daily", per language
FINE: dict[str, str] = {
    "hi-IN": "नहीं, मैं ठीक हूँ, आयरन की गोली रोज़ ले रही हूँ।",
    "en-IN": "I am fine, next week checkup ke liye PHC jaungi.",
    "mr-IN": "नाही, मी बरी आहे, रोज लोहाची गोळी घेते.",
    "bn-IN": "না, আমি ভালো আছি, রোজ আয়রন ট্যাবলেট খাচ্ছি।",
    "ta-IN": "இல்லை, நான் நன்றாக இருக்கிறேன், தினமும் இரும்புச்சத்து மாத்திரை சாப்பிடுகிறேன்.",
    "te-IN": "లేదు, నేను బాగానే ఉన్నాను, రోజూ ఐరన్ మాత్ర వేసుకుంటున్నాను.",
    "kn-IN": "ಇಲ್ಲ, ನಾನು ಚೆನ್ನಾಗಿದ್ದೇನೆ, ಪ್ರತಿದಿನ ಕಬ್ಬಿಣದ ಮಾತ್ರೆ ತೆಗೆದುಕೊಳ್ಳುತ್ತಿದ್ದೇನೆ.",
    "ml-IN": "ഇല്ല, എനിക്ക് സുഖമാണ്, ദിവസവും അയൺ ഗുളിക കഴിക്കുന്നുണ്ട്.",
    "gu-IN": "ના, હું સારી છું, રોજ આયર્નની ગોળી લઉં છું.",
    "pa-IN": "ਨਹੀਂ, ਮੈਂ ਠੀਕ ਹਾਂ, ਰੋਜ਼ ਆਇਰਨ ਦੀ ਗੋਲੀ ਲੈਂਦੀ ਹਾਂ।",
}
FINE_EN = {"en-IN": "I'm fine, I'll go to the PHC for next week's check-up."}
FINE_EN_DEFAULT = "No, I'm fine, I take the iron tablet every day."

# Special conversations: (user line, user English, MomCheck line, MomCheck English) pairs
SPECIAL: dict[str, dict] = {
    "red_movement": {
        "turns": [
            ("कल रात से बच्चा पेट में कम हिल रहा है।", "Since last night the baby has been moving less in my belly.",
             "यह ज़रूरी बात है। आप अभी ज़िला महिला अस्पताल जाइए, एक सौ आठ पर एम्बुलेंस मुफ़्त है। मीना दीदी को अभी बता रही हूँ।",
             "This is important. Please go to the District Women Hospital now; the 108 ambulance is free. I'm telling Meena didi right now."),
            ("ठीक है, अभी जाती हूँ।", "Okay, I'm going now.", None, None),
        ],
        "signs": ["Baby moving less than usual or not moving"],
        "checklist": {"feeling": "ok", "movement": "danger"},
        "triage": "red",
        "outcome": "DANGER_SIGN",
        "summary": "{first} said the baby has been moving less since last night. Advised to go to the District Women Hospital now on the free 108 ambulance; she agreed to go.",
        "ack_minutes": 9,
    },
    "amber_swelling": {
        "turns": [
            ("हो ताई, दोन दिवसांपासून माझ्या पायांना खूप सूज आली आहे.", "Yes tai, my feet have been very swollen for two days.",
             "हे आज-उद्या आरोग्य कर्मचाऱ्याने तपासणं गरजेचं आहे. सविता ताईंना आत्ताच कळवते, त्या लवकरच तुम्हाला भेटतील.",
             "A health worker needs to check this today or tomorrow. I'm telling Savita tai right now; she will see you soon."),
            ("बरं, धन्यवाद.", "Okay, thank you.", None, None),
        ],
        "signs": ["Sudden swelling of face, hands or feet"],
        "checklist": {"feeling": "ok", "swelling": "concern", "tablets": "ok"},
        "triage": "amber",
        "outcome": "DANGER_SIGN",
        "summary": "{first} reported swollen feet for two days. Needs a BP check within a day. She is taking her iron tablets daily.",
        "ack_minutes": 22,
    },
    "callback": {
        "turns": [
            ("अभी खेत में हूँ दीदी, शाम को बात करते हैं।", "I'm in the field right now, didi, let's talk in the evening.",
             "ठीक है, हम शाम छह बजे के बाद फ़ोन करेंगे। धन्यवाद!", "Okay, we'll call after 6 pm. Thank you!"),
        ],
        "signs": [],
        "checklist": {},
        "triage": None,
        "outcome": "CALLBACK",
        "summary": "{first} was busy in the field and asked to be called back in the evening.",
        "callback_time": "after 6 pm",
    },
}

# (woman, days ago, hour IST, kind)
HISTORY: dict[str, list[tuple[str, int, int, str]]] = {
    "9000000100": [  # Meena
        ("Shabnam Bano", 6, 10, "routine"),
        ("Sunita Devi", 5, 11, "routine"),
        ("Kiran Verma", 4, 10, "red_movement"),
        ("Rekha Yadav", 2, 16, "routine"),
        ("Shabnam Bano", 1, 12, "callback"),
    ],
    "9000000200": [  # Savita
        ("Pooja Sharma", 6, 11, "routine"),
        ("Lakshmi Murugan", 5, 10, "routine"),
        ("Anjali Patil", 4, 10, "amber_swelling"),
        ("Fathima Beevi", 4, 15, "routine"),
        ("Kavya Gowda", 3, 11, "routine"),
        ("Gurpreet Kaur", 2, 10, "routine"),
        ("Hetal Parmar", 2, 17, "routine"),
        ("Rina Das", 1, 10, "routine"),
        ("Sravani Reddy", 1, 11, "routine"),
    ],
}

NOTES: dict[str, tuple[str, int, str, str, str]] = {
    # asha phone: (woman, days ago, transcript, action, summary)
    "9000000100": ("Kiran Verma", 4, "किरन को अस्पताल ले गई, बच्चा ठीक है, डॉक्टर ने आराम करने को कहा है",
                   "Took her to hospital; baby fine, advised rest", "Kiran was checked at the hospital; the baby is fine."),
    "9000000200": ("Anjali Patil", 3, "अंजलीचा बीपी तपासला, नॉर्मल आहे, पुढच्या आठवड्यात परत भेट देईन",
                   "Checked BP: normal; revisit next week", "Anjali's BP is normal; Savita will visit again next week."),
}


def _at(days_ago: int, hour: int, minute: int = 0) -> datetime:
    """hour:minute IST on that day, as naive UTC like the rest of the database."""
    local = datetime.combine(today() - timedelta(days=days_ago), datetime.min.time()).replace(hour=hour, minute=minute)
    return local - timedelta(hours=5, minutes=30)


def add_history(session: Session, asha: Asha) -> None:
    plan = HISTORY.get(asha.phone)
    if not plan:
        return
    women = {b.name: b for b in session.exec(select(Beneficiary).where(Beneficiary.asha_id == asha.id)).all()}
    for i, (name, days_ago, hour, kind) in enumerate(plan):
        b = women.get(name)
        if b is None:
            continue
        first = b.name.split()[0]
        start = _at(days_ago, hour, (i * 7) % 50)
        transcript = [{"role": "assistant", "content": prompts.greeting_for(b.language, b.name), "language": b.language}]
        if kind == "routine":
            transcript.append({"role": "user", "content": FINE[b.language], "language": b.language, "en": FINE_EN.get(b.language, FINE_EN_DEFAULT)})
            transcript.append({"role": "assistant", "content": prompts.end_message_for(b.language), "language": b.language})
            postnatal = b.category == "postnatal"
            spec = {
                "signs": [],
                "checklist": {"feeling": "ok", "m_bleeding": "ok", "b_feeding": "ok"} if postnatal else {"feeling": "ok", "bleeding": "ok", "tablets": "ok"},
                "triage": "green",
                "outcome": "ROUTINE",
                "summary": f"{first} and her baby are doing well; no danger signs. She is taking her iron tablets." if postnatal
                else f"{first} is well and taking her iron tablets daily. No danger signs.",
            }
        else:
            spec = SPECIAL[kind]
            for user, user_en, reply, reply_en in spec["turns"]:
                transcript.append({"role": "user", "content": user, "language": b.language, "en": user_en})
                if reply:
                    transcript.append({"role": "assistant", "content": reply, "language": b.language, "en": reply_en})
            transcript.append({"role": "assistant", "content": prompts.end_message_for(b.language), "language": b.language})
        duration = 70 + 25 * len(transcript)
        call = Call(
            beneficiary_id=b.id,
            language=b.language,
            status="completed",
            channel="browser",
            outcome=spec["outcome"],
            danger_signs=spec["signs"],
            summary=spec["summary"].format(first=first),
            transcript=transcript,
            extraction={"callback_time": spec.get("callback_time")} if spec.get("callback_time") else {},
            checklist=spec["checklist"],
            triage=spec["triage"],
            phone_line=True,
            duration_sec=duration,
            triggered_at=start,
            completed_at=start + timedelta(seconds=duration),
        )
        session.add(call)
        session.flush()
        if spec["signs"]:
            created = start + timedelta(seconds=40)
            session.add(
                Alert(
                    beneficiary_id=b.id,
                    call_id=call.id,
                    severity="high" if spec["triage"] == "red" else "medium",
                    reason="Reported on a follow-up call: " + ", ".join(spec["signs"]),
                    danger_signs=spec["signs"],
                    status="acknowledged",
                    created_at=created,
                    acknowledged_at=created + timedelta(minutes=spec["ack_minutes"]),
                )
            )
    note = NOTES.get(asha.phone)
    if note and note[0] in women:
        name, days_ago, transcript, action, summary = note
        session.add(
            Note(asha_id=asha.id, beneficiary_id=women[name].id, transcript=transcript, detected_language=asha.language,
                 action=action, summary=summary, created_at=_at(days_ago, 15))
        )
    session.commit()
