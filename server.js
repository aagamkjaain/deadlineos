// server.ts
import "dotenv/config";
import express from "express";
import bodyParser from "body-parser";
import path from "path";
import { GoogleGenAI as GoogleGenAI2 } from "@google/genai";

// src/services/supabase.ts
import { createClient } from "@supabase/supabase-js";
var supabaseUrl = typeof process !== "undefined" && process.env?.SUPABASE_URL || // @ts-ignore
import.meta.env?.VITE_SUPABASE_URL || // @ts-ignore
import.meta.env?.SUPABASE_URL || (typeof localStorage !== "undefined" && localStorage && typeof localStorage.getItem === "function" ? localStorage.getItem("SUPABASE_URL") : null) || "";
var supabaseKey = typeof process !== "undefined" && process.env?.SUPABASE_KEY || // @ts-ignore
import.meta.env?.VITE_SUPABASE_KEY || // @ts-ignore
import.meta.env?.SUPABASE_KEY || (typeof localStorage !== "undefined" && localStorage && typeof localStorage.getItem === "function" ? localStorage.getItem("SUPABASE_KEY") : null) || "";
var supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseKey || "placeholder"
);
async function createGoal(userId, title, project, estimatedHours, difficulty, impact, subtasks, customCountdownSeconds) {
  const taskSubtasks = subtasks.map((text) => ({ text, completed: false }));
  const { data: newTask, error } = await supabase.from("tasks").insert({
    user_id: userId,
    title,
    project: project || "Default Project",
    status: impact >= 8 ? "critical" : "normal",
    countdown_seconds: customCountdownSeconds !== void 0 ? customCountdownSeconds : estimatedHours * 3600,
    difficulty,
    impact,
    postponed_count: 0,
    progress: 0,
    subtasks: taskSubtasks
  }).select().single();
  if (error) throw error;
  return newTask;
}
async function getTasksByUserId(userId) {
  const { data: tasks, error } = await supabase.from("tasks").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  if (error) throw error;
  return tasks || [];
}
async function updateSubtaskStatus(taskId, subtaskIndex, completed) {
  const { data: currentTask, error: fetchErr } = await supabase.from("tasks").select("*").eq("id", taskId).single();
  if (fetchErr) throw fetchErr;
  const task = currentTask;
  if (!task.subtasks || task.subtasks.length === 0) {
    throw new Error("Task has no subtasks.");
  }
  const updatedSubtasks = [...task.subtasks];
  if (subtaskIndex >= 0 && subtaskIndex < updatedSubtasks.length) {
    updatedSubtasks[subtaskIndex] = {
      ...updatedSubtasks[subtaskIndex],
      completed
    };
  }
  const completedCount = updatedSubtasks.filter((st) => st.completed).length;
  const progress = Math.round(completedCount / updatedSubtasks.length * 100);
  const { data: updatedTask, error: updateErr } = await supabase.from("tasks").update({
    subtasks: updatedSubtasks,
    progress
  }).eq("id", taskId).select().single();
  if (updateErr) throw updateErr;
  return updatedTask;
}
async function updateTaskSubtasks(taskId, subtasks) {
  const completedCount = subtasks.filter((st) => st.completed).length;
  const progress = subtasks.length > 0 ? Math.round(completedCount / subtasks.length * 100) : 0;
  const { data: updatedTask, error } = await supabase.from("tasks").update({ subtasks, progress }).eq("id", taskId).select().single();
  if (error) throw error;
  return updatedTask;
}
async function postponeTask(taskId) {
  const { data: currentTask, error: fetchErr } = await supabase.from("tasks").select("*").eq("id", taskId).single();
  if (fetchErr) throw fetchErr;
  const task = currentTask;
  const { data: updatedTask, error: updateErr } = await supabase.from("tasks").update({
    postponed_count: task.postponed_count + 1,
    countdown_seconds: task.countdown_seconds + 3600
    // Delay by 1 hour
  }).eq("id", taskId).select().single();
  if (updateErr) throw updateErr;
  return updatedTask;
}
async function saveMessageLog(userId, direction, messageText) {
  const { error } = await supabase.from("messages").insert({
    user_id: userId,
    direction,
    message: messageText
  });
  if (error) console.error("Failed to log message to DB:", error);
}
async function saveRiskRecord(userId, riskScore, riskLevel, reason) {
  const { error } = await supabase.from("risk_analysis").insert({
    user_id: userId,
    risk_score: riskScore,
    risk_level: riskLevel,
    reason
  });
  if (error) console.error("Failed to log risk analysis:", error);
}
async function getLatestRisk(userId) {
  const { data, error } = await supabase.from("risk_analysis").select("*").eq("user_id", userId).order("timestamp", { ascending: false }).limit(1);
  if (error) throw error;
  return data && data.length > 0 ? data[0] : null;
}

