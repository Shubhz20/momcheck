"""Prompts and localized messages for the MomCheck voice agent.

Medical content follows the danger signs printed on India's Mother and Child Protection (MCP) card.
The agent screens and escalates; it never diagnoses or prescribes.
"""
from __future__ import annotations

from jinja2 import Template

# Spoken greeting per language. {name} is filled in per call.
# Simple, polite phrasing — to be reviewed by native speakers.
GREETINGS: dict[str, str] = {
    "hi-IN": "नमस्ते {name} जी, मैं मॉमचेक से बोल रही हूँ। आपकी आशा दीदी की तरफ़ से आपकी और बच्चे की सेहत के बारे में पूछने के लिए फ़ोन किया है। क्या अभी दो मिनट बात कर सकती हैं?",
    "en-IN": "Hello {name}, this is MomCheck, calling on behalf of your ASHA didi to check on your health and your baby's. Is this a good time to talk for two minutes?",
    "mr-IN": "नमस्कार {name} ताई, मी मॉमचेकमधून बोलतेय. तुमच्या आशा ताईंच्या वतीने तुमच्या आणि बाळाच्या तब्येतीची चौकशी करण्यासाठी फोन केला आहे. आत्ता दोन मिनिटं बोलू शकाल का?",
    "bn-IN": "নমস্কার {name}, আমি মমচেক থেকে বলছি। আপনার আশা দিদির পক্ষ থেকে আপনার আর বাচ্চার শরীর কেমন আছে জানতে ফোন করেছি। এখন কি দুই মিনিট কথা বলতে পারবেন?",
    "ta-IN": "வணக்கம் {name}, நான் மாம்செக்கிலிருந்து பேசுகிறேன். உங்கள் ஆஷா அக்கா சார்பாக உங்கள் மற்றும் குழந்தையின் உடல்நலம் பற்றி கேட்க அழைக்கிறேன். இப்போது இரண்டு நிமிடம் பேச முடியுமா?",
    "te-IN": "నమస్కారం {name} గారు, నేను మామ్‌చెక్ నుండి మాట్లాడుతున్నాను. మీ ఆశా అక్క తరఫున మీ మరియు బిడ్డ ఆరోగ్యం గురించి తెలుసుకోవడానికి కాల్ చేశాను. ఇప్పుడు రెండు నిమిషాలు మాట్లాడగలరా?",
    "kn-IN": "ನಮಸ್ಕಾರ {name} ಅವರೇ, ನಾನು ಮಾಮ್‌ಚೆಕ್‌ನಿಂದ ಮಾತನಾಡುತ್ತಿದ್ದೇನೆ. ನಿಮ್ಮ ಆಶಾ ಅಕ್ಕನ ಪರವಾಗಿ ನಿಮ್ಮ ಮತ್ತು ಮಗುವಿನ ಆರೋಗ್ಯದ ಬಗ್ಗೆ ಕೇಳಲು ಕರೆ ಮಾಡಿದ್ದೇನೆ. ಈಗ ಎರಡು ನಿಮಿಷ ಮಾತನಾಡಬಹುದೇ?",
    "ml-IN": "നമസ്കാരം {name}, ഞാൻ മോംചെക്കിൽ നിന്നാണ്. നിങ്ങളുടെ ആശ ചേച്ചിക്കു വേണ്ടി നിങ്ങളുടെയും കുഞ്ഞിന്റെയും ആരോഗ്യം അന്വേഷിക്കാൻ വിളിക്കുകയാണ്. ഇപ്പോൾ രണ്ടു മിനിറ്റ് സംസാരിക്കാമോ?",
    "gu-IN": "નમસ્તે {name} બેન, હું મૉમચેકમાંથી બોલું છું. તમારા આશા બેન તરફથી તમારી અને બાળકની તબિયત વિશે પૂછવા ફોન કર્યો છે. શું અત્યારે બે મિનિટ વાત કરી શકો?",
    "pa-IN": "ਸਤ ਸ੍ਰੀ ਅਕਾਲ {name} ਜੀ, ਮੈਂ ਮੌਮਚੈਕ ਤੋਂ ਬੋਲ ਰਹੀ ਹਾਂ। ਤੁਹਾਡੀ ਆਸ਼ਾ ਦੀਦੀ ਵੱਲੋਂ ਤੁਹਾਡੀ ਅਤੇ ਬੱਚੇ ਦੀ ਸਿਹਤ ਬਾਰੇ ਪੁੱਛਣ ਲਈ ਫ਼ੋਨ ਕੀਤਾ ਹੈ। ਕੀ ਹੁਣ ਦੋ ਮਿੰਟ ਗੱਲ ਕਰ ਸਕਦੇ ਹੋ?",
}

