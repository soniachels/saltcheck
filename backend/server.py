from fastapi import FastAPI, HTTPException, Body, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List, Literal
from datetime import datetime
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
person_notes_collection = db["person_notes"]
ai_checkins_collection = db["ai_checkins"]

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
    created_at: datetime

class DailyEntryCreate(BaseModel):
    date: str  # YYYY-MM-DD format
    top_priorities: List[str] = []
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

class TaskResponse(BaseModel):
    id: str
    user_id: str
    project_id: Optional[str]
    title: str
    next_action: Optional[str]
    deadline: Optional[str]
    status: str
    notes: Optional[str]
    parked: bool
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
    # Doom Spending + Soft Saving
    doom_spends: Optional[List[dict]] = None   # [{label, amount, regret: 1-5, date}]
    soft_savings: Optional[List[dict]] = None  # [{label, amount, date}]

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
    relationship_context: Optional[str]
    promised: Optional[str]
    asked_for: Optional[str]
    do_not_reveal: Optional[str]
    follow_up_needed: Optional[str]
    risk_trust_notes: Optional[str]
    locked: bool
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
  "parked": ["Item 1", "Item 2"],
  "money_check": "One money-related insight or null",
  "body_check": "One body-related insight or null",
  "next_sane_step": "One immediate action",
  "closer": "Optional spicy closer"
}"""

PERSON_ADVICE_SYSTEM_PROMPT = """You are PEPPER, the salty, protective AI bestie. The user has shared notes about a specific person in their life and needs your read on the situation.

Be direct. Be a little mean for protective reasons. Use brand voice: food/salt/pepper/flavor metaphors, "girl please," "be so for real" — sparingly, when it fits. Never melodramatic. Never therapist. Never corporate.

Your job:
1. Read the vibe (1 line, blunt)
2. Protect the user's energy and time
3. Give them a clear move (text, ignore, set boundary, follow up, cut losses)
4. Flag risk if you see it (love-bombing, taking advantage, gaslighting patterns — call it out without diagnosing)

