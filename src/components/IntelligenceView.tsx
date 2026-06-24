import React, { useState, useEffect } from 'react';
import {
  Terminal,
  Sparkles,
  BookOpen,
  HelpCircle,
  CheckCircle,
  Circle,
  CornerDownLeft,
  CalendarCheck2,
  AlertTriangle,
  Mic,
  MicOff
} from 'lucide-react';
import { TaskType, ScreenType, TimelineItem } from '../types';
import { generateTaskPlan, getApiKey, GeneratedPlan, getVoicePlanningResponse } from '../services/gemini';

interface IntelligenceViewProps {
  tasks: TaskType[];
  setTasks: React.Dispatch<React.SetStateAction<TaskType[]>>;
  onNavigate: (screen: ScreenType) => void;
  initialPrompt?: string;
  setInitialPrompt?: (prompt: string) => void;
}

export default function IntelligenceView({ 
  tasks, 
  setTasks, 
  onNavigate,
  initialPrompt,
  setInitialPrompt
}: IntelligenceViewProps) {
  const [inputValue, setInputValue] = useState('Plan my AWS exam');
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState(false);
  
  // Voice Assistant States
  const [isListening, setIsListening] = useState(false);
  const [voiceFeedback, setVoiceFeedback] = useState<string | null>(null);
  
  const [generatedPlan, setGeneratedPlan] = useState<GeneratedPlan | null>(null);

  const hasApiKey = !!getApiKey();

  useEffect(() => {
    if (initialPrompt && setInitialPrompt) {
      setInputValue(initialPrompt);
      setInitialPrompt(''); // Reset initial prompt in parent
      
      const autoGenerate = async () => {
        setIsGenerating(true);
        setErrorMessage(null);
        try {
          const plan = await generateTaskPlan(initialPrompt);
          setGeneratedPlan(plan);
        } catch (err: any) {
          setErrorMessage(err.message || 'An error occurred while generating the plan.');
        } finally {
          setIsGenerating(false);
        }
      };
      autoGenerate();
    }
  }, [initialPrompt, setInitialPrompt]);

  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const audioChunksRef = React.useRef<Blob[]>([]);

  // Trigger speech recognition via Gemini (Feature 6)
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
        setVoiceFeedback('Transcribing your voice command...');
        const audioBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          try {
            const base64Data = (reader.result as string).split(',')[1];
            const actualMimeType = recorder.mimeType.split(';')[0] || 'audio/webm';
            
            const { transcribeAudio } = await import('../services/gemini');
            const speechToText = await transcribeAudio(base64Data, actualMimeType);
            
            if (!speechToText) {
              setVoiceFeedback('No speech detected. Please try again.');
              return;
            }

            setInputValue(speechToText);
            setVoiceFeedback(`Processing: "${speechToText}"...`);
            
            // Run AI planning process
            setIsGenerating(true);
            setErrorMessage(null);
            try {
              const plan = await generateTaskPlan(speechToText);
              setGeneratedPlan(plan);
              
              // Speak feedback back to user using Gemini TTS
              const spokenResponse = await getVoicePlanningResponse(`Generate a spoken confirmation response for plan: ${plan.goal}`);
              setVoiceFeedback(spokenResponse);
              speakResponseText(spokenResponse);
            } catch (err: any) {
              setErrorMessage(err.message || 'Error occurred during voice task generation.');
            } finally {
              setIsGenerating(false);
            }
          } catch (err: any) {
            console.error('Transcription failed:', err);
            setVoiceFeedback('Transcription failed. Please try again.');
          }
        };

        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setIsListening(true);
      setVoiceFeedback('Listening to your planning voice commands...');
    } catch (err) {
      console.error('Microphone access failed:', err);
      setVoiceFeedback('Voice error. Please check permissions.');
    }
  };

  const speakResponseText = async (text: string) => {
    try {
      const { generateSpeech, playAudio } = await import('../services/gemini');
      const audio = await generateSpeech(text);
      await playAudio(audio.base64Data, audio.mimeType);
    } catch (err) {
      console.error('Gemini TTS playback failed:', err);
    }
  };

  // Submit search trigger
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    setIsGenerating(true);
    setErrorMessage(null);
    try {
      const plan = await generateTaskPlan(inputValue);
      setGeneratedPlan(plan);
    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred while generating the plan.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle suggestion pills click
  const handleSuggestionClick = async (command: string) => {
    setInputValue(command);
    setIsGenerating(true);
    setErrorMessage(null);
    try {
      const plan = await generateTaskPlan(command);
      setGeneratedPlan(plan);
    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred while generating the plan.');
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleSubtask = (index: number) => {
    if (!generatedPlan) return;
    const updatedSubtasks = [...generatedPlan.subtasks];
    // We can simulate toggling it, but since it is generated state, let's keep it checkable in UI
    // By creating a custom state map for local checks, or editing generatedPlan itself.
    // Let's modify the generatedPlan subtasks completions list
    // Wait, the generatedPlan is just a blueprint until committed. Let's make it checkable:
    // To make it easy, we can just modify the generatedPlan array if needed, but committing adds it to tasks.
  };

  const handleCommitToCalendar = async () => {
    if (!generatedPlan) return;
    
    let dbTaskId = `t_${Date.now()}`;
    
    try {
      const { createGoal, isSupabaseConfigured, supabase } = await import('../services/supabase');
      if (isSupabaseConfigured()) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session && session.user) {
          // 1. Create task in Supabase
          const dbTask = await createGoal(
            session.user.id,
            generatedPlan.goal,
            'AI Architect',
            generatedPlan.estimated_hours,
            generatedPlan.difficulty,
            generatedPlan.impact,
            generatedPlan.subtasks
          );
          dbTaskId = dbTask.id;

          // 2. Schedule Event via Google Calendar API if Google Auth token is active
          if (session.provider_token) {
            const startDateTime = new Date().toISOString();
            const endDateTime = new Date(Date.now() + generatedPlan.estimated_hours * 3600 * 1000).toISOString();
            
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
                    summary: `🎯 DeadlineOS: ${generatedPlan.goal}`,
                    description: `AI-Generated Subtask Checklist:\n${generatedPlan.subtasks.map((st, i) => `${i + 1}. [ ] ${st}`).join('\n')}`,
                    start: { dateTime: startDateTime },
                    end: { dateTime: endDateTime }
                  })
                }
              );

              if (!res.ok) {
                console.error('Google Calendar event creation failed:', await res.text());
              } else {
                console.log('Successfully created Google Calendar event!');
              }
            } catch (googleErr) {
              console.error('Failed to post event to Google Calendar API:', googleErr);
            }
          }
        }
      }
    } catch (err) {
      console.error('Failed to create generated goal in Supabase:', err);
    }

    // Add to global tasks list
    const newTask: TaskType = {
      id: dbTaskId,
      title: generatedPlan.goal,
      project: 'AI Architect',
      status: generatedPlan.impact >= 8 ? 'critical' : 'normal',
      countdownSeconds: generatedPlan.estimated_hours * 3600,
      difficulty: generatedPlan.difficulty,
      impact: generatedPlan.impact,
      postponedCount: 0,
      subtasks: generatedPlan.subtasks.map(st => ({ text: st, completed: false })),
      createdAt: new Date().toISOString()
    };

    setTasks(prev => [newTask, ...prev]);

    setSuccessToast(true);
    setTimeout(() => {
      setSuccessToast(false);
      onNavigate('dashboard'); // Redirect to dashboard to see new task
    }, 2000);
  };

  // Generate timeline phases based on generated plan subtasks
  const getTimelineItems = (): TimelineItem[] => {
    if (!generatedPlan) return [];
    const count = generatedPlan.subtasks.length;
    return [
      {
        id: 'timeline-1',
        week: 'Phase 1: Deep Research',
        title: 'Core Concept Onboarding',
        description: generatedPlan.subtasks[0] || 'Understand fundamentals',
        status: 'current'
      },
      {
        id: 'timeline-2',
        week: 'Phase 2: Execution',
        title: 'Action & Integration Block',
        description: generatedPlan.subtasks[Math.floor(count / 2)] || 'Implement elements',
        status: 'upcoming'
      },
      {
        id: 'timeline-3',
        week: 'Phase 3: Validation',
        title: 'Final Triage & Launch',
        description: generatedPlan.subtasks[count - 1] || 'Verification checks',
        status: 'locked'
      }
    ];
  };

  const timelineItems = getTimelineItems();

  return (
    <div className="max-w-4xl mx-auto space-y-12 pb-20 select-none animate-in fade-in duration-500">
      
      {/* Toast Alert feedback */}
      {successToast && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-surface-container-high border-2 border-secondary text-secondary px-6 py-3 rounded-lg shadow-2xl flex items-center gap-3 animate-in fade-in zoom-in-95 z-50">
          <CheckCircle className="w-5 h-5 shrink-0 text-secondary" />
          <span className="font-sans font-bold text-xs tracking-wider uppercase">
            Plan committed to calendar successfully! Redirecting...
          </span>
        </div>
      )}

      {/* Central Command Heading */}
      <div className="text-center space-y-2 pt-8">
        <h1 className="font-sans text-white text-4xl font-bold tracking-tight">
          Focus on the <span className="shimmer-text">Execution</span>
        </h1>
        <p className="font-sans text-on-surface-variant/70 text-base">
          Your AI Chief of Staff is ready to architect your next milestone.
        </p>
      </div>

      {/* API Key Missing Warning Alert */}
      {!hasApiKey && (
        <div
          onClick={() => onNavigate('settings')}
          className="glass-card bg-error/5 border border-error/25 p-4 rounded-xl flex items-center gap-3 hover:bg-error/10 transition-colors cursor-pointer"
        >
          <AlertTriangle className="text-error w-5 h-5 shrink-0 animate-pulse" />
          <div className="flex-1">
            <h4 className="font-sans text-xs font-bold text-error">Gemini API Key is Required</h4>
            <p className="text-[10px] text-on-surface-variant">Click here to navigate to settings and enter your API Key to enable AI generations.</p>
          </div>
        </div>
      )}

      {/* Raycast-Style Command Input container */}
      <form
        onSubmit={handleFormSubmit}
        className="glass-panel rounded-2xl p-1 relative group border border-outline/40 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all duration-300 shadow-2xl"
      >
        <div className="flex items-center px-5 py-4 gap-4">
          <Terminal className="text-primary w-6 h-6 shrink-0" />
          <input
            type="text"
            className="bg-transparent border-none focus:ring-0 text-lg w-full text-white placeholder:text-on-surface-variant/30 outline-none"
            placeholder="Type a command or plan a goal..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            disabled={!hasApiKey}
          />
          
          {/* Voice Assistant Speech button (Feature 6) */}
          <button
            type="button"
            onClick={handleVoiceInput}
            disabled={!hasApiKey}
            className={`p-2 rounded-xl transition-all border ${
              isListening
                ? 'bg-error/20 border-error/40 text-error animate-pulse'
                : 'bg-surface-container hover:bg-surface-container-high border-outline text-on-surface-variant hover:text-white'
            } cursor-pointer`}
            title="Start AI Voice Planner"
          >
            {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          <kbd className="hidden md:flex items-center gap-1.5 px-2 py-1 bg-surface-container-high border border-outline/50 rounded text-[10px] font-mono text-on-surface-variant font-bold">
            <span>ENTER</span>
            <CornerDownLeft className="w-3 h-3" />
          </kbd>
        </div>

        {/* Quick Suggestions Pills */}
        <div className="flex flex-wrap gap-2 px-4 pb-3 border-t border-outline/20 pt-3">
          <button
            type="button"
            onClick={() => handleSuggestionClick('Plan my AWS exam')}
            disabled={!hasApiKey}
            className="px-4 py-1.5 bg-surface-container-low border border-outline/50 hover:border-primary hover:text-primary rounded-full font-mono text-[10px] text-on-surface-variant transition-all cursor-pointer"
          >
            "Plan my AWS exam"
          </button>
          <button
            type="button"
            onClick={() => handleSuggestionClick('Help me finish my DBMS project')}
            disabled={!hasApiKey}
            className="px-4 py-1.5 bg-surface-container-low border border-outline/50 hover:border-primary hover:text-primary rounded-full font-mono text-[10px] text-on-surface-variant transition-all cursor-pointer"
          >
            "Help me finish my DBMS project"
          </button>
          <button
            type="button"
            onClick={() => handleSuggestionClick('Audit docker credentials')}
            disabled={!hasApiKey}
            className="px-4 py-1.5 bg-surface-container-low border border-outline/50 hover:border-primary hover:text-primary rounded-full font-mono text-[10px] text-on-surface-variant transition-all cursor-pointer"
          >
            "Audit docker credentials"
          </button>
        </div>
      </form>

      {/* Voice feedback overlay */}
      {voiceFeedback && (
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 text-xs font-mono text-primary animate-in fade-in duration-200">
          🗣️ AI: "{voiceFeedback}"
        </div>
      )}

      {/* API Error Messages */}
      {errorMessage && (
        <div className="bg-error-container/10 border border-error/25 p-4 rounded-xl text-xs text-error font-sans">
          ⚠️ {errorMessage}
        </div>
      )}

      {/* AI Response Canvas container */}
      {isGenerating ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4 animate-pulse">
          <Sparkles className="w-8 h-8 text-primary animate-spin" />
          <p className="font-mono text-xs text-on-surface-variant tracking-wider uppercase">
            DeadlineOS is structuring your learning paths...
          </p>
        </div>
      ) : generatedPlan ? (
        <section className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary-container flex items-center justify-center border border-primary/25 shadow shadow-primary/20">
              <Sparkles className="text-primary w-4.5 h-4.5" />
            </div>
            <h2 className="font-sans text-lg font-bold text-white tracking-tight">
              Architected Plan: {generatedPlan.goal}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
            
            {/* Left Timeline Card block */}
            <div className="md:col-span-4">
              <div className="glass-panel p-5 rounded-2xl space-y-6 flex flex-col justify-between h-full bg-surface-container/20">
                <div>
                  <h3 className="font-mono text-[10px] font-bold text-primary uppercase tracking-widest mb-4">
                    Timeline Overview
                  </h3>
                  <div className="relative space-y-6 pl-5 border-l border-outline/60 ml-2">
                    {timelineItems.map((item) => {
                      const isCurrent = item.status === 'current';
                      const isUpcoming = item.status === 'upcoming';
                      return (
                        <div
                          key={item.id}
                          className={`relative ${
                            isCurrent ? 'opacity-100' : isUpcoming ? 'opacity-70' : 'opacity-40'
                          }`}
                        >
                          {/* Dot connector */}
                          <div
                            className={`absolute -left-[24.5px] top-1.5 w-2.5 h-2.5 rounded-full ring-4 ring-background ${
                              isCurrent
                                ? 'bg-primary ring-primary/20'
                                : isUpcoming
                                ? 'bg-outline-variant'
                                : 'bg-outline'
                            }`}
                          ></div>
                          <span className="font-mono text-[9px] text-on-surface-variant block uppercase tracking-wider">
                            {item.week}
                          </span>
                          <span className="font-sans text-xs font-bold text-white block mt-0.5">
                            {item.title}
                          </span>
                          <p className="text-[10px] text-on-surface-variant/80 mt-0.5 leading-normal">
                            {item.description}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-4 border-t border-outline/20 space-y-4">
                  <div className="p-3 bg-primary/10 border border-primary/30 rounded-lg text-left">
                    <span className="font-mono text-[8px] text-primary font-bold uppercase tracking-wider block mb-1">Approval Required</span>
                    <p className="text-[10px] text-on-surface-variant leading-normal">
                      Review the AI-generated timeline and subtasks above. Approve to add these to your Google Calendar and Supabase workspace.
                    </p>
                  </div>
                  <button
                    onClick={handleCommitToCalendar}
                    className="w-full py-3 bg-primary text-on-primary font-sans font-bold text-xs rounded-lg hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-primary/25"
                  >
                    <CalendarCheck2 className="w-4 h-4 text-on-primary" />
                    <span>Approve &amp; Schedule Plan</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Right bento grid details */}
            <div className="md:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-6">
              
              {/* Card 1: Milestone Details */}
              <div className="glass-panel p-5 rounded-2xl sm:col-span-2 group hover:border-primary/40 transition-colors bg-surface-container/20">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <span className="font-mono text-[8px] font-bold bg-secondary-container/30 text-secondary border border-secondary/10 px-2 py-0.5 rounded uppercase tracking-wider">
                      PLAN SPECIFICATIONS
                    </span>
                    <h4 className="font-sans text-base font-bold text-white mt-1.5">
                      Subtasks Checklist ({generatedPlan.estimated_hours}h Estimated)
                    </h4>
                  </div>
                </div>

                {/* Sub-checklists */}
                <ul className="space-y-3">
                  {generatedPlan.subtasks.map((task, idx) => (
                    <li
                      key={idx}
                      onClick={() => toggleSubtask(idx)}
                      className="flex items-center gap-3 text-xs text-on-surface-variant hover:text-white cursor-pointer transition-colors"
                    >
                      <Circle className="w-4 h-4 text-on-surface-variant/50 shrink-0 hover:text-primary" />
                      <span className="text-on-surface">
                        {task}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Card 2: Difficulty diagnostics */}
              <div className="glass-panel p-5 rounded-2xl hover:bg-surface-container/30 transition-all border border-outline/30 flex flex-col justify-between">
                <div>
                  <BookOpen className="text-primary w-5 h-5 mb-3" />
                  <div className="font-sans text-xs font-bold text-white mb-1">
                    AI Task Metrics
                  </div>
                  <p className="text-[10px] text-on-surface-variant leading-relaxed">
                    Plan estimated difficulty rating: <span className="text-primary font-bold">{generatedPlan.difficulty}/10</span>. Focus on the initial components first to maximize initial velocity.
                  </p>
                </div>
              </div>

              {/* Card 3: Impact diagnostics */}
              <div className="glass-panel p-5 rounded-2xl hover:bg-surface-container/30 transition-all border border-outline/30 flex flex-col justify-between">
                <div>
                  <HelpCircle className="text-tertiary w-5 h-5 mb-3" />
                  <div className="font-sans text-xs font-bold text-white mb-1">
                    Urgency &amp; Impact
                  </div>
                  <p className="text-[10px] text-on-surface-variant leading-relaxed">
                    Estimated business/academic impact: <span className="text-tertiary font-bold">{generatedPlan.impact}/10</span>. The Smart Priority Engine will auto-rank this goal.
                  </p>
                </div>
              </div>

            </div>

          </div>
        </section>
      ) : (
        <div className="text-center py-20 text-on-surface-variant text-sm italic">
          Enter a goal above to generate your learning and execution timeline.
        </div>
      )}

    </div>
  );
}
