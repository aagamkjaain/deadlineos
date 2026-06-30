import 'dotenv/config';
import express from 'express';
import bodyParser from 'body-parser';
import path from 'path';
import { GoogleGenAI } from '@google/genai';

import {
  getUserByPhoneNumber,
  createGoal,
  getTasksByUserId,
  updateSubtaskStatus,
  updateTaskSubtasks,
  postponeTask,
  saveMessageLog,
  saveRiskRecord,
  getLatestRisk,
  isSupabaseConfigured,
  supabase
} from './src/services/supabase';

import {
  generateTaskPlan,
  generatePanicTriage,
  generateScopeReduction,
  getVoicePlanningResponse,
  getApiKey
} from './src/services/gemini';

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Custom CORS middleware to avoid external packages
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});



/**
 * Step 5: Intent Classifier using Gemini
 */
async function classifyIntent(messageText: string): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) return 'GENERAL_CHAT';

  const normalized = messageText.trim().toLowerCase();
  
  // Exact command overrides for quick responses
  if (normalized === 'today' || normalized === 'plan' || normalized === 'schedule') return 'GET_TODAY_PLAN';
  if (normalized === 'risk' || normalized === 'status') return 'RISK_CHECK';
  if (normalized === 'panic') return 'PANIC_MODE';
  if (normalized === 'reschedule') return 'RESCHEDULE';
  if (normalized === 'help' || normalized === 'commands') return 'HELP';
  if (normalized.startsWith('done ') || normalized.startsWith('completed ') || normalized === 'done') return 'COMPLETE_TASK';

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
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

    return response.text?.trim() || 'GENERAL_CHAT';
  } catch (e) {
    console.error('Intent classification failed:', e);
    return 'GENERAL_CHAT';
  }
}

/**
 * Shared logic to classify message intent and execute relevant database updates or AI responses
 */
