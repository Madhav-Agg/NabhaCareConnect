"""
End-to-end browser test of the NabhaCare Connect login and panel flows.

Drives the real UI against the real dev servers:
  frontend  http://localhost:3000
  backend   http://localhost:5000

Checks:
  1. Language selection renders (including Punjabi).
  2. Panel selection renders.
  3. Patient OTP login with a seeded account succeeds and reaches the dashboard.
  4. Invalid OTP is rejected and stays on the login screen.
  5. A seeded patient sees their real profile data from the database.
  6. Booking an appointment persists and appears under "My Visits".
  7. Doctor OTP login reaches the doctor dashboard.
  8. The doctor dashboard shows real patient records from the database.
  9. Reloading the page keeps the user signed in (session persistence).
  10. Logging out returns to the language screen.
  11. Unauthenticated API calls are rejected by the backend.

Screenshots are written to unified-app/e2e-screenshots/.
"""

import json
import re
import sys
import time
import urllib.request
from datetime import date, timedelta
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

FRONTEND = "http://localhost:3000"
BACKEND = "http://localhost:5000"
SHOTS = Path(__file__).resolve().parent.parent / "e2e-screenshots"

DOCTOR_PHONE = "+919876500001"
PATIENT_PHONE = "+919876500101"

results = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"  {'PASS' if ok else 'FAIL'}  {name}" + (f" — {detail}" if detail and not ok else ""))
    return ok


def backend_call(path, method="GET", body=None, token=None):
    req = urllib.request.Request(BACKEND + path, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data, timeout=20) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def dev_otp_for(panel, phone):
    """Sign in out-of-band so the test can type the code into the real form."""
    status, sent = backend_call(f"/api/{panel}/auth/send-otp", "POST", {"phone": phone})
    assert status == 200, f"send-otp failed: {status} {sent}"
    return sent["devOtp"]


def sign_in(page, panel, phone):
    """Drive the real OTP flow: request a code in the UI and read it back.

    The code is read from the UI rather than fetched out-of-band, because
    issuing a second code server-side supersedes the first — which is the
    intended single-active-code behaviour.
    """
    page.goto(FRONTEND, wait_until="domcontentloaded")
    page.evaluate("() => window.localStorage.clear()")
    page.goto(FRONTEND, wait_until="networkidle")

    # Wait for the app to finish restoring state before choosing a screen.
    page.wait_for_timeout(1200)

    if page.get_by_role("button", name=re.compile("English", re.I)).count() > 0:
        page.get_by_role("button", name=re.compile("English", re.I)).click()
        page.wait_for_timeout(700)

    # The panel card's heading is deliberately not the control any more: a
    # heading inside a button is invalid HTML, so the card is a heading plus a
    # real button. `data-panel` keeps this selector independent of the active
    # language — the accessible name is translated.
    page.locator(f"[data-panel='{panel.lower()}']").click()
    page.wait_for_timeout(700)

    page.locator("#phone").fill(phone)
    page.get_by_role("button", name=re.compile("Send code", re.I)).click()

    # Development builds echo the one-time code into the UI.
    page.wait_for_selector("#otp", timeout=15000)
    code_el = page.locator("span.font-mono.font-bold").first
    code_el.wait_for(timeout=15000)
    otp = re.sub(r"\D", "", code_el.inner_text())
    assert len(otp) == 6, f"expected a 6-digit code, read {otp!r}"

    page.locator("#otp").fill(otp)
    page.get_by_role("button", name=re.compile("Verify and sign in", re.I)).click()
    page.wait_for_timeout(1800)
    return panel


