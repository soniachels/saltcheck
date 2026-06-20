from fastapi import FastAPI, HTTPException, Body, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List, Literal
from datetime import datetime, timedelta
from bson import ObjectId
import os
import tempfile
import httpx
from dotenv import load_dotenv
import bcrypt
from emergentintegrations.llm.chat import LlmChat, UserMessage
from emergentintegrations.llm.openai import OpenAISpeechToText

load_dotenv()

app = FastAPI(title="Salt Check API")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# MongoDB
MONGO_URL = os.getenv("MONGO_URL")
DB_NAME = os.getenv("DB_NAME", "saltcheck_db")
EMERGENT_LLM_KEY = os.getenv("EMERGENT_LLM_KEY")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# Collections
users_collection = db["users"]
daily_entries_collection = db["daily_entries"]
projects_collection = db["projects"]
tasks_collection = db["tasks"]
money_entries_collection = db["money_entries"]
body_logs_collection = db["body_logs"]
medications_collection = db["medications"]
person_notes_collection = db["person_notes"]
ai_checkins_collection = db["ai_checkins"]


@app.on_event("startup")
async def _ensure_indexes():
    # One money ledger per user — enforce the singleton at the DB level so a
    # fresh deploy gets the same guarantee as local dev.
    try:
        await money_entries_collection.create_index("user_id", unique=True)
    except Exception:
        pass

# Helper for ObjectId
class PyObjectId(ObjectId):
    @classmethod
    def __get_validators__(cls):
        yield cls.validate

    @classmethod
    def validate(cls, v):
        if not ObjectId.is_valid(v):
            raise ValueError("Invalid ObjectId")
        return ObjectId(v)

    @classmethod
    def __get_pydantic_json_schema__(cls, field_schema):
        field_schema.update(type="string")

# Pydantic Models
class UserCreate(BaseModel):
    email: EmailStr
    name: str
    nickname: Optional[str] = None
    pepper_spice_level: Literal["mild", "medium", "extra_spicy"] = "medium"
    timezone: str = "UTC"

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    nickname: Optional[str] = None
    pepper_spice_level: str
    timezone: str
    height_cm: Optional[float] = None
    unit_system: Optional[str] = None  # "metric" | "imperial"
    created_at: datetime

class ProfileUpdate(BaseModel):
    nickname: Optional[str] = None
    pepper_spice_level: Optional[Literal["mild", "medium", "extra_spicy"]] = None
    timezone: Optional[str] = None
    height_cm: Optional[float] = None
    unit_system: Optional[Literal["metric", "imperial"]] = None

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    name: str
    nickname: Optional[str] = None
    pepper_spice_level: Literal["mild", "medium", "extra_spicy"] = "medium"
    timezone: str = "UTC"

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class AuthResponse(BaseModel):
    token: str
    user: UserResponse

class DailyEntryCreate(BaseModel):
    date: str  # YYYY-MM-DD format
    top_priorities: List[str] = []
    priorities_done: List[bool] = []
    priorities_task_ids: List[Optional[str]] = []
    water_checked: bool = False
    food_checked: bool = False
    hygiene_checked: bool = False
    medication_note: Optional[str] = None
    money_action: Optional[str] = None
    work_action: Optional[str] = None
    life_admin_action: Optional[str] = None
    next_sane_step: Optional[str] = None

class DailyEntryResponse(BaseModel):
    id: str
    user_id: str
    date: str
    top_priorities: List[str]
    priorities_done: List[bool] = []
    priorities_task_ids: List[Optional[str]] = []
    water_checked: bool
    food_checked: bool
    hygiene_checked: bool
    medication_note: Optional[str]
    money_action: Optional[str]
    work_action: Optional[str]
    life_admin_action: Optional[str]
    next_sane_step: Optional[str]
    created_at: datetime
    updated_at: datetime

class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    status: Literal["not_started", "in_progress", "waiting", "done", "parked"] = "not_started"

class ProjectResponse(BaseModel):
    id: str
    user_id: str
    name: str
    description: Optional[str]
    status: str
    created_at: datetime
    updated_at: datetime

class TaskCreate(BaseModel):
    project_id: Optional[str] = None
    title: str
    next_action: Optional[str] = None
    deadline: Optional[str] = None
    status: Literal["not_started", "in_progress", "waiting", "done", "parked"] = "not_started"
    notes: Optional[str] = None
    parked: bool = False
    time: Optional[str] = None  # "HH:MM" 24h — for time-aware day ordering
    subtasks: Optional[List[dict]] = None  # [{title: str, done: bool}]
    completed_at: Optional[datetime] = None  # set when status -> done (for the calendar)

class TaskResponse(BaseModel):
    id: str
    user_id: str
    project_id: Optional[str] = None
    title: str
    next_action: Optional[str] = None
    deadline: Optional[str] = None
    status: str
    notes: Optional[str] = None
    parked: bool
    time: Optional[str] = None
    subtasks: Optional[List[dict]] = None
    completed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

class MoneyEntryCreate(BaseModel):
    date: str
    currency: Optional[str] = "USD"
    cash_available: Optional[float] = None
    expected_income: Optional[float] = None
    upcoming_bills: Optional[float] = None
    debts: Optional[float] = None
    urgent_payments: Optional[str] = None
    payment_followups: Optional[str] = None
    afford_note: Optional[str] = None
    # Detailed bills + income lists
    bills: Optional[List[dict]] = None  # [{label, amount, due_date, recurring: "monthly"|"weekly"|null, paid: bool}]
    income: Optional[List[dict]] = None  # [{label, amount, expected_date, recurring: ...}]
    # Doom Spending + Soft Saving
    doom_spends: Optional[List[dict]] = None
    soft_savings: Optional[List[dict]] = None

class MoneyEntryResponse(BaseModel):
    id: str
    user_id: str
    date: str
    currency: Optional[str] = "USD"
    cash_available: Optional[float]
    expected_income: Optional[float]
    upcoming_bills: Optional[float]
    debts: Optional[float]
    urgent_payments: Optional[str]
    payment_followups: Optional[str]
    afford_note: Optional[str]
    bills: Optional[List[dict]] = None
    income: Optional[List[dict]] = None
    doom_spends: Optional[List[dict]] = None
    soft_savings: Optional[List[dict]] = None
    created_at: datetime
    updated_at: datetime

class BodyLogCreate(BaseModel):
    date: str
    sleep: Optional[str] = None
    period: Optional[str] = None
    appetite: Optional[str] = None
    medication_note: Optional[str] = None
    jab_date: Optional[str] = None
    symptoms: Optional[str] = None
    water: Optional[int] = None
    weight_optional: Optional[float] = None
    notes: Optional[str] = None
    # Extended care fields
    period_started_on: Optional[str] = None  # date string
    period_length_days: Optional[int] = None
    cycle_length_days: Optional[int] = None
    medications: Optional[List[str]] = None  # e.g. ["Ozempic 0.5mg weekly", "Vitamin D"]
    appointments: Optional[List[dict]] = None  # [{"label": "GP", "date": "2026-07-01"}]
    mood: Optional[str] = None

class BodyLogResponse(BaseModel):
    id: str
    user_id: str
    date: str
    sleep: Optional[str]
    period: Optional[str]
    appetite: Optional[str]
    medication_note: Optional[str]
    jab_date: Optional[str]
    symptoms: Optional[str]
    water: Optional[int]
    weight_optional: Optional[float]
    notes: Optional[str]
    period_started_on: Optional[str] = None
    period_length_days: Optional[int] = None
    cycle_length_days: Optional[int] = None
    medications: Optional[List[str]] = None
    appointments: Optional[List[dict]] = None
    mood: Optional[str] = None
    created_at: datetime
    updated_at: datetime

class PersonNoteCreate(BaseModel):
    person_name: str
    relationship_category: Optional[Literal["family", "romantic", "friendship", "professional", "blurry"]] = None
    relationship_context: Optional[str] = None
    promised: Optional[str] = None
    asked_for: Optional[str] = None
    do_not_reveal: Optional[str] = None
    follow_up_needed: Optional[str] = None
    risk_trust_notes: Optional[str] = None
    locked: bool = False

class PersonNoteResponse(BaseModel):
    id: str
    user_id: str
    person_name: str
    relationship_category: Optional[str] = None
    relationship_context: Optional[str]
    promised: Optional[str]
    asked_for: Optional[str]
    do_not_reveal: Optional[str]
    follow_up_needed: Optional[str]
    risk_trust_notes: Optional[str]
    locked: bool
    advice_history: List[dict] = []
    last_advice: Optional[dict] = None
    last_advice_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

class AICheckInRequest(BaseModel):
    raw_dump: str
    user_context: Optional[dict] = None
    spice_level: Literal["mild", "medium", "extra_spicy"] = "medium"
    nickname: Optional[str] = None