async function executeUserIntent(userId: string, messageText: string): Promise<string> {
  const intent = await classifyIntent(messageText);

  switch (intent) {
    case 'HELP': {
      const helpMessage = `🤖 *Task Jerker Commands Guide*
      
• *today* / *plan* - Get your daily briefing & active focus blocks
• *done [task name/number]* - Complete a subtask
• *risk* - Audit project schedule risks & warnings
• *panic* - Trigger emergency panic Mode triage
• *reschedule* - Optimize calendar schedules
• Or type naturally to plan a new goal (e.g. "Plan AWS exam due July 15")`;
      await saveMessageLog(userId, 'outbound', helpMessage);
      return helpMessage;
    }

    case 'CREATE_GOAL': {
      const apiKey = getApiKey();
      if (!apiKey) return 'Configure your API key to generate plans.';

      // Extract Goal and Deadline parameters from prompt
      const ai = new GoogleGenAI({ apiKey });
      const extraction = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Parse this instruction: "${messageText}". Current Year: ${new Date().getFullYear()}`,
        config: {
          systemInstruction: 'Extract the core Goal text and the target Deadline Date. Output ONLY valid JSON matching: { "goal": "string", "deadline": "YYYY-MM-DD or null if missing" }',
          responseMimeType: 'application/json'
        }
      });

      const parsed = JSON.parse(extraction.text || '{}');
      if (!parsed.goal) {
        return 'What is the goal name? Please speak or type clearly.';
      }

      // Edge Case 1: No Deadline specified (Case 1)
      if (!parsed.deadline || parsed.deadline === 'null') {
        return '📅 When is this due? Please specify a deadline date (e.g. "Friday" or "July 10").';
      }

      // Calculate hours left to determine estimated plan
      const targetDate = new Date(parsed.deadline);
      const now = new Date();
      const diffMs = targetDate.getTime() - now.getTime();
      const diffHours = Math.max(1, Math.round(diffMs / (3600 * 1000)));

      if (diffHours < 0) {
        return '⚠️ Invalid date. The deadline date must be in the future.';
      }

      // Call AI Task Brain planner (Step 6)
      const plan = await generateTaskPlan(parsed.goal);

      // Save Goal and subtasks in Supabase
      const dbTask = await createGoal(
        userId,
        plan.goal,
        'WhatsApp Plan',
        plan.estimated_hours,
        plan.difficulty,
        plan.impact,
        plan.subtasks
      );

      const reply = `🎯 *Goal Created Successfully*
      
• *Goal:* ${dbTask.title}
• *Deadline:* ${parsed.deadline}
• *Effort Est:* ${plan.estimated_hours} Hours
• *Tasks Generated:* ${dbTask.subtasks.length}
      
*Next Focus Task:*
1. ${dbTask.subtasks[0]?.text || 'Get started'}`;

      await saveMessageLog(userId, 'outbound', reply);
      return reply;
    }

    case 'GET_TODAY_PLAN': {
      const tasks = await getTasksByUserId(userId);
      const activeTasks = tasks.filter(t => t.progress < 100);

      if (activeTasks.length === 0) {
        const reply = '🌅 No active focus tasks found for today. Type "Plan my DBMS project due Friday" to create one.';
        await saveMessageLog(userId, 'outbound', reply);
        return reply;
      }

      let planReply = `📅 *Today's Focus Priorities*\n`;
      activeTasks.forEach((t, i) => {
        const openSubtask = t.subtasks.find(st => !st.completed);
        planReply += `\n*${i + 1}. ${t.title}* (${t.progress}% complete)
• Focus task: ${openSubtask ? openSubtask.text : 'Final testing'}
• Time left: ${Math.ceil(t.countdown_seconds / 3600)} hours`;
      });

      await saveMessageLog(userId, 'outbound', planReply);
      return planReply;
    }

    case 'COMPLETE_TASK': {
      const tasks = await getTasksByUserId(userId);
      const activeTasks = tasks.filter(t => t.progress < 100);

      if (activeTasks.length === 0) {
        return 'No active tasks found to complete.';
      }

      // Find the task and complete its first open subtask
      // E.g. done with the highest priority item
      const targetTask = activeTasks[0];
      const subtaskIndex = targetTask.subtasks.findIndex(st => !st.completed);

      if (subtaskIndex === -1) {
        return 'All subtasks for this task are already completed.';
      }

      const updated = await updateSubtaskStatus(targetTask.id, subtaskIndex, true);
      
      // Step 9: Run Risk Engine Calculation
      const completedCount = updated.subtasks.filter(st => st.completed).length;
      const progress = updated.progress;
      
      // Simulating risk level
      const missedSessionFactor = updated.postponed_count * 20;
      const timeFactor = updated.countdown_seconds / 3600;
      const riskScore = Math.max(0, Math.min(100, Math.round(100 - progress + missedSessionFactor - timeFactor)));
      const riskLevel = riskScore > 75 ? 'high' : riskScore > 40 ? 'medium' : 'low';
      
      await saveRiskRecord(
        userId,
        riskScore,
        riskLevel,
        `Progress update to ${progress}% with ${updated.postponed_count} postponed checks.`
      );

      const reply = `✅ *Task Updated*
      
• Task: "${updated.subtasks[subtaskIndex].text}" marked complete.
• Project Progress: *${progress}%*
• System Risk Level: *${riskLevel.toUpperCase()}*`;

      await saveMessageLog(userId, 'outbound', reply);
      return reply;
    }

    case 'RISK_CHECK': {
      const tasks = await getTasksByUserId(userId);
      const activeTasks = tasks.filter(t => t.progress < 100);

      if (activeTasks.length === 0) {
        return 'No active projects to calculate risks for.';
      }

      const latestRisk = await getLatestRisk(userId);
      const currentRiskLevel = latestRisk ? latestRisk.risk_level.toUpperCase() : 'LOW';
      const currentReason = latestRisk ? latestRisk.reason : 'All schedules are on time.';

      let reply = `⚠️ *Task Jerker Schedule Audit*
      
• General System Risk: *${currentRiskLevel}*
• Details: ${currentReason}
      
*Active Deadlines:*`;

      activeTasks.forEach((t) => {
        const hoursLeft = Math.ceil(t.countdown_seconds / 3600);
        reply += `\n• "${t.title}" -> ${hoursLeft}h remaining (${t.progress}% complete)`;
      });

      await saveMessageLog(userId, 'outbound', reply);
      return reply;
    }

    case 'PANIC_MODE': {
      const tasks = await getTasksByUserId(userId);
      const criticalTask = tasks.find(t => t.status === 'critical') || tasks[0];

      if (!criticalTask) {
        return 'No active tasks found to rescue.';
      }

      // Triage task subtasks using Gemini
      const subtaskStrings = criticalTask.subtasks.map(st => st.text);
      const hoursLeft = Math.ceil(criticalTask.countdown_seconds / 3600);
      
      const triage = await generatePanicTriage(criticalTask.title, subtaskStrings, hoursLeft);

      // Update task subtasks order with triaged checklist
      const triagedSubtasks = [
        ...triage.must_do.map(text => ({ text, completed: false })),
        ...triage.skip.map(text => ({ text, completed: true })) // Mark Nice-to-haves as auto-skipped/completed
      ];
      await updateTaskSubtasks(criticalTask.id, triagedSubtasks);

      const reply = `🚨 *Emergency Panic Protocol Active*
      
*Survival Strategy:* "${triage.justification}"
      
*MUST DO CHECKLIST:*
${triage.must_do.map((t, i) => `${i + 1}. [ ] ${t}`).join('\n')}
      
*DEFERRED / SKIPPED:*
${triage.skip.map(t => `✗ ${t}`).join('\n')}`;

      await saveMessageLog(userId, 'outbound', reply);
      return reply;
    }

    case 'RESCHEDULE': {
      const tasks = await getTasksByUserId(userId);
      const criticalTask = tasks.find(t => t.status === 'critical') || tasks[0];

      if (!criticalTask) {
        return 'No active task found to reschedule.';
      }

      const updated = await postponeTask(criticalTask.id);
      const hoursLeft = Math.ceil(updated.countdown_seconds / 3600);

      const reply = `⏰ *Task Rescheduled*
      
• Task: "${updated.title}" shifted.
• New Deadline countdown: *${hoursLeft} Hours* remaining.
• Postponed count: *${updated.postponed_count}* times.`;

      await saveMessageLog(userId, 'outbound', reply);
      return reply;
    }

    case 'GENERAL_CHAT':
    default: {
      const responseText = await getVoicePlanningResponse(messageText);
      await saveMessageLog(userId, 'outbound', responseText);
      return responseText;
    }
  }
}