END_MESSAGES: dict[str, str] = {
    "hi-IN": "धन्यवाद, अपना और बच्चे का ध्यान रखिए। नमस्ते!",
    "en-IN": "Thank you, please take care of yourself and your baby. Goodbye!",
    "mr-IN": "धन्यवाद, स्वतःची आणि बाळाची काळजी घ्या. नमस्कार!",
    "bn-IN": "ধন্যবাদ, নিজের আর বাচ্চার যত্ন নেবেন। নমস্কার!",
    "ta-IN": "நன்றி, உங்களையும் குழந்தையையும் கவனமாக பார்த்துக்கொள்ளுங்கள். வணக்கம்!",
    "te-IN": "ధన్యవాదాలు, మీ మరియు బిడ్డ ఆరోగ్యం జాగ్రత్తగా చూసుకోండి. నమస్కారం!",
    "kn-IN": "ಧನ್ಯವಾದಗಳು, ನಿಮ್ಮ ಮತ್ತು ಮಗುವಿನ ಆರೋಗ್ಯ ನೋಡಿಕೊಳ್ಳಿ. ನಮಸ್ಕಾರ!",
    "ml-IN": "നന്ദി, നിങ്ങളെയും കുഞ്ഞിനെയും നന്നായി ശ്രദ്ധിക്കുക. നമസ്കാരം!",
    "gu-IN": "આભાર, તમારું અને બાળકનું ધ્યાન રાખજો. નમસ્તે!",
    "pa-IN": "ਧੰਨਵਾਦ, ਆਪਣਾ ਅਤੇ ਬੱਚੇ ਦਾ ਧਿਆਨ ਰੱਖਣਾ। ਸਤ ਸ੍ਰੀ ਅਕਾਲ!",
}

PREGNANCY_DANGER_SIGNS = [
    "Bleeding from the vagina",
    "Severe headache, blurred vision or dizziness",
    "Fits or convulsions",
    "Sudden swelling of face, hands or feet",
    "High fever",
    "Severe pain in the abdomen",
    "Baby moving less than usual or not moving",
    "Leaking of water or fluid",
    "Difficulty in breathing",
]

POSTNATAL_DANGER_SIGNS = [
    "Heavy bleeding after delivery",
    "Fever in the mother",
    "Foul-smelling discharge",
    "Severe headache, blurred vision or fits",
    "Painful, swollen breasts with fever",
    "Feeling very low or hopeless",
    "Baby not feeding well",
    "Baby has fever or feels cold",
    "Baby breathing fast or with difficulty",
    "Baby's skin or eyes turning yellow",
    "Redness or pus at baby's umbilical cord",
    "Baby very sleepy, not moving or having fits",
]

AGENT_SYSTEM_PROMPT = Template(
    """You are "MomCheck", a warm, patient maternal-health follow-up assistant calling on behalf of {{ asha_name }}, the ASHA worker of {{ village }}. You speak to women in rural and semi-urban India on ordinary phone lines.

## Who you are calling
- Name: {{ name }}
- Status: {{ status_line }}
- Next visit: {{ next_visit_line }}
- Today's date: {{ today }}
- Preferred language: {{ language_name }}

## Language
- Speak in {{ language_name }} using simple, everyday spoken words, not textbook language. If she mixes English words (or Hindi) into her speech, it is fine to mix the same way.
- If she clearly prefers another language, switch to it.
- If you say your name in an Indian language, write it in that script so it is pronounced well: मॉमचेक (Hindi, Marathi), মমচেক (Bengali), மாம்செக் (Tamil), మామ్‌చెక్ (Telugu), ಮಾಮ್‌ಚೆಕ್ (Kannada), മോംചെക്ക് (Malayalam), મૉમચેક (Gujarati), ਮੌਮਚੈਕ (Punjabi).
- Keep every reply to one or two short sentences. Ask only ONE question at a time and wait for her answer.

## Call flow
1. Confirm you are speaking with {{ name }}. If someone else answers, politely ask when {{ name }} will be available, thank them and end the call.
2. If she says it is not a good time, ask when to call back, thank her and end the call.
3. Ask how she is feeling today.
4. Screen for danger signs. Ask about these one by one in simple words (yes/no questions), not as a list:
{% for sign in danger_signs %}   - {{ sign }}
{% endfor %}5. Remind her about her next visit ({{ next_visit_line }}) and ask if she will be able to go. Mention that ambulance service 102/108 is free for pregnant women and new mothers.
6. Ask if she has any question. Answer briefly using only the facts below. If you do not know, say that {{ asha_name }} will answer it when she visits.
7. Thank her and end the call warmly.

## If she reports ANY danger sign
- Stay calm and kind. Do not frighten her.
- Tell her this needs to be checked by a health worker today, and that {{ asha_name }} will call her very soon.
- If she reports heavy bleeding, fits, fainting or difficulty breathing, tell her to call 108 for the free ambulance immediately and go to the nearest hospital.
- Never diagnose, never name a disease, never suggest any medicine or dose.

## Facts you may share
- Take the iron (IFA) and calcium tablets daily exactly as given by the ASHA or ANM. Black stools after iron tablets are normal.
- Eat a variety of food: green leafy vegetables, dal, milk, eggs or meat if she eats them, fruits, and drink plenty of water. Rest on her left side during the day.
- At least four antenatal check-ups are recommended, and delivery should happen in a hospital or health centre. Government schemes like Janani Suraksha Yojana support institutional delivery; {{ asha_name }} can help with the papers.
- After delivery: breastfeed within one hour and exclusively for six months, keep the baby warm, and keep the cord clean and dry.

## Rules
- Never ask for Aadhaar, bank details, OTPs or money. If she asks, say MomCheck never asks for these.
- Do not make promises about money, appointments or doctors.
- You are an assistant, not a doctor. Be honest if you are unsure.
"""
)


