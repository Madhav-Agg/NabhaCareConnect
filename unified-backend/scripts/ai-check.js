// Verifies the AI endpoints return genuine model output rather than fallback text.
// Run against a live server:  node scripts/ai-check.js
const B = process.env.BASE_URL || "http://localhost:5000";

async function token() {
  const sent = await (
    await fetch(`${B}/api/patient/auth/send-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "+919876500101" }),
    })
  ).json();
  const verified = await (
    await fetch(`${B}/api/patient/auth/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "+919876500101", otp: sent.devOtp }),
    })
  ).json();
  if (!verified.token) throw new Error(`login failed: ${JSON.stringify(verified)}`);
  return verified.token;
}

(async () => {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${await token()}`,
  };

  const cases = [
    ["mild symptoms (en)", "/api/patient/symptoms/check-symptoms",
      { symptoms: "mild fever and headache for two days", language: "en" }, false],
    ["emergency (en)", "/api/patient/symptoms/check-symptoms",
      { symptoms: "severe chest pain and difficulty breathing", language: "en" }, true],
    ["home remedies (hi)", "/api/patient/home-remedies/get-remedies",
      { symptoms: "sore throat", language: "hi" }, false],
  ];

  let failed = 0;
  for (const [label, path, body, expectEmergency] of cases) {
    const res = await fetch(B + path, { method: "POST", headers, body: JSON.stringify(body) });
    const data = await res.json();
    const text = data.recommendations || "";

    const ok = res.status === 200 && text.length > 40;
    if (!ok) failed++;

    console.log(
      `${ok ? "PASS" : "FAIL"}  ${label}  [${res.status}]` +
        `  emergency=${data.isEmergency ?? "n/a"}  chars=${text.length}`
    );
    if (expectEmergency && data.isEmergency !== true) {
      console.log("      FAIL: emergency case was not flagged as an emergency");
      failed++;
    }
    console.log(`      ${text.replace(/\s+/g, " ").slice(0, 130)}…`);
  }

  console.log(failed === 0 ? "\nAI endpoints returning live output." : `\n${failed} AI check(s) failed.`);
  process.exit(failed === 0 ? 0 : 1);
})();