// Serve frontend assets in production
app.get('/api/ml/productivity/:userId', async (req, res) => {
  const userId = req.params.userId;
  console.log(`[ML API] Request received for userId: "${userId}"`);
  if (!userId) {
    console.warn('[ML API] Request rejected: missing userId');
    return res.status(400).json({ error: 'Missing userId parameter' });
  }

  try {
    // 1. Fetch user's tasks from Supabase
    console.log(`[ML API] Fetching tasks from Supabase for user: ${userId}`);
    const userTasks = await getTasksByUserId(userId);
    console.log(`[ML API] Supabase query complete. Found ${userTasks?.length || 0} tasks.`);
    
    // Map tasks keys matching what predict.py expects
    const tasksPayload = (userTasks || []).map(t => ({
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

    // 2. Spawn Python subprocess to get prediction output
    const { spawn } = await import('child_process');
    const pythonExecutable = process.platform === 'win32' ? 'python' : 'python3';
    
    console.log(`[ML API] Spawning Python subprocess: "${pythonExecutable} ml_pipeline/predict.py"`);
    const pyProcess = spawn(pythonExecutable, ['ml_pipeline/predict.py']);
    
    let outputData = '';
    let errorData = '';

    pyProcess.on('error', (err) => {
      console.error('[ML API] Failed to spawn Python process:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to start ML engine', details: err.message });
      }
    });

    pyProcess.stdout.on('data', (chunk) => {
      outputData += chunk.toString();
    });

    pyProcess.stderr.on('data', (chunk) => {
      errorData += chunk.toString();
    });

    pyProcess.on('close', (code) => {
      console.log(`[ML API] Python subprocess closed with exit code: ${code}`);
      if (code !== 0) {
        console.error('[ML API] Python prediction script error:', errorData);
        if (!res.headersSent) {
          res.status(500).json({ error: 'ML engine error', details: errorData });
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
        console.error('[ML API] Failed to parse Python model response:', outputData, parseErr);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to parse ML response' });
        }
      }
    });

    // Write inputs JSON string to python process stdin and end stream
    console.log(`[ML API] Writing tasks payload to Python stdin (payload count: ${tasksPayload.length})`);
    pyProcess.stdin.write(JSON.stringify(tasksPayload));
    pyProcess.stdin.end();

  } catch (err: any) {
    console.error('[ML API] Fatal error in route handler:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Server prediction failure', details: err.message });
    }
  }
});

