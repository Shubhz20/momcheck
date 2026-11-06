"""Prompts and localized messages for the MomCheck voice agent.

Medical content follows the danger signs printed on India's Mother and Child Protection (MCP) card.
The agent screens and escalates; it never diagnoses or prescribes.
"""
from __future__ import annotations

from jinja2 import Template

from . import protocol

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

# Greeting when MomCheck speaks in the ASHA's cloned voice: it still says plainly that it is an automated assistant.
OWN_VOICE_GREETINGS: dict[str, str] = {
    "hi-IN": "नमस्ते {name} जी, मैं मॉमचेक हूँ, एक ऑटोमैटिक सहायक। आपकी आशा दीदी की आवाज़ में, उनकी तरफ़ से आपकी और बच्चे की सेहत पूछने के लिए फ़ोन किया है। क्या अभी दो मिनट बात कर सकती हैं?",
    "en-IN": "Hello {name}, this is MomCheck, an automated assistant, speaking in your ASHA didi's voice and on her behalf, to check on your health and your baby's. Is this a good time to talk for two minutes?",
    "mr-IN": "नमस्कार {name} ताई, मी मॉमचेक, एक स्वयंचलित सहाय्यक. तुमच्या आशा ताईंच्या आवाजात, त्यांच्या वतीने तुमच्या आणि बाळाच्या तब्येतीची चौकशी करण्यासाठी फोन केला आहे. आत्ता दोन मिनिटं बोलू शकाल का?",
    "bn-IN": "নমস্কার {name}, আমি মমচেক, একটি স্বয়ংক্রিয় সহকারী। আপনার আশা দিদির গলায়, তাঁর পক্ষ থেকে আপনার আর বাচ্চার শরীর কেমন আছে জানতে ফোন করেছি। এখন কি দুই মিনিট কথা বলতে পারবেন?",
    "ta-IN": "வணக்கம் {name}, நான் மாம்செக், ஒரு தானியங்கி உதவியாளர். உங்கள் ஆஷா அக்காவின் குரலில், அவர் சார்பாக உங்கள் மற்றும் குழந்தையின் உடல்நலம் பற்றி கேட்க அழைக்கிறேன். இப்போது இரண்டு நிமிடம் பேச முடியுமா?",
    "te-IN": "నమస్కారం {name} గారు, నేను మామ్‌చెక్, ఒక ఆటోమేటిక్ సహాయకురాలిని. మీ ఆశా అక్క గొంతుతో, ఆమె తరఫున మీ మరియు బిడ్డ ఆరోగ్యం గురించి తెలుసుకోవడానికి కాల్ చేశాను. ఇప్పుడు రెండు నిమిషాలు మాట్లాడగలరా?",
    "kn-IN": "ನಮಸ್ಕಾರ {name} ಅವರೇ, ನಾನು ಮಾಮ್‌ಚೆಕ್, ಒಂದು ಸ್ವಯಂಚಾಲಿತ ಸಹಾಯಕ. ನಿಮ್ಮ ಆಶಾ ಅಕ್ಕನ ಧ್ವನಿಯಲ್ಲಿ, ಅವರ ಪರವಾಗಿ ನಿಮ್ಮ ಮತ್ತು ಮಗುವಿನ ಆರೋಗ್ಯದ ಬಗ್ಗೆ ಕೇಳಲು ಕರೆ ಮಾಡಿದ್ದೇನೆ. ಈಗ ಎರಡು ನಿಮಿಷ ಮಾತನಾಡಬಹುದೇ?",
    "ml-IN": "നമസ്കാരം {name}, ഞാൻ മോംചെക്ക്, ഒരു ഓട്ടോമാറ്റിക് സഹായി. നിങ്ങളുടെ ആശ ചേച്ചിയുടെ ശബ്ദത്തിൽ, അവർക്കു വേണ്ടി നിങ്ങളുടെയും കുഞ്ഞിന്റെയും ആരോഗ്യം അന്വേഷിക്കാൻ വിളിക്കുകയാണ്. ഇപ്പോൾ രണ്ടു മിനിറ്റ് സംസാരിക്കാമോ?",
    "gu-IN": "નમસ્તે {name} બેન, હું મૉમચેક છું, એક ઑટોમેટિક સહાયક. તમારા આશા બેનના અવાજમાં, તેમના તરફથી તમારી અને બાળકની તબિયત વિશે પૂછવા ફોન કર્યો છે. શું અત્યારે બે મિનિટ વાત કરી શકો?",
    "pa-IN": "ਸਤ ਸ੍ਰੀ ਅਕਾਲ {name} ਜੀ, ਮੈਂ ਮੌਮਚੈਕ ਹਾਂ, ਇੱਕ ਆਟੋਮੈਟਿਕ ਸਹਾਇਕ। ਤੁਹਾਡੀ ਆਸ਼ਾ ਦੀਦੀ ਦੀ ਆਵਾਜ਼ ਵਿੱਚ, ਉਨ੍ਹਾਂ ਵੱਲੋਂ ਤੁਹਾਡੀ ਅਤੇ ਬੱਚੇ ਦੀ ਸਿਹਤ ਬਾਰੇ ਪੁੱਛਣ ਲਈ ਫ਼ੋਨ ਕੀਤਾ ਹੈ। ਕੀ ਹੁਣ ਦੋ ਮਿੰਟ ਗੱਲ ਕਰ ਸਕਦੇ ਹੋ?",
}

