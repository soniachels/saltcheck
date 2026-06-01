# Salt Check - Product Requirements Document

## Product Overview
**Salt Check** is a mobile-first "salty" life admin app for overwhelmed Gen Z and millennial users. PEPPER, the AI bestie, converts messy chaos dumps into 3-5 sane moves and gives contextual advice across Money, Body, and People.

**Tagline:** "Dump the mess. Get the next sane step."

## App Structure (v3)

**Bottom Tabs:** TODAY · MATH · BODY · RECEIPTS · MORE
**PEPPER:** Floating FAB in bottom-right of every tab → opens a check-in bottom sheet (no dedicated tab)

### 1. TODAY (merged with Open Loops) ⭐ MERGED
- Hero: day name, date in pepper red, greeting using nickname
- Next Sane Step card (when PEPPER's run today)
- TOP 3 priorities (first card in pickle lime, rest dark)
- SURVIVAL BASICS row (water / food / hygiene tiles — tap to toggle, lilac when checked)
- OPEN LOOPS section inline with "NEW LOOP" pill button
- Tasks shown as CategoryCards with status chip (○ → ◐ → ◑ → ✓) — tap chip to cycle
- Parked & Done counts at bottom

### 2. MATH (formerly Money Floor) ⭐ RENAMED + MODERNIZED
- Auto-detects currency from device locale via `expo-localization`
- **Conversational intake** when empty: PEPPER red bubble + 3 tap-to-fill cards (cash → bills → income)
- Once filled, transforms into hero "THE FLOOR" card in pickle lime with computed `cash - bills - doom`
- 3-tile quick-edit row (CASH / BILLS / INCOMING) with color-coded values
- **DOOM SPENDING** log with regret chip picker (none / a lil / medium / big / huge) — high-regret items show in red
- **SOFT SAVING** log for small wins (skipped latte, found cash)
- Dynamic PEPPER one-liner at bottom that reacts to the math (negative floor → red alert; doom > 2x savings → calls it out)

### 3. BODY ⭐ REDESIGNED with chip pickers
- Hero "how's the body?" in lilac mini-label
- **Chip pickers** (not text input) for MOOD, SLEEP, APPETITE — each with `+ other` for custom
- Water +/- stepper (no more typing)
- Cycle tracker → day-of-cycle calculation and next-period prediction
- Symptoms text card (tap to edit)
- Meds list (Ozempic, vitamins, etc.) with per-item delete + pickle-lime "+ ADD MED" card
- Appointments list with relative dates ("in 3d", red "2d ago" for overdue)
- **PEPPER reads ALL signals together** (cycle + meds + symptoms + mood) → vibe_read, care_moves, doctor_flag, permission

### 4. RECEIPTS ⭐ NOW A TOP-LEVEL TAB
- Biometric/PIN locked landing screen
- Person cards open a bottom sheet with PEPPER advice
- Verdict pill (TRUST / CAUTION / CUT) + red speech bubble + lime "THE MOVE" + red flag list + optional lilac "SAY THIS" with draft text

### 5. MORE — Settings, PEPPER history, about

## PEPPER (global floating FAB)
- Pulsing red flame button in bottom-right of every tab
- Opens a bottom sheet for: text dump, voice dump (Whisper STT), structured AI response (quick_read, salt_check, parked, money/body checks, next_sane_step, closer)
- Auto-syncs response to today's daily_entry

## Tech Stack
- **Frontend:** Expo Router + React Native, Zustand (persisted), expo-localization, expo-audio, expo-notifications, expo-local-authentication
- **Backend:** FastAPI + MongoDB
- **AI:** OpenAI GPT-4.1 + Whisper-1 via Emergent LLM key
- **Push:** expo-notifications + Emergent push relay (deployment-only)

## Design System
- **Colors:** Pepper Red `#C4191E`, Bright Red `#FF0036`, Pickle Lime `#A6AE1C`, Soft Lilac `#E2A9F1`, Salt Bone `#E6DCD1`, Ink Black `#0D0D0D`, Charcoal `#161616`, Charcoal Raised `#1F1F1F`
- **Components:** CategoryCard (signature squircle with icon chip + variants), PepperBubble (speech bubble), ChipPicker (horizontal scrollable selection), PepperFab (global floating CTA)
- **Border radius scale:** sm 6, md 12, lg 20, xl 24, xxl 32, full 999
- Hero typography: display 36, hero 44, 900 weight, ~1px letter spacing

## API Endpoints (`/api` prefix)
**PEPPER:** `POST /pepper/checkin` (with spice + nickname + auto-sync to today), `POST /pepper/transcribe` (Whisper), `POST /pepper/advise-person`, `POST /pepper/advise-body`, `GET /pepper/history/{user_id}`
**Push:** `POST /register-push`, `POST /send-test-push`
**CRUD:** `/daily-entries`, `/projects`, `/tasks`, `/money-entries` (with currency + doom_spends + soft_savings), `/body-logs` (with cycle/meds/appointments), `/person-notes`

## Test Coverage
- **63/63 backend pytest tests passing (100%)** across 4 iterations
- Crisis safety, spice tuning, nickname, auto-sync, voice STT, push graceful-skip, person/body advice, extended models — all green

## MVP Success Metrics
- 60% onboarding completion
- 30% Day 3 retention
- 70% PEPPER response thumbs up
- 50%+ check-ins have parked items
- Floating FAB engagement: >40% daily users tap it at least once

## Future
- Server-side encryption for Receipts (still device-only biometric)
- ISO currency picker + multi-currency split
- Spice Level subscription tier (Mild free / Medium $4.99 / Extra Spicy $9.99)
- Push (real delivery requires google-services.json + deployment)
- Mood/cycle trend charts
- Calendar sync
- Voice → direct PEPPER call (skip text intermediate)

## Features (Implemented)

### 1. PEPPER AI Check-In ⭐ Core Feature
- Free-text "chaos dump" + **voice dump (Whisper STT)**
- AI-powered analysis using OpenAI GPT-4.1 (via Emergent LLM key)
- **Tunable spice level**: Mild / Medium / Extra Spicy — adjusts sass dial
- **Nickname support**: PEPPER addresses user by name sparingly
- Returns structured response: quick_read, salt_check (top 3), parked, money_check, body_check, next_sane_step, closer
- **Crisis Detection**: Drops sass and provides safety response for self-harm keywords
- **Auto-syncs to Today dashboard** so PEPPER's plan shows up on the home screen immediately

### 2. Today Dashboard
- Date header, top 3 priorities (auto-populated by PEPPER)
- Survival basics checklist (water, food, hygiene) — preserved across PEPPER updates
- Quick action items categorized (work/money/life)
- Next sane step card in pepper red
- Refreshes on focus

### 3. Open Loops (Tasks/Projects)
- Lightweight task management
- Fields: title, next action, deadline, status, notes
- Statuses: Not started / In progress / Waiting / Done / Parked
- Add/Edit/Delete with FAB

### 4. Money Floor
- Survival-level money clarity (not full budgeting)
- "The Floor" = cash - upcoming bills
- Color-coded: pickle lime positive, pepper red negative
- "Can I afford this?" notes

### 5. Body — A care-focused space ⭐ REDESIGNED
- **4-tab navigation**: Today / Cycle / Meds / Appts
- **TODAY**: Mood, sleep, water, symptoms, appetite + "ASK PEPPER" → care moves
- **CYCLE**: Day-of-cycle indicator, next period prediction (days until + date), cycle/period length tracking
- **MEDS**: Track medications including Ozempic-style jabs and vitamins, with delete-per-item
- **APPTS**: Doctor/gyno/therapy appointments with relative-date callouts ("in 3 days", "2 days ago" red badge for overdue)
- **PEPPER body advice** (`POST /api/pepper/advise-body`): reads all signals together, returns `vibe_read`, `care_moves[]`, `doctor_flag`, `permission`. Tone is gentler than chaos-dump (no cruel jokes even at extra_spicy).
- Lilac accent (`#E2A9F1`) throughout to match brand body palette

### 6. Receipts — PEPPER reads the room ⭐ REDESIGNED
- Locked screen: dark squircle lock badge, big bold "RECEIPTS" with italic "trust no one." tagline
- Person list as floating CategoryCards with "R" badge and chevron — each person is a "consultation"
- **Tap any person → bottom sheet** with PEPPER advice:
  - **Verdict pill** (TRUST/CAUTION/CUT) with color coding
  - **vibe_read** in red PEPPER speech bubble
  - **THE MOVE** card (pickle lime, single clear action)
  - **WATCH OUT FOR** flag list (red warning icons)
  - **SAY THIS** lilac bubble (if a reply is appropriate, includes the exact draft text)
- Backed by `POST /api/pepper/advise-person` with structured JSON

### 7. PEPPER History
- Past check-ins timeline

### 8. Onboarding (3 screens)
- Uses user-provided brand mockup images full-bleed
- Page indicator + skip + bright red CTA button with circular arrow
- Contextual CTA per slide: "START THE SALT CHECK" → "LET PEPPER CUT IT" → "NEXT SANE MOVE"

### 9. Settings ⭐ NEW
- **PEPPER spice level**: Mild ○ / Medium ◐ / Extra Spicy ● — applied to all check-ins
- **Nickname**: What PEPPER calls you
- **Daily reminders**: Master toggle + morning + evening with custom times (HH:MM with +/-30 min bumps)
- **Danger Zone**: Reset onboarding / Wipe all data
- All settings persisted to AsyncStorage via Zustand

### 10. Voice Dump ⭐ NEW
- Mic button in PEPPER Check-In screen
- OpenAI Whisper-1 transcription via Emergent LLM key
- Live recording timer (mm:ss) and "PEPPER IS LISTENING BACK..." state
- Transcribed text appended to text input (multi-take supported)
- Mic permission handled contextually with Settings deep-link fallback

### 11. Push Notifications ⭐ NEW (requires deployment)
- Emergent-managed push integration
- Scheduled daily reminders (morning + evening)
- 3 randomized salty copy variants per slot ("New day, same chaos." etc)
- Graceful preview behavior: `/api/register-push` returns `{status:"skipped"}` until deployment

## Tech Stack
- **Frontend**: Expo (React Native) + Expo Router, Zustand (persisted)
- **Backend**: FastAPI + MongoDB
- **AI**: OpenAI GPT-4.1 + Whisper-1 via Emergent LLM key
- **Security**: expo-local-authentication (Receipts), AsyncStorage for prefs
- **Notifications**: expo-notifications + Emergent push relay

## Design System
- **Colors**:
  - Pepper Red `#C4191E` (primary CTA, accents)
  - Bright Red `#FF0036` (alerts, sliders)
  - Pickle Lime `#A6AE1C` (money positive, success)
  - Soft Lilac `#E2A9F1` (body notes)
  - Salt Bone `#E6DCD1` (text)
  - Ink Black `#0D0D0D` (background)
- **Typography**: Space Mono — uppercase, wide letter spacing
- Dark mode default

## API Endpoints (all prefixed `/api`)
**PEPPER:**
- `POST /pepper/checkin` — AI check-in (now accepts `spice_level` + `nickname`)
- `GET /pepper/history/{user_id}`
- `POST /pepper/transcribe` — Whisper STT (multipart file)

**Push:**
- `POST /register-push` — Register device token
- `POST /send-test-push` — Manual test trigger

**CRUD:**
- `POST/GET/PUT /daily-entries`
- `POST/GET/PUT/DELETE /projects`
- `POST/GET/PUT/DELETE /tasks`
- `POST/GET/PUT /money-entries`
- `POST/GET/PUT /body-logs`
- `POST/GET/PUT/DELETE /person-notes`

## Test Coverage
- 44 backend pytest tests (currently 43 passing; register-push fix pending re-test)
- Crisis safety verified across all spice levels

## Future Roadmap
- Server-side encryption for Receipts (currently device-only biometric)
- iOS Face ID prompt copy refinement
- Calendar sync
- Recurring tasks
- Budget alerts
- Mood trends
- Voice → direct PEPPER call (skip text intermediate)
- Spice level subscription tier (Mild free, Medium $4.99, Extra Spicy $9.99)

## MVP Success Metrics
- 60% onboarding completion
- 30% Day 3 retention
- 70% PEPPER response thumbs up
- 50%+ check-ins have parked items