// Serve frontend assets in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

/**
 * Telegram Bot polling loop & updates processor
 */
let telegramOffset = 0;

async function sendTelegramMessage(botUrl: string, chatId: string, text: string, options: any = {}) {
  try {
    await axios.post(`${botUrl}/sendMessage`, {
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown',
      ...options
    });
  } catch (err: any) {
    console.error('Failed to send Telegram message:', err.response?.data || err.message);
  }
}

async function editTelegramMessage(botUrl: string, chatId: string, messageId: number, text: string, options: any = {}) {
  try {
    await axios.post(`${botUrl}/editMessageText`, {
      chat_id: chatId,
      message_id: messageId,
      text: text,
      parse_mode: 'Markdown',
      ...options
    });
  } catch (err: any) {
    console.error('Failed to edit Telegram message:', err.response?.data || err.message);
  }
}

async function getGoogleToken(userId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .eq('title', '__SYSTEM_CONFIG__')
      .eq('project', 'OAuth')
      .order('created_at', { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) return null;
    const subtasks = data[0].subtasks;
    if (subtasks && subtasks.length > 0) {
      const match = subtasks[0].text.match(/^provider_token:(.+)$/);
      return match ? match[1] : null;
    }
  } catch (err) {
    console.error('Error fetching Google token from DB config:', err);
  }
  return null;
}

function parsePlanFromText(text: string) {
  const lines = text.split('\n');
  let goal = '';
  let subtasks: string[] = [];
  let hours = 3;
  let difficulty = 5;
  let impact = 5;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.includes('Goal:')) {
      goal = line.split('Goal:')[1].replace(/\*/g, '').trim();
    }
    if (line.includes('Effort Est:')) {
      hours = parseInt(line.split('Effort Est:')[1].replace(/Hours|Hours/gi, '').trim()) || 3;
    }
    if (line.includes('Difficulty:')) {
      difficulty = parseInt(line.split('Difficulty:')[1].split('/')[0].trim()) || 5;
    }
    if (line.includes('Impact:')) {
      impact = parseInt(line.split('Impact:')[1].split('/')[0].trim()) || 5;
    }
    if (/^\d+\.\s+/.test(line)) {
      subtasks.push(line.replace(/^\d+\.\s+/, '').trim());
    }
  }
  return { goal, subtasks, hours, difficulty, impact };
}