# Greeting when she opens her own "Ask MomCheck" link: she came with a question.
ASK_GREETINGS: dict[str, str] = {
    "hi-IN": "नमस्ते {name} जी, मैं मॉमचेक हूँ। बताइए, आज अपनी या बच्चे की सेहत के बारे में क्या पूछना चाहती हैं?",
    "en-IN": "Hello {name}, this is MomCheck. Tell me, what would you like to ask about your health or your baby's today?",
    "mr-IN": "नमस्कार {name} ताई, मी मॉमचेक. सांगा, आज तुमच्या किंवा बाळाच्या तब्येतीबद्दल काय विचारायचं आहे?",
    "bn-IN": "নমস্কার {name}, আমি মমচেক। বলুন, আজ আপনার বা বাচ্চার শরীর নিয়ে কী জানতে চান?",
    "ta-IN": "வணக்கம் {name}, நான் மாம்செக். சொல்லுங்கள், இன்று உங்கள் அல்லது குழந்தையின் உடல்நலம் பற்றி என்ன கேட்க விரும்புகிறீர்கள்?",
    "te-IN": "నమస్కారం {name} గారు, నేను మామ్‌చెక్. చెప్పండి, ఈరోజు మీ లేదా బిడ్డ ఆరోగ్యం గురించి ఏమి అడగాలనుకుంటున్నారు?",
    "kn-IN": "ನಮಸ್ಕಾರ {name} ಅವರೇ, ನಾನು ಮಾಮ್‌ಚೆಕ್. ಹೇಳಿ, ಇಂದು ನಿಮ್ಮ ಅಥವಾ ಮಗುವಿನ ಆರೋಗ್ಯದ ಬಗ್ಗೆ ಏನು ಕೇಳಬೇಕು?",
    "ml-IN": "നമസ്കാരം {name}, ഞാൻ മോംചെക്ക് ആണ്. പറയൂ, ഇന്ന് നിങ്ങളുടെയോ കുഞ്ഞിന്റെയോ ആരോഗ്യത്തെക്കുറിച്ച് എന്താണ് ചോദിക്കാനുള്ളത്?",
    "gu-IN": "નમસ્તે {name} બેન, હું મૉમચેક છું. કહો, આજે તમારી કે બાળકની તબિયત વિશે શું પૂછવું છે?",
    "pa-IN": "ਸਤ ਸ੍ਰੀ ਅਕਾਲ {name} ਜੀ, ਮੈਂ ਮੌਮਚੈਕ ਹਾਂ। ਦੱਸੋ, ਅੱਜ ਤੁਸੀਂ ਆਪਣੀ ਜਾਂ ਬੱਚੇ ਦੀ ਸਿਹਤ ਬਾਰੇ ਕੀ ਪੁੱਛਣਾ ਚਾਹੁੰਦੇ ਹੋ?",
}