CHAT_OUTPUT_RULES = """
## Output format (very important)
Your reply is converted to speech by a text-to-speech voice. For every turn, return ONLY JSON:
{"reply": "<what you say next, in her language>", "end_call": <true|false>, "danger_signs": [<labels>]}
- "reply": one or two short spoken sentences in {{ language_name }}, in its native script (except English words she uses). Write numbers, dates and times as words. No emojis, symbols, lists or brackets.
- "end_call": true only when your reply is the final goodbye.
- "danger_signs": the exact English labels from the danger-sign list that she has reported so far in this call (empty list if none).
- If her message is "(inaudible)" or makes no sense, politely ask her to repeat.
"""


def render_system_prompt(
    *,
    name: str,
    village: str,
    asha_name: str,
    category: str,
    weeks_pregnant: int | None,
    days_since_delivery: int | None,
    next_visit_line: str,
    today: str,
    language_name: str,
) -> str:
    if category == "postnatal":
        status_line = (
            f"New mother, delivered {days_since_delivery} days ago" if days_since_delivery is not None else "New mother"
        )
        signs = POSTNATAL_DANGER_SIGNS
    else:
        status_line = f"Pregnant, about {weeks_pregnant} weeks" if weeks_pregnant is not None else "Pregnant"
        signs = PREGNANCY_DANGER_SIGNS
    body = AGENT_SYSTEM_PROMPT.render(
        name=name,
        village=village or "her village",
        asha_name=asha_name,
        status_line=status_line,
        next_visit_line=next_visit_line,
        today=today,
        language_name=language_name,
        danger_signs=signs,
    )
    return body + Template(CHAT_OUTPUT_RULES).render(language_name=language_name)


def greeting_for(language: str, name: str) -> str:
    return GREETINGS.get(language, GREETINGS["en-IN"]).format(name=name)


def end_message_for(language: str) -> str:
    return END_MESSAGES.get(language, END_MESSAGES["en-IN"])


# ---- Gemini prompts --------------------------------------------------------

CALL_ANALYSIS_PROMPT = """You review transcripts of maternal-health follow-up phone calls made by an assistant to a woman in India.
The transcript may be in any Indian language, code-mixed, or contain speech-recognition errors from a noisy phone line.

Woman: {name} ({status_line})
Danger signs to check for:
{danger_signs}

Transcript:
{transcript}

Return JSON with exactly these keys:
- "outcome": one of "DANGER_SIGN" (she or the person answering reported ANY danger sign, even uncertainly), "CALLBACK" (not a good time / wrong person / asked to call later), "NOT_REACHABLE" (no real conversation happened), "ROUTINE" (conversation happened, no danger sign).
- "danger_signs": list of the danger signs she reported, using the exact English labels above. Empty list if none.
- "severity": "high" if bleeding, fits, fainting, breathing difficulty, or baby not moving; "medium" for other danger signs; "none" otherwise.
- "summary": 1-3 short English sentences for the ASHA worker: how she is, what she reported, what she said about her next visit, any question she asked.
- "will_attend_next_visit": true, false, or null if not discussed.
- "questions_asked": list of short English phrases for questions she asked (may be empty).
When in doubt about a danger sign, include it: a false alarm is safer than a missed one."""

NOTE_EXTRACTION_PROMPT = """An ASHA (community health) worker in India recorded a short spoken note after a home visit. It may be in any Indian language or code-mixed, and may contain speech-recognition errors.

Today's date: {today}
Women she looks after (id: name, village):
{beneficiaries}

Note (transcribed): "{transcript}"

Return JSON with exactly these keys:
- "beneficiary_id": the id of the woman the note is about (match names loosely, allow spelling or script differences), or null if unclear.
- "action": what the ASHA did or advised, in short English (e.g. "Referred to PHC for BP check").
- "follow_up_date": the follow-up date as YYYY-MM-DD if one is mentioned or implied (e.g. "next week" means today + 7 days), else null.
- "summary": a one-line English summary of the note."""

BRIEFING_PROMPT = """Write a short spoken daily briefing for an ASHA worker named {asha_name}, in {language_name}, to be read aloud by a text-to-speech voice.
Rules: simple spoken {language_name} as a friendly colleague would speak; 4-7 short sentences; write all numbers and dates as words; no lists, no symbols, no emojis, no English headings.
Mention: how many follow-up calls were made today and how many were answered; every open danger alert (woman's name, village and the sign, most urgent first) and that she should call them; visits due in the next few days (names). End with one short encouraging line.

Data (JSON):
{data}

Return JSON: {{"text": "<the briefing>"}}"""
