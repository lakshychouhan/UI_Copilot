from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import base64
from dotenv import load_dotenv
import os

from openai import OpenAI
import openai  # for openai.RateLimitError


# ------------- OpenAI setup -------------

load_dotenv()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

client = None
if OPENAI_API_KEY:
    # if key is present, create a client
    client = OpenAI(api_key=OPENAI_API_KEY)


# ------------- FastAPI app + CORS -------------
app = FastAPI()

# Add all origins that should be allowed to call the API
origins = [
    "http://localhost:5173",                 # Vite dev
    "http://localhost:4173",                 # Vite preview (optional)
    "https://ui-copilot-2.onrender.com",     # your frontend on Render
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],   # or ["POST"] if you want to be strict
    allow_headers=["*"],
)



# ------------- Pydantic models -------------

class VisionResponse(BaseModel):
    code: str


class GenerateRequest(BaseModel):
    prompt: str


# ------------- System prompt & fallback code -------------

SYSTEM_PROMPT = """
You are an assistant that generates SAFE React components using Tailwind CSS.

Hard requirements:
- Return ONLY JavaScript React component code. No explanations, comments, or surrounding text.
- Do NOT use Markdown fences (no ``` at all).
- Do NOT include import statements.
- Use a single default export named GeneratedComponent.
- The component must be self-contained (no external data fetching, no window/document, no localStorage, no eval, no dangerouslySetInnerHTML).
- Use Tailwind classes for styling.
- Ensure good color contrast: never use text colors that are the same as the background (avoid white text on white boxes or black text on black boxes).
"""


FALLBACK_CODE = """
import React from "react";

export default function GeneratedComponent() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6 bg-slate-950 min-h-screen">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm
                     transform transition-transform duration-200 hover:-translate-y-1 hover:shadow-xl"
        >
          <h2 className="text-lg font-semibold text-slate-50 mb-2">Card {i}</h2>
          <p className="text-sm text-slate-400">
            This is a fallback generated card {i}. Configure your API key to get real AI output.
          </p>
        </div>
      ))}
    </div>
  );
}
"""


# ------------- Screenshot → UI (Vision) -------------

@app.post("/vision-ui", response_model=VisionResponse)
async def vision_ui(file: UploadFile = File(...)):
    """
    Accepts an uploaded screenshot and asks the vision model
    to generate a React + Tailwind component that matches the UI.
    """
    if client is None:
        raise HTTPException(
            status_code=500,
            detail="No OPENAI_API_KEY set; Vision endpoint cannot call OpenAI."
        )

    # Read bytes and base64 encode
    content = await file.read()
    encoded = base64.b64encode(content).decode("utf-8")

    try:
        result = client.responses.create(
            model="gpt-4.1-mini",
            input=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "input_text",
                            "text": (
                                "You are a React UI generator. "
                                "Analyze this screenshot and generate a clean, simple, responsive "
                                "React component using TailwindCSS. "
                                "Return ONLY the code for: "
                                "`export default function GeneratedComponent() { ... }` "
                                "No markdown fences. No imports."
                            ),
                        },
                        {
                            "type": "input_image",
                            "image_url": f"data:image/png;base64,{encoded}",
                        },
                    ],
                }
            ],
        )

        # Extract JSX text from the response
        # (this assumes the Responses API structure)
        jsx = result.output[0].content[0].text

        return VisionResponse(code=jsx)

    except Exception as e:
        # If anything goes wrong, surface it as HTTP 500
        raise HTTPException(status_code=500, detail=str(e))


# ------------- Text prompt → UI (code generator) -------------

@app.post("/generate-ui")
async def generate_ui(req: GenerateRequest):
    # If no API key, always send fallback code so the app still works
    if client is None:
        return {
            "code": FALLBACK_CODE,
            "error": "No OPENAI_API_KEY set; using fallback code.",
        }

    try:
        response = client.responses.create(
            model="gpt-4.1-mini",
            input=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": req.prompt},
            ],
        )

        # Extract text from response
        code = response.output[0].content[0].text
        return {"code": code, "error": None}

    except openai.RateLimitError:
        # 429 / quota error
        return {
            "code": FALLBACK_CODE,
            "error": "OpenAI quota/rate limit exceeded; showing fallback UI instead.",
        }

    except Exception as e:
        # Anything else – HTTP 500
        raise HTTPException(status_code=500, detail=str(e))