# What the ASHA reads aloud to give MomCheck her voice. Reading it is also her spoken consent.
VOICE_SCRIPTS: dict[str, str] = {
    "hi-IN": "मैं {name} हूँ, {area} की आशा कार्यकर्ता। मैं सहमति देती हूँ कि मॉमचेक मेरी आवाज़ में मेरी गर्भवती महिलाओं और नई माताओं से बात करे। मॉमचेक हमेशा बताएगा कि वह एक ऑटोमैटिक सहायक है। अपना और अपने बच्चे का ध्यान रखिए।",
    "en-IN": "I am {name}, the ASHA worker of {area}. I agree that MomCheck may speak in my voice with the pregnant women and new mothers I look after. MomCheck will always tell them it is an automated assistant. Please take care of yourself and your baby.",
    "mr-IN": "मी {name}, {area} ची आशा कार्यकर्ती आहे. मी संमती देते की मॉमचेक माझ्या आवाजात माझ्या गरोदर महिला आणि नवीन मातांशी बोलू शकतो. मॉमचेक नेहमी सांगेल की तो एक स्वयंचलित सहाय्यक आहे. स्वतःची आणि बाळाची काळजी घ्या.",
}
# Any other language: she reads the English script (the cloned voice still speaks every language).

AGENT_SYSTEM_PROMPT = Template(
    """You are "MomCheck", a warm, patient maternal-health assistant working for {{ asha_name }}, the ASHA worker of {{ village }}.
{% if mode == "ask" %}{{ name }} opened her personal "Ask MomCheck" link on her own phone and started this conversation. She may have a question or a worry.
{% else %}You are on a follow-up call with a woman in rural or semi-urban India, on an ordinary phone line.
{% endif %}{% if own_voice %}You speak in {{ asha_name }}'s own voice, cloned with her permission. If she asks whether you are {{ asha_name }}, say honestly that you are MomCheck, an automated assistant using {{ asha_name }}'s voice with her permission, and that {{ asha_name }} reads every conversation.
{% endif %}
## Who you are talking to
- Name: {{ name }}
- Status: {{ status_line }}
- Next visit: {{ next_visit_line }}
- Today's date: {{ today }}
- Preferred language: {{ language_name }}

## Language
- Speak in {{ language_name }} using simple, everyday spoken words, not textbook language. If she mixes English words (or Hindi) into her speech, it is fine to mix the same way.
- If she clearly prefers another language, switch to it.
- If you say your name in an Indian language, write it in that script so it is pronounced well: मॉमचेक (Hindi, Marathi), মমচেক (Bengali), மாம்செக் (Tamil), మామ్‌చెక్ (Telugu), ಮಾಮ್‌ಚೆಕ್ (Kannada), മോംചെക്ക് (Malayalam), મૉમચેક (Gujarati), ਮੌਮਚੈਕ (Punjabi).
- {{ asha_name }} is the ASHA worker. Refer to her the way women in your language respectfully would (for example "Meena didi" in Hindi, "Savita tai" in Marathi, "Selvi akka" in Tamil).
- Write every name (hers, {{ asha_name }}'s, places) in the script of the language you are speaking, e.g. सविता in Hindi or Marathi, সবিতা in Bengali, சவிதா in Tamil.
- Keep every reply to one or two short sentences. Ask only ONE question at a time and wait for her answer.

## Checklist: what to find out, one question at a time, in simple words
{% for item in items %}- [{{ item.id }}] {{ item.label }}: {{ item.ask }}
{% endfor %}
## How the conversation goes
{% if mode == "ask" %}1. Listen to what she wants and answer it first, briefly, using only the facts below.
2. If what she describes could be a danger sign, ask one or two follow-up questions to understand it.
3. Then gently check the most important rows she has not mentioned (bleeding{% if category == "postnatal" %}, the baby's feeding and breathing{% else %}, the baby's movements{% endif %}). Do not go through the whole checklist.
4. Ask if there is anything else, then end warmly.
{% else %}1. Confirm you are speaking with {{ name }}. If someone else answers (a shared phone), do not mention her health or pregnancy; politely ask when {{ name }} will be available, thank them and end the call.
2. If she says it is not a good time, ask when to call back, thank her and end the call.
3. Go through the checklist rows above in order, one question at a time.{% if category == "postnatal" %} Ask about her own recovery first, then the two mood questions gently and without judgement, then the baby.{% endif %}
4. Remind her about her next visit ({{ next_visit_line }}) and ask if she will be able to go.
5. Ask if she has any question. Answer briefly using only the facts below. If you do not know, say that {{ asha_name }} will answer it when she visits.
6. Thank her and end the call warmly.
{% endif %}
## Danger signs and what to tell her
RED, she must go to a hospital now:
{% for s in red %}- {{ s.label }}
{% endfor %}AMBER, a health worker must see her within a day:
{% for s in amber %}- {{ s.label }}
{% endfor %}
- If she reports a RED sign: stay calm and kind, do not frighten her. Tell her to go to {{ hospital }} now, that the ambulance on 108 or 102 is free for pregnant women and new mothers, and that {{ asha_name }} is being told right now and will call her.
- If she reports an AMBER sign: tell her {{ asha_name }} will call or visit her today or tomorrow, and that if it gets worse she should go to {{ phc }}.
- Mood: if she often feels low, be kind, tell her many new mothers feel this way and that {{ asha_name }} will talk with her. If she mentions harming herself or the baby, tell her she is not alone, that {{ asha_name }} will call her right now, and that the free Tele-MANAS helpline 14416 is there for her any time, day or night.
- Never diagnose, never name a disease, never suggest any medicine or dose.

## Facts you may share
- Take the iron (IFA) and calcium tablets daily exactly as given by the ASHA or ANM. Black stools after iron tablets are normal.
- Eat a variety of food: green leafy vegetables, dal, milk, eggs or meat if she eats them, fruits, and drink plenty of water. Rest on her left side during the day.
- At least four antenatal check-ups are recommended, and delivery should happen in a hospital or health centre. On the ninth of every month a doctor checks pregnant women for free at the government health centre (PMSMA). Government schemes like Janani Suraksha Yojana support institutional delivery; {{ asha_name }} can help with the papers.
- After delivery: breastfeed within one hour and exclusively for six months, at least eight times a day; keep the baby warm, skin to skin; put nothing on the cord and keep it clean and dry. {{ asha_name }} visits on days 3, 7, 14, 21, 28 and 42 after delivery.

## Rules
- Never ask for Aadhaar, bank details, OTPs or money. If she asks, say MomCheck never asks for these.
- Do not make promises about money, appointments or doctors.
- You are an assistant, not a doctor. Be honest if you are unsure.
"""
)


