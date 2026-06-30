import { GoogleGenAI } from '@google/genai';

export function getApiKey(): string {
  // 1. Process environment (server-side Node)
  if (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) {
    return process.env.GEMINI_API_KEY;
  }

  // 2. LocalStorage (client-side browser)
  if (typeof localStorage !== 'undefined' && localStorage && typeof localStorage.getItem === 'function') {
    const localKey = localStorage.getItem('GEMINI_API_KEY');
    if (localKey) return localKey;
  }
  
  // 3. Vite environment
  // @ts-ignore
  const viteKey = typeof import.meta !== 'undefined' && import.meta.env?.VITE_GEMINI_API_KEY;
  if (viteKey) return viteKey;

  // @ts-ignore
  const envKey = typeof import.meta !== 'undefined' && import.meta.env?.GEMINI_API_KEY;
  if (envKey) return envKey;

  // 4. Window global
  if (typeof window !== 'undefined') {
    const windowKey = (window as any).GEMINI_API_KEY;
    if (windowKey) return windowKey;
  }

  return '';
}

export function saveApiKey(key: string) {
  if (typeof localStorage !== 'undefined' && localStorage && typeof localStorage.setItem === 'function') {
    localStorage.setItem('GEMINI_API_KEY', key);
  }
}

export function getAiProvider(): 'gemini' | 'ollama' {
  if (typeof process !== 'undefined' && process.env?.AI_PROVIDER) {
    return (process.env.AI_PROVIDER as any) === 'ollama' ? 'ollama' : 'gemini';
  }
  if (typeof localStorage !== 'undefined' && localStorage && typeof localStorage.getItem === 'function') {
    return (localStorage.getItem('AI_PROVIDER') as any) || 'gemini';
  }
  return 'gemini';
}

export function getOllamaUrl(): string {
  if (typeof process !== 'undefined' && process.env?.OLLAMA_URL) {
    return process.env.OLLAMA_URL;
  }
  if (typeof localStorage !== 'undefined' && localStorage && typeof localStorage.getItem === 'function') {
    return localStorage.getItem('OLLAMA_URL') || 'http://localhost:11434';
  }
  return 'http://localhost:11434';
}

export function getOllamaModel(): string {
  if (typeof process !== 'undefined' && process.env?.OLLAMA_MODEL) {
    return process.env.OLLAMA_MODEL;
  }
  if (typeof localStorage !== 'undefined' && localStorage && typeof localStorage.getItem === 'function') {
    return localStorage.getItem('OLLAMA_MODEL') || 'llama3';
  }
  return 'llama3';
}

export function saveOllamaConfigs(provider: 'gemini' | 'ollama', url: string, model: string) {
  if (typeof localStorage !== 'undefined' && localStorage && typeof localStorage.setItem === 'function') {
    localStorage.setItem('AI_PROVIDER', provider);
    localStorage.setItem('OLLAMA_URL', url);
    localStorage.setItem('OLLAMA_MODEL', model);
  }
}

let cachedKey = '';
let cachedClient: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI | null {
  const key = getApiKey();
  if (!key) return null;
  if (key !== cachedKey || !cachedClient) {
    cachedKey = key;
    // Note: GoogleGenAI client expects apiKey to be passed
    cachedClient = new GoogleGenAI({ apiKey: key });
  }
  return cachedClient;
}

export interface GeneratedPlan {
  goal: string;
  subtasks: string[];
  estimated_hours: number;
  difficulty: number; // 1 to 10
  impact: number; // 1 to 10
  hasDeadline: boolean;
  deadlineDate?: string;
  deadlineHours?: number;
  takesMoreThanOneDay: boolean;
  timelinePhases: {
    phaseName: string;
    title: string;
    description: string;
    status: 'current' | 'upcoming' | 'locked';
  }[];
}

export interface TriagePlan {
  must_do: string[];
  skip: string[];
  justification: string;
}

export interface TrimmedScopePlan {
  subtasks: string[];
  justification: string;
}

/**
 * Helper to clean Markdown wrapper JSON block code elements from local LLMs.
 */
