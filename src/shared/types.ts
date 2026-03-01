// Types used across the project

export type PageMetadata = {
  url: string;
  title: string;
  description?: string;
  domain: string;
};

export type PageElement = {
  tag: string; // input, textarea, button
  type?: string; // text, submit, checkbox
  label?: string; // associated label text
  value?: string; // current value for inputs
  cursorPosition?: number; // for text inputs
  textContent?: string; // for non-input elements
  placeholder?: string;
  nameAttr?: string;
  ariaLabel?: string;
  surroundings?: string; // text content around the focused element, for additional context
};

/**
 * Page context sent from content script to background
 * when page loads and when navigation occurs
 *
 */
export type PageContext = {
  timestamp: number;
  pageMetadata: PageMetadata;
  tabId?: number;
  frameId?: number;

  /** Meaningful page content extracted from DOM */
  content: string;
};

/**
 * Sent from content script to background on completion request
 * Includes info about the field user is typing in and surroundings
 */
export type CompletionContext = {
  timestamp: number;
  pageMetadata: PageMetadata;
  tabId?: number;
  frameId?: number;
  element: PageElement;
  recentActions?: DOMAction[];
};

export type DOMAction = {
  id: string;
  timestamp: number;
  tabId?: number;
  frameId?: number;
  pageMetadata: PageMetadata;
  element?: PageElement;
  type: "change" | "click" | "navigation" | "other";
  lastUrl?: string; // for navigation events
};

export type Suggestion = {
  text: string;
  confidence: number;
  type: "completion" | "correction" | "enhancement";
};

export enum MessageType {
  DOM_ACTION = "DOM_ACTION",
  REQUEST_COMPLETION = "REQUEST_COMPLETION",
  COMPLETION_RESULT = "COMPLETION_RESULT",
  PAGE_CONTEXT = "PAGE_CONTEXT",
}

export type DOMActionMessage = {
  type: MessageType.DOM_ACTION;
  action: DOMAction;
};

export type RequestCompletionMessage = {
  type: MessageType.REQUEST_COMPLETION;
  completionContext: CompletionContext;
};

export type CompletionResultMessage = {
  type: MessageType.COMPLETION_RESULT;
  error?: string;
  suggestions: Suggestion[];
};

export type PageContextMessage = {
  type: MessageType.PAGE_CONTEXT;
  pageContext: PageContext;
};

export type Message =
  | DOMActionMessage
  | RequestCompletionMessage
  | CompletionResultMessage
  | PageContextMessage;
