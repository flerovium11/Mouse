from pydantic import BaseModel, Field
from typing import Optional, List
from enum import Enum
import uuid


# --- Component Schemas ---

class PageMetadata(BaseModel):
    url: str
    title: str
    description: Optional[str] = None
    domain: str


class PageChunk(BaseModel):
    id: str
    content: str


class PageElement(BaseModel):
    tag: str
    type: Optional[str] = None
    label: Optional[str] = None
    value: Optional[str] = None
    cursorPosition: Optional[int] = None
    textContent: Optional[str] = None
    placeholder: Optional[str] = None
    nameAttr: Optional[str] = None
    ariaLabel: Optional[str] = None
    surroundings: Optional[str] = None


class ActionType(str, Enum):
    change = "change"
    click = "click"
    navigation = "navigation"
    other = "other"


class DOMAction(BaseModel):
    id: str  # uuid
    timestamp: int
    tabId: Optional[int] = None
    frameId: Optional[int] = None
    pageMetadata: PageMetadata
    element: Optional[PageElement] = None
    type: ActionType
    lastUrl: Optional[str] = None


class SuggestionType(str, Enum):
    completion = "completion"
    correction = "correction"
    enhancement = "enhancement"


class Suggestion(BaseModel):
    text: str
    confidence: float = Field(ge=0, le=1)
    type: SuggestionType


# --- Request Bodies ---

class DumpRequest(BaseModel):
    pageMetadata: PageMetadata
    chunks: List[PageChunk]


class GenRequest(BaseModel):
    pageMetadata: PageMetadata
    chunks: List[PageChunk]
    element: PageElement
    recentActions: List[DOMAction]


# --- Response Bodies ---

class RegisterResponse(BaseModel):
    uuid: str


class GenResponse(BaseModel):
    suggestions: List[Suggestion]