function cleanAndParseJson(content: string): any {
  let cleanJson = content.trim();
  if (cleanJson.startsWith('```')) {
    cleanJson = cleanJson.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
  }
  return JSON.parse(cleanJson);
}

/**
 * Generate a structured plan for a user's goal.
 */
export async function generateTaskPlan(prompt: string, currentDateStr: string = new Date().toISOString()): Promise<GeneratedPlan> {
  if (getAiProvider() === 'ollama') {
    const url = getOllamaUrl();
    const model = getOllamaModel();
    const systemInstruction = `You are Task Jerker AI Task Brain.
Decompose the goal into subtasks (3 to 6 tasks), estimate the effort required in hours, estimate the difficulty (1 to 10), and estimate the impact (1 to 10).

Identify if a date, deadline, or duration constraint is mentioned in the user's prompt (e.g. "by Friday", "in 3 days", "on June 28th", "deadline is 2026-06-27").
If a date or deadline is mentioned:
1. Set "hasDeadline" to true.
2. Parse the target date and set "deadlineDate" (format: YYYY-MM-DD).
3. Calculate the number of hours from the current time (${currentDateStr}) to the target deadline date, and set "deadlineHours".
4. Determine if the task is complex or if the duration to the deadline spans more than one day. Set "takesMoreThanOneDay" to true or false.
5. Plan the subtasks accordingly. If "takesMoreThanOneDay" is true, distribute the subtasks across multiple days in "timelinePhases".
   For "timelinePhases", generate a list of phases. Each phase represents a group of subtasks/milestones for a day or phase (e.g., "Day 1: Initial Setup", "Day 2: Implementation", etc.). Each phase must have:
   - "phaseName" (e.g. "Day 1", "Day 2", etc.)
   - "title" (a summary of the day's/phase's focus)
   - "description" (a detailed description of what should be done)
   - "status" (set the first phase to "current", and subsequent phases to "upcoming" or "locked")
If no deadline is mentioned:
1. Set "hasDeadline" to false.
2. Set "takesMoreThanOneDay" based on whether estimated_hours > 8 or if the task is complex.
3. Generate standard timeline phases (e.g., "Phase 1: Research", "Phase 2: Development", "Phase 3: Testing").

Output ONLY valid JSON matching this schema:
{
  "goal": "A short capitalized title for the goal",
  "subtasks": ["subtask1", "subtask2", ...],
  "estimated_hours": number,
  "difficulty": number,
  "impact": number,
  "hasDeadline": boolean,
  "deadlineDate": "YYYY-MM-DD or empty string",
  "deadlineHours": number,
  "takesMoreThanOneDay": boolean,
  "timelinePhases": [
    {
      "phaseName": "Day 1",
      "title": "title",
      "description": "desc",
      "status": "current"
    }
  ]
}`;

    const res = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: `Please break down the following goal/task into a structured plan: "${prompt}". The current date and time is: ${currentDateStr}.` }
        ],
        stream: false,
        format: 'json'
      })
    });

    if (!res.ok) {
      throw new Error(`Ollama request failed: ${res.statusText}`);
    }

    const data = await res.json();
    const content = data.message?.content || '';
    return cleanAndParseJson(content) as GeneratedPlan;
  }

  const client = getGeminiClient();
  if (!client) {
    throw new Error('Gemini API Key is missing. Please set it in Settings.');
  }

  const response = await client.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Please break down the following goal/task into a structured plan: "${prompt}".
The current date and time is: ${currentDateStr}.`,
    config: {
      systemInstruction: `You are Task Jerker AI Task Brain.
Decompose the goal into subtasks (3 to 6 tasks), estimate the effort required in hours, estimate the difficulty (1 to 10), and estimate the impact (1 to 10).