// src/services/gemini.ts
import { GoogleGenAI } from "@google/genai";
function getApiKey() {
  if (typeof process !== "undefined" && process.env?.GEMINI_API_KEY) {
    return process.env.GEMINI_API_KEY;
  }
  if (typeof localStorage !== "undefined" && localStorage && typeof localStorage.getItem === "function") {
    const localKey = localStorage.getItem("GEMINI_API_KEY");
    if (localKey) return localKey;
  }
  const viteKey = typeof import.meta !== "undefined" && import.meta.env?.VITE_GEMINI_API_KEY;
  if (viteKey) return viteKey;
  const envKey = typeof import.meta !== "undefined" && import.meta.env?.GEMINI_API_KEY;
  if (envKey) return envKey;
  if (typeof window !== "undefined") {
    const windowKey = window.GEMINI_API_KEY;
    if (windowKey) return windowKey;
  }
  return "";
}
function getAiProvider() {
  if (typeof process !== "undefined" && process.env?.AI_PROVIDER) {
    return process.env.AI_PROVIDER === "ollama" ? "ollama" : "gemini";
  }
  if (typeof localStorage !== "undefined" && localStorage && typeof localStorage.getItem === "function") {
    return localStorage.getItem("AI_PROVIDER") || "gemini";
  }
  return "gemini";
}
function getOllamaUrl() {
  if (typeof process !== "undefined" && process.env?.OLLAMA_URL) {
    return process.env.OLLAMA_URL;
  }
  if (typeof localStorage !== "undefined" && localStorage && typeof localStorage.getItem === "function") {
    return localStorage.getItem("OLLAMA_URL") || "http://localhost:11434";
  }
  return "http://localhost:11434";
}
function getOllamaModel() {
  if (typeof process !== "undefined" && process.env?.OLLAMA_MODEL) {
    return process.env.OLLAMA_MODEL;
  }
  if (typeof localStorage !== "undefined" && localStorage && typeof localStorage.getItem === "function") {
    return localStorage.getItem("OLLAMA_MODEL") || "llama3";
  }
  return "llama3";
}
var cachedKey = "";
var cachedClient = null;
function getGeminiClient() {
  const key = getApiKey();
  if (!key) return null;
  if (key !== cachedKey || !cachedClient) {
    cachedKey = key;
    cachedClient = new GoogleGenAI({ apiKey: key });
  }
  return cachedClient;
}
function cleanAndParseJson(content) {
  let cleanJson = content.trim();
  if (cleanJson.startsWith("```")) {
    cleanJson = cleanJson.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
  }
  return JSON.parse(cleanJson);
}
async function generateTaskPlan(prompt, currentDateStr = (/* @__PURE__ */ new Date()).toISOString()) {
  if (getAiProvider() === "ollama") {
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
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: `Please break down the following goal/task into a structured plan: "${prompt}". The current date and time is: ${currentDateStr}.` }
        ],
        stream: false,
        format: "json"
      })
    });
    if (!res.ok) {
      throw new Error(`Ollama request failed: ${res.statusText}`);
    }
    const data = await res.json();
    const content = data.message?.content || "";
    return cleanAndParseJson(content);
  }
  const client = getGeminiClient();
  if (!client) {
    throw new Error("Gemini API Key is missing. Please set it in Settings.");
  }
  const response = await client.models.generateContent({
    model: "gemini-2.5-flash",
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
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          goal: { type: "STRING", description: "A short capitalized title for the goal" },
          subtasks: {
            type: "ARRAY",
            items: { type: "STRING" },
            description: "List of specific actionable subtasks to accomplish the goal"
          },
          estimated_hours: { type: "INTEGER", description: "Total estimated hours to complete" },
          difficulty: { type: "INTEGER", description: "Difficulty rating from 1 (easy) to 10 (hard)" },
          impact: { type: "INTEGER", description: "Impact rating from 1 (low) to 10 (critical)" },
          hasDeadline: { type: "BOOLEAN", description: "Whether a deadline is mentioned" },
          deadlineDate: { type: "STRING", description: "The deadline date in YYYY-MM-DD format if mentioned" },
          deadlineHours: { type: "INTEGER", description: "Hours from current time to the deadline" },
          takesMoreThanOneDay: { type: "BOOLEAN", description: "Whether the task spans more than one day" },
          timelinePhases: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                phaseName: { type: "STRING", description: "e.g. Day 1, Day 2, Phase 1" },
                title: { type: "STRING", description: "Short title of the phase" },
                description: { type: "STRING", description: "Description of what to do in this phase" },
                status: { type: "STRING", enum: ["current", "upcoming", "locked"] }
              },
              required: ["phaseName", "title", "description", "status"]
            }
          }
        },
        required: ["goal", "subtasks", "estimated_hours", "difficulty", "impact", "hasDeadline", "takesMoreThanOneDay", "timelinePhases"]
      }
    }
  });
  if (!response.text) {
    throw new Error("Failed to generate response from Gemini.");
  }
  return JSON.parse(response.text);
}
async function generatePanicTriage(taskTitle, subtasks, hoursLeft) {
  if (getAiProvider() === "ollama") {
    const url = getOllamaUrl();
    const model = getOllamaModel();
    const res = await fetch(`${url}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: 'You are the Task Jerker Panic Mode Agent. Triage the given subtasks into "must_do" (essential for MVP/survival/deployment) and "skip" (nice-to-have, documentation, cleanups, styles) based on the remaining hours constraint. Output ONLY valid JSON matching this schema:\n{\n  "must_do": ["task1", "task2"],\n  "skip": ["task3"],\n  "justification": "reason"\n}' },
          { role: "user", content: `Goal/Task: "${taskTitle}"
Subtasks: ${JSON.stringify(subtasks)}
Time Remaining: ${hoursLeft} hours` }
        ],
        stream: false,
        format: "json"
      })
    });
    if (!res.ok) throw new Error(`Ollama request failed: ${res.statusText}`);
    const data = await res.json();
    return cleanAndParseJson(data.message?.content || "{}");
  }
  const client = getGeminiClient();
  if (!client) {
    throw new Error("Gemini API Key is missing. Please set it in Settings.");
  }
  const response = await client.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `Goal/Task: "${taskTitle}"
Subtasks: ${JSON.stringify(subtasks)}
Time Remaining: ${hoursLeft} hours`,
    config: {
      systemInstruction: 'You are the Task Jerker Panic Mode Agent. Triage the given subtasks into "must_do" (essential for MVP/survival/deployment) and "skip" (nice-to-have, documentation, cleanups, styles) based on the remaining hours constraint. Output ONLY valid JSON matching the specified schema.',
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          must_do: {
            type: "ARRAY",
            items: { type: "STRING" },
            description: "Critical path subtasks that MUST be done"
          },
          skip: {
            type: "ARRAY",
            items: { type: "STRING" },
            description: "Non-critical subtasks that should be skipped or deferred"
          },
          justification: {
            type: "STRING",
            description: "Short reason explaining why certain tasks were cut"
          }
        },
        required: ["must_do", "skip", "justification"]
      }
    }
  });
  if (!response.text) {
    throw new Error("Failed to generate response from Gemini.");
  }
  return JSON.parse(response.text);
}
async function getVoicePlanningResponse(userSpeechInput) {
  if (getAiProvider() === "ollama") {
    const url = getOllamaUrl();
    const model = getOllamaModel();
    const res = await fetch(`${url}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "You are the voice assistant for Task Jerker, a distraction-free productivity dashboard. Respond to the user request in a single, short, concise, highly motivating sentence (maximum 25 words). Keep it verbal and spoken-friendly." },
          { role: "user", content: userSpeechInput }
        ],
        stream: false
      })
    });
    if (!res.ok) throw new Error(`Ollama request failed: ${res.statusText}`);
    const data = await res.json();
    return data.message?.content || "Understood, let us keep pushing toward the deadline.";
  }
  const client = getGeminiClient();
  if (!client) {
    return "Please set your Gemini API key in settings first.";
  }
  const response = await client.models.generateContent({
    model: "gemini-2.5-flash",
    contents: userSpeechInput,
    config: {
      systemInstruction: "You are the voice assistant for Task Jerker, a distraction-free productivity dashboard. Respond to the user request in a single, short, concise, highly motivating sentence (maximum 25 words). Keep it verbal and spoken-friendly."
    }
  });
  return response.text || "Understood, let us keep pushing toward the deadline.";
}

