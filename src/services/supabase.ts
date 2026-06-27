import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  (typeof process !== 'undefined' && process.env?.SUPABASE_URL) ||
  // @ts-ignore
  import.meta.env?.VITE_SUPABASE_URL ||
  // @ts-ignore
  import.meta.env?.SUPABASE_URL ||
  (typeof localStorage !== 'undefined' && localStorage && typeof localStorage.getItem === 'function' ? localStorage.getItem('SUPABASE_URL') : null) ||
  '';

const supabaseKey =
  (typeof process !== 'undefined' && process.env?.SUPABASE_KEY) ||
  // @ts-ignore
  import.meta.env?.VITE_SUPABASE_KEY ||
  // @ts-ignore
  import.meta.env?.SUPABASE_KEY ||
  (typeof localStorage !== 'undefined' && localStorage && typeof localStorage.getItem === 'function' ? localStorage.getItem('SUPABASE_KEY') : null) ||
  '';

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseKey || 'placeholder'
);

export function isSupabaseConfigured(): boolean {
  return (
    supabaseUrl !== '' &&
    supabaseUrl !== 'placeholder' &&
    supabaseKey !== '' &&
    supabaseKey !== 'placeholder'
  );
}

export interface DbUser {
  id: string;
  phone_number: string;
  created_at: string;
  channel: string;
}

export interface DbTask {
  id: string;
  user_id: string;
  title: string;
  project: string;
  status: 'critical' | 'normal' | 'deferred';
  countdown_seconds: number;
  progress: number;
  difficulty: number;
  impact: number;
  postponed_count: number;
  subtasks: { text: string; completed: boolean }[];
  created_at: string;
}

/**
 * Fetch a user by phone number or create one if they do not exist (Step 4)
 */
export async function getOrCreateUser(phoneNumber: string): Promise<DbUser> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase client is not configured. Please add SUPABASE_URL and SUPABASE_KEY to your environment/settings.');
  }

  // Normalize phone number (trim whitespace and normalize structure)
  const normPhone = phoneNumber.trim().replace('whatsapp:', '');

  // 1. Search user
  const { data: user, error: fetchErr } = await supabase
    .from('users')
    .select('*')
    .eq('phone_number', normPhone)
    .single();

  if (fetchErr && fetchErr.code !== 'PGRST116') { // PGRST116 means zero rows returned
    throw fetchErr;
  }

  if (user) {
    return user as DbUser;
  }

  // 2. Create user if missing
  const { data: newUser, error: insertErr } = await supabase
    .from('users')
    .insert({ phone_number: normPhone, channel: 'whatsapp' })
    .select()
    .single();

  if (insertErr) {
    throw insertErr;
  }

  return newUser as DbUser;
}

/**
 * Fetch a user by phone number (returns null if not found)
 */
export async function getUserByPhoneNumber(phoneNumber: string): Promise<DbUser | null> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase client is not configured. Please add SUPABASE_URL and SUPABASE_KEY to your environment/settings.');
  }

  // Normalize phone number (trim whitespace and normalize structure)
  const normPhone = phoneNumber.trim().replace('whatsapp:', '');

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('phone_number', normPhone)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw error;
  }

  return user as DbUser;
}

/**
 * Add a new task (Step 6)
 */
export async function createGoal(
  userId: string,
  title: string,
  project: string,
  estimatedHours: number,
  difficulty: number,
  impact: number,
  subtasks: string[],
  customCountdownSeconds?: number
): Promise<DbTask> {
  const taskSubtasks = subtasks.map(text => ({ text, completed: false }));
  
  const { data: newTask, error } = await supabase
    .from('tasks')
    .insert({
      user_id: userId,
      title,
      project: project || 'Default Project',
      status: impact >= 8 ? 'critical' : 'normal',
      countdown_seconds: customCountdownSeconds !== undefined ? customCountdownSeconds : estimatedHours * 3600,
      difficulty,
      impact,
      postponed_count: 0,
      progress: 0,
      subtasks: taskSubtasks
    })
    .select()
    .single();

  if (error) throw error;
  return newTask as DbTask;
}

/**
 * Fetch all tasks for a specific user
 */
