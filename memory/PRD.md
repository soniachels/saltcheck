# Salt Check - Product Requirements Document

## Product Overview
**Salt Check** is a mobile-first "salty" life admin app for overwhelmed Gen Z and millennial users. PEPPER, an AI bestie with personality, converts messy chaos dumps into 3-5 sane moves.

**Tagline:** "Dump the mess. Get the next sane step."

## Target Audience
- Gen Z & millennial women (primary)
- Freelancers, creators, students, young founders
- ADHD-ish, internet-brained tendencies

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

### 5. Body Notes
- Sleep, appetite, symptoms, medication, water, weight (optional)
- Lilac accent (`#E2A9F1`)

### 6. Receipts (Private)
- Private people/power notes
- Biometric/PIN lock via expo-local-authentication
- Person name, relationship, promised, asked for, do_not_reveal, follow-ups, risk/trust

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