// server.ts
var app = express();
var PORT = process.env.PORT || 3001;
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});
async function classifyIntent(messageText) {
  const apiKey = getApiKey();
  if (!apiKey) return "GENERAL_CHAT";
  const normalized = messageText.trim().toLowerCase();
  if (normalized === "today" || normalized === "plan" || normalized === "schedule") return "GET_TODAY_PLAN";
  if (normalized === "risk" || normalized === "status") return "RISK_CHECK";
  if (normalized === "panic") return "PANIC_MODE";
  if (normalized === "reschedule") return "RESCHEDULE";
  if (normalized === "help" || normalized === "commands") return "HELP";
  if (normalized.startsWith("done ") || normalized.startsWith("completed ") || normalized === "done") return "COMPLETE_TASK";
  try {
    const ai = new GoogleGenAI2({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Message: "${messageText}"`,
      config: {
        systemInstruction: `Classify the user message into one of these intents:
- CREATE_GOAL: User wants to start a new task, study course, prepare for exams, or make a roadmap (e.g. "Need to prepare for cloud exam", "Plan a DBMS project due Friday").
- COMPLETE_TASK: User is reporting a task/subtask completion (e.g. "I finished the ER diagram", "done with section 2").
- GET_TODAY_PLAN: User is requesting what to work on today (e.g. "What's my plan today?").
- RISK_CHECK: User wants to know their status/risks (e.g. "Check my risk score", "Show deadlines risk").
- PANIC_MODE: User has an immediate emergency or submission due in hours (e.g. "deadline in 10 hours", "emergency").
- RESCHEDULE: User wants to reschedule or shift focus (e.g. "reschedule DBMS project").
- GENERAL_CHAT: Conversational chatter, questions, or fallbacks.

Output ONLY the exact intent string.`,
        temperature: 0.1
      }
    });
    return response.text?.trim() || "GENERAL_CHAT";
  } catch (e) {
    console.error("Intent classification failed:", e);
    return "GENERAL_CHAT";
  }
}
async function executeUserIntent(userId, messageText) {
  const intent = await classifyIntent(messageText);
  switch (intent) {
    case "HELP": {
      const helpMessage = `\u{1F916} *Task Jerker Commands Guide*
      
\u2022 *today* / *plan* - Get your daily briefing & active focus blocks
\u2022 *done [task name/number]* - Complete a subtask
\u2022 *risk* - Audit project schedule risks & warnings
\u2022 *panic* - Trigger emergency panic Mode triage
\u2022 *reschedule* - Optimize calendar schedules
\u2022 Or type naturally to plan a new goal (e.g. "Plan AWS exam due July 15")`;
      await saveMessageLog(userId, "outbound", helpMessage);
      return helpMessage;
    }
    case "CREATE_GOAL": {
      const apiKey = getApiKey();
      if (!apiKey) return "Configure your API key to generate plans.";
      const ai = new GoogleGenAI2({ apiKey });
      const extraction = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Parse this instruction: "${messageText}". Current Year: ${(/* @__PURE__ */ new Date()).getFullYear()}`,
        config: {
          systemInstruction: 'Extract the core Goal text and the target Deadline Date. Output ONLY valid JSON matching: { "goal": "string", "deadline": "YYYY-MM-DD or null if missing" }',
          responseMimeType: "application/json"
        }
      });
      const parsed = JSON.parse(extraction.text || "{}");
      if (!parsed.goal) {
        return "What is the goal name? Please speak or type clearly.";
      }
      if (!parsed.deadline || parsed.deadline === "null") {
        return '\u{1F4C5} When is this due? Please specify a deadline date (e.g. "Friday" or "July 10").';
      }
      const targetDate = new Date(parsed.deadline);
      const now = /* @__PURE__ */ new Date();
      const diffMs = targetDate.getTime() - now.getTime();
      const diffHours = Math.max(1, Math.round(diffMs / (3600 * 1e3)));
      if (diffHours < 0) {
        return "\u26A0\uFE0F Invalid date. The deadline date must be in the future.";
      }
      const plan = await generateTaskPlan(parsed.goal);
      const dbTask = await createGoal(
        userId,
        plan.goal,
        "WhatsApp Plan",
        plan.estimated_hours,
        plan.difficulty,
        plan.impact,
        plan.subtasks
      );
      const reply = `\u{1F3AF} *Goal Created Successfully*
      
\u2022 *Goal:* ${dbTask.title}
\u2022 *Deadline:* ${parsed.deadline}
\u2022 *Effort Est:* ${plan.estimated_hours} Hours
\u2022 *Tasks Generated:* ${dbTask.subtasks.length}
      
*Next Focus Task:*
1. ${dbTask.subtasks[0]?.text || "Get started"}`;
      await saveMessageLog(userId, "outbound", reply);
      return reply;
    }
    case "GET_TODAY_PLAN": {
      const tasks = await getTasksByUserId(userId);
      const activeTasks = tasks.filter((t) => t.progress < 100);
      if (activeTasks.length === 0) {
        const reply = '\u{1F305} No active focus tasks found for today. Type "Plan my DBMS project due Friday" to create one.';
        await saveMessageLog(userId, "outbound", reply);
        return reply;
      }
      let planReply = `\u{1F4C5} *Today's Focus Priorities*
`;
      activeTasks.forEach((t, i) => {
        const openSubtask = t.subtasks.find((st) => !st.completed);
        planReply += `
*${i + 1}. ${t.title}* (${t.progress}% complete)
\u2022 Focus task: ${openSubtask ? openSubtask.text : "Final testing"}
\u2022 Time left: ${Math.ceil(t.countdown_seconds / 3600)} hours`;
      });
      await saveMessageLog(userId, "outbound", planReply);
      return planReply;
    }
    case "COMPLETE_TASK": {
      const tasks = await getTasksByUserId(userId);
      const activeTasks = tasks.filter((t) => t.progress < 100);
      if (activeTasks.length === 0) {
        return "No active tasks found to complete.";
      }
      const targetTask = activeTasks[0];
      const subtaskIndex = targetTask.subtasks.findIndex((st) => !st.completed);
      if (subtaskIndex === -1) {
        return "All subtasks for this task are already completed.";
      }
      const updated = await updateSubtaskStatus(targetTask.id, subtaskIndex, true);
      const completedCount = updated.subtasks.filter((st) => st.completed).length;
      const progress = updated.progress;
      const missedSessionFactor = updated.postponed_count * 20;
      const timeFactor = updated.countdown_seconds / 3600;
      const riskScore = Math.max(0, Math.min(100, Math.round(100 - progress + missedSessionFactor - timeFactor)));
      const riskLevel = riskScore > 75 ? "high" : riskScore > 40 ? "medium" : "low";
      await saveRiskRecord(
        userId,
        riskScore,
        riskLevel,
        `Progress update to ${progress}% with ${updated.postponed_count} postponed checks.`
      );
      const reply = `\u2705 *Task Updated*
      
\u2022 Task: "${updated.subtasks[subtaskIndex].text}" marked complete.
\u2022 Project Progress: *${progress}%*
\u2022 System Risk Level: *${riskLevel.toUpperCase()}*`;
      await saveMessageLog(userId, "outbound", reply);
      return reply;
    }
    case "RISK_CHECK": {
      const tasks = await getTasksByUserId(userId);
      const activeTasks = tasks.filter((t) => t.progress < 100);
      if (activeTasks.length === 0) {
        return "No active projects to calculate risks for.";
      }
      const latestRisk = await getLatestRisk(userId);
      const currentRiskLevel = latestRisk ? latestRisk.risk_level.toUpperCase() : "LOW";
      const currentReason = latestRisk ? latestRisk.reason : "All schedules are on time.";
      let reply = `\u26A0\uFE0F *Task Jerker Schedule Audit*
      
\u2022 General System Risk: *${currentRiskLevel}*
\u2022 Details: ${currentReason}
      
*Active Deadlines:*`;
      activeTasks.forEach((t) => {
        const hoursLeft = Math.ceil(t.countdown_seconds / 3600);
        reply += `
\u2022 "${t.title}" -> ${hoursLeft}h remaining (${t.progress}% complete)`;
      });
      await saveMessageLog(userId, "outbound", reply);
      return reply;
    }
    case "PANIC_MODE": {
      const tasks = await getTasksByUserId(userId);
      const criticalTask = tasks.find((t) => t.status === "critical") || tasks[0];
      if (!criticalTask) {
        return "No active tasks found to rescue.";
      }
      const subtaskStrings = criticalTask.subtasks.map((st) => st.text);
      const hoursLeft = Math.ceil(criticalTask.countdown_seconds / 3600);
      const triage = await generatePanicTriage(criticalTask.title, subtaskStrings, hoursLeft);
      const triagedSubtasks = [
        ...triage.must_do.map((text) => ({ text, completed: false })),
        ...triage.skip.map((text) => ({ text, completed: true }))
        // Mark Nice-to-haves as auto-skipped/completed
      ];
      await updateTaskSubtasks(criticalTask.id, triagedSubtasks);
      const reply = `\u{1F6A8} *Emergency Panic Protocol Active*
      
*Survival Strategy:* "${triage.justification}"
      
*MUST DO CHECKLIST:*
${triage.must_do.map((t, i) => `${i + 1}. [ ] ${t}`).join("\n")}
      
*DEFERRED / SKIPPED:*
${triage.skip.map((t) => `\u2717 ${t}`).join("\n")}`;
      await saveMessageLog(userId, "outbound", reply);
      return reply;
    }
    case "RESCHEDULE": {
      const tasks = await getTasksByUserId(userId);
      const criticalTask = tasks.find((t) => t.status === "critical") || tasks[0];
      if (!criticalTask) {
        return "No active task found to reschedule.";
      }
      const updated = await postponeTask(criticalTask.id);
      const hoursLeft = Math.ceil(updated.countdown_seconds / 3600);
      const reply = `\u23F0 *Task Rescheduled*
      
\u2022 Task: "${updated.title}" shifted.
\u2022 New Deadline countdown: *${hoursLeft} Hours* remaining.
\u2022 Postponed count: *${updated.postponed_count}* times.`;
      await saveMessageLog(userId, "outbound", reply);
      return reply;
    }
    case "GENERAL_CHAT":
    default: {
      const responseText = await getVoicePlanningResponse(messageText);
      await saveMessageLog(userId, "outbound", responseText);
      return responseText;
    }
  }
}
app.get("/api/ml/productivity/:userId", async (req, res) => {
  const userId = req.params.userId;
  console.log(`[ML API] Request received for userId: "${userId}"`);
  if (!userId) {
    console.warn("[ML API] Request rejected: missing userId");
    return res.status(400).json({ error: "Missing userId parameter" });
  }
  try {
    console.log(`[ML API] Fetching tasks from Supabase for user: ${userId}`);
    const userTasks = await getTasksByUserId(userId);
    console.log(`[ML API] Supabase query complete. Found ${userTasks?.length || 0} tasks.`);
    const tasksPayload = (userTasks || []).map((t) => ({
      id: t.id,
      title: t.title,
      project: t.project,
      status: t.status,
      countdownSeconds: t.countdown_seconds,
      progress: t.progress,
      difficulty: t.difficulty,
      impact: t.impact,
      postponedCount: t.postponed_count,
      createdAt: t.created_at
    }));
    const { spawn } = await import("child_process");
    const pythonExecutable = process.platform === "win32" ? "python" : "python3";
    console.log(`[ML API] Spawning Python subprocess: "${pythonExecutable} ml_pipeline/predict.py"`);
    const pyProcess = spawn(pythonExecutable, ["ml_pipeline/predict.py"]);
    let outputData = "";
    let errorData = "";
    pyProcess.on("error", (err) => {
      console.error("[ML API] Failed to spawn Python process:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to start ML engine", details: err.message });
      }
    });
    pyProcess.stdout.on("data", (chunk) => {
      outputData += chunk.toString();
    });
    pyProcess.stderr.on("data", (chunk) => {
      errorData += chunk.toString();
    });
    pyProcess.on("close", (code) => {
      console.log(`[ML API] Python subprocess closed with exit code: ${code}`);
      if (code !== 0) {
        console.error("[ML API] Python prediction script error:", errorData);
        if (!res.headersSent) {
          res.status(500).json({ error: "ML engine error", details: errorData });
        }
        return;
      }
      try {
        console.log(`[ML API] Parsing Python stdout payload (length: ${outputData.length})`);
        const result = JSON.parse(outputData.trim());
        if (!res.headersSent) {
          res.json(result);
        }
      } catch (parseErr) {
        console.error("[ML API] Failed to parse Python model response:", outputData, parseErr);
        if (!res.headersSent) {
          res.status(500).json({ error: "Failed to parse ML response" });
        }
      }
    });
    console.log(`[ML API] Writing tasks payload to Python stdin (payload count: ${tasksPayload.length})`);
    pyProcess.stdin.write(JSON.stringify(tasksPayload));
    pyProcess.stdin.end();
  } catch (err) {
    console.error("[ML API] Fatal error in route handler:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Server prediction failure", details: err.message });
    }
  }
});
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "dist")));
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "dist", "index.html"));
  });
}
var telegramOffset = 0;
async function sendTelegramMessage(botUrl, chatId, text, options = {}) {
  try {
    await axios.post(`${botUrl}/sendMessage`, {
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      ...options
    });
  } catch (err) {
    console.error("Failed to send Telegram message:", err.response?.data || err.message);
  }
}
async function editTelegramMessage(botUrl, chatId, messageId, text, options = {}) {
  try {
    await axios.post(`${botUrl}/editMessageText`, {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "Markdown",
      ...options
    });
  } catch (err) {
    console.error("Failed to edit Telegram message:", err.response?.data || err.message);
  }
}
async function getGoogleToken(userId) {
  try {
    const { data, error } = await supabase.from("tasks").select("*").eq("user_id", userId).eq("title", "__SYSTEM_CONFIG__").eq("project", "OAuth").order("created_at", { ascending: false }).limit(1);
    if (error || !data || data.length === 0) return null;
    const subtasks = data[0].subtasks;
    if (subtasks && subtasks.length > 0) {
      const match = subtasks[0].text.match(/^provider_token:(.+)$/);
      return match ? match[1] : null;
    }
  } catch (err) {
    console.error("Error fetching Google token from DB config:", err);
  }
  return null;
}
function parsePlanFromText(text) {
  const lines = text.split("\n");
  let goal = "";
  let subtasks = [];
  let hours = 3;
  let difficulty = 5;
  let impact = 5;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.includes("Goal:")) {
      goal = line.split("Goal:")[1].replace(/\*/g, "").trim();
    }
    if (line.includes("Effort Est:")) {
      hours = parseInt(line.split("Effort Est:")[1].replace(/Hours|Hours/gi, "").trim()) || 3;
    }
    if (line.includes("Difficulty:")) {
      difficulty = parseInt(line.split("Difficulty:")[1].split("/")[0].trim()) || 5;
    }
    if (line.includes("Impact:")) {
      impact = parseInt(line.split("Impact:")[1].split("/")[0].trim()) || 5;
    }
    if (/^\d+\.\s+/.test(line)) {
      subtasks.push(line.replace(/^\d+\.\s+/, "").trim());
    }
  }
  return { goal, subtasks, hours, difficulty, impact };
}
async function handleTelegramMessage(botUrl, message) {
  const chatId = String(message.chat.id);
  const text = message.text || "";
  const trimmedText = text.trim();
  if (trimmedText.startsWith("/start")) {
    const parts = trimmedText.split(/\s+/);
    if (parts.length > 1) {
      const potentialUserId = parts[1];
      try {
        const { data: updatedUser, error } = await supabase.from("users").update({ phone_number: `telegram:${chatId}`, channel: "telegram" }).eq("id", potentialUserId).select().single();
        if (error || !updatedUser) {
          console.error("Failed to link Telegram chat ID to user:", error);
          await sendTelegramMessage(
            botUrl,
            chatId,
            `\u26A0\uFE0F *Failed to link account:* We could not find a user profile matching this ID. Please try connecting again from the dashboard settings.`
          );
        } else {
          await sendTelegramMessage(
            botUrl,
            chatId,
            `\u{1F389} *Account Connected Successfully!*

Your Telegram account has been linked to your Task Jerker account.

You can now send me goals and deadlines (e.g. "Plan AWS exam due Friday") or run commands like *today*, *risk*, *panic*, and *reschedule* directly from here!`
          );
        }
      } catch (err) {
        console.error("Error linking Telegram profile:", err);
        await sendTelegramMessage(
          botUrl,
          chatId,
          `\u26A0\uFE0F *Connection Error:* An error occurred while linking your account.`
        );
      }
      return;
    }
  }
  if (trimmedText.startsWith("/start") || trimmedText.startsWith("/help")) {
    await sendTelegramMessage(
      botUrl,
      chatId,
      `\u{1F916} *Welcome to your Task Jerker AI Assistant!*
      
Send me a goal or deadline (e.g. "I have a hackathon on 24th June"), and I will decompose it into a structured Action Plan, save it, and sync it to Google Calendar.

*Available Commands:*
\u2022 *today* / *plan* - Get your daily briefing & active focus blocks
\u2022 *done [task name/number]* - Complete a subtask
\u2022 *risk* - Audit project schedule risks & warnings
\u2022 *panic* - Trigger emergency panic Mode triage
\u2022 *reschedule* - Optimize calendar schedules

To pair your account, click the link in your Web Settings dashboard.`
    );
    return;
  }
  let user = null;
  const { data: matchedUsers } = await supabase.from("users").select("*").eq("phone_number", `telegram:${chatId}`);
  if (matchedUsers && matchedUsers.length > 0) {
    user = matchedUsers[0];
  }
  if (!user) {
    await sendTelegramMessage(
      botUrl,
      chatId,
      `\u{1F4F1} *Telegram Account Not Linked*

Your Telegram chat is not connected to a Task Jerker profile.

Please log in to the web dashboard, go to Settings, and click *Connect Telegram Bot* to pair your account.`
    );
    return;
  }
  await saveMessageLog(user.id, "inbound", `[Telegram] ${text}`);
  const intent = await classifyIntent(text);
  if (intent === "CREATE_GOAL") {
    await sendTelegramMessage(botUrl, chatId, "\u{1F914} Decomposing your goal into structured tasks...");
    try {
      const plan = await generateTaskPlan(text);
      const responseText = `\u{1F4CB} *Plan of Action Decomposed:*
     
*Goal:* ${plan.goal}
*Effort Est:* ${plan.estimated_hours} Hours
*Difficulty:* ${plan.difficulty}/10
*Impact:* ${plan.impact}/10

*Tasks Checklist:*
${plan.subtasks.map((st, idx) => `${idx + 1}. ${st}`).join("\n")}

Confirm to save in database and schedule sequential Google Calendar events:`;
      await sendTelegramMessage(botUrl, chatId, responseText, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "\u2705 Approve Plan", callback_data: "approve_plan" },
              { text: "\u274C Reject Plan", callback_data: "reject_plan" }
            ]
          ]
        }
      });
    } catch (err) {
      console.error("Failed to generate task plan on Telegram message:", err);
      await sendTelegramMessage(botUrl, chatId, `\u26A0\uFE0F Failed to generate action plan: ${err.message || err}`);
    }
  } else {
    try {
      const reply = await executeUserIntent(user.id, text);
      await sendTelegramMessage(botUrl, chatId, reply);
    } catch (err) {
      console.error("Error executing intent via Telegram:", err);
      await sendTelegramMessage(botUrl, chatId, `\u26A0\uFE0F An error occurred while executing command.`);
    }
  }
}
async function handleTelegramCallbackQuery(botUrl, callbackQuery) {
  const chatId = String(callbackQuery.message.chat.id);
  const data = callbackQuery.data;
  const messageId = callbackQuery.message.message_id;
  const messageText = callbackQuery.message.text || "";
  try {
    await axios.post(`${botUrl}/answerCallbackQuery`, {
      callback_query_id: callbackQuery.id
    });
  } catch (err) {
    console.error("Failed to answer Telegram callback query:", err);
  }
  let user = null;
  const { data: matchedUsers } = await supabase.from("users").select("*").eq("phone_number", `telegram:${chatId}`);
  if (matchedUsers && matchedUsers.length > 0) {
    user = matchedUsers[0];
  }
  if (!user) {
    await editTelegramMessage(botUrl, chatId, messageId, `\u26A0\uFE0F *Error:* No active user profile found for this Telegram account.`);
    return;
  }
  if (data === "reject_plan") {
    await editTelegramMessage(botUrl, chatId, messageId, `\u274C *Plan Rejected.* You can send another goal to try again.`);
    return;
  }
  if (data === "approve_plan") {
    await editTelegramMessage(botUrl, chatId, messageId, `\u2699\uFE0F *Processing plan approval and calendar scheduling...*`);
    const parsed = parsePlanFromText(messageText);
    if (!parsed.goal || parsed.subtasks.length === 0) {
      await editTelegramMessage(botUrl, chatId, messageId, `\u26A0\uFE0F *Error:* Could not parse plan details from the message.`);
      return;
    }
    const subtasksCount = parsed.subtasks.length;
    const subtaskHours = Math.max(1, Math.round(parsed.hours / subtasksCount));
    const subtaskCountdown = subtaskHours * 3600;
    let calendarSynced = false;
    const googleToken = await getGoogleToken(user.id);
    for (let i = 0; i < subtasksCount; i++) {
      const subtaskText = parsed.subtasks[i];
      try {
        await createGoal(
          user.id,
          subtaskText,
          parsed.goal,
          // Group subtasks under main goal project name
          subtaskHours,
          parsed.difficulty,
          parsed.impact,
          [],
          subtaskCountdown
        );
      } catch (dbErr) {
        console.error("Failed to save decomposed Telegram task to Supabase:", dbErr);
      }
      if (googleToken) {
        const startDateTime = new Date(Date.now() + i * subtaskHours * 3600 * 1e3).toISOString();
        const endDateTime = new Date(Date.now() + (i + 1) * subtaskHours * 3600 * 1e3).toISOString();
        try {
          const res = await axios.post(
            "https://www.googleapis.com/calendar/v3/calendars/primary/events",
            {
              summary: `\u{1F3AF} ${parsed.goal}: ${subtaskText}`,
              description: `Subtask of Goal: ${parsed.goal}
Difficulty: ${parsed.difficulty}/10
Impact: ${parsed.impact}/10`,
              start: { dateTime: startDateTime },
              end: { dateTime: endDateTime }
            },
            {
              headers: {
                Authorization: `Bearer ${googleToken}`,
                "Content-Type": "application/json"
              }
            }
          );
          if (res.status === 200 || res.status === 201) {
            calendarSynced = true;
          }
        } catch (googleErr) {
          console.error("Failed to post event to Google Calendar from Telegram Bot:", googleErr.response?.data || googleErr.message);
        }
      }
    }
    let finalReply = `\u2705 *Plan Approved!*
    
Decomposed tasks successfully created in database & task priority queue.`;
    if (googleToken && calendarSynced) {
      finalReply += `
\u{1F4C5} *All tasks mapped sequentially on your Google Calendar!*`;
    } else if (googleToken && !calendarSynced) {
      finalReply += `
\u26A0\uFE0F *Google Calendar event creation failed. Check credentials.*`;
    } else {
      finalReply += `
\u2139\uFE0F *Google Calendar sync skipped (no active browser Google Oauth token saved in database config).*`;
    }
    await editTelegramMessage(botUrl, chatId, messageId, finalReply);
    await saveMessageLog(user.id, "outbound", `[Telegram Plan Approved] ${parsed.goal}`);
  }
}
async function initTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log("Telegram Bot Token is not configured in .env. Skipping Telegram bot polling loop.");
    return;
  }
  console.log("Starting Telegram bot polling loop...");
  pollTelegramUpdates(token);
}
async function pollTelegramUpdates(token) {
  const botUrl = `https://api.telegram.org/bot${token}`;
  while (true) {
    try {
      const response = await axios.get(`${botUrl}/getUpdates`, {
        params: {
          offset: telegramOffset,
          timeout: 30
        },
        timeout: 35e3
      });
      const updates = response.data?.result || [];
      for (const update of updates) {
        telegramOffset = update.update_id + 1;
        if (update.message) {
          await handleTelegramMessage(botUrl, update.message);
        } else if (update.callback_query) {
          await handleTelegramCallbackQuery(botUrl, update.callback_query);
        }
      }
    } catch (error) {
      console.error("Telegram bot polling error:", error.message || error);
      await new Promise((resolve) => setTimeout(resolve, 5e3));
    }
  }
}
app.listen(PORT, () => {
  console.log(`Backend server listening on port ${PORT}`);
  initTelegramBot();
});