Identify if a date, deadline, or duration constraint is mentioned in the user's prompt (e.g. "by Friday", "in 3 days", "on June 28th", "deadline is 2026-06-27").
If a date or deadline is mentioned:
1. Set "hasDeadline" to true.
2. Parse the target date and set "deadlineDate" (format: YYYY-MM-DD).
3. Calculate the number of hours from the current time (${currentDateStr}) to the target deadline date, and set "deadlineHours".
4. Determine if the task is complex or if the duration to the deadline spans more than one day. Set "takesMoreThanOneDay" to true or false.
5. Plan the subtasks accordingly. If "takesMoreThanOneDay" is true, distribute the subtasks across multiple days in "timelinePhases".
   For "timelinePhases", generate a list of phases. Each phase represents a group of subtasks/milestones for a day or phase (e.g., "Day 1: Initial Setup", "Day 2: Implementation", etc.). Each phase must have:
   - "phaseName" (e.g. "Day 1", "Day 2", etc.)
   - "title" (a summary of the day's/phase's focus)
   - "description" (a detailed description of what should be done)
   - "status" (set the first phase to "current", and subsequent phases to "upcoming" or "locked")
If no deadline is mentioned:
1. Set "hasDeadline" to false.
2. Set "takesMoreThanOneDay" based on whether estimated_hours > 8 or if the task is complex.
3. Generate standard timeline phases (e.g., "Phase 1: Research", "Phase 2: Development", "Phase 3: Testing").

Output ONLY valid JSON matching the specified schema.`,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          goal: { type: 'STRING', description: 'A short capitalized title for the goal' },
          subtasks: {
            type: 'ARRAY',
            items: { type: 'STRING' },
            description: 'List of specific actionable subtasks to accomplish the goal'
          },
          estimated_hours: { type: 'INTEGER', description: 'Total estimated hours to complete' },
          difficulty: { type: 'INTEGER', description: 'Difficulty rating from 1 (easy) to 10 (hard)' },
          impact: { type: 'INTEGER', description: 'Impact rating from 1 (low) to 10 (critical)' },
          hasDeadline: { type: 'BOOLEAN', description: 'Whether a deadline is mentioned' },
          deadlineDate: { type: 'STRING', description: 'The deadline date in YYYY-MM-DD format if mentioned' },
          deadlineHours: { type: 'INTEGER', description: 'Hours from current time to the deadline' },
          takesMoreThanOneDay: { type: 'BOOLEAN', description: 'Whether the task spans more than one day' },
          timelinePhases: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                phaseName: { type: 'STRING', description: 'e.g. Day 1, Day 2, Phase 1' },
                title: { type: 'STRING', description: 'Short title of the phase' },
                description: { type: 'STRING', description: 'Description of what to do in this phase' },
                status: { type: 'STRING', enum: ['current', 'upcoming', 'locked'] }
              },
              required: ['phaseName', 'title', 'description', 'status']
            }
          }
        },
        required: ['goal', 'subtasks', 'estimated_hours', 'difficulty', 'impact', 'hasDeadline', 'takesMoreThanOneDay', 'timelinePhases']
      }
    }
  });

  if (!response.text) {
    throw new Error('Failed to generate response from Gemini.');
  }

  return JSON.parse(response.text) as GeneratedPlan;
}

/**
 * Triage tasks for Panic Mode based on remaining time.
 */
export async function generatePanicTriage(
  taskTitle: string,
  subtasks: string[],
  hoursLeft: number
): Promise<TriagePlan> {
  if (getAiProvider() === 'ollama') {
    const url = getOllamaUrl();
    const model = getOllamaModel();
    const res = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You are the Task Jerker Panic Mode Agent. Triage the given subtasks into "must_do" (essential for MVP/survival/deployment) and "skip" (nice-to-have, documentation, cleanups, styles) based on the remaining hours constraint. Output ONLY valid JSON matching this schema:\n{\n  "must_do": ["task1", "task2"],\n  "skip": ["task3"],\n  "justification": "reason"\n}' },
          { role: 'user', content: `Goal/Task: "${taskTitle}"\nSubtasks: ${JSON.stringify(subtasks)}\nTime Remaining: ${hoursLeft} hours` }
        ],
        stream: false,
        format: 'json'
      })
    });
    if (!res.ok) throw new Error(`Ollama request failed: ${res.statusText}`);
    const data = await res.json();
    return cleanAndParseJson(data.message?.content || '{}') as TriagePlan;
  }

  const client = getGeminiClient();
  if (!client) {
    throw new Error('Gemini API Key is missing. Please set it in Settings.');
  }

  const response = await client.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Goal/Task: "${taskTitle}"\nSubtasks: ${JSON.stringify(subtasks)}\nTime Remaining: ${hoursLeft} hours`,
    config: {
      systemInstruction: 'You are the Task Jerker Panic Mode Agent. Triage the given subtasks into "must_do" (essential for MVP/survival/deployment) and "skip" (nice-to-have, documentation, cleanups, styles) based on the remaining hours constraint. Output ONLY valid JSON matching the specified schema.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          must_do: {
            type: 'ARRAY',
            items: { type: 'STRING' },
            description: 'Critical path subtasks that MUST be done'
          },
          skip: {
            type: 'ARRAY',
            items: { type: 'STRING' },
            description: 'Non-critical subtasks that should be skipped or deferred'
          },
          justification: {
            type: 'STRING',
            description: 'Short reason explaining why certain tasks were cut'
          }
        },
        required: ['must_do', 'skip', 'justification']
      }
    }
  });

  if (!response.text) {
    throw new Error('Failed to generate response from Gemini.');
  }

  return JSON.parse(response.text) as TriagePlan;
}