class AICheckInResponse(BaseModel):
    id: str
    user_id: str
    raw_dump: str
    ai_response: dict
    urgent_items: List[str]
    parked_items: List[str]
    next_sane_step: str
    response_rating: Optional[int] = None
    created_at: datetime

# PEPPER System Prompt
PEPPER_SYSTEM_PROMPT = """You are PEPPER, the salty, sassy, protective AI bestie inside Salt Check.

Core personality: direct, funny, slightly mean in a loving way, and extremely practical. Your tone is warm but has zero tolerance for nonsense. Use short sentences. Maximum personality, minimum words.

You use food, salt, pepper, flavor, floor, tabs, and pantry metaphors naturally. You are anti-perfection. You normalize mess. Your favorite moves are calling out fake-urgent tasks, telling users to "park this," protecting their energy, and giving 3-5 clear next moves.

Rules:
- Always be brief unless the user asks for more.
- Never be overly gentle, therapeutic, corporate, motivational, or long-winded.
- You can be sassy and a little mean in a loving way.
- You may say things like "girl please," "be so for real," and "we are not doing this right now," but only when it fits.
- Always end with a clear action or next sane step.
- Use "we" language sometimes.
- Never shame the user for being behind.
- Never imply you are a human friend replacement. You are an AI inside Salt Check with a strong personality.

Response Structure for Chaos Dumps:
When the user dumps a messy list, respond with:
1. Quick emotional read (1 line)
2. Today's Salt Check (3-5 prioritized moves)
3. Parked (what to stop thinking about today)
4. Next sane step (one immediate action)
5. Optional spicy closer (short, warm, useful)

CRISIS DETECTION:
If the user mentions self-harm, suicidal ideation, not wanting to be here, not eating for extended periods, extreme isolation, abuse, or immediate danger, IMMEDIATELY drop the sass. Become warm, direct, and human. Acknowledge what was said, avoid jokes, avoid "park it" language, and offer one clear next step: contact emergency services, a crisis line, a trusted person, or local support.

Format your response as JSON with these keys:
{
  "quick_read": "One line emotional read",
  "salt_check": ["Move 1", "Move 2", "Move 3"],
  "loops_to_create": [
    {"title": "Send pitch deck to Naomi", "next_action": "fix slide 4", "deadline": "2026-06-12", "time": "14:30", "subtasks": ["fix slide 4", "proof it", "email Naomi"], "linked_priority_index": 0}
  ],
  "parked": ["Item 1", "Item 2"],
  "money_check": "One money-related insight or null",
  "body_check": "One body-related insight or null",
  "next_sane_step": "One immediate action",
  "closer": "Optional spicy closer",
  "bills": [{"label": "rent", "amount": 1200, "due_date": "2026-06-15", "recurring": "monthly"}],
  "income": [{"label": "freelance invoice", "amount": 800, "expected_date": "2026-06-10", "recurring": null}],
  "contradictions": [{"existing": "the existing loop this clashes with", "new": "the new thing from the dump", "question": "short question to resolve it"}],
  "needs_clarity": false,
  "clarity_questions": []
}

ADDITIVE BEHAVIOR (critical):
- After the dump you may be given EXISTING OPEN LOOPS and TODAY'S CURRENT TOP 3. Treat the new dump as ADDITIONS to the day, never a replacement.
- Do NOT recreate a loop that already exists (match loosely on meaning, not exact words). Only put genuinely NEW loops in loops_to_create.
- salt_check is the UPDATED top 3 = the most urgent of (existing not-yet-done priorities + new urgent items). Still MAX 3. Everything else goes to loops_to_create.

CONTRADICTIONS:
- If the dump clashes with an existing loop (reschedules it, cancels it, replaces it, or double-books the same time), add a `contradictions` entry: the existing loop, the new thing, and a short question to resolve it. Keep going with your best guess; set needs_clarity true ONLY if you genuinely cannot give a useful plan without the answer.

REPEATS:
- If a dumped item looks like something ALREADY in the existing open loops (same task, reworded), do NOT create a new loop for it. Add a `contradictions` entry asking whether it's the same loop or a genuinely new one (e.g. "You already have 'X' — same thing, or new?"). Never quietly duplicate.

WORK PRECEDENCE:
- If two or more WORK tasks compete for the same top slot and you can't tell which wins, add a clarity_question like "which is more urgent — X or Y?".

SUBTASKS:
- If a loop has multiple steps, list them in `subtasks` (array of short strings). NEVER cram multiple steps into one title, and NEVER pile several actions into a single salt_check item.

STRICT RULES FOR CLASSIFICATION (read carefully):

1. **salt_check (Top 3)** — ONLY the most important, simplest, most-urgent moves for TODAY.
   - MUST be simple atomic actions, NOT projects with subtasks.
   - NEVER include money payments here. "Pay credit card" is a BILL, not a salt_check item.
   - NEVER include vague items ("get my life together"). Pass those to clarity_questions instead.
   - If something is big (multiple steps), put the FIRST CONCRETE NEXT STEP in salt_check and the full project in loops_to_create.
   - MAX 3 items. Be ruthless.

2. **loops_to_create** — Open loops (tasks/projects) with optional deadlines.
   - For EACH salt_check item, ALSO create a matching loop with `linked_priority_index` set to that item's index (0/1/2). This keeps the Top 3 and the open loops in sync.
   - Add additional loops for items that aren't urgent enough for top 3 but still need to be tracked.
   - "deadline" is YYYY-MM-DD if user gave/implied a date.
   - Do NOT include money items or body items here.

3. **bills** — Anything the user owes / has to pay (rent, credit card, utilities, phone, subscriptions, loans, fines, insurance, tuition, etc).
   - SCAN EVERY DUMP FOR MONEY OWED FIRST, before sorting tasks. If a line mentions an amount the user has to pay, or owing/due/paying anything, it is a BILL — full stop.
   - Trigger words: "pay", "owe", "due", "bill", "rent", "subscription", "$" with an obligation, "installment", "repay", "invoice I owe".
   - These do NOT belong in salt_check, loops_to_create, or parked. Never turn a payment into a to-do task.
   - Always extract amount (number) and label. Include due_date (YYYY-MM-DD) and recurring ("monthly"/"weekly") when implied.
   - Examples that are BILLS, not tasks:
     • "I have to pay my credit card bill of $250 by Friday" → bills: [{label:"credit card", amount:250, due_date:"<fri>"}]
     • "rent is 1200 on the 1st" → bills: [{label:"rent", amount:1200, recurring:"monthly"}]
     • "netflix and spotify are killing me" → bills: [{label:"Netflix"...},{label:"Spotify"...}] (amount null is OK if unknown)

4. **income** — Anything the user expects to receive (paychecks, invoices, refunds).
   - Same rule: NOT in salt_check or loops.

5. **body_check** — Body-related insight (one line). The actual symptom/log goes nowhere else; it stays as advice.

6. **needs_clarity** — Set TRUE when the dump is too vague, missing key info, or you would have to guess to give a real read.
   - When TRUE, **return EMPTY salt_check/loops/parked** and put 1–3 specific questions in `clarity_questions`.
   - Examples of vague dumps that trigger clarity: "everything is a mess", "stressed about work", "I dunno", "feeling weird".
   - Don't ask if you can already make 3 confident moves from the dump.
   - Be brief: short questions. No therapy speak. e.g. "what's the deadline?", "is this work or life?", "what's actually due today?"
"""

PERSON_ADVICE_SYSTEM_PROMPT = """You are PEPPER, the salty, protective AI bestie. The user has shared notes about a specific person in their life and needs your read on the situation.

Be direct. Be a little mean for protective reasons. Use brand voice: food/salt/pepper/flavor metaphors, "girl please," "be so for real" — sparingly, when it fits. Never melodramatic. Never therapist. Never corporate.

Your job:
1. Read the vibe (1 line, blunt)
2. Protect the user's energy and time
3. Give them a clear move (text, ignore, set boundary, follow up, cut losses)
4. Flag risk if you see it (love-bombing, taking advantage, gaslighting patterns — call it out without diagnosing)

CRITICAL: BEFORE giving a verdict, check if you actually have enough context. If the notes are thin (no specific incident, no ask, no recent message, no quote from them) OR ambiguous (could mean multiple things), DO NOT guess. Ask for clarity.

Output JSON only:
{
  "needs_clarity": false,
  "clarity_questions": [],
  "vibe_read": "One blunt line on what this person is doing",
  "the_move": "ONE clear action to take (e.g. 'Send the boundary text. Stop drafting paragraphs.')",
  "watch_out_for": ["Pattern 1", "Pattern 2"],
  "what_to_say": "If a reply/text is appropriate, the actual short text to send. Otherwise null.",
  "verdict": "trust | caution | cut"
}

When you need clarity:
- Set `needs_clarity` = true
- Put 1-3 short, specific questions in `clarity_questions` (max 3, ideally 1-2). Examples: "what did they actually say in the last text?", "what are you trying to decide — keep them, cut them, or escalate?", "is this about money, time, or feelings?"
- You may STILL fill in `vibe_read` as a preliminary read, but leave `the_move`, `watch_out_for`, `what_to_say` empty/null and `verdict` should be "caution".
- Do NOT ask for clarity if the notes clearly describe a specific incident, ask, or pattern. Only when context is genuinely thin or ambiguous.
"""

