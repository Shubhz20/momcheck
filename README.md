# Janani Saathi

**Voice follow-up calls for pregnant women, built for ASHA workers. Speaks Marathi, Hindi and Hinglish.**

An ASHA worker is responsible for every pregnant woman and newborn in her village. Following up with each of them means walking door to door or making calls from her own phone. When a danger sign is missed, the referral comes late.

Janani Saathi takes over the routine part. A voice agent calls each woman in her own language. It:

- reminds her of the next check-up or vaccination,
- asks the standard danger-sign questions (bleeding, swelling, severe headache, fever, reduced baby movement),
- answers common questions from a verified knowledge base,
- **alerts the ASHA straight away** when something needs attention.

The ASHA sees everything on one dashboard. She can also record a spoken note after a home visit ("Sunita ko BP check ke liye PHC bheja"), and it is saved as a structured record.

> **Safety:** Janani Saathi is a screening and reminder tool. It never diagnoses or prescribes. Every danger sign is escalated to a human health worker.

## Built on Gnani AI

| Gnani technology | Used for |
|---|---|
| **Agent Builder** (Platform API) | The outbound follow-up calls: language switching (Marathi, Hindi, English), knowledge base and FAQs, call outcome tags, post-call webhook |
| **Prisma STT** | Turning the ASHA's spoken visit notes into text; transcribing call recordings |
| **Timbre v2.5 TTS** | The ASHA's spoken daily briefing in Marathi or Hindi |

## Status

🚧 In active development. Setup instructions, architecture and evaluation results will be added here.
