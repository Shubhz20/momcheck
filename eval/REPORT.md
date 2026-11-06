# Noise robustness: Gnani Prisma STT on phone-line audio

Synthetic replies a woman might give on a follow-up call (3 per language) were spoken by **Gnani Timbre TTS**, degraded to phone-line quality (8 kHz, 300–3400 Hz band, G.711 µ-law) with procedural street/market noise at several SNRs, transcribed by **Gnani Prisma STT** (`prisma-v3.0`), and checked by Gemini for the danger sign.

| Condition | Avg CER ↓ | Danger sign detected correctly ↑ |
|---|---|---|
| Clean (16 kHz) | 6.8% | 100% (30/30) |
| Phone line (8 kHz, µ-law) | 7.3% | 100% (30/30) |
| Phone line + street noise 20 dB SNR | 6.5% | 100% (30/30) |
| Phone line + street noise 10 dB SNR | 7.3% | 100% (30/30) |
| Phone line + street noise 5 dB SNR | 11.4% | 100% (30/30) |
| Phone line + street noise 0 dB SNR | 28.3% | 83% (25/30) |

## Character error rate by language

| Language | Clean (16 kHz) | Phone line (8 kHz, µ-law) | Phone line + street noise 20 dB SNR | Phone line + street noise 10 dB SNR | Phone line + street noise 5 dB SNR | Phone line + street noise 0 dB SNR |
|---|---|---|---|---|---|---|
| Hindi | 4.9% | 8.1% | 4.9% | 4.9% | 8.7% | 33.7% |
| English | 30.9% | 25.0% | 25.5% | 26.5% | 41.3% | 57.2% |
| Marathi | 0.0% | 1.7% | 0.0% | 0.0% | 1.7% | 12.6% |
| Bengali | 12.0% | 4.6% | 12.0% | 12.0% | 14.3% | 38.1% |
| Tamil | 1.1% | 1.1% | 1.1% | 4.7% | 5.9% | 42.5% |
| Telugu | 2.8% | 2.8% | 2.8% | 5.1% | 9.5% | 9.8% |
| Kannada | 0.0% | 2.5% | 2.5% | 2.5% | 2.5% | 7.8% |
| Malayalam | 5.0% | 8.4% | 5.0% | 8.9% | 11.8% | 24.8% |
| Gujarati | 5.7% | 8.0% | 2.3% | 0.0% | 6.9% | 22.1% |
| Punjabi | 5.2% | 10.6% | 9.3% | 8.4% | 11.2% | 34.3% |

CER = character edit distance / reference length, after removing punctuation. Text-to-speech audio is cleaner than real speech, so real calls will score worse; the trend across noise levels is what this measures.

**The English row is code-mixed Hinglish.** Prisma writes the Hindi words in Devanagari and the English words in Latin ("मुझे थोड़ा bleeding हो रहा है since last night"), which is how code-mixed speech is naturally written. Against our romanised reference that counts as character errors, but the words are right, and the danger sign in those sentences was still detected.
