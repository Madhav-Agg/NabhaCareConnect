// POST /api/patient/symptoms/check-symptoms  (requires a patient session)

const express = require("express");
const router = express.Router();

const { dbHelpers } = require("../db");
const { requireAuth } = require("../middleware/auth");
const { complete, withDisclaimer, resolveLanguage, EMERGENCY_ADVICE, AiUnavailableError } =
  require("../utils/ai");
const { fail } = require("../utils/errorCodes");

const MAX_SYMPTOM_LENGTH = 2000;

const EMERGENCY_KEYWORDS = {
  en: [
    "chest pain", "heart pain", "difficulty breathing", "breathing problem",
    "cannot breathe", "severe bleeding", "unconscious", "unconsciousness",
    "seizure", "stroke", "paralysis", "suicide", "emergency", "urgent",
    "severe burn", "poisoning",
  ],
  hi: [
    "छाती में दर्द", "दिल में दर्द", "सांस लेने में तकलीफ", "सांस की तकलीफ",
    "अचानक कमजोरी", "गंभीर रक्तस्राव", "बेहोशी", "बेहोश", "आपातकाल", "तत्काल",
    "दौरा", "लकड़ी", "ज़हर",
  ],
  pa: [
    "ਛਾਤੀ ਵਿੱਚ ਦਰਦ", "ਦਿਲ ਵਿੱਚ ਦਰਦ", "ਸਾਹ ਲੈਣ ਵਿੱਚ ਮੁਸ਼ਕਲ", "ਸਾਹ ਦੀ ਮੁਸ਼ਕਲ",
    "ਅਚਾਨਕ ਕਮਜ਼ੋਰੀ", "ਗੰਭੀਰ ਖੂਨ ਵਹਾਅ", "ਬੇਹੋਸ਼ੀ", "ਬੇਹੋਸ਼", "ਐਮਰਜੈਂਸੀ", "ਤਤਕਾਲ",
    "ਦੌਰਾ", "ਲਕੜੀ", "ਜ਼ਹਰ",
  ],
};

function looksLikeEmergency(symptoms, language) {
  const haystack = symptoms.toLowerCase();
  const keywords = EMERGENCY_KEYWORDS[language] || EMERGENCY_KEYWORDS.en;
  return keywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
}

function buildPrompt(symptoms, language, isEmergency) {
  const opening = isEmergency
    ? EMERGENCY_ADVICE[language] || EMERGENCY_ADVICE.en
    : "The patient reports mild symptoms.";

  const medicineBlock = isEmergency
    ? "Do NOT recommend specific medicines for this emergency. Give immediate safety " +
      "guidance only (stay calm, call 108, do not drive yourself)."
    : "🩺 **Suggested medicines:** list 1-2 commonly available over-the-counter Indian " +
      "medicines that are appropriate for these symptoms, plus when NOT to take them.";

  const structure = {
    en: `A patient described their symptoms as: "${symptoms}"\n\n${opening}\n\nRespond using exactly these sections:\n${medicineBlock}\n🌿 **Home remedies:** list 2-3 simple, safe home remedies.\n\nKeep the whole answer under 150 words.`,
    hi: `रोगी ने अपने लक्षण इस प्रकार बताए: "${symptoms}"\n\n${opening}\n\nकृपया ठीक इन खंडों में उत्तर दें:\n${medicineBlock}\n🌿 **घरेलू उपचार:** 2-3 सरल, सुरक्षित घरेलू उपचार सूचीबद्ध करें।\n\nपूरा उत्तर 150 शब्दों से कम रखें।`,
    pa: `ਮਰੀਜ਼ ਨੇ ਆਪਣੇ ਲੱਛਣ ਇਸ ਤਰ੍ਹਾਂ ਦੱਸੇ: "${symptoms}"\n\n${opening}\n\nਕਿਰਪਾ ਕਰਕੇ ਠੀਕ ਇਨ੍ਹਾਂ ਹਿੱਸਿਆਂ ਵਿੱਚ ਜਵਾਬ ਦਿਓ:\n${medicineBlock}\n🌿 **ਘਰੇਲੂ ਇਲਾਜ:** 2-3 ਸੌਖੇ, ਸੁਰੱਖਿਅਤ ਘਰੇਲੂ ਇਲਾਜ ਸੂਚੀਬੱਧ ਕਰੋ।\n\nਪੂਰਾ ਜਵਾਬ 150 ਸ਼ਬਦਾਂ ਤੋਂ ਘੱਟ ਰੱਖੋ।`,
  }[language];

  // The English medicineBlock is used verbatim in all languages on purpose: it is
  // the safety-critical instruction set and is already understood by the model.
  return structure;
}

router.post("/check-symptoms", requireAuth("patient"), async (req, res, next) => {
  try {
    const rawSymptoms = req.body?.symptoms;
    const language = resolveLanguage(req.body?.language);

    if (typeof rawSymptoms !== "string" || rawSymptoms.trim() === "") {
      return res
        .status(400)
        .json({ success: false, error: "Please describe your symptoms." });
    }
    if (rawSymptoms.length > MAX_SYMPTOM_LENGTH) {
      return res.status(400).json({
        success: false,
        error: `Symptoms must be under ${MAX_SYMPTOM_LENGTH} characters.`,
      });
    }

    const symptoms = rawSymptoms.trim();
    const isEmergency = looksLikeEmergency(symptoms, language);

    // Emergency handling never depends on an external AI service. Safety-critical
    // guidance is deterministic; if the model is reachable we append extra detail,
    // and if it is not we still return the emergency instructions.
    if (isEmergency) {
      const emergencyAdvice = EMERGENCY_ADVICE[language] || EMERGENCY_ADVICE.en;
      let extra = "";
      try {
        extra = await complete({
          prompt: buildPrompt(symptoms, language, true),
          maxTokens: 600,
        });
      } catch (err) {
        console.error("⚠️  AI unavailable during emergency assessment:", err.message);
      }

      dbHelpers.storeSymptomCheck({
        phone: req.user.phone,
        symptoms,
        language,
        is_emergency: true,
        ai_response: `${emergencyAdvice}\n\n${extra}`.trim(),
      });

      return res.json({
        success: true,
        isEmergency: true,
        language,
        recommendations: withDisclaimer(
          `${emergencyAdvice}\n\n${extra}`.trim(),
          language
        ),
        aiAvailable: extra !== "",
      });
    }

    const aiResponse = withDisclaimer(
      await complete({ prompt: buildPrompt(symptoms, language, false), maxTokens: 1000 }),
      language
    );

    dbHelpers.storeSymptomCheck({
      phone: req.user.phone,
      symptoms,
      language,
      is_emergency: isEmergency,
      ai_response: aiResponse,
    });

    return res.json({
      success: true,
      isEmergency,
      language,
      recommendations: aiResponse,
    });
  } catch (err) {
    if (err instanceof AiUnavailableError) {
      return res.status(503).json({
        success: false,
        error: err.message,
        code: "AI_UNAVAILABLE",
      });
    }
    return next(err);
  }
});

/** GET /api/patient/symptoms/history — the caller's own previous assessments. */
router.get("/history", requireAuth("patient"), (req, res) => {
  return res.json({ success: true, data: dbHelpers.listSymptomChecks(req.user.phone) });
});

module.exports = router;