Output JSON only:
{
  "vibe_read": "One blunt line on what this person is doing",
  "the_move": "ONE clear action to take (e.g. 'Send the boundary text. Stop drafting paragraphs.')",
  "watch_out_for": ["Pattern 1", "Pattern 2"],
  "what_to_say": "If a reply/text is appropriate, the actual short text to send. Otherwise null.",
  "verdict": "trust | caution | cut" 
}"""

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

# API Endpoints
@app.get("/")
async def root():
    return {"message": "Salt Check API", "status": "running"}

# User endpoints
@app.post("/api/users", response_model=UserResponse)
async def create_user(user: UserCreate):
    user_dict = user.model_dump()
    user_dict["created_at"] = datetime.utcnow()
    user_dict["updated_at"] = datetime.utcnow()
    
    # Check if user exists
    existing = await users_collection.find_one({"email": user.email})
    if existing:
        raise HTTPException(status_code=400, detail="User already exists")
    
    result = await users_collection.insert_one(user_dict)
    user_dict["id"] = str(result.inserted_id)
    return UserResponse(**user_dict)

@app.get("/api/users/{user_id}", response_model=UserResponse)
async def get_user(user_id: str):
    user = await users_collection.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user["id"] = str(user["_id"])
    return UserResponse(**user)

@app.get("/api/users", response_model=List[UserResponse])
async def list_users():
    users = []
    async for user in users_collection.find():
        user["id"] = str(user["_id"])
        users.append(UserResponse(**user))
    return users

# PEPPER Check-In endpoint
@app.post("/api/pepper/checkin", response_model=AICheckInResponse)
async def pepper_checkin(checkin: AICheckInRequest, user_id: str = "default_user"):
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
            
            user_message = UserMessage(
                text=f"User dump: {checkin.raw_dump}\n\nRespond with the structured JSON format as specified in your system prompt."
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
        urgent_items = ai_response.get("salt_check", [])
        parked_items = ai_response.get("parked", [])
        next_sane_step = ai_response.get("next_sane_step", "Take a breath and start with one thing")
        
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
        salt_check_items = ai_response.get("salt_check", [])
        
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
            "next_sane_step": next_sane_step,
            "money_action": money_action,
            "work_action": work_action,
            "life_admin_action": life_admin_action,
            "medication_note": ai_response.get("body_check"),
            "updated_at": datetime.utcnow(),
        }
        
        existing_entry = await daily_entries_collection.find_one({"user_id": user_id, "date": today_str})
        if existing_entry:
            # Preserve checkbox state on update
            await daily_entries_collection.update_one(
                {"_id": existing_entry["_id"]},
                {"$set": daily_entry_data}
            )
        else:
            daily_entry_data["water_checked"] = False
            daily_entry_data["food_checked"] = False
            daily_entry_data["hygiene_checked"] = False
            daily_entry_data["created_at"] = datetime.utcnow()
            await daily_entries_collection.insert_one(daily_entry_data)
        
        return AICheckInResponse(**checkin_doc)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PEPPER is taking a break: {str(e)}")

@app.get("/api/pepper/history/{user_id}", response_model=List[AICheckInResponse])
async def get_pepper_history(user_id: str, limit: int = 10):
    checkins = []
    async for checkin in ai_checkins_collection.find({"user_id": user_id}).sort("created_at", -1).limit(limit):
        checkin["id"] = str(checkin["_id"])
        checkins.append(AICheckInResponse(**checkin))
    return checkins

# Daily Entry endpoints
@app.post("/api/daily-entries", response_model=DailyEntryResponse)
async def create_daily_entry(entry: DailyEntryCreate, user_id: str = "default_user"):
    entry_dict = entry.model_dump()
    entry_dict["user_id"] = user_id
    entry_dict["created_at"] = datetime.utcnow()
    entry_dict["updated_at"] = datetime.utcnow()
    
    result = await daily_entries_collection.insert_one(entry_dict)
    entry_dict["id"] = str(result.inserted_id)
    return DailyEntryResponse(**entry_dict)

@app.get("/api/daily-entries/{user_id}", response_model=List[DailyEntryResponse])
async def get_daily_entries(user_id: str):
    entries = []
    async for entry in daily_entries_collection.find({"user_id": user_id}).sort("date", -1):
        entry["id"] = str(entry["_id"])
        entries.append(DailyEntryResponse(**entry))
    return entries

@app.get("/api/daily-entries/{user_id}/{date}", response_model=DailyEntryResponse)
async def get_daily_entry_by_date(user_id: str, date: str):
    entry = await daily_entries_collection.find_one({"user_id": user_id, "date": date})
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    entry["id"] = str(entry["_id"])
    return DailyEntryResponse(**entry)

@app.put("/api/daily-entries/{entry_id}", response_model=DailyEntryResponse)
async def update_daily_entry(entry_id: str, entry: DailyEntryCreate):
    entry_dict = entry.model_dump()
    entry_dict["updated_at"] = datetime.utcnow()
    
    result = await daily_entries_collection.update_one(
        {"_id": ObjectId(entry_id)},
        {"$set": entry_dict}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Entry not found")
    
    updated_entry = await daily_entries_collection.find_one({"_id": ObjectId(entry_id)})
    updated_entry["id"] = str(updated_entry["_id"])
    return DailyEntryResponse(**updated_entry)

# Project endpoints
@app.post("/api/projects", response_model=ProjectResponse)
async def create_project(project: ProjectCreate, user_id: str = "default_user"):
    project_dict = project.model_dump()
    project_dict["user_id"] = user_id
    project_dict["created_at"] = datetime.utcnow()
    project_dict["updated_at"] = datetime.utcnow()
    
    result = await projects_collection.insert_one(project_dict)
    project_dict["id"] = str(result.inserted_id)
    return ProjectResponse(**project_dict)

@app.get("/api/projects/{user_id}", response_model=List[ProjectResponse])
async def get_projects(user_id: str):
    projects = []
    async for project in projects_collection.find({"user_id": user_id}):
        project["id"] = str(project["_id"])
        projects.append(ProjectResponse(**project))
    return projects

@app.put("/api/projects/{project_id}", response_model=ProjectResponse)
async def update_project(project_id: str, project: ProjectCreate):
    project_dict = project.model_dump()
    project_dict["updated_at"] = datetime.utcnow()
    
    result = await projects_collection.update_one(
        {"_id": ObjectId(project_id)},
        {"$set": project_dict}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")
    
    updated_project = await projects_collection.find_one({"_id": ObjectId(project_id)})
    updated_project["id"] = str(updated_project["_id"])
    return ProjectResponse(**updated_project)

@app.delete("/api/projects/{project_id}")
async def delete_project(project_id: str):
    result = await projects_collection.delete_one({"_id": ObjectId(project_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"message": "Project deleted"}

# Task endpoints
@app.post("/api/tasks", response_model=TaskResponse)
async def create_task(task: TaskCreate, user_id: str = "default_user"):
    task_dict = task.model_dump()
    task_dict["user_id"] = user_id
    task_dict["created_at"] = datetime.utcnow()
    task_dict["updated_at"] = datetime.utcnow()
    
    result = await tasks_collection.insert_one(task_dict)
    task_dict["id"] = str(result.inserted_id)
    return TaskResponse(**task_dict)

@app.get("/api/tasks/{user_id}", response_model=List[TaskResponse])
async def get_tasks(user_id: str):
    tasks = []
    async for task in tasks_collection.find({"user_id": user_id}):
        task["id"] = str(task["_id"])
        tasks.append(TaskResponse(**task))
    return tasks

@app.put("/api/tasks/{task_id}", response_model=TaskResponse)
async def update_task(task_id: str, task: TaskCreate):
    task_dict = task.model_dump()
    task_dict["updated_at"] = datetime.utcnow()
    
    result = await tasks_collection.update_one(
        {"_id": ObjectId(task_id)},
        {"$set": task_dict}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")
    
    updated_task = await tasks_collection.find_one({"_id": ObjectId(task_id)})
    updated_task["id"] = str(updated_task["_id"])
    return TaskResponse(**updated_task)

@app.delete("/api/tasks/{task_id}")
async def delete_task(task_id: str):
    result = await tasks_collection.delete_one({"_id": ObjectId(task_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"message": "Task deleted"}

# Money Entry endpoints
@app.post("/api/money-entries", response_model=MoneyEntryResponse)
async def create_money_entry(entry: MoneyEntryCreate, user_id: str = "default_user"):
    entry_dict = entry.model_dump()
    entry_dict["user_id"] = user_id
    entry_dict["created_at"] = datetime.utcnow()
    entry_dict["updated_at"] = datetime.utcnow()
    
    result = await money_entries_collection.insert_one(entry_dict)
    entry_dict["id"] = str(result.inserted_id)
    return MoneyEntryResponse(**entry_dict)

@app.get("/api/money-entries/{user_id}", response_model=List[MoneyEntryResponse])
async def get_money_entries(user_id: str):
    entries = []
    async for entry in money_entries_collection.find({"user_id": user_id}).sort("date", -1):
        entry["id"] = str(entry["_id"])
        entries.append(MoneyEntryResponse(**entry))
    return entries

@app.put("/api/money-entries/{entry_id}", response_model=MoneyEntryResponse)
async def update_money_entry(entry_id: str, entry: MoneyEntryCreate):
    entry_dict = entry.model_dump()
    entry_dict["updated_at"] = datetime.utcnow()
    
    result = await money_entries_collection.update_one(
        {"_id": ObjectId(entry_id)},
        {"$set": entry_dict}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Entry not found")
    
    updated_entry = await money_entries_collection.find_one({"_id": ObjectId(entry_id)})
    updated_entry["id"] = str(updated_entry["_id"])
    return MoneyEntryResponse(**updated_entry)

# Body Log endpoints
@app.post("/api/body-logs", response_model=BodyLogResponse)
async def create_body_log(log: BodyLogCreate, user_id: str = "default_user"):
    log_dict = log.model_dump()
    log_dict["user_id"] = user_id
    log_dict["created_at"] = datetime.utcnow()
    log_dict["updated_at"] = datetime.utcnow()
    
    result = await body_logs_collection.insert_one(log_dict)
    log_dict["id"] = str(result.inserted_id)
    return BodyLogResponse(**log_dict)

@app.get("/api/body-logs/{user_id}", response_model=List[BodyLogResponse])
async def get_body_logs(user_id: str):
    logs = []
    async for log in body_logs_collection.find({"user_id": user_id}).sort("date", -1):
        log["id"] = str(log["_id"])
        logs.append(BodyLogResponse(**log))
    return logs

@app.put("/api/body-logs/{log_id}", response_model=BodyLogResponse)
async def update_body_log(log_id: str, log: BodyLogCreate):
    log_dict = log.model_dump()
    log_dict["updated_at"] = datetime.utcnow()
    
    result = await body_logs_collection.update_one(
        {"_id": ObjectId(log_id)},
        {"$set": log_dict}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Log not found")
    
    updated_log = await body_logs_collection.find_one({"_id": ObjectId(log_id)})
    updated_log["id"] = str(updated_log["_id"])
    return BodyLogResponse(**updated_log)

# Person Note endpoints
@app.post("/api/person-notes", response_model=PersonNoteResponse)
async def create_person_note(note: PersonNoteCreate, user_id: str = "default_user"):
    note_dict = note.model_dump()
    note_dict["user_id"] = user_id
    note_dict["created_at"] = datetime.utcnow()
    note_dict["updated_at"] = datetime.utcnow()
    
    result = await person_notes_collection.insert_one(note_dict)
    note_dict["id"] = str(result.inserted_id)
    return PersonNoteResponse(**note_dict)

@app.get("/api/person-notes/{user_id}", response_model=List[PersonNoteResponse])
async def get_person_notes(user_id: str):
    notes = []
    async for note in person_notes_collection.find({"user_id": user_id}):
        note["id"] = str(note["_id"])
        notes.append(PersonNoteResponse(**note))
    return notes

@app.put("/api/person-notes/{note_id}", response_model=PersonNoteResponse)
async def update_person_note(note_id: str, note: PersonNoteCreate):
    note_dict = note.model_dump()
    note_dict["updated_at"] = datetime.utcnow()
    
    result = await person_notes_collection.update_one(
        {"_id": ObjectId(note_id)},
        {"$set": note_dict}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Note not found")
    
    updated_note = await person_notes_collection.find_one({"_id": ObjectId(note_id)})
    updated_note["id"] = str(updated_note["_id"])
    return PersonNoteResponse(**updated_note)

@app.delete("/api/person-notes/{note_id}")
async def delete_person_note(note_id: str):
    result = await person_notes_collection.delete_one({"_id": ObjectId(note_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Note not found")
    return {"message": "Receipt deleted"}

@app.post("/api/pepper/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
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
async def register_push(body: RegisterPushBody):
    try:
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
async def send_test_push(body: TestPushBody):
    """Manually trigger a push to verify wiring after deployment."""
    try:
        await send_push(
            recipients=[body.user_id],
            data={"title": body.title, "message": body.message},
        )
        return {"status": "sent"}
    except Exception as e:
        return {"status": "failed", "reason": str(e)}


# ============================================================
# PEPPER Advice — People (Receipts) and Body
# ============================================================
class PersonAdviceRequest(BaseModel):
    person_note_id: Optional[str] = None
    person_name: str
    relationship_context: Optional[str] = None
    promised: Optional[str] = None
    asked_for: Optional[str] = None
    do_not_reveal: Optional[str] = None
    follow_up_needed: Optional[str] = None
    risk_trust_notes: Optional[str] = None
    spice_level: Literal["mild", "medium", "extra_spicy"] = "medium"


@app.post("/api/pepper/advise-person")
async def advise_person(req: PersonAdviceRequest, user_id: str = "default_user"):
    """PEPPER reads the person notes and tells the user what to do."""
    try:
        spice_modifier = {
            "mild": "Tone down sass. Warm and direct.",
            "medium": "Brand voice as defined.",
            "extra_spicy": "Max protective energy. More 'be so for real'. Never cruel.",
        }.get(req.spice_level, "")
        
        context_lines = [
            f"Person: {req.person_name}",
            f"Relationship: {req.relationship_context or 'not specified'}",
        ]
        if req.promised: context_lines.append(f"What they promised: {req.promised}")
        if req.asked_for: context_lines.append(f"What they're asking for: {req.asked_for}")
        if req.do_not_reveal: context_lines.append(f"Do not reveal to them: {req.do_not_reveal}")
        if req.follow_up_needed: context_lines.append(f"Follow up needed: {req.follow_up_needed}")
        if req.risk_trust_notes: context_lines.append(f"Risk/trust notes: {req.risk_trust_notes}")
        
        user_prompt = (
            "Read these notes and give your read on this person. JSON only.\n\n"
            + "\n".join(context_lines)
        )
        
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"advise_person_{user_id}_{datetime.utcnow().timestamp()}",
            system_message=f"{PERSON_ADVICE_SYSTEM_PROMPT}\n\n{spice_modifier}"
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
async def advise_body(req: BodyAdviceRequest, user_id: str = "default_user"):
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