/**
 * Trim the scope of a task plan by 30%.
 */
export async function generateScopeReduction(
  taskTitle: string,
  subtasks: string[]
): Promise<TrimmedScopePlan> {
  if (getAiProvider() === 'ollama') {
    const url = getOllamaUrl();
    const model = getOllamaModel();
    const res = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You are the Task Jerker Anti-Procrastination Coach. Trim the scope of the subtasks by roughly 30% to salvage a slipping deadline, keeping only the bare minimum core value. Output ONLY valid JSON matching this schema:\n{\n  "subtasks": ["trimmed_task1"],\n  "justification": "reason"\n}' },
          { role: 'user', content: `Task: "${taskTitle}"\nCurrent Subtasks: ${JSON.stringify(subtasks)}` }
        ],
        stream: false,
        format: 'json'
      })
    });
    if (!res.ok) throw new Error(`Ollama request failed: ${res.statusText}`);
    const data = await res.json();
    return cleanAndParseJson(data.message?.content || '{}') as TrimmedScopePlan;
  }

  const client = getGeminiClient();
  if (!client) {
    throw new Error('Gemini API Key is missing. Please set it in Settings.');
  }

  const response = await client.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Task: "${taskTitle}"\nCurrent Subtasks: ${JSON.stringify(subtasks)}`,
    config: {
      systemInstruction: 'You are the Task Jerker Anti-Procrastination Coach. Trim the scope of the subtasks by roughly 30% to salvage a slipping deadline, keeping only the bare minimum core value. Output ONLY valid JSON matching this schema.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          subtasks: {
            type: 'ARRAY',
            items: { type: 'STRING' },
            description: 'Reduced/simplified list of subtasks'
          },
          justification: {
            type: 'STRING',
            description: 'Encouraging reason explaining the scope trim recommendation'
          }
        },
        required: ['subtasks', 'justification']
      }
    }
  });

  if (!response.text) {
    throw new Error('Failed to generate response from Gemini.');
  }

  return JSON.parse(response.text) as TrimmedScopePlan;
}

/**
 * Voice Assistant helper for talking to user.
 */
export async function getVoicePlanningResponse(userSpeechInput: string): Promise<string> {
  if (getAiProvider() === 'ollama') {
    const url = getOllamaUrl();
    const model = getOllamaModel();
    const res = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You are the voice assistant for Task Jerker, a distraction-free productivity dashboard. Respond to the user request in a single, short, concise, highly motivating sentence (maximum 25 words). Keep it verbal and spoken-friendly.' },
          { role: 'user', content: userSpeechInput }
        ],
        stream: false
      })
    });
    if (!res.ok) throw new Error(`Ollama request failed: ${res.statusText}`);
    const data = await res.json();
    return data.message?.content || 'Understood, let us keep pushing toward the deadline.';
  }

  const client = getGeminiClient();
  if (!client) {
    return 'Please set your Gemini API key in settings first.';
  }

  const response = await client.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: userSpeechInput,
    config: {
      systemInstruction: 'You are the voice assistant for Task Jerker, a distraction-free productivity dashboard. Respond to the user request in a single, short, concise, highly motivating sentence (maximum 25 words). Keep it verbal and spoken-friendly.'
    }
  });

  return response.text || 'Understood, let us keep pushing toward the deadline.';
}

export interface ParsedVoiceCommand {
  action: 'CREATE_TASK' | 'NAVIGATE' | 'INTELLIGENCE_PLAN' | 'GENERAL_CHAT';
  taskDetails: {
    title: string;
    hours: number;
    status: 'critical' | 'normal' | 'deferred';
  } | null;
  screen: 'dashboard' | 'intelligence' | 'architect' | 'focus' | 'analytics' | 'habits' | 'settings' | null;
  planPrompt: string | null;
  spokenResponse: string;
}

/**
 * Transcribe raw base64 audio data using Gemini multimodal capabilities.
 */
export async function transcribeAudio(base64Data: string, mimeType: string): Promise<string> {
  if (getAiProvider() === 'ollama') {
    throw new Error('Ollama does not support audio transcription natively. Fallback to Web Speech API.');
  }

  const client = getGeminiClient();
  if (!client) {
    throw new Error('Gemini API Key is missing. Please set it in Settings.');
  }

  const response = await client.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      {
        inlineData: {
          mimeType,
          data: base64Data
        }
      },
      {
        text: 'Transcribe this voice note precisely. Do not add any preamble, conversational filler, or commentary. Just return the text transcript.'
      }
    ]
  });

  return response.text?.trim() || '';
}

/**
 * Convert text into speech using Gemini TTS responseModalities: ["AUDIO"].
 */
export async function generateSpeech(text: string): Promise<{ base64Data: string; mimeType: string }> {
  if (getAiProvider() === 'ollama') {
    throw new Error('Ollama does not support TTS natively. Fallback to Web Speech API.');
  }

  const client = getGeminiClient();
  if (!client) {
    throw new Error('Gemini API Key is missing. Please set it in Settings.');
  }

  const response = await client.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: text,
    config: {
      // @ts-ignore
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: 'Puck' // Available prebuilt voices: Puck, Charon, Kore, Fenrir, Aoede
          }
        }
      }
    }
  });

  const part = response.candidates?.[0]?.content?.parts?.[0];
  if (part && 'inlineData' in part && part.inlineData?.data) {
    return {
      base64Data: part.inlineData.data,
      mimeType: part.inlineData.mimeType || 'audio/wav'
    };
  }

  throw new Error('Failed to generate voice response from Gemini TTS.');
}

/**
 * Parse a user spoken command into structured actions.
 */
export async function parseVoiceCommand(commandText: string, currentTasks: any[]): Promise<ParsedVoiceCommand> {
  if (getAiProvider() === 'ollama') {
    const url = getOllamaUrl();
    const model = getOllamaModel();
    const res = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: `You are the voice control processor for Task Jerker.