CHAT_OUTPUT_RULES = """
## Output format (very important)
Your reply is converted to speech by a text-to-speech voice. For every turn, return ONLY JSON:
{"reply": "<what you say next, in her language>", "reply_en": "<the same in English>", "heard_en": "<what she just said, in English>", "end_call": <true|false>, "danger_signs": [<labels>], "checklist": {"<row id>": "ok" | "concern" | "danger"}}
- "reply": one or two short spoken sentences in {{ language_name }}, in its native script (except English words she uses). Write numbers, dates and times as words. No emojis, symbols, lists or brackets.
- "reply_en" and "heard_en": short, faithful English translations, shown as subtitles to the ASHA. "heard_en" is "" if she said nothing.
- "end_call": true only when your reply is the final goodbye.
- "danger_signs": the exact English labels from the RED and AMBER lists that she has reported so far in this conversation (empty list if none).
- "checklist": the rows (by id) her answers so far tell you about: "ok" if she said it is fine, "concern" for a worry that is not a danger sign (missed tablets, may skip the check-up, a mild problem), "danger" for a danger sign. Leave out every row that has not been discussed; never assume "ok".
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
    hospital: str = "",
    phc: str = "",
    mode: str = "followup",
    own_voice: bool = False,
) -> str:
    if category == "postnatal":
        status_line = (
            f"New mother, delivered {days_since_delivery} days ago" if days_since_delivery is not None else "New mother"
        )
        next_day = protocol.next_hbnc_day(days_since_delivery)
        if next_day:
            status_line += f"; the next home newborn-care visit is on day {next_day} after delivery"
    else:
        status_line = f"Pregnant, about {weeks_pregnant} weeks" if weeks_pregnant is not None else "Pregnant"
    signs = protocol.signs_for(category)
    body = AGENT_SYSTEM_PROMPT.render(
        name=name,
        village=village or "her village",
        asha_name=asha_name,
        status_line=status_line,
        next_visit_line=next_visit_line,
        today=today,
        language_name=language_name,
        category=category,
        items=protocol.items_for(category, weeks_pregnant),
        red=[s for s in signs if s.level == protocol.RED],
        amber=[s for s in signs if s.level == protocol.AMBER],
        hospital=hospital or "the nearest government hospital",
        phc=phc or "the nearest health centre",
        mode=mode,
        own_voice=own_voice,
    )
    return body + Template(CHAT_OUTPUT_RULES).render(language_name=language_name)


def greeting_for(language: str, name: str, *, own_voice: bool = False, mode: str = "followup") -> str:
    table = ASK_GREETINGS if mode == "ask" else OWN_VOICE_GREETINGS if own_voice else GREETINGS
    return table.get(language, table["en-IN"]).format(name=name)


def end_message_for(language: str) -> str:
    return END_MESSAGES.get(language, END_MESSAGES["en-IN"])


def voice_script(language: str, name: str, area: str) -> str:
    return VOICE_SCRIPTS.get(language, VOICE_SCRIPTS["en-IN"]).format(name=name, area=area or "my area")


# ---- Gemini prompts --------------------------------------------------------

CALL_ANALYSIS_PROMPT = """You review transcripts of maternal-health conversations with a woman in India: follow-up calls by the MomCheck assistant, conversations she started herself, or home visits where an ASHA worker spoke with her through an interpreter.
The transcript may be in any Indian language, code-mixed, or contain speech-recognition errors from a noisy phone line.