async function handleTelegramMessage(botUrl: string, message: any) {
  const chatId = String(message.chat.id);
  const text = message.text || '';
  const trimmedText = text.trim();

  // 1. Deep linking start handling
  if (trimmedText.startsWith('/start')) {
    const parts = trimmedText.split(/\s+/);
    if (parts.length > 1) {
      const potentialUserId = parts[1];
      try {
        const { data: updatedUser, error } = await supabase
          .from('users')
          .update({ phone_number: `telegram:${chatId}`, channel: 'telegram' })
          .eq('id', potentialUserId)
          .select()
          .single();

        if (error || !updatedUser) {
          console.error('Failed to link Telegram chat ID to user:', error);
          await sendTelegramMessage(
            botUrl,
            chatId,
            `⚠️ *Failed to link account:* We could not find a user profile matching this ID. Please try connecting again from the dashboard settings.`
          );
        } else {
          await sendTelegramMessage(
            botUrl,
            chatId,
            `🎉 *Account Connected Successfully!*\n\nYour Telegram account has been linked to your Task Jerker account.\n\nYou can now send me goals and deadlines (e.g. "Plan AWS exam due Friday") or run commands like *today*, *risk*, *panic*, and *reschedule* directly from here!`
          );
        }
      } catch (err: any) {
        console.error('Error linking Telegram profile:', err);
        await sendTelegramMessage(
          botUrl,
          chatId,
          `⚠️ *Connection Error:* An error occurred while linking your account.`
        );
      }
      return;
    }
  }

  // 2. Help command / Generic Start
  if (trimmedText.startsWith('/start') || trimmedText.startsWith('/help')) {
    await sendTelegramMessage(
      botUrl,
      chatId,
      `🤖 *Welcome to your Task Jerker AI Assistant!*
      
Send me a goal or deadline (e.g. "I have a hackathon on 24th June"), and I will decompose it into a structured Action Plan, save it, and sync it to Google Calendar.

*Available Commands:*
• *today* / *plan* - Get your daily briefing & active focus blocks
• *done [task name/number]* - Complete a subtask
• *risk* - Audit project schedule risks & warnings
• *panic* - Trigger emergency panic Mode triage
• *reschedule* - Optimize calendar schedules

To pair your account, click the link in your Web Settings dashboard.`
    );
    return;
  }

  // 3. Find matched user profile
  let user: any = null;
  const { data: matchedUsers } = await supabase
    .from('users')
    .select('*')
    .eq('phone_number', `telegram:${chatId}`);

  if (matchedUsers && matchedUsers.length > 0) {
    user = matchedUsers[0];
  }

  if (!user) {
    await sendTelegramMessage(
      botUrl,
      chatId,
      `📱 *Telegram Account Not Linked*\n\nYour Telegram chat is not connected to a Task Jerker profile.\n\nPlease log in to the web dashboard, go to Settings, and click *Connect Telegram Bot* to pair your account.`
    );
    return;
  }

  // 4. Save query to messages table (Database logging)
  await saveMessageLog(user.id, 'inbound', `[Telegram] ${text}`);

  // 5. Classify intent
  const intent = await classifyIntent(text);

  if (intent === 'CREATE_GOAL') {
    await sendTelegramMessage(botUrl, chatId, '🤔 Decomposing your goal into structured tasks...');
    try {
      const plan = await generateTaskPlan(text);
      const responseText = `📋 *Plan of Action Decomposed:*
     
*Goal:* ${plan.goal}
*Effort Est:* ${plan.estimated_hours} Hours
*Difficulty:* ${plan.difficulty}/10
*Impact:* ${plan.impact}/10

*Tasks Checklist:*
${plan.subtasks.map((st, idx) => `${idx + 1}. ${st}`).join('\n')}

Confirm to save in database and schedule sequential Google Calendar events:`;

      await sendTelegramMessage(botUrl, chatId, responseText, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Approve Plan', callback_data: 'approve_plan' },
              { text: '❌ Reject Plan', callback_data: 'reject_plan' }
            ]
          ]
        }
      });
    } catch (err: any) {
      console.error('Failed to generate task plan on Telegram message:', err);
      await sendTelegramMessage(botUrl, chatId, `⚠️ Failed to generate action plan: ${err.message || err}`);
    }
  } else {
    // Other command intents: call the executeUserIntent helper
    try {
      const reply = await executeUserIntent(user.id, text);
      await sendTelegramMessage(botUrl, chatId, reply);
    } catch (err: any) {
      console.error('Error executing intent via Telegram:', err);
      await sendTelegramMessage(botUrl, chatId, `⚠️ An error occurred while executing command.`);
    }
  }
}

