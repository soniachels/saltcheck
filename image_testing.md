# Image Testing Playbook for Salt Check
(Saved from integration playbook — reference for testing agent runs.)

## Rules
- Always use base64-encoded images. Accepted: JPEG, PNG, WEBP.
- Use real visual content (no blank/solid images).
- Detect MIME after transformations.
- Resize big images before sending.

## Salt Check usage
- Endpoint: `POST /api/pepper/analyze-screenshot`
- Sends `{ image_base64: "...", person_name, relationship_category, context?: string }`
- Uses Emergent LLM with OpenAI gpt-4.1 vision.
- Returns JSON: `{ tone, red_flags[], green_flags[], suggested_reply, verdict }`.
