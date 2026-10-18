// POST /api/patient/home-remedies/get-remedies  (requires a patient session)

const express = require("express");
const router = express.Router();

const { requireAuth } = require("../middleware/auth");
const { complete, withDisclaimer, resolveLanguage, AiUnavailableError } = require("../utils/ai");

const MAX_SYMPTOM_LENGTH = 2000;

const DISCLAIMERS = {
  en: "⚠️ Warning: These are general suggestions. Please consult a doctor first.",
  hi: "⚠️ चेतावनी: ये सामान्य सुझाव हैं। कृपया पहले डॉक्टर से सलाह लें।",
  pa: "⚠️ ਚੇਤਾਵਨੀ: ਇਹ ਸਾਧਾਰਣ ਸੁਝਾਅ ਹਨ। ਕਿਰਪਾ ਕਰਕੇ ਪਹਿਲਾਂ ਡਾਕਟਰ ਨਾਲ ਸਲਾਹ ਲਓ।",
};

function buildPrompt(symptoms, language) {
  const common = [
    "Provide ONLY natural and lifestyle-based remedies — no medicines, no drugs.",
    "Focus on hydration, rest, dietary adjustments, relaxation, herbal teas,",
    "natural compresses and breathing exercises.",
    `Provide 4-6 distinct remedies specific to: "${symptoms}".`,
    "Use bullet points, keep the answer under 200 words, and make each remedy",
    "practical and easy to follow.",
  ].join(" ");

  return {
    en: `Generate natural home remedies for these symptoms: ${common}`,
    hi: `इन लक्षणों के लिए प्राकृतिक घरेलू उपचार दें: ${symptoms} केवल प्राकृतिक और जीवनशैली आधारित उपचार दें — कोई दवा नहीं। हाइड्रेशन, आराम, आहार, आरामदायक तकनीकें, हर्बल चाय, प्राकृतिक कंप्रेस और सांस के व्यायाम पर ध्यान दें। 4-6 अलग उपचार बुलेट पॉइंट में दें, 200 शब्दों से कम।`,
    pa: `ਇਨ੍ਹਾਂ ਲੱਛਣਾਂ ਲਈ ਕੁਦਰਤੀ ਘਰੇਲੂ ਇਲਾਜ ਦਿਓ: ${symptoms} ਸਿਰਫ਼ ਕੁਦਰਤੀ ਅਤੇ ਜੀਵਨਸ਼ੈਲੀ-ਆਧਾਰਿਤ ਇਲਾਜ ਦਿਓ — ਕੋਈ ਦਵਾਈ ਨਹੀਂ। ਹਾਈਡ੍ਰੇਸ਼ਨ, ਆਰਾਮ, ਖੁਰਾਕ, ਆਰਾਮਦਾਇਕ ਤਕਨੀਕਾਂ, ਜੜੀ-ਬੂਟੀਆਂ ਦੀ ਚਾਹ, ਕੁਦਰਤੀ ਕੰਪ੍ਰੈਸ ਅਤੇ ਸਾਹ ਦੇ ਵਿਅਯਾਮ 'ਤੇ ਧਿਆਨ ਦਿਓ। 4-6 ਵੱਖ-ਵੱਖ ਇਲਾਜ ਬੁਲੇਟ ਪੌਇੰਟ ਵਿੱਚ, 200 ਸ਼ਬਦਾਂ ਤੋਂ ਘੱਟ।`,
  }[language];
}

router.post("/get-remedies", requireAuth("patient"), async (req, res, next) => {
  try {
    const rawSymptoms = req.body?.symptoms;
    const language = resolveLanguage(req.body?.language);

    if (typeof rawSymptoms !== "string" || rawSymptoms.trim() === "") {
      return res
        .status(400)
        .json({ success: false, error: "Please describe the symptom you want remedies for." });
    }
    if (rawSymptoms.length > MAX_SYMPTOM_LENGTH) {
      return res.status(400).json({
        success: false,
        error: `Symptoms must be under ${MAX_SYMPTOM_LENGTH} characters.`,
      });
    }

    const aiResponse = await complete({
      prompt: buildPrompt(rawSymptoms.trim(), language),
      maxTokens: 400,
    });

    const disclaimer = DISCLAIMERS[language] || DISCLAIMERS.en;
    const recommendations = aiResponse.includes(disclaimer)
      ? aiResponse
      : `${aiResponse}\n\n${disclaimer}`;

    return res.json({ success: true, language, recommendations });
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

module.exports = router;