async function handleTelegramCallbackQuery(botUrl: string, callbackQuery: any) {
  const chatId = String(callbackQuery.message.chat.id);
  const data = callbackQuery.data;
  const messageId = callbackQuery.message.message_id;
  const messageText = callbackQuery.message.text || '';

  // Acknowledge the callback query immediately to stop the loading animation
  try {
    await axios.post(`${botUrl}/answerCallbackQuery`, {
      callback_query_id: callbackQuery.id
    });
  } catch (err) {
    console.error('Failed to answer Telegram callback query:', err);
  }

  // Find user dynamically
  let user: any = null;
  const { data: matchedUsers } = await supabase
    .from('users')
    .select('*')
    .eq('phone_number', `telegram:${chatId}`);
  
  if (matchedUsers && matchedUsers.length > 0) {
    user = matchedUsers[0];
  }

  if (!user) {
    await editTelegramMessage(botUrl, chatId, messageId, `⚠️ *Error:* No active user profile found for this Telegram account.`);
    return;
  }

  if (data === 'reject_plan') {
    await editTelegramMessage(botUrl, chatId, messageId, `❌ *Plan Rejected.* You can send another goal to try again.`);
    return;
  }

  if (data === 'approve_plan') {
    await editTelegramMessage(botUrl, chatId, messageId, `⚙️ *Processing plan approval and calendar scheduling...*`);

    const parsed = parsePlanFromText(messageText);
    if (!parsed.goal || parsed.subtasks.length === 0) {
      await editTelegramMessage(botUrl, chatId, messageId, `⚠️ *Error:* Could not parse plan details from the message.`);
      return;
    }

    const subtasksCount = parsed.subtasks.length;
    const subtaskHours = Math.max(1, Math.round(parsed.hours / subtasksCount));
    const subtaskCountdown = subtaskHours * 3600;

    let calendarSynced = false;
    const googleToken = await getGoogleToken(user.id);

    for (let i = 0; i < subtasksCount; i++) {
      const subtaskText = parsed.subtasks[i];

      // 1. Create task in Supabase
      try {
        await createGoal(
          user.id,
          subtaskText,
          parsed.goal, // Group subtasks under main goal project name
          subtaskHours,
          parsed.difficulty,
          parsed.impact,
          [],
          subtaskCountdown
        );
      } catch (dbErr) {
        console.error('Failed to save decomposed Telegram task to Supabase:', dbErr);
      }

      // 2. Schedule Event via Google Calendar API if OAuth token is available
      if (googleToken) {
        const startDateTime = new Date(Date.now() + i * subtaskHours * 3600 * 1000).toISOString();
        const endDateTime = new Date(Date.now() + (i + 1) * subtaskHours * 3600 * 1000).toISOString();

        try {
          const res = await axios.post(
            'https://www.googleapis.com/calendar/v3/calendars/primary/events',
            {
              summary: `🎯 ${parsed.goal}: ${subtaskText}`,
              description: `Subtask of Goal: ${parsed.goal}\nDifficulty: ${parsed.difficulty}/10\nImpact: ${parsed.impact}/10`,
              start: { dateTime: startDateTime },
              end: { dateTime: endDateTime }
            },
            {
              headers: {
                Authorization: `Bearer ${googleToken}`,
                'Content-Type': 'application/json'
              }
            }
          );
          if (res.status === 200 || res.status === 201) {
            calendarSynced = true;
          }
        } catch (googleErr: any) {
          console.error('Failed to post event to Google Calendar from Telegram Bot:', googleErr.response?.data || googleErr.message);
        }
      }
    }

    let finalReply = `✅ *Plan Approved!*
    
Decomposed tasks successfully created in database & task priority queue.`;

    if (googleToken && calendarSynced) {
      finalReply += `\n📅 *All tasks mapped sequentially on your Google Calendar!*`;
    } else if (googleToken && !calendarSynced) {
      finalReply += `\n⚠️ *Google Calendar event creation failed. Check credentials.*`;
    } else {
      finalReply += `\nℹ️ *Google Calendar sync skipped (no active browser Google Oauth token saved in database config).*`;
    }

    await editTelegramMessage(botUrl, chatId, messageId, finalReply);
    await saveMessageLog(user.id, 'outbound', `[Telegram Plan Approved] ${parsed.goal}`);
  }
}

async function initTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    console.log('Telegram Bot Token is not configured in .env. Skipping Telegram bot polling loop.');
    return;
  }

  console.log('Starting Telegram bot polling loop...');
  pollTelegramUpdates(token);
}

async function pollTelegramUpdates(token: string) {
  const botUrl = `https://api.telegram.org/bot${token}`;

  while (true) {
    try {
      const response = await axios.get(`${botUrl}/getUpdates`, {
        params: {
          offset: telegramOffset,
          timeout: 30
        },
        timeout: 35000
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
    } catch (error: any) {
      console.error('Telegram bot polling error:', error.message || error);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

app.listen(PORT, () => {
  console.log(`Backend server listening on port ${PORT}`);
  initTelegramBot();
});