Analyze the user's spoken command and determine the appropriate action.
You must classify the command into one of the following actions:
1. CREATE_TASK: User wants to add a new task, goal, or deadline. Look for titles and durations (e.g. "due in 5 hours", "estimated 3 hours"). Default duration is 3 hours. Status can be "critical" (if high priority or urgent), "deferred", or "normal".
2. NAVIGATE: User wants to change screens. Map their request to a valid screen: "dashboard", "intelligence", "architect", "focus", "analytics", "habits", "settings".
3. INTELLIGENCE_PLAN: User wants to generate a complete multi-step plan for a complex goal (e.g. "plan my compiler project"). Set planPrompt to the goal.
4. GENERAL_CHAT: User is asking a question, greeting, or wants motivational advice (e.g. "what are my deadlines?", "tell me a joke", "how am I doing?").

For all actions, generate a friendly, concise 'spokenResponse' (maximum 20 words) that the system will speak back to the user.
Output ONLY a valid JSON object matching this schema:
{
  "action": "CREATE_TASK" | "NAVIGATE" | "INTELLIGENCE_PLAN" | "GENERAL_CHAT",
  "taskDetails": { "title": "string", "hours": number, "status": "critical" | "normal" | "deferred" } | null,
  "screen": "dashboard" | "intelligence" | "architect" | "focus" | "analytics" | "habits" | "settings" | null,
  "planPrompt": "string" | null,
  "spokenResponse": "string"
}` },
          { role: 'user', content: `User command: "${commandText}"\nCurrent tasks in system: ${JSON.stringify(currentTasks.map(t => ({ id: t.id, title: t.title, status: t.status })))}` }
        ],
        stream: false,
        format: 'json'
      })
    });
    if (!res.ok) throw new Error(`Ollama request failed: ${res.statusText}`);
    const data = await res.json();
    const content = data.message?.content || '{}';
    const parsed = cleanAndParseJson(content);
    return {
      action: parsed.action || 'GENERAL_CHAT',
      taskDetails: parsed.taskDetails || null,
      screen: parsed.screen || null,
      planPrompt: parsed.planPrompt || null,
      spokenResponse: parsed.spokenResponse || 'Understood, processing completed.'
    };
  }

  const client = getGeminiClient();
  if (!client) {
    throw new Error('Gemini API Key is missing. Please set it in Settings.');
  }

  const response = await client.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `User command: "${commandText}"\nCurrent tasks in system: ${JSON.stringify(currentTasks.map(t => ({ id: t.id, title: t.title, status: t.status })))}`,
    config: {
      systemInstruction: `You are the voice control processor for Task Jerker.
