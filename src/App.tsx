import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Timer,
  ShieldCheck,
  TriangleAlert,
  BarChart2,
  CheckCircle,
  HelpCircle,
  Cpu,
  RefreshCw,
  Search,
  Bell,
  Zap,
  Plus,
  X,
  PlusSquare,
  Sparkles,
  Layers,
  ChevronDown,
  LogIn,
  Settings,
  Mic
} from 'lucide-react';
import { ScreenType, TaskType } from './types';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import DashboardView from './components/DashboardView';
import IntelligenceView from './components/IntelligenceView';
import LandingView from './components/LandingView';
import VoiceCommandPanel from './components/VoiceCommandPanel';
import FocusView from './components/FocusView';
import { getApiKey, saveApiKey, getAiProvider, getOllamaUrl, getOllamaModel, saveOllamaConfigs } from './services/gemini';
import { supabase, isSupabaseConfigured } from './services/supabase';

export default function App() {
  const [activeScreen, setActiveScreen] = useState<ScreenType>('landing');
  const [voiceCommandPanelOpen, setVoiceCommandPanelOpen] = useState(false);
  const [createTaskOpen, setCreateTaskOpen] = useState(false);

  // Global Session States (Lifted)
  const [activeSessionTaskId, setActiveSessionTaskId] = useState<string | null>(null);
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionTime, setSessionTime] = useState(0);

  // Task states (empty initially, loaded from Supabase)
  const [tasks, setTasks] = useState<TaskType[]>([]);
  const [session, setSession] = useState<any>(null);
  const [initialPrompt, setInitialPrompt] = useState<string>('');

  // Form states for creating a new task
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskProject, setNewTaskProject] = useState('Nexus Core');
  const [newTaskStatus, setNewTaskStatus] = useState<'critical' | 'normal' | 'deferred'>('normal');
  const [newTaskHours, setNewTaskHours] = useState(3);

  // Voice Assistant command executor handlers
  const handleVoiceCreateTask = async (title: string, hours: number, status: 'critical' | 'normal' | 'deferred') => {
    let dbTaskId = `t_${Date.now()}`;
    const defaultSubtasks = [
      'Initial design and outline requirements',
      'Core feature development and implementation',
      'Final verification and testing loop'
    ];

    if (session && session.user && isSupabaseConfigured()) {
      try {
        const { createGoal } = await import('./services/supabase');
        const dbTask = await createGoal(
          session.user.id,
          title,
          'Voice Assistant Plan',
          hours,
          5, // difficulty
          status === 'critical' ? 8 : status === 'normal' ? 6 : 4, // impact
          defaultSubtasks
        );
        dbTaskId = dbTask.id;
      } catch (err) {
        console.error('Failed to create task in Supabase:', err);
      }
    }

    // Sync to Google Calendar
    if (session?.provider_token) {
      const now = new Date();
      const targetDate = new Date(now.getTime() + hours * 3600 * 1000);
      const startDateTime = now.toISOString();
      const endDateTime = targetDate.toISOString();
      try {
        const res = await fetch(
          'https://www.googleapis.com/calendar/v3/calendars/primary/events',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${session.provider_token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              summary: `🎯 Voice Assistant Plan: ${title}`,
              description: `Project: Voice Assistant Plan\nPriority: ${status.toUpperCase()}\nStatus: NOT COMPLETED`,
              start: { dateTime: startDateTime },
              end: { dateTime: endDateTime }
            })
          }
        );
        if (!res.ok) {
          console.error('Google Calendar event creation failed from voice assistant:', await res.text());
        }
      } catch (googleErr) {
        console.error('Failed to sync to Google Calendar from voice assistant:', googleErr);
      }
    }

    const newTask: TaskType = {
      id: dbTaskId,
      title,
      project: 'Voice Assistant Plan',
      status,
      countdownSeconds: hours * 3600,
      difficulty: 5,
      impact: status === 'critical' ? 8 : status === 'normal' ? 6 : 4,
      postponedCount: 0,
      subtasks: defaultSubtasks.map(text => ({ text, completed: false })),
      createdAt: new Date().toISOString()
    };

    setTasks(prev => [newTask, ...prev]);
  };

  const handleVoiceNavigate = (screen: any) => {
    setActiveScreen(screen);
  };

  const handleVoicePlanGoal = (goal: string) => {
    setInitialPrompt(goal);
    setActiveScreen('intelligence');
  };

  // Priority score calculation formula (Feature 2)
  const calculatePriorityScore = (task: Partial<TaskType>) => {
    const hoursLeft = (task.countdownSeconds || 0) / 3600;
    const urgency = Math.max(0, Math.min(100, 100 - (hoursLeft * 2)));
    const impact = task.impact || 5;
    const difficulty = task.difficulty || 5;
    const postponed = task.postponedCount || 0;
    const score = Math.round((urgency * 0.4) + (impact * 4) + (difficulty * 1) - (postponed * 3));
    return Math.max(0, Math.min(100, score));
  };

  // Sort tasks dynamically based on calculated priority score
  const sortedTasks = [...tasks].map(t => ({
    ...t,
    priorityScore: calculatePriorityScore(t)
  })).sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));

  // Tick down counting tasks every second, and active session timer
  useEffect(() => {
    const timer = setInterval(() => {
      setTasks((prevTasks) =>
        prevTasks.map((t) => ({
          ...t,
          countdownSeconds: t.countdownSeconds > 0 ? t.countdownSeconds - 1 : 0
        }))
      );
      if (sessionActive) {
        setSessionTime((prev) => prev + 1);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [sessionActive]);

  // Action selected from Command Palette
  const handleSelectPaletteAction = (actionKey: string) => {
    if (actionKey === 'panic') {
      setActiveScreen('panicMode');
    } else if (actionKey === 'task') {
      setCreateTaskOpen(true);
    } else if (actionKey === 'aws') {
      setActiveScreen('intelligence');
    } else if (actionKey === 'risk') {
      setActiveScreen('riskCenter');
    }
  };

  // Add a newly created task
  const handleCreateTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    let dbTaskId = `t_${Date.now()}`;
    const defaultSubtasks = [
      'Initial design and outline requirements',
      'Core feature development and implementation',
      'Final verification and testing loop'
    ];

    if (session && session.user && isSupabaseConfigured()) {
      try {
        const { createGoal } = await import('./services/supabase');
        const dbTask = await createGoal(
          session.user.id,
          newTaskTitle,
          newTaskProject,
          newTaskHours,
          5, // difficulty
          newTaskStatus === 'critical' ? 8 : newTaskStatus === 'normal' ? 6 : 4, // impact
          defaultSubtasks
        );
        dbTaskId = dbTask.id;
      } catch (err) {
        console.error('Failed to create task in Supabase:', err);
        alert('Failed to save task to cloud. Saving locally instead.');
      }
    }

    // Sync to Google Calendar
    if (session?.provider_token) {
      const now = new Date();
      const targetDate = new Date(now.getTime() + newTaskHours * 3600 * 1000);
      const startDateTime = now.toISOString();
      const endDateTime = targetDate.toISOString();
      try {
        const res = await fetch(
          'https://www.googleapis.com/calendar/v3/calendars/primary/events',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${session.provider_token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              summary: `🎯 ${newTaskProject}: ${newTaskTitle}`,
              description: `Project: ${newTaskProject}\nPriority: ${newTaskStatus.toUpperCase()}\nStatus: NOT COMPLETED`,
              start: { dateTime: startDateTime },
              end: { dateTime: endDateTime }
            })
          }
        );
        if (!res.ok) {
          console.error('Google Calendar event creation failed from command palette:', await res.text());
        }
      } catch (googleErr) {
        console.error('Failed to sync to Google Calendar from command palette:', googleErr);
      }
    }

    const newTask: TaskType = {
      id: dbTaskId,
      title: newTaskTitle,
      project: newTaskProject,
      status: newTaskStatus,
      countdownSeconds: newTaskHours * 3600,
      difficulty: 5,
      impact: newTaskStatus === 'critical' ? 8 : newTaskStatus === 'normal' ? 6 : 4,
      postponedCount: 0,
      subtasks: defaultSubtasks.map(text => ({ text, completed: false })),
      createdAt: new Date().toISOString()
    };

    setTasks(prev => [newTask, ...prev]);
    setNewTaskTitle('');
    setCreateTaskOpen(false);
  };

  // Render secondary app screens beautifully
  const renderArchitectView = () => (
    <div className="space-y-8 pb-20 select-none animate-in fade-in duration-500 text-on-surface">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-white text-3xl font-bold tracking-tight flex items-center gap-2">
            <Calendar className="text-primary w-8 h-8" />
            <span>Milestone Architect</span>
          </h2>
          <p className="text-on-surface-variant text-sm mt-1">
            Build dependency maps and lock critical target times into your workflow.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        <div className="md:col-span-8 glass-card p-6 rounded-2xl border border-outline/30 space-y-6">
          <h3 className="font-sans font-bold text-base text-white">Active Milestone Timeline</h3>
          <div className="space-y-4">
            {[
              { id: '1', title: 'DB Setup & Migration Hooks', date: 'Due in 2 days', status: 'Completed', progress: 100 },
              { id: '2', title: 'AWS Cloud Deployment Setup', date: 'Due in 4 days', status: 'In Progress', progress: 66 },
              { id: '3', title: 'Client Feedback Implementations', date: 'Due in 1 week', status: 'Blocked', progress: 12 }
            ].map((milestone) => (
              <div key={milestone.id} className="p-4 rounded-xl border border-outline/40 bg-surface-container/20 space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="font-sans font-bold text-xs text-white">{milestone.title}</h4>
                  <span className={`font-mono text-[9px] font-bold px-2 py-0.5 rounded ${
                    milestone.status === 'Completed' ? 'bg-secondary/15 text-secondary' : milestone.status === 'Blocked' ? 'bg-error/15 text-error' : 'bg-primary/15 text-primary'
                  }`}>{milestone.status}</span>
                </div>
                <div className="h-1 bg-surface-container rounded-full overflow-hidden">
                  <div className={`h-full ${milestone.status === 'Completed' ? 'bg-secondary' : milestone.status === 'Blocked' ? 'bg-error' : 'bg-primary'}`} style={{ width: `${milestone.progress}%` }}></div>
                </div>
                <div className="flex justify-between text-[10px] text-on-surface-variant">
                  <span>{milestone.progress}% completed</span>
                  <span>{milestone.date}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="md:col-span-4 glass-card p-6 rounded-2xl border border-outline/30 flex flex-col justify-between">
          <div>
            <Sparkles className="text-primary w-6 h-6 mb-4" />
            <h3 className="font-sans font-bold text-sm text-white mb-2">Automated Optimization</h3>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              Based on your ongoing velocity rates, AI suggests scheduling AWS Deployments early in the morning blocks. Focus mode blocks will be generated automatically.
            </p>
          </div>
          <button className="mt-8 py-3 bg-primary text-on-primary font-bold text-xs rounded-lg hover:brightness-110 active:scale-95 transition-all">
            Optimize Target Blocks
          </button>
        </div>
      </div>
    </div>
  );

  // Focus view moved to components/FocusView.tsx

  // Risk Mitigation Center is removed

  const renderAnalyticsView = () => (
    <div className="space-y-8 pb-20 select-none animate-in fade-in duration-500 text-on-surface">
      <div>
        <h2 className="text-white text-3xl font-bold tracking-tight flex items-center gap-2">
          <BarChart2 className="text-primary w-8 h-8" />
          <span>Productivity Analytics</span>
        </h2>
        <p className="text-on-surface-variant text-sm mt-1">
          Historical velocity analytics, commitment adherence tracking, and AI-predicted project bottlenecks.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        <div className="md:col-span-12 glass-card p-6 rounded-2xl border border-outline/30 space-y-6">
          <h3 className="font-sans font-bold text-base text-white">Developer Throughput (Last 4 Weeks)</h3>
          <div className="flex items-end gap-3 h-48 pt-6 px-4 border-b border-outline/20">
            {[45, 60, 30, 85, 95, 66, 40, 55, 70, 90, 100, 75].map((val, idx) => (
              <div key={idx} className="w-full bg-primary/25 hover:bg-primary rounded-t transition-all group relative" style={{ height: `${val}%` }}>
                <span className="absolute -top-7 left-1/2 -translate-x-1/2 bg-surface-container border border-outline px-1.5 rounded font-mono text-[8px] text-white hidden group-hover:block whitespace-nowrap z-10">{val}%</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-on-surface-variant px-4">
            <span>Week 1</span>
            <span>Week 2</span>
            <span>Week 3</span>
            <span>Week 4 (Current)</span>
          </div>
        </div>
      </div>
    </div>
  );

  const renderHabitsView = () => (
    <div className="space-y-8 pb-20 select-none animate-in fade-in duration-500 text-on-surface">
      <div>
        <h2 className="text-white text-3xl font-bold tracking-tight flex items-center gap-2">
          <CheckCircle className="text-primary w-8 h-8" />
          <span>Performance Habits Matrix</span>
        </h2>
        <p className="text-on-surface-variant text-sm mt-1">
          Stay adherent to deep work blocks, deep focus routines, and scheduled standups.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        <div className="md:col-span-8 glass-card p-6 rounded-2xl border border-outline/30">
          <h3 className="font-sans font-bold text-base text-white mb-6">Deep Work Consistency Grid</h3>
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 28 }).map((_, idx) => {
              const active = idx % 3 === 0 || idx % 5 === 0;
              const highlyActive = idx % 7 === 0;
              return (
                <div
                  key={idx}
                  className={`aspect-square rounded border ${
                    highlyActive
                      ? 'bg-secondary border-secondary/30'
                      : active
                      ? 'bg-primary/40 border-primary/20'
                      : 'bg-surface-container-low border-outline/30'
                  }`}
                  title={`Day ${idx + 1}`}
                ></div>
              );
            })}
          </div>
        </div>
        <div className="md:col-span-4 glass-card p-6 rounded-2xl border border-outline/30 flex flex-col justify-between">
          <div>
            <Sparkles className="text-primary w-6 h-6 mb-4" />
            <h3 className="font-sans font-bold text-sm text-white mb-2">Performance Routine</h3>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              Deep work block routines logged successfully. Current streak: <span className="text-secondary font-bold">5 Days</span>. Optimized workspace limits active.
            </p>
          </div>
          <button className="mt-8 py-3 bg-secondary text-on-secondary font-bold text-xs rounded-lg hover:brightness-110 active:scale-95 transition-all">
            Log Todays deep focus
          </button>
        </div>
      </div>
    </div>
  );

  // Credentials and config states
  const [apiKeyInput, setApiKeyInput] = useState(getApiKey());
  const [aiProvider, setAiProvider] = useState<'gemini' | 'ollama'>(() => getAiProvider());
  const [ollamaUrlInput, setOllamaUrlInput] = useState(() => getOllamaUrl());
  const [ollamaModelInput, setOllamaModelInput] = useState(() => getOllamaModel());
  const [supabaseUrlInput, setSupabaseUrlInput] = useState(
    localStorage.getItem('SUPABASE_URL') || 
    // @ts-ignore
    import.meta.env?.VITE_SUPABASE_URL || 
    // @ts-ignore
    import.meta.env?.SUPABASE_URL || 
    ''
  );
  const [supabaseKeyInput, setSupabaseKeyInput] = useState(
    localStorage.getItem('SUPABASE_KEY') || 
    // @ts-ignore
    import.meta.env?.VITE_SUPABASE_KEY || 
    // @ts-ignore
    import.meta.env?.SUPABASE_KEY || 
    ''
  );
  const [userPhoneInput, setUserPhoneInput] = useState(localStorage.getItem('USER_PHONE_NUMBER') || '');

  // Fetch tasks from Supabase if configured
  const loadTasksFromSupabase = async (userId: string) => {
    if (!userId || !isSupabaseConfigured()) return;
    try {
      const { getTasksByUserId } = await import('./services/supabase');
      const dbTasks = await getTasksByUserId(userId);
      
      const mappedTasks: TaskType[] = dbTasks.map(t => ({
        id: t.id,
        title: t.title,
        project: t.project,
        status: t.status,
        countdownSeconds: t.countdown_seconds,
        progress: t.progress,
        difficulty: t.difficulty,
        impact: t.impact,
        postponedCount: t.postponed_count,
        subtasks: t.subtasks,
        createdAt: t.created_at
      }));
      setTasks(mappedTasks);
      if (mappedTasks.length > 0 && !activeSessionTaskId) {
        setActiveSessionTaskId(mappedTasks[0].id);
      }
    } catch (e) {
      console.error('Failed to load tasks from Supabase:', e);
    }
  };

  const ensureUserProfileExists = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (error && error.code === 'PGRST116') {
        await supabase
          .from('users')
          .insert({ id: userId, channel: 'web' });
      }
    } catch (err) {
      console.error('Error ensuring user profile exists:', err);
    }
  };

  const loadUserProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (data && data.phone_number) {
        setUserPhoneInput(data.phone_number);
      }
    } catch (err) {
      console.error('Error loading user profile:', err);
    }
  };

  const syncGoogleTokenToDb = async (userId: string, providerToken: string | null) => {
    if (!providerToken || !isSupabaseConfigured()) return;
    try {
      await supabase
        .from('tasks')
        .delete()
        .eq('user_id', userId)
        .eq('title', '__SYSTEM_CONFIG__')
        .eq('project', 'OAuth');

      await supabase
        .from('tasks')
        .insert({
          user_id: userId,
          title: '__SYSTEM_CONFIG__',
          project: 'OAuth',
          status: 'deferred',
          countdown_seconds: 0,
          difficulty: 1,
          impact: 1,
          progress: 100,
          subtasks: [{ text: `provider_token:${providerToken}`, completed: true }]
        });
      console.log('Successfully synchronized Google OAuth token to database config.');
    } catch (err) {
      console.error('Failed to sync Google token to DB config:', err);
    }
  };

  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    // Check existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        setActiveScreen('dashboard');
        ensureUserProfileExists(session.user.id).then(() => {
          loadTasksFromSupabase(session.user.id);
          loadUserProfile(session.user.id);
          if (session.provider_token) {
            syncGoogleTokenToDb(session.user.id, session.provider_token);
          }
        });
      } else {
        setActiveScreen('landing');
      }
    });

    // Listen to changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        setActiveScreen('dashboard');
        ensureUserProfileExists(session.user.id).then(() => {
          loadTasksFromSupabase(session.user.id);
          loadUserProfile(session.user.id);
          if (session.provider_token) {
            syncGoogleTokenToDb(session.user.id, session.provider_token);
          }
        });
      } else {
        setActiveScreen('landing');
        setTasks([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSaveConfigs = async () => {
    saveApiKey(apiKeyInput);
    saveOllamaConfigs(aiProvider, ollamaUrlInput, ollamaModelInput);
    
    if (session && session.user && isSupabaseConfigured()) {
      const isTelegram = userPhoneInput.startsWith('telegram:');
      const normPhone = isTelegram ? userPhoneInput : userPhoneInput.trim().replace('whatsapp:', '');
      const activeChannel = isTelegram ? 'telegram' : 'whatsapp';
      
      try {
        const { error } = await supabase
          .from('users')
          .upsert({
            id: session.user.id,
            phone_number: normPhone || null,
            channel: activeChannel
          });
        
        if (error) throw error;
        alert('DeadlineOS configuration saved successfully!');
      } catch (err: any) {
        console.error('Failed to save profile changes to Supabase:', err);
        alert('Failed to save configuration: ' + err.message);
      }
    } else {
      localStorage.setItem('USER_PHONE_NUMBER', userPhoneInput);
      alert('DeadlineOS configuration saved locally!');
    }
  };

  const handleDisconnectTelegram = async () => {
    if (session && session.user && isSupabaseConfigured()) {
      try {
        const { error } = await supabase
          .from('users')
          .upsert({
            id: session.user.id,
            phone_number: null,
            channel: 'web'
          });
        
        if (error) throw error;
        setUserPhoneInput('');
        alert('Telegram account successfully disconnected!');
      } catch (err: any) {
        console.error('Failed to disconnect Telegram:', err);
        alert('Failed to disconnect Telegram: ' + err.message);
      }
    }
  };


  const renderSettingsView = () => {
    const isTelegramConnected = userPhoneInput.startsWith('telegram:');
    const telegramChatId = isTelegramConnected ? userPhoneInput.replace('telegram:', '') : '';

    return (
      <div className="space-y-8 pb-20 select-none animate-in fade-in duration-500 text-on-surface">
      <div>
        <h2 className="text-white text-3xl font-bold tracking-tight flex items-center gap-2">
          <Settings className="text-primary w-8 h-8" />
          <span>DeadlineOS Configurations</span>
        </h2>
        <p className="text-on-surface-variant text-sm mt-1">
          Calibrate intelligence parameters, configure API credentials, and link workspaces.
        </p>
      </div>
      <div className="glass-card rounded-2xl p-6 border border-outline/30 space-y-6">
        
        {/* AI Provider configuration dropdown */}
        <div className="flex flex-col gap-3 pb-4 border-b border-outline/20">
          <div>
            <h3 className="font-sans font-bold text-xs text-white">AI Model Provider</h3>
            <p className="text-[10px] text-on-surface-variant mt-0.5">Select your preferred AI engine for plan generation and analysis.</p>
          </div>
          <select
            value={aiProvider}
            onChange={(e) => setAiProvider(e.target.value as 'gemini' | 'ollama')}
            className="w-full max-w-md bg-surface-container border border-outline rounded-lg px-3 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="gemini">Google Gemini API (Cloud)</option>
            <option value="ollama">Ollama (Local / Offline)</option>
          </select>
        </div>

        {aiProvider === 'gemini' ? (
          /* Gemini API Key Configuration Section */
          <div className="flex flex-col gap-3 pb-4 border-b border-outline/20">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-sans font-bold text-xs text-white">Gemini API Configuration</h3>
                <p className="text-[10px] text-on-surface-variant mt-0.5">Enter your Gemini API key from Google AI Studio to power AI features.</p>
              </div>
            </div>
            <input
              type="password"
              placeholder="AIzaSy..."
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              className="w-full max-w-md bg-surface-container border border-outline rounded-lg px-3 py-2 text-xs text-white placeholder:text-on-surface-variant/30 focus:ring-1 focus:ring-primary outline-none"
            />
          </div>
        ) : (
          /* Ollama Settings Section */
          <>
            <div className="flex flex-col gap-3 pb-4 border-b border-outline/20">
              <div>
                <h3 className="font-sans font-bold text-xs text-white">Ollama Base URL</h3>
                <p className="text-[10px] text-on-surface-variant mt-0.5">The endpoint URL of your locally running Ollama instance.</p>
              </div>
              <input
                type="text"
                placeholder="e.g. http://localhost:11434"
                value={ollamaUrlInput}
                onChange={(e) => setOllamaUrlInput(e.target.value)}
                className="w-full max-w-md bg-surface-container border border-outline rounded-lg px-3 py-2 text-xs text-white placeholder:text-on-surface-variant/30 focus:ring-1 focus:ring-primary outline-none"
              />
            </div>
            <div className="flex flex-col gap-3 pb-4 border-b border-outline/20">
              <div>
                <h3 className="font-sans font-bold text-xs text-white">Ollama Model Name</h3>
                <p className="text-[10px] text-on-surface-variant mt-0.5">Model name download in Ollama (e.g., llama3, gemma2, mistral).</p>
              </div>
              <input
                type="text"
                placeholder="e.g. llama3"
                value={ollamaModelInput}
                onChange={(e) => setOllamaModelInput(e.target.value)}
                className="w-full max-w-md bg-surface-container border border-outline rounded-lg px-3 py-2 text-xs text-white placeholder:text-on-surface-variant/30 focus:ring-1 focus:ring-primary outline-none"
              />
            </div>
          </>
        )}

        {/* User WhatsApp Phone Configuration */}
        <div className="flex flex-col gap-3 pb-4 border-b border-outline/20">
          <div>
            <h3 className="font-sans font-bold text-xs text-white">WhatsApp Integration Channel</h3>
            <p className="text-[10px] text-on-surface-variant mt-0.5">Enter your phone number to synchronize targets created over WhatsApp.</p>
          </div>
          <input
            type="text"
            placeholder="e.g. +1234567890"
            value={isTelegramConnected ? '' : userPhoneInput}
            onChange={(e) => setUserPhoneInput(e.target.value)}
            disabled={isTelegramConnected}
            className="w-full max-w-md bg-surface-container border border-outline rounded-lg px-3 py-2 text-xs text-white placeholder:text-on-surface-variant/30 focus:ring-1 focus:ring-primary outline-none disabled:opacity-50"
          />
          {isTelegramConnected && (
            <p className="text-[10px] text-warning mt-0.5">WhatsApp integration is disabled because Telegram is connected. Disconnect Telegram below to use WhatsApp.</p>
          )}
        </div>

        {/* User Telegram Configuration */}
        <div className="flex flex-col gap-3 pb-4 border-b border-outline/20">
          <div>
            <h3 className="font-sans font-bold text-xs text-white">Telegram Integration Channel</h3>
            <p className="text-[10px] text-on-surface-variant mt-0.5">
              Link your Telegram account to plan deadlines, check today's tasks, audit risk schedules, and trigger panic mode commands directly.
            </p>
          </div>
          {isTelegramConnected ? (
            <div className="flex items-center justify-between bg-surface-container/50 border border-success/30 rounded-xl p-4 max-w-md">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                <div>
                  <div className="text-white text-xs font-bold">Connected to Telegram</div>
                  <div className="text-[10px] text-on-surface-variant">Chat ID: {telegramChatId}</div>
                </div>
              </div>
              <button
                onClick={handleDisconnectTelegram}
                className="bg-error/10 hover:bg-error/20 text-error text-[10px] px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer border border-error/30"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <a
                // @ts-ignore
                href={`https://t.me/${import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'deadlineos_bot'}?start=${session?.user?.id || ''}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 w-full max-w-md bg-[#0088cc] hover:brightness-110 text-white text-xs px-4 py-2.5 rounded-lg font-bold transition-all cursor-pointer shadow-lg shadow-[#0088cc]/20"
              >
                <span>Connect Telegram Bot</span>
              </a>
              <p className="text-[9px] text-on-surface-variant/70">
                Clicking the button will open Telegram. Start the bot to pair it with this dashboard session.
              </p>
            </div>
          )}
        </div>

        <div className="pt-2 flex justify-end">
          <button
            onClick={handleSaveConfigs}
            className="bg-primary text-on-primary hover:brightness-110 text-xs px-6 py-2.5 rounded-lg font-bold transition-all cursor-pointer shadow-lg shadow-primary/20"
          >
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
};

  // Selector for the right view block
  const renderActiveScreenContent = () => {
    switch (activeScreen) {
      case 'dashboard':
        return (
          <DashboardView
            onNavigate={(scr) => {
              if (scr === 'intelligence') {
                setActiveScreen('intelligence');
              }
            }}
            tasks={sortedTasks}
            setTasks={setTasks}
            activeSessionTaskId={activeSessionTaskId}
            setActiveSessionTaskId={setActiveSessionTaskId}
            sessionActive={sessionActive}
            setSessionActive={setSessionActive}
            sessionTime={sessionTime}
            setSessionTime={setSessionTime}
            onProcessTaskCommand={(prompt) => {
              setInitialPrompt(prompt);
              setActiveScreen('intelligence');
            }}
            session={session}
          />
        );
      case 'intelligence':
        return (
          <IntelligenceView
            tasks={sortedTasks}
            setTasks={setTasks}
            onNavigate={(scr) => setActiveScreen(scr)}
            initialPrompt={initialPrompt}
            setInitialPrompt={setInitialPrompt}
          />
        );
      case 'architect':
        return renderArchitectView();
      case 'focus':
        return (
          <FocusView
            tasks={sortedTasks}
            setTasks={setTasks}
            activeSessionTaskId={activeSessionTaskId}
            setActiveSessionTaskId={setActiveSessionTaskId}
            sessionActive={sessionActive}
            setSessionActive={setSessionActive}
            setSessionTime={setSessionTime}
          />
        );
      case 'analytics':
        return renderAnalyticsView();
      case 'habits':
        return renderHabitsView();
      case 'settings':
        return renderSettingsView();
      default:
        return null;
    }
  };

  // If active screen is Landing page or session is missing, show Landing page
  if (activeScreen === 'landing' || !session) {
    return <LandingView session={session} onEnterApp={() => setActiveScreen('dashboard')} />;
  }

  // Otherwise, standard App Shell
  return (
    <div className="bg-[#0A0A0A] min-h-screen text-on-surface font-sans relative">
      {/* Sidebar navigation */}
      <Sidebar
        activeScreen={activeScreen}
        onScreenChange={(screen) => setActiveScreen(screen)}
        session={session}
        onSignOut={async () => {
          await supabase.auth.signOut();
          setSession(null);
          setTasks([]);
          setActiveScreen('landing');
        }}
      />

      {/* Main app layout wrapper */}
      <div className="ml-64 flex flex-col min-h-screen relative bg-[#0A0A0A]">
        {/* Universal Top bar header */}
        <Header
          placeholder={
            activeScreen === 'intelligence'
              ? 'Type a command or plan a goal...'
              : 'Search tasks, intelligence, or files...'
          }
          onSearchFocus={() => setVoiceCommandPanelOpen(true)}
        />

        {/* Dynamic Canvas Container */}
        <main className="px-10 pt-8 flex-grow">
          {renderActiveScreenContent()}
        </main>
      </div>

      {/* Floating Action Voice Command Button */}
      {activeScreen !== 'landing' && (
        <button
          onClick={() => setVoiceCommandPanelOpen(true)}
          className="fixed bottom-10 right-10 w-14 h-14 bg-primary text-on-primary rounded-full shadow-2xl shadow-primary/30 flex items-center justify-center group active:scale-95 hover:scale-[1.03] transition-all z-40 cursor-pointer overflow-hidden"
          title="Start AI Voice Assistant"
        >
          <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
          <Mic className="w-6 h-6 text-on-primary shrink-0 animate-pulse" />
        </button>
      )}

      {/* Voice Command Panel */}
      <VoiceCommandPanel
        isOpen={voiceCommandPanelOpen}
        onClose={() => setVoiceCommandPanelOpen(false)}
        tasks={tasks}
        onCreateTask={handleVoiceCreateTask}
        onNavigate={handleVoiceNavigate}
        onPlanGoal={handleVoicePlanGoal}
      />

      {/* Create Task Modal Dialog */}
      {createTaskOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md glass-panel rounded-2xl overflow-hidden border border-outline/30 bg-surface-container-low/95 p-6 space-y-6 shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-outline/20 pb-3">
              <h3 className="font-sans font-bold text-sm text-white">Create High-Priority Deadline</h3>
              <button
                onClick={() => setCreateTaskOpen(false)}
                className="text-on-surface-variant hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateTaskSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="font-mono text-[9px] text-on-surface-variant uppercase block font-bold">
                  Task Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Write Database Seed Script"
                  className="w-full bg-surface-container border border-outline rounded-lg px-3 py-2 text-xs text-white placeholder:text-on-surface-variant/40 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="font-mono text-[9px] text-on-surface-variant uppercase block font-bold">
                    Project
                  </label>
                  <select
                    className="w-full bg-surface-container border border-outline rounded-lg px-3 py-2 text-xs text-white focus:ring-1 focus:ring-primary outline-none"
                    value={newTaskProject}
                    onChange={(e) => setNewTaskProject(e.target.value)}
                  >
                    <option value="Nexus Core">Nexus Core</option>
                    <option value="Internal Operations">Internal Operations</option>
                    <option value="Vision 2025">Vision 2025</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-mono text-[9px] text-on-surface-variant uppercase block font-bold">
                    Priority Status
                  </label>
                  <select
                    className="w-full bg-surface-container border border-outline rounded-lg px-3 py-2 text-xs text-white focus:ring-1 focus:ring-primary outline-none"
                    value={newTaskStatus}
                    onChange={(e) =>
                      setNewTaskStatus(e.target.value as 'critical' | 'normal' | 'deferred')
                    }
                  >
                    <option value="critical">Critical</option>
                    <option value="normal">Normal</option>
                    <option value="deferred">Deferred</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-mono text-[9px] text-on-surface-variant uppercase block font-bold">
                  Countdown Duration (Hours)
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  required
                  className="w-full bg-surface-container border border-outline rounded-lg px-3 py-2 text-xs text-white focus:ring-1 focus:ring-primary outline-none"
                  value={newTaskHours}
                  onChange={(e) => setNewTaskHours(parseInt(e.target.value))}
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setCreateTaskOpen(false)}
                  className="flex-1 py-2.5 border border-outline rounded-lg text-xs text-on-surface font-semibold hover:bg-surface-container transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-primary text-on-primary font-sans font-bold text-xs rounded-lg hover:brightness-110 active:scale-95 transition-all cursor-pointer"
                >
                  Create Target
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