export async function getTasksByUserId(userId: string): Promise<DbTask[]> {
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (tasks || []) as DbTask[];
}

/**
 * Update subtasks list and recalculate progress (Step 8)
 */
export async function updateSubtaskStatus(
  taskId: string,
  subtaskIndex: number,
  completed: boolean
): Promise<DbTask> {
  // Fetch current task
  const { data: currentTask, error: fetchErr } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .single();

  if (fetchErr) throw fetchErr;

  const task = currentTask as DbTask;
  if (!task.subtasks || task.subtasks.length === 0) {
    throw new Error('Task has no subtasks.');
  }

  const updatedSubtasks = [...task.subtasks];
  if (subtaskIndex >= 0 && subtaskIndex < updatedSubtasks.length) {
    updatedSubtasks[subtaskIndex] = {
      ...updatedSubtasks[subtaskIndex],
      completed
    };
  }

  const completedCount = updatedSubtasks.filter(st => st.completed).length;
  const progress = Math.round((completedCount / updatedSubtasks.length) * 100);

  const { data: updatedTask, error: updateErr } = await supabase
    .from('tasks')
    .update({
      subtasks: updatedSubtasks,
      progress
    })
    .eq('id', taskId)
    .select()
    .single();

  if (updateErr) throw updateErr;
  return updatedTask as DbTask;
}

/**
 * Update whole subtasks block (e.g. after AI scope trims or panic triage)
 */
export async function updateTaskSubtasks(
  taskId: string,
  subtasks: { text: string; completed: boolean }[]
): Promise<DbTask> {
  const completedCount = subtasks.filter(st => st.completed).length;
  const progress = subtasks.length > 0 ? Math.round((completedCount / subtasks.length) * 100) : 0;

  const { data: updatedTask, error } = await supabase
    .from('tasks')
    .update({ subtasks, progress })
    .eq('id', taskId)
    .select()
    .single();

  if (error) throw error;
  return updatedTask as DbTask;
}

/**
 * Increment postponement counters and delay task by 1 hour (Step 8 / Anti-procrastination)
 */
export async function postponeTask(taskId: string): Promise<DbTask> {
  const { data: currentTask, error: fetchErr } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .single();

  if (fetchErr) throw fetchErr;
  const task = currentTask as DbTask;

  const { data: updatedTask, error: updateErr } = await supabase
    .from('tasks')
    .update({
      postponed_count: task.postponed_count + 1,
      countdown_seconds: task.countdown_seconds + 3600 // Delay by 1 hour
    })
    .eq('id', taskId)
    .select()
    .single();

  if (updateErr) throw updateErr;
  return updatedTask as DbTask;
}

/**
 * Log message conversation history (Step 14)
 */
export async function saveMessageLog(
  userId: string,
  direction: 'inbound' | 'outbound',
  messageText: string
): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .insert({
      user_id: userId,
      direction,
      message: messageText
    });
  if (error) console.error('Failed to log message to DB:', error);
}

/**
 * Update last interaction time for WhatsApp session state (Step 14)
 */
export async function updateWhatsAppSession(userId: string): Promise<void> {
  const { error } = await supabase
    .from('whatsapp_sessions')
    .upsert({
      user_id: userId,
      last_interaction: new Date().toISOString()
    });
  if (error) console.error('Failed to upsert whatsapp session:', error);
}

/**
 * Log a daily risk analysis score (Step 9)
 */
export async function saveRiskRecord(
  userId: string,
  riskScore: number,
  riskLevel: 'low' | 'medium' | 'high',
  reason: string
): Promise<void> {
  const { error } = await supabase
    .from('risk_analysis')
    .insert({
      user_id: userId,
      risk_score: riskScore,
      risk_level: riskLevel,
      reason
    });
  if (error) console.error('Failed to log risk analysis:', error);
}

/**
 * Fetch latest risk log
 */
export async function getLatestRisk(userId: string): Promise<any> {
  const { data, error } = await supabase
    .from('risk_analysis')
    .select('*')
    .eq('user_id', userId)
    .order('timestamp', { ascending: false })
    .limit(1);

  if (error) throw error;
  return data && data.length > 0 ? data[0] : null;
}
