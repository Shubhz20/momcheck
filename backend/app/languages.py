"""The 10 Indian languages supported by Gnani Prisma STT and Timbre TTS."""

LANGUAGES: dict[str, dict[str, str]] = {
    "hi-IN": {"name": "Hindi", "native": "हिन्दी"},
    "en-IN": {"name": "English", "native": "English"},
    "bn-IN": {"name": "Bengali", "native": "বাংলা"},
    "gu-IN": {"name": "Gujarati", "native": "ગુજરાતી"},
    "kn-IN": {"name": "Kannada", "native": "ಕನ್ನಡ"},
    "ml-IN": {"name": "Malayalam", "native": "മലയാളം"},
    "mr-IN": {"name": "Marathi", "native": "मराठी"},
    "pa-IN": {"name": "Punjabi", "native": "ਪੰਜਾਬੀ"},
    "ta-IN": {"name": "Tamil", "native": "தமிழ்"},
    "te-IN": {"name": "Telugu", "native": "తెలుగు"},
}


def language_name(code: str) -> str:
    return LANGUAGES.get(code, {}).get("name", code)
