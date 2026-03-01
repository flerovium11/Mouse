import dotenv
dotenv.load_dotenv()

from google import genai
from google.genai import types
import os
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, PointStruct, VectorParams
qdrant = QdrantClient(":memory:") # Create in-memory Qdrant instance, for testing, CI/CD

with open('mouse/backend/prompt.txt', 'r') as f:
    SUMMARY_PROMPT = f.read()

# Only run this block for Gemini Developer API
client = genai.Client(api_key=os.getenv('GEMINI_API_KEY'))

def generate_summary_prompt(website_text: str) -> str:
    return SUMMARY_PROMPT.format(website_text)

import requests
print("Fetching website text...")
example_website_text = requests.get("https://geminiliveagentchallenge.devpost.com/?ref_feature=challenge&ref_medium=discover").text

response = client.models.generate_content(
    model='gemini-2.5-flash-lite',
    contents=types.Part.from_text(text=generate_summary_prompt(example_website_text)),
    config=types.GenerateContentConfig(
        temperature=0,
        top_p=0.95,
        top_k=20,
    ),
)
print(response.text)
# Parse the response
text = response.text
text = text.replace("```json", "").replace("```", "")
import json
snippets = json.loads(text)
print(snippets)

results = client.models.embed_content(
    model="gemini-embedding-001",
    contents=snippets,
)

print(results)
points = [
    PointStruct(
        id=idx,
        vector=response.values,
        payload={"text": text},
    )
    for idx, (response, text) in enumerate(zip(results.embeddings, snippets))
]

qdrant.create_collection("snippets", vectors_config=
    VectorParams(
        size=3072,
        distance=Distance.COSINE,
    )
)
qdrant.upsert(collection_name="snippets", points=points)

