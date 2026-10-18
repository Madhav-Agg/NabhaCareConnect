// Shared helper for the OpenRouter-backed AI endpoints.
//
// The previous implementation caught every failure and returned hardcoded
// "recommendation" text with `success: true`, which made an outage or a missing
// API key indistinguishable from a real model answer. Failures are now surfaced
// as 503 with an honest error message.

require("dotenv").config();

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// The model this project originally hardcoded, x-ai/grok-4-fast:free, was retired by
// xAI and now returns 404 — which is why the symptom checker only ever produced its
// fallback text. Free-tier endpoints also rate-limit unpredictably (HTTP 429), so the
// helper walks a list of models and retries transient failures with backoff.
// Set OPENROUTER_MODEL to pin a single model and disable the chain.
const DEFAULT_MODEL_CHAIN = [
  "cohere/north-mini-code:free",
  "dots-studio/dots-3-note-preview:free",
  "google/gemma-4-26b-a4b-it:free",
  "google/gemma-4-31b-it:free",
];
const DEFAULT_MODEL = DEFAULT_MODEL_CHAIN[0];

const ATTEMPT_TIMEOUT_MS = Number(process.env.AI_REQUEST_TIMEOUT_MS || 45000);
const MAX_ATTEMPTS_PER_MODEL = Number(process.env.AI_MAX_ATTEMPTS || 2);
const RETRY_BASE_DELAY_MS = Number(process.env.AI_RETRY_BASE_DELAY_MS || 1200);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 429 and 5xx are worth retrying; 4xx (other than 429) will not fix themselves. */
function isRetryableStatus(status) {
  return status === 429 || status === 408 || status >= 500;
}

const SYSTEM_PROMPT =
  "You are an AI medical assistant for a symptom checker and home remedies app " +
  "serving rural India. Use simple, medically accurate, plain language. Give clear " +
  "explanations, likely causes, and Indian-style home remedies where appropriate. " +
  "Avoid fear-inducing or overly technical wording. Never invent facts about the " +
  "patient. If anything sounds serious, advise consulting a doctor. You do not " +
  "diagnose and you do not replace a doctor.";

class AiUnavailableError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "AiUnavailableError";
    this.statusCode = 503;
    this.cause = cause;
  }
}

async function callOnce(model, { prompt, systemPrompt, maxTokens }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);

  try {
    return await fetch(OPENROUTER_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.FRONTEND_URL || "http://localhost:3000",
        "X-Title": "NabhaCare Connect",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        max_tokens: maxTokens,
        temperature: 0.6,
      }),
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Call the chat-completions endpoint.
 * @returns {Promise<string>} the assistant message content
 * @throws {AiUnavailableError} when the key is missing or every model fails
 */
async function complete({ prompt, systemPrompt = SYSTEM_PROMPT, maxTokens = 500 }) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new AiUnavailableError(
      "The AI symptom checker is not configured on this server (OPENROUTER_API_KEY is missing)."
    );
  }

  const models = process.env.OPENROUTER_MODEL
    ? [process.env.OPENROUTER_MODEL]
    : DEFAULT_MODEL_CHAIN;

  const failures = [];

  for (const model of models) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_MODEL; attempt++) {
      let response;
      try {
        response = await callOnce(model, { prompt, systemPrompt, maxTokens });
      } catch (err) {
        const reason = err.name === "AbortError" ? "timed out" : err.message;
        failures.push(`${model}: ${reason}`);
        if (attempt < MAX_ATTEMPTS_PER_MODEL) {
          await sleep(RETRY_BASE_DELAY_MS * attempt);
          continue;
        }
        break;
      }

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        console.error(
          `❌ OpenRouter ${model} returned ${response.status} (attempt ${attempt}):`,
          body.slice(0, 200)
        );
        failures.push(`${model}: HTTP ${response.status}`);

        if (isRetryableStatus(response.status) && attempt < MAX_ATTEMPTS_PER_MODEL) {
          await sleep(RETRY_BASE_DELAY_MS * attempt);
          continue;
        }
        break;
      }

      let payload;
      try {
        payload = await response.json();
      } catch {
        failures.push(`${model}: unreadable response body`);
        break;
      }

      const choice = payload?.choices?.[0];
      const content = choice?.message?.content;
      const finishReason = choice?.finish_reason;

      if (typeof content === "string" && content.trim() !== "") {
        if (finishReason === "length") {
          console.warn(`⚠️  ${model} truncated its answer at max_tokens=${maxTokens}`);
        }
        return content.trim();
      }

      // Reasoning-style models can burn the whole budget on hidden thinking and
      // return no visible content. Retrying occasionally succeeds, so it is
      // treated as retryable once before moving on.
      failures.push(`${model}: empty response (finish_reason=${finishReason})`);
      if (attempt < MAX_ATTEMPTS_PER_MODEL) {
        await sleep(RETRY_BASE_DELAY_MS * attempt);
        continue;
      }
      break;
    }
  }

  console.error("❌ All OpenRouter models failed:", failures.join(" | "));
  throw new AiUnavailableError(
    "The AI service is currently unavailable. Please try again shortly, or use the " +
      "emergency and appointment options instead."
  );
}

const DISCLAIMERS = {
  en: "⚠️ These are recommendations only. Please consult a doctor before taking any medication.",
  hi: "⚠️ ये केवल सुझाव हैं। किसी भी दवा लेने से पहले कृपया डॉक्टर से सलाह लें।",
  pa: "⚠️ ਇਹ ਸਿਰਫ਼ ਸਿਫਾਰਸ਼ਾਂ ਹਨ। ਕੋਈ ਵੀ ਦਵਾਈ ਲੈਣ ਤੋਂ ਪਹਿਲਾਂ ਕਿਰਪਾ ਕਰਕੇ ਡਾਕਟਰ ਨਾਲ ਸਲਾਹ ਲਓ।",
};

const EMERGENCY_ADVICE = {
  en: "🚨 **Emergency Alert:** Call an ambulance (dial 108 in India) or go to the nearest hospital immediately. Do not delay.",
  hi: "🚨 **आपातकालीन चेतावनी:** एम्बुलेंस को कॉल करें (भारत में 108 डायल करें) या तुरंत निकटतम अस्पताल जाएं। देरी न करें।",
  pa: "🚨 **ਐਮਰਜੈਂਸੀ ਚੇਤਾਵਨੀ:** ਐਂਬੂਲੈਂਸ ਨੂੰ ਕਾਲ ਕਰੋ (ਭਾਰਤ ਵਿੱਚ 108 ਡਾਇਲ ਕਰੋ) ਜਾਂ ਤੁਰੰਤ ਨੇੜਲੇ ਹਸਪਤਾਲ ਜਾਓ। ਦੇਰੀ ਨਾ ਕਰੋ।",
};

function withDisclaimer(text, language) {
  const disclaimer = DISCLAIMERS[language] || DISCLAIMERS.en;
  return text.includes(disclaimer) ? text : `${text}\n\n${disclaimer}`;
}

const SUPPORTED_LANGUAGES = new Set(["en", "hi", "pa"]);

function resolveLanguage(raw) {
  const lang = typeof raw === "string" ? raw.toLowerCase() : "";
  return SUPPORTED_LANGUAGES.has(lang) ? lang : "en";
}

module.exports = {
  complete,
  withDisclaimer,
  resolveLanguage,
  EMERGENCY_ADVICE,
  DISCLAIMERS,
  AiUnavailableError,
  DEFAULT_MODEL,
};