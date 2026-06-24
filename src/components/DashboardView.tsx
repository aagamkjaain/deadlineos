import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  AlertTriangle,
  CalendarDays,
  RefreshCw,
  Mic,
  MicOff
} from 'lucide-react';
import { TaskType } from '../types';
import { generateScopeReduction, getApiKey } from '../services/gemini';

interface DashboardViewProps {
  onNavigate: (screen: 'intelligence') => void;
  tasks: TaskType[];
  setTasks: React.Dispatch<React.SetStateAction<TaskType[]>>;
  activeSessionTaskId: string | null;
  setActiveSessionTaskId: (id: string | null) => void;
  sessionActive: boolean;
  setSessionActive: (active: boolean) => void;
  sessionTime: number;
  setSessionTime: (time: number | ((prev: number) => number)) => void;
  onProcessTaskCommand?: (prompt: string) => void;
  session?: any;
}

export default function DashboardView({
  onNavigate,
  tasks,
  setTasks,
  activeSessionTaskId,
  setActiveSessionTaskId,
  sessionActive,
  setSessionActive,
  sessionTime,
  setSessionTime,
  onProcessTaskCommand,
  session
}: DashboardViewProps) {
  // Anti-procrastination states
  const [scopeTrimming, setScopeTrimming] = useState(false);
  const [trimJustification, setTrimJustification] = useState<string | null>(null);

  const [googleEvents, setGoogleEvents] = useState<any[]>([]);
  const [calendarInput, setCalendarInput] = useState('');
  const [isListening, setIsListening] = useState(false);

  // Month details calculation
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const firstDayIndex = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();

  const calendarDays = [];
  for (let i = 0; i < firstDayIndex; i++) {
    calendarDays.push(null);
  }
  for (let d = 1; d <= totalDays; d++) {
    calendarDays.push(new Date(year, month, d));
  }

  // Fetch Google Calendar events (mock or real OAuth API)
  useEffect(() => {
    const token = session?.provider_token;
    if (token) {
      const timeMin = new Date(year, month, 1).toISOString();
      const timeMax = new Date(year, month + 1, 0).toISOString();
      fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => {
          if (data.items) {
            setGoogleEvents(data.items);
          }
        })
        .catch(err => {
          console.error('Google Calendar events fetch failed:', err);
          setGoogleEvents([]);
        });
    } else {
      setGoogleEvents([]);
    }
  }, [session]);

  const tasksDueThisDay = (d: Date) => {
    return tasks.filter(task => {
      if (!task.createdAt) return false;
      const createdDate = new Date(task.createdAt);
      const dueDate = new Date(createdDate.getTime() + task.countdownSeconds * 1000);
      return (
        dueDate.getDate() === d.getDate() &&
        dueDate.getMonth() === d.getMonth() &&
        dueDate.getFullYear() === d.getFullYear()
      );
    });
  };

  const googleEventsThisDay = (d: Date) => {
    return googleEvents.filter(evt => {
      const dateStr = evt.start?.dateTime || evt.start?.date;
      if (!dateStr) return false;
      const evtDate = new Date(dateStr);
      return (
        evtDate.getDate() === d.getDate() &&
        evtDate.getMonth() === d.getMonth() &&
        evtDate.getFullYear() === d.getFullYear()
      );
    });
  };

  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const audioChunksRef = React.useRef<Blob[]>([]);

  const handleVoiceInput = async () => {
    if (isListening) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      let mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/ogg';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/mp4';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = '';
      }

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          try {
            const base64Data = (reader.result as string).split(',')[1];
            const actualMimeType = recorder.mimeType.split(';')[0] || 'audio/webm';
            
            const { transcribeAudio } = await import('../services/gemini');
            const transcription = await transcribeAudio(base64Data, actualMimeType);
            if (transcription) {
              setCalendarInput(transcription);
            }
          } catch (err: any) {
            console.error('Transcription failed:', err);
            alert('Failed to transcribe audio. Error: ' + err.message);
          }
        };

        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setIsListening(true);
    } catch (err) {
      console.error('Microphone access failed:', err);
      alert('Could not access microphone. Please check permissions.');
    }
  };

  const handleProcessCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!calendarInput.trim()) return;
    if (onProcessTaskCommand) {
      onProcessTaskCommand(calendarInput);
    }
  };

  const formatSessionTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const formatCountdown = (secs: number) => {
    const h = Math.floor(secs / 3600).toString().padStart(2, '0');
    const m = Math.floor((secs % 3600) / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  // Find highly postponed tasks (Feature 5: Anti-procrastination)
  const highlyPostponedTask = tasks.find(t => (t.postponedCount || 0) >= 3);
  const hasApiKey = !!getApiKey();

  const handlePostponeTask = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // prevent starting focus session

    // Optimistic UI update
    setTasks(prevTasks => prevTasks.map(t => {
      if (t.id === taskId) {
        return {
          ...t,
          postponedCount: (t.postponedCount || 0) + 1,
          countdownSeconds: t.countdownSeconds + 3600 // Delay countdown by 1 hour
        };
      }
      return t;
    }));

    try {
      const { postponeTask, isSupabaseConfigured } = await import('../services/supabase');
      if (isSupabaseConfigured()) {
        await postponeTask(taskId);
      }
    } catch (err) {
      console.error('Failed to sync postponed task state to Supabase:', err);
    }
  };

  const handleReduceScope = async (taskId: string) => {
    const targetTask = tasks.find(t => t.id === taskId);
    if (!targetTask) return;

    setScopeTrimming(true);
    setTrimJustification(null);
    try {
      const subtaskStrings = targetTask.subtasks?.map(st => st.text) || [];
      const result = await generateScopeReduction(targetTask.title, subtaskStrings);

      const trimmedSubtasks = result.subtasks.map(text => ({ text, completed: false }));

      const { supabase, isSupabaseConfigured } = await import('../services/supabase');
      if (isSupabaseConfigured()) {
        await supabase
          .from('tasks')
          .update({
            subtasks: trimmedSubtasks,
            progress: 0,
            postponed_count: 0
          })
          .eq('id', taskId);
      }

      setTasks(prevTasks => prevTasks.map(t => {
        if (t.id === taskId) {
          return {
            ...t,
            subtasks: trimmedSubtasks,
            postponedCount: 0, // Reset postponement count
            progress: 0
          };
        }
        return t;
      }));
      setTrimJustification(result.justification);
    } catch (err: any) {
      alert(err.message || 'Error occurred during scope trim generation.');
    } finally {
      setScopeTrimming(false);
    }
  };

  // Select the focus task: either the active session task, or the highest priority task (first sorted item)
  const focusTask = tasks.find(t => t.id === activeSessionTaskId) || tasks[0];

  const handleStartSession = () => {
    if (!focusTask) return;
    if (sessionActive) {
      setSessionActive(false);
    } else {
      setActiveSessionTaskId(focusTask.id);
      setSessionTime(0);
      setSessionActive(true);
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };
  const userName = session?.user?.user_metadata?.full_name || session?.user?.email?.split('@')[0] || 'User';
  const criticalTasksCount = tasks.filter(t => t.status === 'critical').length;

  return (
    <div className="space-y-10 pb-20 select-none animate-in fade-in duration-500">

      {/* Dynamic Session HUD banner when active */}
      {sessionActive && focusTask && (
        <div className="bg-primary/10 border-y border-primary/30 py-3 px-10 -mx-10 flex justify-between items-center animate-in slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-secondary animate-pulse"></span>
            <span className="font-mono text-xs font-semibold text-primary uppercase tracking-wider">
              Active Focus Session: {focusTask.title}
            </span>
          </div>
          <div className="flex items-center gap-6">
            <span className="font-mono text-sm font-bold text-white">
              Elapsed: {formatSessionTime(sessionTime)}
            </span>
            <button
              onClick={() => {
                setSessionActive(false);
                setSessionTime(0);
              }}
              className="text-xs bg-error/20 hover:bg-error/30 text-error font-semibold px-3 py-1 rounded transition-colors cursor-pointer"
            >
              Stop Session
            </button>
          </div>
        </div>
      )}

      {/* Anti-procrastination Overlay warning (Feature 5) */}
      {highlyPostponedTask && (
        <div className="bg-error/10 border border-error/30 p-6 rounded-2xl animate-in slide-in-from-top-4 duration-300 space-y-4">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-error/20 rounded-xl flex items-center justify-center border border-error/30 shrink-0">
              <AlertTriangle className="text-error w-5 h-5 animate-bounce" />
            </div>
            <div className="flex-1 space-y-1">
              <h4 className="font-sans text-sm font-bold text-white uppercase tracking-wider">
                Procrastination Warning Detect
              </h4>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                You have postponed "<span className="text-error font-semibold">{highlyPostponedTask.title}</span>" {highlyPostponedTask.postponedCount} times. At your current pace, you risk missing the target milestone.
              </p>
            </div>

            <button
              onClick={() => handleReduceScope(highlyPostponedTask.id)}
              disabled={!hasApiKey || scopeTrimming}
              className="py-2.5 px-5 bg-error hover:brightness-110 text-on-error font-sans font-bold text-xs rounded-xl shadow-lg shadow-error/20 active:scale-95 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-40"
            >
              {scopeTrimming ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Trimming Scope...</span>
                </>
              ) : (
                <span>Auto-Reduce Scope (AI)</span>
              )}
            </button>
          </div>

          {trimJustification && (
            <div className="bg-surface-container/40 p-4 border border-outline/30 rounded-xl text-xs text-secondary font-mono italic animate-in fade-in duration-300">
              💡 Coach: "{trimJustification}"
            </div>
          )}
        </div>
      )}

      {/* Greeting Section */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        <div className="lg:col-span-8">
          <h2 className="font-sans text-white text-3xl font-bold tracking-tight mb-3">
            {getGreeting()}, {userName}.
          </h2>
          <p className="text-on-surface-variant text-base leading-relaxed max-w-2xl">
            {criticalTasksCount > 0 ? (
              <>
                You have{' '}
                <span className="text-error font-bold">
                  {criticalTasksCount} high-priority {criticalTasksCount === 1 ? 'deadline' : 'deadlines'}
                </span>{' '}
                pending. DeadlineOS has prioritized your active work blocks dynamically.
              </>
            ) : (
              'You have no high-priority deadlines pending. Keep up the good work!'
            )}
          </p>
        </div>
      </section>

      {/* Main Bento Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Google Calendar */}
        <div className="lg:col-span-8 flex flex-col gap-8">

          {/* Google Calendar MONTHLY App Grid View */}
          <div className="glass-card rounded-2xl border border-outline/30 p-6 space-y-6 bg-surface-container/20">
            <div className="flex justify-between items-center pb-2 border-b border-outline/20">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-secondary animate-pulse"></span>
                <h3 className="font-sans text-lg font-bold text-white tracking-tight">
                  Google Calendar • <span className="text-primary">{monthNames[month]} {year}</span>
                </h3>
              </div>
              <span className="font-mono text-[9px] text-on-surface-variant bg-surface-container border border-outline/50 px-2 py-0.5 rounded uppercase tracking-wider">
                {session?.user ? 'SYNCED: ' + session.user.email : 'DEMO GOOGLE SYNC'}
              </span>
            </div>

            <div className="grid grid-cols-7 gap-1.5 text-center">
              {/* Week Headers */}
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(h => (
                <div key={h} className="text-[10px] font-mono font-bold text-on-surface-variant py-1 uppercase">{h}</div>
              ))}
              {/* Calendar Days */}
              {calendarDays.map((day, idx) => {
                if (!day) return <div key={`empty-${idx}`} className="bg-[#0A0A0A]/20 min-h-[75px] border border-outline/5 rounded-lg opacity-20"></div>;

                const isToday = day.getDate() === now.getDate() && day.getMonth() === now.getMonth();
                const tasksDue = tasksDueThisDay(day);
                const gEvents = googleEventsThisDay(day);

                return (
                  <div
                    key={day.toISOString()}
                    className={`min-h-[75px] p-1.5 border rounded-lg flex flex-col justify-between transition-all hover:bg-surface-container-high/30 select-none ${isToday
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/20 shadow-lg'
                      : 'border-outline/10 bg-surface-container-low/10'
                      }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className={`font-mono text-[10px] font-bold ${isToday ? 'text-primary' : 'text-on-surface-variant'}`}>
                        {day.getDate()}
                      </span>
                      {isToday && <span className="w-1.5 h-1.5 bg-primary rounded-full animate-ping"></span>}
                    </div>
                    <div className="mt-1 space-y-1 overflow-y-auto no-scrollbar max-h-[48px]">
                      {tasksDue.map(t => (
                        <div
                          key={t.id}
                          className="px-1 py-0.5 bg-primary-container/20 border border-primary/20 text-[8px] text-primary rounded truncate text-left font-medium"
                          title={t.title}
                        >
                          🎯 {t.title}
                        </div>
                      ))}
                      {gEvents.map(e => (
                        <div
                          key={e.id}
                          className="px-1 py-0.5 bg-secondary-container/20 border border-secondary/20 text-[8px] text-secondary rounded truncate text-left font-medium"
                          title={e.summary}
                        >
                          📅 {e.summary}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* AI Calendar Assistant typing and speech input block */}
            <form onSubmit={handleProcessCommand} className="pt-4 border-t border-outline/25 space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <h4 className="font-mono text-[9px] text-primary font-bold uppercase tracking-wider">
                  AI Narration & Task Assistant
                </h4>
              </div>

              <div className="relative">
                <textarea
                  placeholder="Speak or type a new goal... (e.g. 'Plan my compiler project due in 3 days')"
                  value={calendarInput}
                  onChange={(e) => setCalendarInput(e.target.value)}
                  className="w-full bg-surface-container border border-outline rounded-xl px-4 py-3 text-xs text-white placeholder:text-on-surface-variant/30 focus:ring-1 focus:ring-primary outline-none resize-none h-16 pr-12 font-sans"
                />
                <button
                  type="button"
                  onClick={handleVoiceInput}
                  className={`absolute right-3 bottom-3 p-2 rounded-lg border transition-all ${isListening
                    ? 'bg-error/20 border-error/40 text-error animate-pulse'
                    : 'bg-surface-container-low border-outline text-on-surface-variant hover:text-white hover:bg-surface-container-high'
                    } cursor-pointer`}
                  title={isListening ? "Stop Narration" : "Narrate Task"}
                >
                  {isListening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                </button>
              </div>

              <div className="flex justify-between items-center text-[10px] text-on-surface-variant font-mono">
                <span>
                  {isListening ? '🎙️ Narration mode active. Speak clearly...' : 'Transcribe voice or text, then click Process'}
                </span>
                <button
                  type="submit"
                  disabled={!calendarInput.trim()}
                  className="px-5 py-2 bg-primary text-on-primary font-sans font-bold text-xs rounded-xl shadow-lg hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-40"
                >
                  Process Command
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Right Column: Sidebar (Upcoming Deadlines) */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          <div className="flex items-center justify-between px-1">
            <h3 className="font-mono text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
              Task Priority Queue
            </h3>
            <button
              onClick={() => onNavigate('intelligence')}
              className="text-primary font-mono text-[10px] font-semibold hover:underline flex items-center gap-1 cursor-pointer bg-transparent border-none"
            >
              <CalendarDays className="w-3 h-3" />
              <span>Architect Plan</span>
            </button>
          </div>

          {/* List of Countdown cards */}
          <div className="space-y-4">
            {tasks.map((task) => {
              const countdownStr = formatCountdown(task.countdownSeconds);
              const isCritical = task.status === 'critical';
              const isNormal = task.status === 'normal';

              return (
                <div
                  key={task.id}
                  onClick={() => {
                    setActiveSessionTaskId(task.id);
                    setSessionTime(0);
                    setSessionActive(true);
                  }}
                  className={`glass-card rounded-xl p-4 hover:bg-surface-container-high transition-all cursor-pointer group flex flex-col justify-between border ${activeSessionTaskId === task.id ? 'border-primary animate-pulse-subtle' : 'border-outline/30'
                    }`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <span
                      className={`px-2 py-0.5 rounded font-mono text-[9px] font-bold tracking-wider ${isCritical
                        ? 'bg-error-container/20 text-error border border-error/10'
                        : isNormal
                          ? 'bg-primary-container/20 text-primary border border-primary/10'
                          : 'bg-secondary-container/20 text-secondary border border-secondary/10'
                        }`}
                    >
                      {task.status.toUpperCase()}
                    </span>
                    <div className="text-right">
                      <span className="font-mono text-[8px] text-on-surface-variant block tracking-wider">
                        DEADLINE
                      </span>
                      <span
                        className={`font-mono text-xs font-bold tabular-nums ${isCritical ? 'text-error' : 'text-white'
                          }`}
                      >
                        {countdownStr}
                      </span>
                    </div>
                  </div>
                  <h4 className="font-sans font-bold text-xs text-white group-hover:text-primary transition-colors">
                    {task.title}
                  </h4>

                  {/* Task details containing postponement warning and reschedule/postpone action */}
                  <div className="flex justify-between items-center mt-3 pt-2 border-t border-outline/10">
                    <p className="font-mono text-[8px] text-on-surface-variant/70">
                      Postponed: <span className={task.postponedCount && task.postponedCount >= 3 ? 'text-error font-bold font-sans' : 'text-white font-mono'}>{task.postponedCount || 0}</span>
                    </p>
                    <button
                      onClick={(e) => handlePostponeTask(task.id, e)}
                      className="px-2 py-1 bg-surface-container hover:bg-surface-container-high border border-outline/50 hover:text-primary font-mono text-[8px] rounded uppercase font-bold transition-all cursor-pointer"
                      title="Delay task by 1 hour"
                    >
                      Postpone +1h
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}