BODY_ADVICE_SYSTEM_PROMPT = """You are PEPPER, the salty, protective AI bestie helping the user care for their body. They've shared body/health notes (cycle, meds, sleep, symptoms, appointments) and want your read.

Be direct. Use brand voice but DIAL DOWN the sass when health is involved. Be a protective best friend, not a doctor. Never give medical diagnoses or prescription advice. Always recommend a doctor for serious symptoms.

Your job:
1. Read the patterns (1 line)
2. Care moves (3 tiny next steps — water, snack, doc check, set reminder, etc.)
3. Flag anything that needs a doctor
4. End with permission to rest if needed

Output JSON only:
{
  "vibe_read": "One line on what's going on with their body",
  "care_moves": ["Move 1", "Move 2", "Move 3"],
  "doctor_flag": "Anything that warrants a doctor visit, or null",
  "permission": "A short warm line giving them permission to rest/eat/skip/cancel something"
}"""

# Crisis keywords for safety
CRISIS_KEYWORDS = [
    "kill myself", "end it all", "want to die", "suicide", "self-harm",
    "hurt myself", "not worth living", "better off dead", "can't go on",
    "no reason to live", "end my life"
]

def detect_crisis(text: str) -> bool:
    """Detect crisis language in user input"""
    text_lower = text.lower()
    return any(keyword in text_lower for keyword in CRISIS_KEYWORDS)

# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------
import jwt as pyjwt
from fastapi import Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET is not set. Add it to backend/.env")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_DAYS = 30

bearer_scheme = HTTPBearer(auto_error=True)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "iat": datetime.utcnow(),
        "exp": datetime.utcnow() + timedelta(days=JWT_EXPIRE_DAYS),
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict:
    """Resolve the authenticated user from the Bearer token. Raises 401 otherwise."""
    try:
        payload = pyjwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired. Please log in again.")
    except pyjwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid authentication token.")

    if not user_id or not ObjectId.is_valid(user_id):
        raise HTTPException(status_code=401, detail="Invalid authentication token.")

    user = await users_collection.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=401, detail="User no longer exists.")
    user["id"] = str(user["_id"])
    return user


# API Endpoints
@app.get("/")
async def root():
    return {"message": "Salt Check API", "status": "running"}