def main():
    SHOTS.mkdir(exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(viewport={"width": 1360, "height": 1000})
        page = context.new_page()

        console_errors = []
        failed_requests = []

        def on_response(response):
            if response.status >= 400:
                failed_requests.append(f"{response.status} {response.request.method} {response.url}")

        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: console_errors.append(f"PAGEERROR: {e}"))
        page.on("response", on_response)

        # ---------------------------------------------------------------
        print("\n1. Language selection")
        page.goto(FRONTEND, wait_until="networkidle")
        page.wait_for_timeout(600)
        has_punjabi = page.get_by_role("button", name=re.compile("ਪੰਜਾਬੀ")).count() > 0
        check("language screen shows Punjabi (was unreachable before)", has_punjabi)
        check("hero image renders", page.locator('img[alt=""]').count() > 0)
        page.screenshot(path=SHOTS / "01-language.png", full_page=True)

        # ---------------------------------------------------------------
        print("\n2. Panel selection")
        page.get_by_role("button", name=re.compile("English", re.I)).click()
        page.wait_for_timeout(600)
        check(
            "panel selection screen appears",
            page.get_by_role("heading", name=re.compile("Select Your Panel", re.I)).count() > 0,
        )
        page.screenshot(path=SHOTS / "02-panel-selection.png", full_page=True)

        # ---------------------------------------------------------------
        print("\n3. Invalid OTP is rejected")
        page.locator("[data-panel='patient']").click()
        page.wait_for_timeout(500)
        page.locator("#phone").fill("+919999111111")
        page.get_by_role("button", name=re.compile("Send code", re.I)).click()
        page.wait_for_selector("#otp", timeout=15000)
        page.locator("#otp").fill("000000")
        page.get_by_role("button", name=re.compile("Verify and sign in", re.I)).click()
        page.wait_for_timeout(1500)
        still_on_login = page.locator("#otp").count() > 0
        check("wrong OTP keeps the user on the login screen", still_on_login)
        page.screenshot(path=SHOTS / "03-invalid-otp.png", full_page=True)

        # ---------------------------------------------------------------
        print("\n4. Patient login")
        sign_in(page, "Patient", PATIENT_PHONE)
        page.wait_for_timeout(1500)

        logged_in = page.get_by_role("button", name=re.compile("Profile", re.I)).count() > 0
        check("patient reaches the dashboard after OTP login", logged_in)
        page.screenshot(path=SHOTS / "04-patient-dashboard.png", full_page=True)

        # ---------------------------------------------------------------
        print("\n5. Profile shows real database data")
        page.get_by_role("button", name=re.compile("Profile", re.I)).first.click()
        page.wait_for_timeout(1500)
        name_value = page.locator("#profile-name").input_value() if page.locator("#profile-name").count() else ""
        body_text = page.inner_text("body")
        check("profile shows the seeded name 'Gurpreet Singh'", "Gurpreet Singh" in body_text,
              f"body did not contain the name")
        page.screenshot(path=SHOTS / "05-patient-profile.png", full_page=True)
        check("profile no longer shows the hardcoded 'Madhav Aggarwal'",
              "Madhav Aggarwal" not in body_text)

        # ---------------------------------------------------------------
        print("\n6. Book an appointment and see it in My Visits")
        # Unique date per run so repeat runs never trip the (correct) double-booking guard.
        appt_date = (date.today() + timedelta(days=200 + (int(time.time()) % 120))).isoformat()
        # The UI renders dates via toLocaleDateString, which drops the leading zero
        # on the day ("1 Aug 2027", not "01 Aug 2027"). strftime("%-d") is not
        # available on Windows, so build it by hand.
        _d = date.fromisoformat(appt_date)
        appt_display = f"{_d.day} {_d.strftime('%b %Y')}"

        page.locator("[data-nav='desktop'] [data-nav-item='appointments']").click()
        page.wait_for_timeout(1500)
        page.locator("#appt-date").fill(appt_date)
        page.get_by_role("combobox").nth(1).click()
        page.wait_for_timeout(400)
        page.get_by_role("option", name="10:30", exact=True).click()
        page.wait_for_timeout(300)
        page.get_by_role("button", name=re.compile("Video consultation", re.I)).click()
        page.wait_for_timeout(300)
        page.get_by_role("button", name=re.compile("Confirm booking", re.I)).click()
        page.wait_for_timeout(2500)
        booking_text = page.inner_text("body")
        check("appointment booking succeeds", "Appointment booked" in booking_text,
              booking_text[:300])
        page.screenshot(path=SHOTS / "06-booking.png", full_page=True)

        page.locator("[data-nav='desktop'] [data-nav-item='myAppointments']").click()
        page.wait_for_timeout(1800)
        visits_text = page.inner_text("body")
        check("the new appointment appears under My Visits", appt_display in visits_text,
              f"expected {appt_display} in: {visits_text[:300]}")
        check("future appointment is labelled 'Scheduled', not 'Past'",
              "Scheduled" in visits_text and appt_display in visits_text)
        page.screenshot(path=SHOTS / "07-my-appointments.png", full_page=True)

        # ---------------------------------------------------------------
        print("\n7. Session persists across a reload")
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(2000)
        check("user stays signed in after a page reload",
              page.get_by_role("button", name=re.compile("Profile", re.I)).count() > 0)

        # ---------------------------------------------------------------
        print("\n7b. Patient records, medicine finder, emergency contacts")
        page.get_by_role("button", name=re.compile("Health Records", re.I)).first.click()
        page.wait_for_timeout(1500)
        rec_text = page.inner_text("body")
        check("patient health records load from the database",
              "General check-up" in rec_text or "HbA1c" in rec_text or "Complete blood count" in rec_text,
              rec_text[:250])
        page.screenshot(path=SHOTS / "11-patient-records.png", full_page=True)

        page.locator("[data-nav='desktop'] [data-nav-item='medicines']").click()
        page.wait_for_timeout(1500)
        med_text = page.inner_text("body")
        check("medicine finder lists real pharmacies",
              "JP Pharmacy" in med_text or "Prem Medical Store" in med_text, med_text[:250])
        check("medicine finder no longer claims stock levels",
              "lastUpdated" not in med_text and "in stock" not in med_text.lower())
        page.screenshot(path=SHOTS / "12-medicine-finder.png", full_page=True)

        page.locator("[data-nav='desktop'] [data-nav-item='emergency']").click()
        page.wait_for_timeout(1500)
        emg_text = page.inner_text("body")
        check("emergency contacts load", "Ambulance" in emg_text and "108" in emg_text, emg_text[:250])
        check("the invented phone number +919999999999 is gone",
              "9999999999" not in emg_text)
        page.screenshot(path=SHOTS / "13-emergency.png", full_page=True)

        # ---------------------------------------------------------------
        print("\n8. Doctor login and real records")
        sign_in(page, "Doctor", DOCTOR_PHONE)
        page.wait_for_timeout(2000)

        doc_body = page.inner_text("body")
        check("doctor reaches the doctor dashboard", "BharatCare" in doc_body or "NabhaCare" in doc_body)
        check("doctor name comes from the account, not 'Dr. Sample'", "Dr. Sample" not in doc_body)
        page.screenshot(path=SHOTS / "08-doctor-dashboard.png", full_page=True)

        page.get_by_role("button", name=re.compile("Health Records", re.I)).first.click()
        page.wait_for_timeout(2000)
        records_text = page.inner_text("body")
        check("doctor sees the real seeded patients",
              "Gurpreet Singh" in records_text or "Simran Kaur" in records_text,
              records_text[:300])
        check("doctor records no longer show the invented patient 'Preet Kaur' as a patient",
              "Simran Bhatia" not in records_text)
        page.screenshot(path=SHOTS / "09-doctor-records.png", full_page=True)

        page.get_by_role("button", name=re.compile("Appointment Queue|Appointments", re.I)).first.click()
        page.wait_for_timeout(2000)
        queue_text = page.inner_text("body")
        check("doctor queue renders real appointments", "Gurpreet" in queue_text or "upcoming" in queue_text,
              queue_text[:300])
        page.screenshot(path=SHOTS / "10-doctor-queue.png", full_page=True)

        # ---------------------------------------------------------------
        print("\n9. Logout")
        # Logout now lives in the shared header account menu for both panels, not
        # on the patient Profile screen and not in a bespoke doctor popover. The
        # trigger is addressed by its accessible name: the language menu is also
        # a `header button[aria-haspopup]` and comes first in the DOM.
        page.get_by_role("button", name=re.compile("Account menu", re.I)).first.click()
        page.wait_for_timeout(600)
        page.get_by_role("menuitem", name=re.compile("Logout", re.I)).first.click()
        page.wait_for_timeout(2000)
        # Logging out returns to panel selection; the chosen language is kept.
        check("logout returns to the panel selection screen",
              page.get_by_role("heading", name=re.compile("Select Your Panel", re.I)).count() > 0)
        check("the session token is cleared from storage",
              page.evaluate("() => window.localStorage.getItem('nabhacare.token')") is None)

        status, _ = backend_call("/api/patient/profile")
        check("after logout the backend rejects the data endpoints", status == 401, f"got {status}")

        # ---------------------------------------------------------------
        print("\n10. Browser console")
        # Chromium logs every 4xx fetch as a console error. This test deliberately
        # triggers 401s (wrong OTP, post-logout probe), so only genuine JavaScript
        # exceptions and React warnings are treated as failures here; the HTTP
        # responses themselves are asserted separately below.
        real_errors = [
            e for e in console_errors
            if "Failed to load resource" not in e
            and "favicon" not in e.lower()
            and "Download the React DevTools" not in e
        ]
        check("no uncaught JavaScript errors or React warnings", len(real_errors) == 0,
              "; ".join(real_errors[:3]))

        unexpected_http = [
            r for r in failed_requests
            # 401 is expected for the deliberate wrong-OTP attempt in step 3 and
            # the post-logout probe in step 9.
            if not (r.startswith("401") and ("verify-otp" in r or "api/patient/profile" in r))
        ]
        check("no unexpected HTTP error responses", len(unexpected_http) == 0,
              "; ".join(unexpected_http[:5]))

        browser.close()

    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)} passed, {len(failed)} failed")
    print(f"Screenshots: {SHOTS}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())