Woman: {name} ({status_line})
Danger signs to check for (RED = hospital now, AMBER = health worker within a day):
{danger_signs}
Checklist rows (id: what it covers):
{items}

Transcript:
{transcript}

Return JSON with exactly these keys:
- "outcome": one of "DANGER_SIGN" (she or the person answering reported ANY danger sign, even uncertainly), "CALLBACK" (not a good time / wrong person / asked to call later), "NOT_REACHABLE" (no real conversation happened), "ROUTINE" (conversation happened, no danger sign).
- "danger_signs": list of the danger signs she reported, using the exact English labels above. Empty list if none.
- "checklist": object mapping row id to "ok", "concern" or "danger", ONLY for rows that were actually asked about or that she talked about. A row nobody mentioned must be left out, never marked "ok".
- "summary": 1-3 short English sentences for the ASHA worker: how she (and the baby) are, what she reported, what she said about her next visit, any question she asked.
- "will_attend_next_visit": true, false, or null if not discussed.
- "callback_time": when she asked to be called back, in short English (e.g. "after 6 pm"), or null.
- "questions_asked": list of short English phrases for questions she asked (may be empty).
When in doubt about a danger sign, include it: a false alarm is safer than a missed one."""

INTERPRET_PROMPT = """You are a medical interpreter during a home visit or phone call between {asha_name}, an ASHA health worker, and {name}, a {status_line} in India.
{speaker_line}
Translate it into {target_language}: clear, polite, everyday {target_language} with simple words a woman with little schooling understands, written in its native script with standard spelling (not dialect spellings). Keep the meaning exact. Do not add advice, do not drop anything. Write names in the {target_language} script. Write numbers as words.
{signs_block}
What was said (speech recognition, may contain errors): "{text}"

Return JSON: {{"translation": "<in {target_language}>", "english": "<in English>"{signs_keys}}}"""

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