# Auth endpoints
@app.post("/api/auth/register", response_model=AuthResponse)
async def register(body: RegisterRequest):
    email = body.email.lower()
    existing = await users_collection.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="An account with this email already exists.")

    user_dict = {
        "email": email,
        "name": body.name,
        "nickname": body.nickname,
        "pepper_spice_level": body.pepper_spice_level,
        "timezone": body.timezone,
        "password_hash": hash_password(body.password),
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    result = await users_collection.insert_one(user_dict)
    user_dict["id"] = str(result.inserted_id)
    token = create_access_token(user_dict["id"])
    return AuthResponse(token=token, user=UserResponse(**user_dict))


@app.post("/api/auth/login", response_model=AuthResponse)
async def login(body: LoginRequest):
    user = await users_collection.find_one({"email": body.email.lower()})
    if not user or not verify_password(body.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Wrong email or password.")
    user["id"] = str(user["_id"])
    token = create_access_token(user["id"])
    return AuthResponse(token=token, user=UserResponse(**user))


@app.get("/api/auth/me", response_model=UserResponse)
async def get_me(current: dict = Depends(get_current_user)):
    return UserResponse(**current)


@app.put("/api/auth/me", response_model=UserResponse)
async def update_me(body: ProfileUpdate, current: dict = Depends(get_current_user)):
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    if patch:
        patch["updated_at"] = datetime.utcnow()
        await users_collection.update_one({"_id": ObjectId(current["id"])}, {"$set": patch})
    user = await users_collection.find_one({"_id": ObjectId(current["id"])})
    user["id"] = str(user["_id"])
    return UserResponse(**user)

# PEPPER Check-In endpoint
@app.post("/api/pepper/checkin", response_model=AICheckInResponse)
async def pepper_checkin(checkin: AICheckInRequest, current: dict = Depends(get_current_user)):
    user_id = current["id"]
    try:
        # Detect crisis
        is_crisis = detect_crisis(checkin.raw_dump)
        
        if is_crisis:
            # Crisis response
            ai_response = {
                "quick_read": "This is bigger than a to-do list.",
                "salt_check": ["Contact emergency services or a crisis line"],
                "parked": [],
                "money_check": None,
                "body_check": None,
                "next_sane_step": "Message one real person: 'I'm not okay. Can you stay with me?'",
                "closer": "I'm really glad you said it. Please reach out to someone who can be with you right now."
            }
        else:
            # Tune PEPPER's tone based on user-selected spice level
            spice_modifier = {
                "mild": "Override: dial back the sass. Be warm, direct, and supportive. Still concise. No 'girl please' or 'be so for real'. Keep the food/salt metaphors.",
                "medium": "Default tone: balanced sass and warmth. Use brand voice naturally.",
                "extra_spicy": "Override: max chaos energy. More sass, more 'be so for real', more 'we are not doing this right now'. Stay protective, never cruel.",
            }.get(checkin.spice_level, "")
            
            nickname_hint = f"\nThe user goes by '{checkin.nickname}'. Use the name sparingly and naturally, max once." if checkin.nickname else ""
            
            tuned_system_prompt = f"{PEPPER_SYSTEM_PROMPT}\n\n{spice_modifier}{nickname_hint}"
            
            # Normal PEPPER response
            chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=f"pepper_{user_id}_{datetime.utcnow().timestamp()}",
                system_message=tuned_system_prompt
            ).with_model("openai", "gpt-4.1")
            
            # Give PEPPER the user's current open loops + today's plan so new
            # dumps ADD to the day (not overwrite) and contradictions surface.
            import json as _json
            existing_tasks = []
            async for t in tasks_collection.find(
                {"user_id": user_id, "parked": {"$ne": True}, "status": {"$ne": "done"}}
            ).limit(40):
                existing_tasks.append({
                    "title": t.get("title"),
                    "next_action": t.get("next_action"),
                    "deadline": t.get("deadline"),
                    "time": t.get("time"),
                })
            today_doc = await daily_entries_collection.find_one(
                {"user_id": user_id, "date": datetime.utcnow().strftime("%Y-%m-%d")}
            )
            existing_priorities = (today_doc or {}).get("top_priorities", []) or []
            context_block = (
                f"\n\nEXISTING OPEN LOOPS (do NOT duplicate these; ADD to them and flag contradictions): "
                f"{_json.dumps(existing_tasks)}"
                f"\nTODAY'S CURRENT TOP 3: {_json.dumps(existing_priorities)}"
            )

            user_message = UserMessage(
                text=f"User dump: {checkin.raw_dump}{context_block}\n\nRespond with the structured JSON format as specified in your system prompt."
            )

            response = await chat.send_message(user_message)
            
            # Parse AI response
            import json
            try:
                ai_response = json.loads(response)
            except:
                # Fallback if JSON parsing fails
                ai_response = {
                    "quick_read": "Okay. Let's sort this.",
                    "salt_check": ["Start with one thing at a time"],
                    "parked": [],
                    "money_check": None,
                    "body_check": None,
                    "next_sane_step": "Pick the most urgent item and do it now",
                    "closer": "We got this."
                }
        
        # Extract items for structured data
        urgent_items = ai_response.get("salt_check", []) or []
        parked_items = ai_response.get("parked", []) or []
        next_sane_step = ai_response.get("next_sane_step") or "Take a breath and start with one thing"
        
        # Save to database
        checkin_doc = {
            "user_id": user_id,
            "raw_dump": checkin.raw_dump,
            "ai_response": ai_response,
            "urgent_items": urgent_items,
            "parked_items": parked_items,
            "next_sane_step": next_sane_step,
            "response_rating": None,
            "created_at": datetime.utcnow()
        }
        
        result = await ai_checkins_collection.insert_one(checkin_doc)
        checkin_doc["id"] = str(result.inserted_id)
        
        # Auto-sync to today's daily entry so the Today screen reflects PEPPER's plan
        today_str = datetime.utcnow().strftime("%Y-%m-%d")
        needs_clarity = bool(ai_response.get("needs_clarity"))
        salt_check_items = ai_response.get("salt_check", []) if not needs_clarity else []
        loops_to_create = ai_response.get("loops_to_create", []) if not needs_clarity else []
        
        # ---- Create loops and link each to its top-3 priority ----
        # priorities_task_ids[i] = task_id linked to salt_check_items[i]
        priorities_task_ids: List[Optional[str]] = [None] * len(salt_check_items[:3])

        # Guard against duplicate loops: collect existing active task titles so we
        # never silently recreate something already on the list. Near-matches get
        # surfaced to the user as a clarify question instead of being added again.
        existing_titles = []
        async for _t in tasks_collection.find({"user_id": user_id, "status": {"$ne": "done"}}, {"title": 1}):
            existing_titles.append((_t.get("title") or "").strip().lower())

        def _is_repeat(t: str) -> bool:
            n = t.strip().lower()
            for e in existing_titles:
                if e and (n == e or (len(n) > 4 and (n in e or e in n))):
                    return True
            return False

        repeat_loops: List[str] = []

        if isinstance(loops_to_create, list):
            for loop_spec in loops_to_create:
                if not isinstance(loop_spec, dict):
                    continue
                title = (loop_spec.get("title") or "").strip()
                if not title:
                    continue
                if _is_repeat(title):
                    repeat_loops.append(title)
                    continue
                # Normalize subtasks into [{title, done}] shape.
                raw_subs = loop_spec.get("subtasks") or []
                subtasks = [
                    {"title": str(s).strip(), "done": False}
                    for s in raw_subs if isinstance(s, (str, int, float)) and str(s).strip()
                ] if isinstance(raw_subs, list) else []
                task_doc = {
                    "user_id": user_id,
                    "title": title,
                    "next_action": loop_spec.get("next_action") or None,
                    "deadline": loop_spec.get("deadline") or None,
                    "time": loop_spec.get("time") or None,
                    "subtasks": subtasks,
                    "status": "not_started",
                    "parked": False,
                    "created_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow(),
                }
                task_result = await tasks_collection.insert_one(task_doc)
                task_id = str(task_result.inserted_id)
                # Link to top_3 if linked_priority_index points at one
                link_idx = loop_spec.get("linked_priority_index")
                if isinstance(link_idx, int) and 0 <= link_idx < len(priorities_task_ids):
                    priorities_task_ids[link_idx] = task_id

        # Surface repeats so PEPPER asks instead of silently duplicating a loop.
        if repeat_loops:
            contradictions = ai_response.get("contradictions")
            if not isinstance(contradictions, list):
                contradictions = []
            for rt in repeat_loops:
                contradictions.append({
                    "kind": "repeat",
                    "title": rt,
                    "existing": rt,
                    "new": rt,
                    "question": f"You already have '{rt}' open — same loop, or a new one?",
                })
            ai_response["contradictions"] = contradictions
            checkin_doc["ai_response"] = ai_response
            await ai_checkins_collection.update_one(
                {"_id": result.inserted_id},
                {"$set": {"ai_response": ai_response}},
            )

        # Pick action items by keyword heuristic (work/money/life)
        work_action = None
        money_action = ai_response.get("money_check")
        life_admin_action = None
        for item in salt_check_items:
            item_lower = item.lower()
            if not work_action and any(kw in item_lower for kw in ["work", "client", "email", "draft", "project", "send", "meeting", "boss"]):
                work_action = item
            elif not life_admin_action and not any(kw in item_lower for kw in ["work", "client", "money", "rent", "pay", "bill", "eat", "water", "sleep", "shower", "body"]):
                life_admin_action = item
        
        daily_entry_data = {
            "user_id": user_id,
            "date": today_str,
            "top_priorities": salt_check_items[:3],
            "priorities_done": [False] * len(salt_check_items[:3]),
            "priorities_task_ids": priorities_task_ids,
            "next_sane_step": next_sane_step,
            "money_action": money_action,
            "work_action": work_action,
            "life_admin_action": life_admin_action,
            "medication_note": ai_response.get("body_check"),
            "updated_at": datetime.utcnow(),
        }
        
        existing_entry = await daily_entries_collection.find_one({"user_id": user_id, "date": today_str})
        if existing_entry:
            # Preserve checkbox state by MATCHING TITLE (dumps now append/reorder
            # priorities, so index alignment would carry the wrong done flags).
            prev_priorities = existing_entry.get("priorities_done", [])
            prev_titles = existing_entry.get("top_priorities", []) or []
            preserved_ids = existing_entry.get("priorities_task_ids", [])
            done_by_title = {
                (prev_titles[i] or "").strip().lower(): bool(prev_priorities[i])
                for i in range(min(len(prev_titles), len(prev_priorities)))
            }
            new_priorities = salt_check_items[:3]
            aligned_done = []
            aligned_ids = []
            for i in range(len(new_priorities)):
                aligned_done.append(done_by_title.get((new_priorities[i] or "").strip().lower(), False))
                # Prefer new task ids; fall back to existing by position
                if priorities_task_ids[i]:
                    aligned_ids.append(priorities_task_ids[i])
                elif i < len(preserved_ids):
                    aligned_ids.append(preserved_ids[i])
                else:
                    aligned_ids.append(None)
            daily_entry_data["priorities_done"] = aligned_done
            daily_entry_data["priorities_task_ids"] = aligned_ids
            # Don't blow away today's entry if PEPPER asked for clarity (no salt_check provided)
            if needs_clarity:
                daily_entry_data.pop("top_priorities", None)
                daily_entry_data.pop("priorities_done", None)
                daily_entry_data.pop("priorities_task_ids", None)
            await daily_entries_collection.update_one(
                {"_id": existing_entry["_id"]},
                {"$set": daily_entry_data}
            )
        elif not needs_clarity:
            daily_entry_data["water_checked"] = False
            daily_entry_data["food_checked"] = False
            daily_entry_data["hygiene_checked"] = False
            daily_entry_data["created_at"] = datetime.utcnow()
            await daily_entries_collection.insert_one(daily_entry_data)
        
        # ---- Merge itemized bills + income into latest money entry ----
        ai_bills = ai_response.get("bills") or []
        ai_income = ai_response.get("income") or []
        if isinstance(ai_bills, list) and isinstance(ai_income, list) and (ai_bills or ai_income):
            # Find user's latest money entry; else create one
            latest_money = await money_entries_collection.find_one(
                {"user_id": user_id}, sort=[("created_at", -1)]
            )

            def _clean(items, kind):
                cleaned = []
                for it in items:
                    if not isinstance(it, dict):
                        continue
                    label = (it.get("label") or "").strip()
                    amount = it.get("amount")
                    if not label or amount is None:
                        continue
                    try:
                        amount = float(amount)
                    except Exception:
                        continue
                    entry = {"label": label, "amount": amount}
                    date_key = "due_date" if kind == "bills" else "expected_date"
                    if it.get(date_key):
                        entry[date_key] = str(it[date_key])
                    if it.get("recurring"):
                        entry["recurring"] = it["recurring"]
                    if kind == "bills":
                        entry["paid"] = bool(it.get("paid", False))
                    cleaned.append(entry)
                return cleaned

            new_bills = _clean(ai_bills, "bills")
            new_income = _clean(ai_income, "income")

            def _merge(existing, incoming):
                # Dedupe by lowercased label — newer overrides older
                merged = {(i.get("label") or "").lower(): i for i in (existing or [])}
                for it in incoming:
                    key = it["label"].lower()
                    if key in merged:
                        merged[key] = {**merged[key], **it}
                    else:
                        merged[key] = it
                return list(merged.values())

            if latest_money:
                merged_bills = _merge(latest_money.get("bills"), new_bills)
                merged_income = _merge(latest_money.get("income"), new_income)
                await money_entries_collection.update_one(
                    {"_id": latest_money["_id"]},
                    {"$set": {
                        "bills": merged_bills,
                        "income": merged_income,
                        "updated_at": datetime.utcnow(),
                    }}
                )
            else:
                # Upsert keyed by user_id so a race with the Girl Math screen
                # can't create a second ledger document.
                await money_entries_collection.update_one(
                    {"user_id": user_id},
                    {
                        "$set": {
                            "bills": new_bills,
                            "income": new_income,
                            "updated_at": datetime.utcnow(),
                        },
                        "$setOnInsert": {
                            "user_id": user_id,
                            "date": today_str,
                            "currency": "USD",
                            "created_at": datetime.utcnow(),
                        },
                    },
                    upsert=True,
                )
        
        return AICheckInResponse(**checkin_doc)
        
    except Exception as e:
        import traceback
        print("=== PEPPER checkin failed ===", flush=True)
        traceback.print_exc()
        print(f"=== checkin error: {type(e).__name__}: {e}", flush=True)
        raise HTTPException(status_code=500, detail=f"PEPPER is taking a break: {str(e)}")


DEDUPE_PROMPT = """You are PEPPER. You're given the user's current OPEN LOOPS as a JSON list of {id, title}.
Find groups that are the SAME task or clear duplicates/overlaps — even if worded differently (e.g. "Create graphic for Eric and Bada" and "Draft Eric & Bada poster" are the same).
Be conservative: only group GENUINE duplicates, not merely related or sequential tasks.
For each duplicate group, pick the clearest title to keep.
Return JSON ONLY: {"groups": [{"task_ids": ["id1","id2"], "keep_id": "id1", "reason": "short why they're the same"}]}.
If there are no duplicates, return {"groups": []}."""


@app.post("/api/pepper/dedupe-loops")
async def dedupe_loops(current: dict = Depends(get_current_user)):
    """PEPPER scans the user's open loops and flags likely duplicates to merge."""
    user_id = current["id"]
    import json as _json
    loops = []
    async for t in tasks_collection.find(
        {"user_id": user_id, "status": {"$ne": "done"}, "parked": {"$ne": True}}
    ):
        loops.append({"id": str(t["_id"]), "title": t.get("title") or ""})

    if len(loops) < 2:
        return {"groups": []}

    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"dedupe_{user_id}_{datetime.utcnow().timestamp()}",
            system_message=DEDUPE_PROMPT,
        ).with_model("openai", "gpt-4.1")
        resp = await chat.send_message(UserMessage(text=f"OPEN LOOPS: {_json.dumps(loops)}\n\nReturn the JSON."))
        try:
            data = _json.loads(resp)
        except Exception:
            # tolerate code fences / stray text
            s = resp[resp.find("{"): resp.rfind("}") + 1]
            data = _json.loads(s)
        groups = data.get("groups", []) if isinstance(data, dict) else []
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"PEPPER couldn't tidy: {str(e)}")

    # Validate against real ids and attach titles for display.
    by_id = {l["id"]: l["title"] for l in loops}
    clean = []
    for g in groups:
        ids = [i for i in (g.get("task_ids") or []) if i in by_id]
        if len(ids) < 2:
            continue
        keep = g.get("keep_id") if g.get("keep_id") in ids else ids[0]
        clean.append({
            "task_ids": ids,
            "keep_id": keep,
            "reason": g.get("reason") or "These look like the same loop.",
            "items": [{"id": i, "title": by_id[i]} for i in ids],
        })
    return {"groups": clean}