Analyze the user's spoken command and determine the appropriate action.
You must classify the command into one of the following actions:
1. CREATE_TASK: User wants to add a new task, goal, or deadline. Look for titles and durations (e.g. "due in 5 hours", "estimated 3 hours"). Default duration is 3 hours. Status can be "critical" (if high priority or urgent), "deferred", or "normal".
2. NAVIGATE: User wants to change screens. Map their request to a valid screen: "dashboard", "intelligence", "architect", "focus", "analytics", "habits", "settings".
3. INTELLIGENCE_PLAN: User wants to generate a complete multi-step plan for a complex goal (e.g. "plan my compiler project"). Set planPrompt to the goal.
4. GENERAL_CHAT: User is asking a question, greeting, or wants motivational advice (e.g. "what are my deadlines?", "tell me a joke", "how am I doing?").

For all actions, generate a friendly, concise 'spokenResponse' (maximum 20 words) that the system will speak back to the user.
Output ONLY a valid JSON object matching this schema:
{
  "action": "CREATE_TASK" | "NAVIGATE" | "INTELLIGENCE_PLAN" | "GENERAL_CHAT",
  "taskDetails": { "title": "string", "hours": number, "status": "critical" | "normal" | "deferred" } | null,
  "screen": "dashboard" | "intelligence" | "architect" | "focus" | "analytics" | "habits" | "settings" | null,
  "planPrompt": "string" | null,
  "spokenResponse": "string"
}`,
      responseMimeType: 'application/json'
    }
  });

  const parsed = JSON.parse(response.text || '{}');
  return {
    action: parsed.action || 'GENERAL_CHAT',
    taskDetails: parsed.taskDetails || null,
    screen: parsed.screen || null,
    planPrompt: parsed.planPrompt || null,
    spokenResponse: parsed.spokenResponse || 'Understood, processing completed.'
  };
}

/**
 * Utility to play base64-encoded audio in the browser.
 */
export function playAudio(base64Data: string, mimeType: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const audioUrl = `data:${mimeType};base64,${base64Data}`;
      const audio = new Audio(audioUrl);
      audio.onended = () => resolve();
      audio.onerror = (e) => reject(e);
      audio.play().catch(reject);
    } catch (err) {
      reject(err);
    }
  });
}
