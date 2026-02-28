import {FunctionTool, LlmAgent} from '@google/adk';
import {z} from 'zod';
import 'dotenv/config';

/* Mock tool implementation */
const addSnippet = new FunctionTool({
  name: 'add_snippet',
  description: 'Saves a piece of information for later retrieval.',
  parameters: z.object({
    snippet: z.string().describe("The piece of information to save."),
  }),
  execute: ({snippet}) => {
    console.log(`Saving snippet: ${snippet}`);
    return {status: 'success', report: `The snippet "${snippet}" has been saved.`};
  },
});

export const rootAgent = new LlmAgent({
  name: 'hello_time_agent',
  model: 'gemini-2.5-flash-lite',
  description: 'An agent that extracts meaningful content from website text and saves it for later use.',
  instruction: `ROLE: Intelligent Content Extraction Agent

TASK:
Analyze the website text provided in the next prompt and extract only meaningful, retainable content that a user would want to remember or act on.

FOCUS ON:
- Tasks
- Deadlines
- Instructions
- Requirements
- Important factual information

IGNORE:
- Navigation menus
- Headers and footers
- Layout elements
- System messages
- IDs, tags, scripts, or structural/technical metadata

OUTPUT REQUIREMENTS:
- Each extracted item must be 1-6 sentences and similar information should be grouped together.
- Each item must represent a single, self-contained idea or actionable piece of information.
- Do not include formatting artifacts or structural references from the website.
- Do not include IDs, tags, or metadata.

TOOL USAGE:
- For each extracted piece of meaningful content, call the \`add_snippet\` tool.
- Pass the extracted text as the value of the \`snippet\` parameter.
- Make exactly one tool call per snippet.
- Do not combine multiple ideas into a single tool call.

The website text will be provided in the next prompt.`,
  tools: [addSnippet],
});

