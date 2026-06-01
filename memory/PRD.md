# Salt Check - Product Requirements Document

## Product Overview
**Salt Check** is a mobile-first "salty" life admin app for overwhelmed Gen Z and millennial users. The app helps users manage daily chaos through PEPPER, an AI bestie with personality that converts messy thought dumps into 3-5 sane moves.

**Tagline:** "Dump the mess. Get the next sane step."

## Target Audience
- Gen Z & millennial women (primary)
- Freelancers, creators, students, young founders
- People with ADHD-ish, internet-brained tendencies

## Core Features (Implemented)

### 1. PEPPER AI Check-In ⭐ Core Feature
- Free-text "chaos dump" input
- AI-powered analysis using OpenAI GPT-4.1 (via Emergent LLM key)
- Returns structured response:
  - Quick emotional read
  - Today's Salt Check (3-5 prioritized moves)
  - Parked items (non-urgent stuff)
  - Money check
  - Body check
  - Next sane step (immediate action)
  - Spicy closer
- **Crisis Detection:** Drops sass and provides safety response for self-harm/crisis keywords

### 2. Today Dashboard
- Daily survival dashboard with date, top 3 priorities
- Survival basics checklist (water, food, hygiene)
- Quick action items (work/money/life)
- Next sane step card
- Connects to PEPPER check-in for plan generation

### 3. Open Loops
- Lightweight task/project management
- Fields: Title, next action, deadline, status, notes
- Statuses: Not started, In progress, Waiting, Done, Parked
- Add/Edit/Delete tasks with FAB

### 4. Money Floor
- Survival-level money clarity (not full budgeting)
- Tracks: Cash available, expected income, upcoming bills, debts
- Shows "The Floor" calculation (real available money)
- "Can I afford this?" notes
- Color-coded with pickle lime (positive) and pepper red (negative)

### 5. Body Notes
- Low-pressure body tracking
- Logs: Sleep, appetite, symptoms, medication, water, notes
- Weight is optional and visually quiet

### 6. Receipts (Private)
- Private people and power notes
- Biometric/PIN lock via expo-local-authentication
- Fields: Person name, relationship, promised, asked for, do not reveal, follow-ups, risk/trust notes
- Permanent delete option

### 7. PEPPER History
- View past check-ins with full PEPPER responses
- Date-organized timeline

## Tech Stack
- **Frontend:** Expo (React Native) + Expo Router
- **Backend:** FastAPI + MongoDB
- **AI:** OpenAI GPT-4.1 via Emergent LLM key
- **Security:** expo-local-authentication for Receipts
- **State:** Zustand

## Design System
- **Colors:**
  - Pepper Red: #C4191E (primary CTA)
  - Bright Red: #FF0036 (accents)
  - Pickle Lime: #A6AE1C (money positive)
  - Soft Lilac: #E2A9F1 (body notes)
  - Salt Bone: #E6DCD1 (text/cards)
  - Ink Black: #0D0D0D (background)
- **Typography:** Space Mono (wide)
- **Style:** Dark mode default, salty/edgy aesthetic

## API Endpoints
All endpoints prefixed with `/api`:
- `POST /pepper/checkin` - AI check-in
- `GET /pepper/history/{user_id}` - Past check-ins
- `POST/GET/PUT /daily-entries` - Today's plan
- `POST/GET/PUT/DELETE /projects` - Project management
- `POST/GET/PUT/DELETE /tasks` - Task management  
- `POST/GET/PUT /money-entries` - Money Floor
- `POST/GET/PUT /body-logs` - Body Notes
- `POST/GET/PUT/DELETE /person-notes` - Receipts

## Future Roadmap (Not Yet Built)
- Server-side encryption for Receipts (currently device-only biometric lock)
- Calendar sync
- Recurring tasks
- Budget alerts
- Mood trends
- Export to Markdown/PDF
- Voice dump input
- Push notifications for daily check-ins

## MVP Success Metrics
- 60% onboarding completion (3 screens)
- 30% Day 3 retention
- 70% PEPPER response thumbs up
- 3+ Today dashboard opens/week
- 50%+ check-ins have parked items
