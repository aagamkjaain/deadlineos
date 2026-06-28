import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  AlertTriangle,
  CalendarDays,
  RefreshCw,
  Mic,
  MicOff,
  X,
  Trash2
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

  // Date-click task addition states
  const [clickedDate, setClickedDate] = useState<Date | null>(null);
  const [clickedDateModalOpen, setClickedDateModalOpen] = useState(false);
  const [clickedTaskTitle, setClickedTaskTitle] = useState('');
  const [clickedTaskProject, setClickedTaskProject] = useState('Nexus Core');
  const [clickedTaskStatus, setClickedTaskStatus] = useState<'critical' | 'normal' | 'deferred'>('normal');
  const [isSavingTask, setIsSavingTask] = useState(false);

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

  // Completion status calculation helper
  const getCompletionStatus = (task: TaskType) => {
    const progress = task.progress ?? 0;
    if (progress === 100) return 'completed';
    if (progress === 0) return 'not completed';
    return 'pending';
  };

  const handlePostponeTask = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // prevent starting focus session
    const targetTask = tasks.find(t => t.id === taskId);

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

    // Google Calendar Update on Postpone
    if (session?.provider_token && targetTask) {
      try {
        const queryUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?q=${encodeURIComponent(targetTask.title)}`;
        const response = await fetch(queryUrl, {
          headers: { Authorization: `Bearer ${session.provider_token}` }
        });
        if (response.ok) {
          const data = await response.json();
          const events = data.items || [];
          const matchingEvent = events.find((evt: any) => (evt.summary || '').includes(targetTask.title));
          if (matchingEvent && matchingEvent.id) {
            const oldStart = matchingEvent.start?.dateTime || matchingEvent.start?.date;
            const oldEnd = matchingEvent.end?.dateTime || matchingEvent.end?.date;
            if (oldStart && oldEnd) {
              const newStart = new Date(new Date(oldStart).getTime() + 3600 * 1000).toISOString();
              const newEnd = new Date(new Date(oldEnd).getTime() + 3600 * 1000).toISOString();
              
              const updateRes = await fetch(
                `https://www.googleapis.com/calendar/v3/calendars/primary/events/${matchingEvent.id}`,
                {
                  method: 'PATCH',
                  headers: {
                    Authorization: `Bearer ${session.provider_token}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    start: { dateTime: newStart },
                    end: { dateTime: newEnd }
                  })
                }
              );
              if (updateRes.ok) {
                console.log(`Successfully postponed Google Calendar event for task: ${targetTask.title}`);
              } else {
                console.error('Failed to update event time on Google Calendar:', await updateRes.text());
              }
            }
          }
        }
      } catch (googleErr) {
        console.error('Error updating Google Calendar event on postpone:', googleErr);
      }
    }
  };

  const handleRemoveTask = async (taskId: string, taskTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to remove the task "${taskTitle}"?`)) {
      return;
    }

    // 1. Delete from Supabase if configured
    const { supabase, isSupabaseConfigured } = await import('../services/supabase');
    if (session && isSupabaseConfigured()) {
      try {
        const { error } = await supabase.from('tasks').delete().eq('id', taskId);
        if (error) console.error('Failed to delete task from Supabase:', error);
      } catch (dbErr) {
        console.error('Failed to delete task from Supabase:', dbErr);
      }
    }

    // 2. Local state update
    setTasks(prev => prev.filter(t => t.id !== taskId));
    if (activeSessionTaskId === taskId) {
      setActiveSessionTaskId(null);
      setSessionActive(false);
      setSessionTime(0);
    }

    // 3. Remove/Delete from Google Calendar if provider_token is present
    if (session?.provider_token) {
      try {
        const queryUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?q=${encodeURIComponent(taskTitle)}`;
        const response = await fetch(queryUrl, {
          headers: {
            Authorization: `Bearer ${session.provider_token}`
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          const events = data.items || [];
          const matchingEvent = events.find((evt: any) => {
            const summary = evt.summary || '';
            return summary.includes(taskTitle);
          });
          
          if (matchingEvent && matchingEvent.id) {
            const deleteRes = await fetch(
              `https://www.googleapis.com/calendar/v3/calendars/primary/events/${matchingEvent.id}`,
              {
                method: 'DELETE',
                headers: {
                  Authorization: `Bearer ${session.provider_token}`
                }
              }
            );
            if (deleteRes.ok) {
              console.log(`Successfully deleted Google Calendar event for task: ${taskTitle}`);
            } else {
              console.error('Failed to delete event from Google Calendar:', await deleteRes.text());
            }
          }
        }
      } catch (googleErr) {
        console.error('Error during Google Calendar event deletion:', googleErr);
      }
    }
  };

  const handleUpdateCompletionStatus = async (taskId: string, newStatus: 'completed' | 'pending' | 'not completed') => {
    const targetTask = tasks.find(t => t.id === taskId);
    if (!targetTask) return;

    let newProgress = 0;
    if (newStatus === 'completed') {
      newProgress = 100;
    } else if (newStatus === 'pending') {
      newProgress = 50;
    } else {
      newProgress = 0;
    }

    const newSubtasks = targetTask.subtasks?.map(st => ({
      ...st,
      completed: newStatus === 'completed' ? true : newStatus === 'not completed' ? false : st.completed
    })) || [];

    // Local state update
    setTasks(prev => prev.map(t => {
      if (t.id === taskId) {
        return {
          ...t,
          progress: newProgress,
          subtasks: newSubtasks
        };
      }
      return t;
    }));

    // Sync to Supabase if configured
    try {
      const { updateTaskSubtasks, isSupabaseConfigured } = await import('../services/supabase');
      if (isSupabaseConfigured()) {
        await updateTaskSubtasks(taskId, newSubtasks);
        const { supabase } = await import('../services/supabase');
        await supabase
          .from('tasks')
          .update({ progress: newProgress })
          .eq('id', taskId);
      }
    } catch (err) {
      console.error('Failed to sync completion status to Supabase:', err);
    }

    // Google Calendar Update
    if (session?.provider_token) {
      try {
        const queryUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?q=${encodeURIComponent(targetTask.title)}`;
        const response = await fetch(queryUrl, {
          headers: { Authorization: `Bearer ${session.provider_token}` }
        });
        if (response.ok) {
          const data = await response.json();
          const events = data.items || [];
          const matchingEvent = events.find((evt: any) => (evt.summary || '').includes(targetTask.title));
          if (matchingEvent && matchingEvent.id) {
            const updateRes = await fetch(
              `https://www.googleapis.com/calendar/v3/calendars/primary/events/${matchingEvent.id}`,
              {
                method: 'PATCH',
                headers: {
                  Authorization: `Bearer ${session.provider_token}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  description: `Project: ${targetTask.project}\nPriority: ${targetTask.status.toUpperCase()}\nStatus: ${newStatus.toUpperCase()}`
                })
              }
            );
            if (updateRes.ok) {
              console.log(`Successfully updated Google Calendar status for task: ${targetTask.title}`);
            }
          }
        }
      } catch (googleErr) {
        console.error('Error updating Google Calendar event status:', googleErr);
      }
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

  const handleDayClick = (day: Date) => {
    setClickedDate(day);
    setClickedTaskTitle('');
    setClickedTaskProject('Nexus Core');
    setClickedTaskStatus('normal');
    setClickedDateModalOpen(true);
  };

  const handleClickedDateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clickedDate || !clickedTaskTitle.trim()) return;

    setIsSavingTask(true);
    let dbTaskId = `t_${Date.now()}`;
    const defaultSubtasks = [
      'Initial design and outline requirements',
      'Core feature development and implementation',
      'Final verification and testing loop'
    ];

    // Calculate countdownSeconds based on clickedDate
    const targetDate = new Date(clickedDate);
    // Set due time to end of clicked day (23:59:59)
    targetDate.setHours(23, 59, 59, 999);
    const now = new Date();
    let countdownSeconds = Math.round((targetDate.getTime() - now.getTime()) / 1000);
    if (countdownSeconds < 0) {
      countdownSeconds = 3 * 3600; // fallback to 3 hours
    }

    try {
      const { createGoal, isSupabaseConfigured } = await import('../services/supabase');
      if (session && session.user && isSupabaseConfigured()) {
        try {
          const dbTask = await createGoal(
            session.user.id,
            clickedTaskTitle,
            clickedTaskProject,
            3, // estimatedHours (default)
            5, // difficulty (default)
            clickedTaskStatus === 'critical' ? 8 : clickedTaskStatus === 'normal' ? 6 : 4, // impact
            defaultSubtasks,
            countdownSeconds
          );
          dbTaskId = dbTask.id;
        } catch (dbErr) {
          console.error('Failed to save clicked day task to Supabase:', dbErr);
        }
      }

      // Automatically create Google Calendar event if provider_token is present
      if (session?.provider_token) {
        const startDateTime = new Date(targetDate.getTime() - 3600 * 1000).toISOString(); // 1 hour before end of day
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
                summary: `🎯 DeadlineOS: ${clickedTaskTitle}`,
                description: `Project: ${clickedTaskProject}\nPriority: ${clickedTaskStatus.toUpperCase()}`,
                start: { dateTime: startDateTime },
                end: { dateTime: endDateTime }
              })
            }
          );
          if (!res.ok) {
            console.error('Google Calendar event creation failed:', await res.text());
          } else {
            console.log('Successfully created Google Calendar event from date click!');
          }
        } catch (googleErr) {
          console.error('Failed to sync to Google Calendar from date click:', googleErr);
        }
      }
    } catch (err) {
      console.error('Failed to create task on date click:', err);
    } finally {
      setIsSavingTask(false);
      setClickedDateModalOpen(false);
    }

    const newTask: TaskType = {
      id: dbTaskId,
      title: clickedTaskTitle,
      project: clickedTaskProject,
      status: clickedTaskStatus,
      countdownSeconds,
      difficulty: 5,
      impact: clickedTaskStatus === 'critical' ? 8 : clickedTaskStatus === 'normal' ? 6 : 4,
      postponedCount: 0,
      subtasks: defaultSubtasks.map(text => ({ text, completed: false })),
      createdAt: new Date().toISOString()
    };

    setTasks(prev => [newTask, ...prev]);
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
                    onClick={() => handleDayClick(day)}
                    className={`min-h-[75px] p-1.5 border rounded-lg flex flex-col justify-between transition-all hover:bg-surface-container-high/30 select-none cursor-pointer ${isToday
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
                    <div className="flex flex-col gap-1.5">
                      <span
                        className={`px-2 py-0.5 rounded font-mono text-[9px] font-bold tracking-wider w-max ${isCritical
                          ? 'bg-error-container/20 text-error border border-error/10'
                          : isNormal
                            ? 'bg-primary-container/20 text-primary border border-primary/10'
                            : 'bg-secondary-container/20 text-secondary border border-secondary/10'
                          }`}
                      >
                        {task.status.toUpperCase()}
                      </span>
                      <select
                        value={getCompletionStatus(task)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => handleUpdateCompletionStatus(task.id, e.target.value as any)}
                        className={`px-2 py-0.5 rounded font-mono text-[9px] font-bold tracking-wider cursor-pointer outline-none border bg-transparent ${
                          getCompletionStatus(task) === 'completed'
                            ? 'bg-secondary-container/20 text-secondary border-secondary/20'
                            : getCompletionStatus(task) === 'pending'
                              ? 'bg-tertiary-container/20 text-tertiary border-tertiary/20'
                              : 'bg-surface-container-high/40 text-on-surface-variant border-outline/20'
                        }`}
                      >
                        <option value="not completed" className="bg-surface-container text-white">NOT COMPLETED</option>
                        <option value="pending" className="bg-surface-container text-white">PENDING</option>
                        <option value="completed" className="bg-surface-container text-white">COMPLETED</option>
                      </select>
                    </div>
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
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => handlePostponeTask(task.id, e)}
                        className="px-2 py-1 bg-surface-container hover:bg-surface-container-high border border-outline/50 hover:text-primary font-mono text-[8px] rounded uppercase font-bold transition-all cursor-pointer"
                        title="Delay task by 1 hour"
                      >
                        Postpone +1h
                      </button>
                      <button
                        onClick={(e) => handleRemoveTask(task.id, task.title, e)}
                        className="p-1 text-on-surface-variant hover:text-error hover:bg-error/10 border border-transparent hover:border-error/20 rounded transition-all cursor-pointer flex items-center justify-center"
                        title="Remove task from queue"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {/* Create Task Modal for Clicked Date */}
        {clickedDateModalOpen && clickedDate && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-md glass-panel rounded-2xl overflow-hidden border border-outline/30 bg-surface-container-low/95 p-6 space-y-6 shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
              <div className="flex justify-between items-center border-b border-outline/20 pb-3">
                <div className="space-y-1">
                  <h3 className="font-sans font-bold text-sm text-white">Create Target Deadline</h3>
                  <p className="font-mono text-[9px] text-primary font-bold uppercase tracking-wider">
                    For {clickedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                <button
                  onClick={() => setClickedDateModalOpen(false)}
                  className="text-on-surface-variant hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleClickedDateSubmit} className="space-y-4">
                <div className="space-y-1">
                  <label className="font-mono text-[9px] text-on-surface-variant uppercase block font-bold">
                    Task Title
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Write Database Seed Script"
                    className="w-full bg-surface-container border border-outline rounded-lg px-3 py-2 text-xs text-white placeholder:text-on-surface-variant/40 focus:ring-1 focus:ring-primary focus:border-primary outline-none font-sans"
                    value={clickedTaskTitle}
                    onChange={(e) => setClickedTaskTitle(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="font-mono text-[9px] text-on-surface-variant uppercase block font-bold">
                      Project
                    </label>
                    <select
                      className="w-full bg-surface-container border border-outline rounded-lg px-3 py-2 text-xs text-white focus:ring-1 focus:ring-primary outline-none"
                      value={clickedTaskProject}
                      onChange={(e) => setClickedTaskProject(e.target.value)}
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
                      value={clickedTaskStatus}
                      onChange={(e) =>
                        setClickedTaskStatus(e.target.value as 'critical' | 'normal' | 'deferred')
                      }
                    >
                      <option value="critical">Critical</option>
                      <option value="normal">Normal</option>
                      <option value="deferred">Deferred</option>
                    </select>
                  </div>
                </div>

                <div className="pt-2">
                  <span className="font-mono text-[8px] text-on-surface-variant/60 block uppercase tracking-wider">
                    Google Calendar &amp; DB Connection
                  </span>
                  <p className="text-[10px] text-on-surface-variant leading-normal mt-0.5">
                    This task will automatically save to Supabase and schedule an event on your Google Calendar.
                  </p>
                </div>

                <div className="pt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setClickedDateModalOpen(false)}
                    className="flex-1 py-2.5 border border-outline rounded-lg text-xs text-on-surface font-semibold hover:bg-surface-container transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingTask}
                    className="flex-1 py-2.5 bg-primary text-on-primary font-sans font-bold text-xs rounded-lg hover:brightness-110 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    {isSavingTask ? 'Saving...' : 'Create Target'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}