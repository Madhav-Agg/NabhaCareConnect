// Translation for dynamic content.
//
// Locale files can only translate strings that exist at build time. Patient- and
// doctor-entered content — record titles, notes, descriptions, facility names —
// is user-generated and cannot be handled by the resource bundles.
//
// This endpoint is the supported way to translate such text. It runs entirely on
// the server: the provider credential is read from the server environment and is
// never exposed to the browser, and the client only ever receives translated
// text back.
//
// Design notes:
//   * Requires a session, so the endpoint cannot be used as an open proxy.
//   * Input is length-capped and the prompt is tightly scoped, which keeps the
//     cost and abuse surface small.
//   * Returns `translated: null` with a reason when the service is unavailable,
//     rather than echoing the original text as if it had been translated.

const express = require("express");
const router = express.Router();

const { requireAuth } = require("../middleware/auth");
const { complete, AiUnavailableError } = require("../utils/ai");

const MAX_CHARS = 1000;
const SUPPORTED = new Set(["en", "hi", "pa"]);

// How each target language names the language itself, so the model is told the
// output language unambiguously.
const LANGUAGE_NAMES = {
  en: "English",
  hi: "Hindi (Devanagari script)",
  pa: "Punjabi (Gurmukhi script)",
};

/** POST /api/{doctor|patient}/translate  { text, targetLanguage } */
router.post("/", requireAuth(), async (req, res, next) => {
  try {
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    const target = String(req.body?.targetLanguage ?? "").toLowerCase();

    if (!text) {
      return res.status(400).json({ success: false, error: "text is required.", code: "TEXT_REQUIRED" });
    }
    if (text.length > MAX_CHARS) {
      return res.status(400).json({
        success: false,
        error: `text must be under ${MAX_CHARS} characters.`,
        code: "TEXT_TOO_LONG",
      });
    }
    if (!SUPPORTED.has(target)) {
      return res.status(400).json({
        success: false,
        error: `targetLanguage must be one of: ${[...SUPPORTED].join(", ")}.`,
        code: "LANGUAGE_UNSUPPORTED",
      });
    }
    if (target === "en") {
      // English is the source language; nothing to do.
      return res.json({ success: true, translated: text, targetLanguage: target, unchanged: true });
    }

    const prompt =
      `Translate the following text into ${LANGUAGE_NAMES[target]}. ` +
      `Preserve any medical terminology accurately. Do not add commentary, ` +
      `explanations or quotes — output only the translation.\n\n` +
      `Text: ${text}`;

    const translated = await complete({
      prompt,
      maxTokens: Math.min(MAX_CHARS * 2, 2000),
    });

    return res.json({
      success: true,
      translated: translated.trim(),
      targetLanguage: target,
    });
  } catch (err) {
    if (err instanceof AiUnavailableError) {
      // Honest failure: the caller keeps the original text and decides what to do.
      return res.status(503).json({
        success: false,
        error: err.message,
        code: "TRANSLATION_UNAVAILABLE",
        translated: null,
      });
    }
    return next(err);
  }
});

module.exports = router;