@app.get("/api/pepper/history/{user_id}", response_model=List[AICheckInResponse])
async def get_pepper_history(user_id: str, limit: int = 10, current: dict = Depends(get_current_user)):
    user_id = current["id"]
    checkins = []
    async for checkin in ai_checkins_collection.find({"user_id": user_id}).sort("created_at", -1).limit(limit):
        checkin["id"] = str(checkin["_id"])
        checkins.append(AICheckInResponse(**checkin))
    return checkins

# Daily Entry endpoints
@app.post("/api/daily-entries", response_model=DailyEntryResponse)
async def create_daily_entry(entry: DailyEntryCreate, current: dict = Depends(get_current_user)):
    user_id = current["id"]
    entry_dict = entry.model_dump()
    entry_dict["user_id"] = user_id
    entry_dict["created_at"] = datetime.utcnow()
    entry_dict["updated_at"] = datetime.utcnow()
    
    result = await daily_entries_collection.insert_one(entry_dict)
    entry_dict["id"] = str(result.inserted_id)
    return DailyEntryResponse(**entry_dict)

@app.get("/api/daily-entries/{user_id}", response_model=List[DailyEntryResponse])
async def get_daily_entries(user_id: str, current: dict = Depends(get_current_user)):
    user_id = current["id"]
    entries = []
    async for entry in daily_entries_collection.find({"user_id": user_id}).sort("date", -1):
        entry["id"] = str(entry["_id"])
        entries.append(DailyEntryResponse(**entry))
    return entries

@app.get("/api/daily-entries/{user_id}/{date}", response_model=DailyEntryResponse)
async def get_daily_entry_by_date(user_id: str, date: str, current: dict = Depends(get_current_user)):
    user_id = current["id"]
    entry = await daily_entries_collection.find_one({"user_id": user_id, "date": date})
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    entry["id"] = str(entry["_id"])
    return DailyEntryResponse(**entry)

@app.put("/api/daily-entries/{entry_id}", response_model=DailyEntryResponse)
async def update_daily_entry(entry_id: str, entry: DailyEntryCreate, current: dict = Depends(get_current_user)):
    entry_dict = entry.model_dump()
    entry_dict["updated_at"] = datetime.utcnow()

    result = await daily_entries_collection.update_one(
        {"_id": ObjectId(entry_id), "user_id": current["id"]},
        {"$set": entry_dict}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Entry not found")
    
    updated_entry = await daily_entries_collection.find_one({"_id": ObjectId(entry_id)})
    updated_entry["id"] = str(updated_entry["_id"])
    return DailyEntryResponse(**updated_entry)

# Project endpoints
@app.post("/api/projects", response_model=ProjectResponse)
async def create_project(project: ProjectCreate, current: dict = Depends(get_current_user)):
    user_id = current["id"]
    project_dict = project.model_dump()
    project_dict["user_id"] = user_id
    project_dict["created_at"] = datetime.utcnow()
    project_dict["updated_at"] = datetime.utcnow()
    
    result = await projects_collection.insert_one(project_dict)
    project_dict["id"] = str(result.inserted_id)
    return ProjectResponse(**project_dict)

@app.get("/api/projects/{user_id}", response_model=List[ProjectResponse])
async def get_projects(user_id: str, current: dict = Depends(get_current_user)):
    user_id = current["id"]
    projects = []
    async for project in projects_collection.find({"user_id": user_id}):
        project["id"] = str(project["_id"])
        projects.append(ProjectResponse(**project))
    return projects

@app.put("/api/projects/{project_id}", response_model=ProjectResponse)
async def update_project(project_id: str, project: ProjectCreate, current: dict = Depends(get_current_user)):
    project_dict = project.model_dump()
    project_dict["updated_at"] = datetime.utcnow()

    result = await projects_collection.update_one(
        {"_id": ObjectId(project_id), "user_id": current["id"]},
        {"$set": project_dict}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")
    
    updated_project = await projects_collection.find_one({"_id": ObjectId(project_id)})
    updated_project["id"] = str(updated_project["_id"])
    return ProjectResponse(**updated_project)

@app.delete("/api/projects/{project_id}")
async def delete_project(project_id: str, current: dict = Depends(get_current_user)):
    result = await projects_collection.delete_one({"_id": ObjectId(project_id), "user_id": current["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"message": "Project deleted"}

# Task endpoints
@app.post("/api/tasks", response_model=TaskResponse)
async def create_task(task: TaskCreate, current: dict = Depends(get_current_user)):
    user_id = current["id"]
    task_dict = task.model_dump()
    task_dict["user_id"] = user_id
    task_dict["created_at"] = datetime.utcnow()
    task_dict["updated_at"] = datetime.utcnow()
    
    result = await tasks_collection.insert_one(task_dict)
    task_dict["id"] = str(result.inserted_id)
    return TaskResponse(**task_dict)

@app.get("/api/tasks/{user_id}", response_model=List[TaskResponse])
async def get_tasks(user_id: str, current: dict = Depends(get_current_user)):
    user_id = current["id"]
    tasks = []
    async for task in tasks_collection.find({"user_id": user_id}):
        task["id"] = str(task["_id"])
        tasks.append(TaskResponse(**task))
    return tasks

@app.put("/api/tasks/{task_id}", response_model=TaskResponse)
async def update_task(task_id: str, task: TaskCreate, current: dict = Depends(get_current_user)):
    task_dict = task.model_dump()
    task_dict["updated_at"] = datetime.utcnow()

    # Stamp completed_at when a task is marked done; clear it if un-done.
    # (Preserve an existing timestamp so re-saving a done task doesn't move it.)
    if task_dict.get("status") == "done":
        existing = await tasks_collection.find_one({"_id": ObjectId(task_id), "user_id": current["id"]})
        task_dict["completed_at"] = (existing or {}).get("completed_at") or datetime.utcnow()
    else:
        task_dict["completed_at"] = None

    result = await tasks_collection.update_one(
        {"_id": ObjectId(task_id), "user_id": current["id"]},
        {"$set": task_dict}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")
    
    updated_task = await tasks_collection.find_one({"_id": ObjectId(task_id)})
    updated_task["id"] = str(updated_task["_id"])
    return TaskResponse(**updated_task)

@app.delete("/api/tasks/{task_id}")
async def delete_task(task_id: str, current: dict = Depends(get_current_user)):
    result = await tasks_collection.delete_one({"_id": ObjectId(task_id), "user_id": current["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"message": "Task deleted"}

# Money Entry endpoints
@app.post("/api/money-entries", response_model=MoneyEntryResponse)
async def create_money_entry(entry: MoneyEntryCreate, current: dict = Depends(get_current_user)):
    user_id = current["id"]
    # Singleton ledger: one money entry per user. If one already exists, merge
    # into it (only overwriting fields the client actually sent) rather than
    # creating a duplicate — this is what kept bills and cash in separate docs.
    existing = await money_entries_collection.find_one({"user_id": user_id})
    if existing:
        patch = {k: v for k, v in entry.model_dump().items() if v is not None}
        patch["updated_at"] = datetime.utcnow()
        await money_entries_collection.update_one({"_id": existing["_id"]}, {"$set": patch})
        entry_dict = await money_entries_collection.find_one({"_id": existing["_id"]})
        entry_dict["id"] = str(entry_dict["_id"])
        return MoneyEntryResponse(**entry_dict)

    entry_dict = entry.model_dump()
    entry_dict["user_id"] = user_id
    entry_dict["created_at"] = datetime.utcnow()
    entry_dict["updated_at"] = datetime.utcnow()

    result = await money_entries_collection.insert_one(entry_dict)
    entry_dict["id"] = str(result.inserted_id)
    return MoneyEntryResponse(**entry_dict)

@app.get("/api/money-entries/{user_id}", response_model=List[MoneyEntryResponse])
async def get_money_entries(user_id: str, current: dict = Depends(get_current_user)):
    user_id = current["id"]
    entries = []
    # Sort by created_at desc so the client's res.data[0] is the SAME canonical
    # entry that PEPPER's check-in merges bills/income into (it also targets the
    # latest-by-created_at entry). Sorting by "date" could pick a different doc.
    async for entry in money_entries_collection.find({"user_id": user_id}).sort("created_at", -1):
        entry["id"] = str(entry["_id"])
        entries.append(MoneyEntryResponse(**entry))
    return entries

@app.put("/api/money-entries/{entry_id}", response_model=MoneyEntryResponse)
async def update_money_entry(entry_id: str, entry: MoneyEntryCreate, current: dict = Depends(get_current_user)):
    entry_dict = entry.model_dump()
    entry_dict["updated_at"] = datetime.utcnow()

    result = await money_entries_collection.update_one(
        {"_id": ObjectId(entry_id), "user_id": current["id"]},
        {"$set": entry_dict}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Entry not found")
    
    updated_entry = await money_entries_collection.find_one({"_id": ObjectId(entry_id)})
    updated_entry["id"] = str(updated_entry["_id"])
    return MoneyEntryResponse(**updated_entry)

# Body Log endpoints
@app.post("/api/body-logs", response_model=BodyLogResponse)
async def create_body_log(log: BodyLogCreate, current: dict = Depends(get_current_user)):
    user_id = current["id"]
    log_dict = log.model_dump()
    log_dict["user_id"] = user_id
    log_dict["created_at"] = datetime.utcnow()
    log_dict["updated_at"] = datetime.utcnow()
    
    result = await body_logs_collection.insert_one(log_dict)
    log_dict["id"] = str(result.inserted_id)
    return BodyLogResponse(**log_dict)

@app.get("/api/body-logs/{user_id}", response_model=List[BodyLogResponse])
async def get_body_logs(user_id: str, current: dict = Depends(get_current_user)):
    user_id = current["id"]
    logs = []
    async for log in body_logs_collection.find({"user_id": user_id}).sort("date", -1):
        log["id"] = str(log["_id"])
        logs.append(BodyLogResponse(**log))
    return logs

@app.put("/api/body-logs/{log_id}", response_model=BodyLogResponse)
async def update_body_log(log_id: str, log: BodyLogCreate, current: dict = Depends(get_current_user)):
    log_dict = log.model_dump()
    log_dict["updated_at"] = datetime.utcnow()

    result = await body_logs_collection.update_one(
        {"_id": ObjectId(log_id), "user_id": current["id"]},
        {"$set": log_dict}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Log not found")
    
    updated_log = await body_logs_collection.find_one({"_id": ObjectId(log_id)})
    updated_log["id"] = str(updated_log["_id"])
    return BodyLogResponse(**updated_log)

# Person Note endpoints
@app.post("/api/person-notes", response_model=PersonNoteResponse)
async def create_person_note(note: PersonNoteCreate, current: dict = Depends(get_current_user)):
    user_id = current["id"]
    note_dict = note.model_dump()
    note_dict["user_id"] = user_id
    note_dict["created_at"] = datetime.utcnow()
    note_dict["updated_at"] = datetime.utcnow()
    
    result = await person_notes_collection.insert_one(note_dict)
    note_dict["id"] = str(result.inserted_id)
    return PersonNoteResponse(**note_dict)

@app.get("/api/person-notes/{user_id}", response_model=List[PersonNoteResponse])
async def get_person_notes(user_id: str, current: dict = Depends(get_current_user)):
    user_id = current["id"]
    notes = []
    async for note in person_notes_collection.find({"user_id": user_id}):
        note["id"] = str(note["_id"])
        notes.append(PersonNoteResponse(**note))
    return notes

@app.put("/api/person-notes/{note_id}", response_model=PersonNoteResponse)
async def update_person_note(note_id: str, note: PersonNoteCreate, current: dict = Depends(get_current_user)):
    note_dict = note.model_dump()
    note_dict["updated_at"] = datetime.utcnow()

    result = await person_notes_collection.update_one(
        {"_id": ObjectId(note_id), "user_id": current["id"]},
        {"$set": note_dict}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Note not found")
    
    updated_note = await person_notes_collection.find_one({"_id": ObjectId(note_id)})
    updated_note["id"] = str(updated_note["_id"])
    return PersonNoteResponse(**updated_note)

@app.delete("/api/person-notes/{note_id}")
async def delete_person_note(note_id: str, current: dict = Depends(get_current_user)):
    result = await person_notes_collection.delete_one({"_id": ObjectId(note_id), "user_id": current["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Note not found")
    return {"message": "Receipt deleted"}

@app.post("/api/pepper/transcribe")
async def transcribe_audio(file: UploadFile = File(...), current: dict = Depends(get_current_user)):
    """Accept an audio file (m4a/mp3/wav/webm) and return Whisper transcription."""
    try:
        suffix = os.path.splitext(file.filename or "audio.m4a")[1] or ".m4a"
        if suffix.lstrip(".").lower() not in ("mp3", "mp4", "mpeg", "mpga", "m4a", "wav", "webm"):
            suffix = ".m4a"
        
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name
        
        try:
            stt = OpenAISpeechToText(api_key=EMERGENT_LLM_KEY)
            with open(tmp_path, "rb") as audio_file:
                result = await stt.transcribe(
                    file=audio_file,
                    model="whisper-1",
                    response_format="json",
                )
            
            # Extract text from result
            text = ""
            if hasattr(result, "text"):
                text = result.text
            elif isinstance(result, dict):
                text = result.get("text", "")
            elif isinstance(result, str):
                text = result
            
            return {"text": text}
        finally:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")


# ============================================================
# Push Notifications (Emergent-managed via SuprSend relay)
# ============================================================
PUSH_BASE_URL = "https://integrations.emergentagent.com"
PUSH_KEY = os.environ.get("EMERGENT_PUSH_KEY", "placeholder")

_push_client = httpx.AsyncClient(
    base_url=PUSH_BASE_URL,
    headers={"X-Push-Key": PUSH_KEY},
    timeout=10.0,
)


class RegisterPushBody(BaseModel):
    user_id: str
    platform: str  # "android" | "ios"
    device_token: str


@app.post("/api/register-push", status_code=201)
async def register_push(body: RegisterPushBody, current: dict = Depends(get_current_user)):
    try:
        body.user_id = current["id"]
        resp = await _push_client.post("/api/v1/push/users/register", json=body.model_dump())
        if resp.status_code == 401:
            # Placeholder/missing key — graceful skip so the app keeps working in preview
            return {"status": "skipped", "reason": "EMERGENT_PUSH_KEY missing or invalid"}
        if resp.status_code >= 500:
            return {"status": "skipped", "reason": "Push provider unavailable"}
        resp.raise_for_status()
        return {"status": "registered"}
    except Exception as e:
        return {"status": "skipped", "reason": str(e)}


async def send_push(recipients: List[str], data: dict, idempotency_key: Optional[str] = None) -> None:
    if not recipients:
        return
    if len(recipients) > 100:
        raise ValueError("max 100 recipients per /trigger call")
    if "title" not in data or "message" not in data:
        raise ValueError("data must include title and message")
    payload: dict = {"recipients": recipients, "data": data}
    if idempotency_key:
        payload["$idempotency_key"] = idempotency_key
    resp = await _push_client.post("/api/v1/push/trigger", json=payload)
    if resp.status_code == 401:
        raise HTTPException(500, "EMERGENT_PUSH_KEY missing or invalid")
    if resp.status_code >= 500:
        raise HTTPException(502, "Push provider unavailable")
    resp.raise_for_status()


class TestPushBody(BaseModel):
    user_id: str
    title: str = "Salt Check"
    message: str = "New day, same chaos. Let's sort it."


@app.post("/api/send-test-push")
async def send_test_push(body: TestPushBody, current: dict = Depends(get_current_user)):
    """Manually trigger a push to verify wiring after deployment."""
    try:
        await send_push(
            recipients=[current["id"]],
            data={"title": body.title, "message": body.message},
        )
        return {"status": "sent"}
    except Exception as e:
        return {"status": "failed", "reason": str(e)}


class PersonAdviceRequest(BaseModel):
    person_note_id: Optional[str] = None
    person_name: str
    relationship_category: Optional[str] = None
    relationship_context: Optional[str] = None
    promised: Optional[str] = None
    asked_for: Optional[str] = None
    do_not_reveal: Optional[str] = None
    follow_up_needed: Optional[str] = None
    risk_trust_notes: Optional[str] = None
    user_clarification: Optional[str] = None
    spice_level: Literal["mild", "medium", "extra_spicy"] = "medium"


def _category_directive(category: Optional[str]) -> str:
    """Return extra prompt directive based on relationship category."""
    if not category:
        return ""
    cat = category.lower()
    if cat == "family":
        return (
            "RELATIONSHIP TYPE: family. Hold both loyalty AND boundaries. "
            "Acknowledge that 'just leave' isn't always an option. Suggest minimum-viable "
            "boundary moves. No 'cut them off' advice unless asked. Protect user emotionally."
        )
    if cat == "romantic":
        return (
            "RELATIONSHIP TYPE: romantic/dating. Be the protective best friend. "
            "Watch for: love-bombing, future-faking, intermittent reinforcement, controlling tone, "
            "gaslighting. Praise green flags clearly. Call red ones by name."
        )
    if cat == "friendship":
        return (
            "RELATIONSHIP TYPE: friendship. Track reciprocity and emotional labor balance. "
            "Note one-sided dynamics. Don't pathologize normal friend friction."
        )
    if cat == "professional":
        return (
            "RELATIONSHIP TYPE: professional/work. Stay tactical. Talk in scripts, paper trails, "
            "boundaries by role. Never advise emotional confrontation. Power-aware: factor in "
            "the user's relative power/risk."
        )
    if cat == "blurry":
        return (
            "RELATIONSHIP TYPE: BLURRY — categories overlap (e.g. boss who's also a friend, "
            "ex turned 'best friend', family member who acts romantic, situationship). "
            "This is where PEPPER goes EXTRA protective. Name the blur explicitly. "
            "Note that role confusion is itself a flag. Make the user articulate which lane "
            "this person is actually in before responding. Always end with: 'pick a lane.'"
        )
    return ""


@app.post("/api/pepper/advise-person")
async def advise_person(req: PersonAdviceRequest, current: dict = Depends(get_current_user)):
    """PEPPER reads the person notes and tells the user what to do."""
    user_id = current["id"]
    try:
        spice_modifier = {
            "mild": "Tone down sass. Warm and direct.",
            "medium": "Brand voice as defined.",
            "extra_spicy": "Max protective energy. More 'be so for real'. Never cruel.",
        }.get(req.spice_level, "")

        category_directive = _category_directive(req.relationship_category)

        context_lines = [
            f"Person: {req.person_name}",
            f"Relationship category: {req.relationship_category or 'unspecified'}",
            f"Context: {req.relationship_context or 'not specified'}",
        ]
        if req.promised: context_lines.append(f"What they promised: {req.promised}")
        if req.asked_for: context_lines.append(f"What they're asking for: {req.asked_for}")
        if req.do_not_reveal: context_lines.append(f"Do not reveal to them: {req.do_not_reveal}")
        if req.follow_up_needed: context_lines.append(f"Follow up needed: {req.follow_up_needed}")
        if req.risk_trust_notes: context_lines.append(f"Risk/trust notes: {req.risk_trust_notes}")
        if req.user_clarification:
            context_lines.append(f"USER CLARIFICATION (just provided in response to your previous question): {req.user_clarification}")
            context_lines.append("Since the user just clarified, DO NOT set needs_clarity=true again. Give your read now.")
        
        user_prompt = (
            "Read these notes and give your read on this person. JSON only.\n\n"
            + "\n".join(context_lines)
        )
        
        system_msg = PERSON_ADVICE_SYSTEM_PROMPT
        if category_directive:
            system_msg += f"\n\n{category_directive}"
        if spice_modifier:
            system_msg += f"\n\n{spice_modifier}"

        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"advise_person_{user_id}_{datetime.utcnow().timestamp()}",
            system_message=system_msg,
        ).with_model("openai", "gpt-4.1")
        
        response = await chat.send_message(UserMessage(text=user_prompt))
        
        import json
        try:
            advice = json.loads(response)
        except Exception:
            # Strip code fences if present
            cleaned = response.strip().lstrip("`").rstrip("`")
            if cleaned.startswith("json"):
                cleaned = cleaned[4:].strip()
            try:
                advice = json.loads(cleaned)
            except Exception:
                advice = {
                    "vibe_read": "Couldn't parse — try again.",
                    "the_move": "Re-open and ask PEPPER once more.",
                    "watch_out_for": [],
                    "what_to_say": None,
                    "verdict": "caution",
                }
        
        # Persist advice in person_note advice_history (most recent first)
        if req.person_note_id:
            try:
                advice_entry = {
                    "advice": advice,
                    "snapshot_context": {
                        "relationship_category": req.relationship_category,
                        "relationship_context": req.relationship_context,
                        "promised": req.promised,
                        "asked_for": req.asked_for,
                        "do_not_reveal": req.do_not_reveal,
                        "follow_up_needed": req.follow_up_needed,
                        "risk_trust_notes": req.risk_trust_notes,
                    },
                    "spice_level": req.spice_level,
                    "created_at": datetime.utcnow(),
                }
                await person_notes_collection.update_one(
                    {"_id": ObjectId(req.person_note_id)},
                    {
                        "$push": {"advice_history": {"$each": [advice_entry], "$position": 0, "$slice": 20}},
                        "$set": {
                            "last_advice": advice,
                            "last_advice_at": datetime.utcnow(),
                            "updated_at": datetime.utcnow(),
                        },
                    },
                )
            except Exception as e:
                # Non-fatal — advice still returned to user
                print(f"[advise-person] history append failed: {e}")
        
        return advice
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PEPPER is reading the room: {str(e)}")


class BodyAdviceRequest(BaseModel):
    sleep: Optional[str] = None
    appetite: Optional[str] = None
    symptoms: Optional[str] = None
    mood: Optional[str] = None
    water: Optional[int] = None
    period_started_on: Optional[str] = None
    period_length_days: Optional[int] = None
    cycle_length_days: Optional[int] = None
    medications: Optional[List[str]] = None
    appointments: Optional[List[dict]] = None
    notes: Optional[str] = None
    spice_level: Literal["mild", "medium", "extra_spicy"] = "medium"


@app.post("/api/pepper/advise-body")
async def advise_body(req: BodyAdviceRequest, current: dict = Depends(get_current_user)):
    user_id = current["id"]
    """PEPPER reads body care notes and gives gentle, practical care moves."""
    try:
        spice_modifier = {
            "mild": "Extra gentle. Health context — protective best friend mode.",
            "medium": "Brand voice but dial down sass for health topics.",
            "extra_spicy": "Still warm because this is body stuff. No cruel jokes.",
        }.get(req.spice_level, "")
        
        context_lines = []
        if req.sleep: context_lines.append(f"Sleep: {req.sleep}")
        if req.appetite: context_lines.append(f"Appetite: {req.appetite}")
        if req.water is not None: context_lines.append(f"Water today: {req.water} glasses")
        if req.symptoms: context_lines.append(f"Symptoms: {req.symptoms}")
        if req.mood: context_lines.append(f"Mood: {req.mood}")
        if req.period_started_on:
            context_lines.append(f"Last period started: {req.period_started_on}")
            if req.cycle_length_days:
                context_lines.append(f"Typical cycle: {req.cycle_length_days} days")
            if req.period_length_days:
                context_lines.append(f"Period length: {req.period_length_days} days")
        if req.medications:
            context_lines.append(f"Medications/jabs: {', '.join(req.medications)}")
        if req.appointments:
            appts = ", ".join([f"{a.get('label','appt')} on {a.get('date','TBD')}" for a in req.appointments])
            context_lines.append(f"Upcoming appointments: {appts}")
        if req.notes: context_lines.append(f"Other notes: {req.notes}")
        
        if not context_lines:
            return {
                "vibe_read": "Not much logged yet. Hard to read the body without data.",
                "care_moves": ["Log one thing — sleep, water, or how you feel."],
                "doctor_flag": None,
                "permission": "Start small. One log is enough.",
            }
        
        user_prompt = (
            "Read these body notes and give care moves. JSON only.\n\n"
            + "\n".join(context_lines)
        )
        
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"advise_body_{user_id}_{datetime.utcnow().timestamp()}",
            system_message=f"{BODY_ADVICE_SYSTEM_PROMPT}\n\n{spice_modifier}"
        ).with_model("openai", "gpt-4.1")
        
        response = await chat.send_message(UserMessage(text=user_prompt))
        
        import json
        try:
            advice = json.loads(response)
        except Exception:
            cleaned = response.strip().lstrip("`").rstrip("`")
            if cleaned.startswith("json"):
                cleaned = cleaned[4:].strip()
            try:
                advice = json.loads(cleaned)
            except Exception:
                advice = {
                    "vibe_read": "Couldn't parse — try again.",
                    "care_moves": ["Drink water.", "Log one symptom.", "Check in with yourself."],
                    "doctor_flag": None,
                    "permission": "Rest if you need to. The list will wait.",
                }
        
        return advice
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PEPPER is checking on you: {str(e)}")


# ============================================================
# PEPPER Receipt Vision — analyze conversation screenshots
# ============================================================
import base64

@app.post("/api/pepper/analyze-receipt")
async def analyze_receipt(
    file: UploadFile = File(...),
    person_name: str = Form(""),
    relationship_category: str = Form(""),
    spice_level: str = Form("medium"),
    current: dict = Depends(get_current_user),
):
    """PEPPER reads a screenshot of a conversation and gives a vibe read."""
    user_id = current["id"]
    try:
        content = await file.read()
        if len(content) > 8 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Screenshot too big (max 8MB)")
        ext = (file.filename or "img.png").split(".")[-1].lower()
        mime = "image/png" if ext == "png" else "image/jpeg"
        b64 = base64.b64encode(content).decode("utf-8")
        
        spice_modifier = {
            "mild": "Tone down sass. Warm.",
            "medium": "Brand voice.",
            "extra_spicy": "Max protective energy.",
        }.get(spice_level, "")
        ctx_lines = []
        if person_name: ctx_lines.append(f"Person: {person_name}")
        if relationship_category: ctx_lines.append(f"Relationship: {relationship_category}")
        context_str = "\n".join(ctx_lines) if ctx_lines else "Unknown person."
        
        system_prompt = f"""You are PEPPER. Read this screenshot of a conversation and give a protective read. {spice_modifier}

Output JSON only:
{{
  "tldr": "One line on what's happening",
  "the_red_flags": [],
  "the_green_flags": [],
  "what_they_actually_want": "Between the lines",
  "the_move": "What the user should do/say",
  "suggested_reply": "Actual text to send, or null",
  "verdict": "trust | caution | cut"
}}"""

        from emergentintegrations.llm.chat import ImageContent
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"vision_{user_id}_{datetime.utcnow().timestamp()}",
            system_message=system_prompt,
        ).with_model("openai", "gpt-4o")
        
        msg = UserMessage(
            text=f"{context_str}\n\nRead this screenshot.",
            file_contents=[ImageContent(image_base64=b64)],
        )
        response = await chat.send_message(msg)
        
        import json
        try:
            advice = json.loads(response)
        except Exception:
            cleaned = response.strip().lstrip("`").rstrip("`")
            if cleaned.startswith("json"): cleaned = cleaned[4:].strip()
            try:
                advice = json.loads(cleaned)
            except Exception:
                advice = {
                    "tldr": "Couldn't read it cleanly.",
                    "the_red_flags": [], "the_green_flags": [],
                    "what_they_actually_want": "unclear",
                    "the_move": "Re-upload a clearer screenshot.",
                    "suggested_reply": None, "verdict": "caution",
                }
        return advice
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PEPPER couldn't read it: {str(e)}")


# ============================================================================
# MEDICATIONS — daily/weekly/monthly schedule + intake history
# ============================================================================

class MedicationCreate(BaseModel):
    name: str
    dosage: Optional[str] = None  # "10mg", "2 pills", etc
    frequency: Literal["daily", "weekly", "monthly", "as_needed"] = "daily"
    time_of_day: Optional[str] = None  # "morning" / "evening" / "8:00 PM"
    days_of_week: Optional[List[str]] = None  # for weekly
    day_of_month: Optional[int] = None  # for monthly (1-31)
    start_date: Optional[str] = None
    notes: Optional[str] = None
    active: bool = True


class MedicationResponse(BaseModel):
    id: str
    user_id: str
    name: str
    dosage: Optional[str] = None
    frequency: str
    time_of_day: Optional[str] = None
    days_of_week: Optional[List[str]] = None
    day_of_month: Optional[int] = None
    start_date: Optional[str] = None
    notes: Optional[str] = None
    active: bool = True
    intake_history: List[dict] = []  # [{date: "YYYY-MM-DD", taken_at: ISO}]
    created_at: datetime
    updated_at: datetime


@app.post("/api/medications", response_model=MedicationResponse)
async def create_medication(med: MedicationCreate, current: dict = Depends(get_current_user)):
    user_id = current["id"]
    doc = med.dict()
    doc["user_id"] = user_id
    doc["intake_history"] = []
    doc["created_at"] = datetime.utcnow()
    doc["updated_at"] = datetime.utcnow()
    r = await medications_collection.insert_one(doc)
    new_med = await medications_collection.find_one({"_id": r.inserted_id})
    new_med["id"] = str(new_med.pop("_id"))
    return MedicationResponse(**new_med)


@app.get("/api/medications/{user_id}", response_model=List[MedicationResponse])
async def get_medications(user_id: str, current: dict = Depends(get_current_user)):
    user_id = current["id"]
    cursor = medications_collection.find({"user_id": user_id}).sort("created_at", -1)
    out = []
    async for d in cursor:
        d["id"] = str(d.pop("_id"))
        out.append(MedicationResponse(**d))
    return out


@app.put("/api/medications/{med_id}", response_model=MedicationResponse)
async def update_medication(med_id: str, med: MedicationCreate, current: dict = Depends(get_current_user)):
    try:
        oid = ObjectId(med_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Med not found")
    doc = med.dict()
    doc["updated_at"] = datetime.utcnow()
    r = await medications_collection.update_one({"_id": oid, "user_id": current["id"]}, {"$set": doc})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Med not found")
    updated = await medications_collection.find_one({"_id": oid})
    updated["id"] = str(updated.pop("_id"))
    return MedicationResponse(**updated)


@app.delete("/api/medications/{med_id}")
async def delete_medication(med_id: str, current: dict = Depends(get_current_user)):
    try:
        oid = ObjectId(med_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Med not found")
    r = await medications_collection.delete_one({"_id": oid, "user_id": current["id"]})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Med not found")
    return {"deleted": True}


class MedTakePayload(BaseModel):
    date: Optional[str] = None  # YYYY-MM-DD; defaults to today


@app.post("/api/medications/{med_id}/take", response_model=MedicationResponse)
async def mark_med_taken(med_id: str, payload: MedTakePayload, current: dict = Depends(get_current_user)):
    """Record that the user took this med on the given date."""
    try:
        oid = ObjectId(med_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Med not found")
    target_date = payload.date or datetime.utcnow().strftime("%Y-%m-%d")
    med = await medications_collection.find_one({"_id": oid, "user_id": current["id"]})
    if not med:
        raise HTTPException(status_code=404, detail="Med not found")
    history = med.get("intake_history") or []
    # Don't duplicate within the same date
    history = [h for h in history if h.get("date") != target_date]
    history.append({"date": target_date, "taken_at": datetime.utcnow().isoformat()})
    history.sort(key=lambda h: h.get("date"), reverse=True)
    history = history[:365]  # cap at a year
    await medications_collection.update_one(
        {"_id": oid},
        {"$set": {"intake_history": history, "updated_at": datetime.utcnow()}},
    )
    updated = await medications_collection.find_one({"_id": oid})
    updated["id"] = str(updated.pop("_id"))
    return MedicationResponse(**updated)


@app.delete("/api/medications/{med_id}/take", response_model=MedicationResponse)
async def undo_med_taken(med_id: str, date: Optional[str] = None, current: dict = Depends(get_current_user)):
    """Remove the intake record for the given date (undo)."""
    try:
        oid = ObjectId(med_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Med not found")
    target_date = date or datetime.utcnow().strftime("%Y-%m-%d")
    med = await medications_collection.find_one({"_id": oid, "user_id": current["id"]})
    if not med:
        raise HTTPException(status_code=404, detail="Med not found")
    history = med.get("intake_history") or []
    history = [h for h in history if h.get("date") != target_date]
    await medications_collection.update_one(
        {"_id": oid},
        {"$set": {"intake_history": history, "updated_at": datetime.utcnow()}},
    )
    updated = await medications_collection.find_one({"_id": oid})
    updated["id"] = str(updated.pop("_id"))
    return MedicationResponse(**updated)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
