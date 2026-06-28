import React, { useState, useEffect } from 'react';
import { Timer } from 'lucide-react';
import { TaskType } from '../types';
import { isSupabaseConfigured } from '../services/supabase';

interface FocusViewProps {
  tasks: TaskType[];
  setTasks: React.Dispatch<React.SetStateAction<TaskType[]>>;
  activeSessionTaskId: string | null;
  setActiveSessionTaskId: (id: string | null) => void;
  sessionActive: boolean;
  setSessionActive: (active: boolean) => void;
  setSessionTime: React.Dispatch<React.SetStateAction<number>>;
}

export default function FocusView({
  tasks,
  setTasks,
  activeSessionTaskId,
  setActiveSessionTaskId,
  sessionActive,
  setSessionActive,
  setSessionTime
}: FocusViewProps) {
  const getCompletionStatus = (task: TaskType) => {
    const progress = task.progress ?? 0;
    if (progress === 100) return 'completed';
    if (progress === 0) return 'not completed';
    return 'pending';
  };

  const activeTask = tasks.find(t => t.id === activeSessionTaskId) || tasks[0];
  const [seconds, setSeconds] = useState(1500); // 25:00 Pomodoro
  const running = sessionActive;

  // Pomodoro countdown timer tick down when running
  useEffect(() => {
    let pomodoroInterval: any;
    if (sessionActive) {
      pomodoroInterval = setInterval(() => {
        setSeconds((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => {
      if (pomodoroInterval) clearInterval(pomodoroInterval);
    };
  }, [sessionActive]);

  // Reset the Pomodoro timer when active task shifts
  useEffect(() => {
    setSeconds(1500);
  }, [activeSessionTaskId]);

  const toggleSubtask = (taskId: string, subtaskIndex: number) => {
    setTasks(prevTasks => prevTasks.map(t => {
      if (t.id === taskId && t.subtasks) {
        const newSubtasks = [...t.subtasks];
        newSubtasks[subtaskIndex] = {
          ...newSubtasks[subtaskIndex],
          completed: !newSubtasks[subtaskIndex].completed
        };
        const completedCount = newSubtasks.filter(st => st.completed).length;
        const progress = Math.round((completedCount / newSubtasks.length) * 100);

        // Asynchronously sync to Supabase if configured
        if (isSupabaseConfigured()) {
          import('../services/supabase').then(({ updateSubtaskStatus }) => {
            updateSubtaskStatus(taskId, subtaskIndex, newSubtasks[subtaskIndex].completed);
          }).catch(err => console.error(err));
        }

        return { ...t, subtasks: newSubtasks, progress };
      }
      return t;
    }));
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="space-y-8 pb-20 select-none animate-in fade-in duration-500 text-on-surface">
      <div>
        <h2 className="text-white text-3xl font-bold tracking-tight flex items-center gap-2">
          <Timer className="text-primary w-8 h-8" />
          <span>Deep Focus Sandbox</span>
        </h2>
        <p className="text-on-surface-variant text-sm mt-1">
          Silence notifications, play ambient static, and focus completely on a target block.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-stretch">
        <div className="md:col-span-7 glass-card p-10 rounded-2xl border border-outline/30 flex flex-col items-center justify-center text-center space-y-6">
          <div className="font-sans text-[70px] font-extrabold text-white tracking-tighter tabular-nums">
            {formatTime(seconds)}
          </div>
          <button
            onClick={() => {
              setSessionActive(!sessionActive);
              if (!sessionActive && activeTask) {
                setActiveSessionTaskId(activeTask.id);
                setSessionTime(0);
              }
            }}
            className={`px-8 py-3 font-bold text-xs rounded-xl shadow-lg transition-all cursor-pointer ${
              running ? 'bg-secondary text-on-secondary shadow-secondary/20' : 'bg-primary text-on-primary shadow-primary/20'
            }`}
          >
            {running ? 'Pause Focus Block' : 'Start Focus Block'}
          </button>
        </div>
        <div className="md:col-span-5 glass-card p-6 rounded-2xl border border-outline/30 flex flex-col justify-between">
          <div className="space-y-4">
            <h3 className="font-sans font-bold text-sm text-white">Target Focus Task</h3>
            
            <div className="space-y-1">
              <label className="font-mono text-[9px] text-on-surface-variant uppercase block font-bold">Active Task</label>
              <select
                value={activeTask?.id || ''}
                onChange={(e) => {
                  setActiveSessionTaskId(e.target.value);
                  setSessionTime(0);
                }}
                className="w-full bg-surface-container border border-outline rounded-lg px-3 py-2 text-xs text-white outline-none"
              >
                {tasks.map(t => (
                  <option key={t.id} value={t.id}>
                    [{getCompletionStatus(t).toUpperCase()}] {t.title} ({t.project})
                  </option>
                ))}
              </select>
            </div>

            {activeTask ? (
              <div className="space-y-3 pt-2">
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  You are focusing on: <span className="text-primary font-bold">{activeTask.title}</span>.
                </p>
                
                {activeTask.subtasks && activeTask.subtasks.length > 0 ? (
                  <div className="space-y-2 pt-2 border-t border-outline/20">
                    <span className="font-mono text-[9px] text-on-surface-variant block uppercase tracking-wider">Subtasks Checklist</span>
                    <ul className="space-y-2">
                      {activeTask.subtasks.map((st, idx) => (
                        <li
                          key={idx}
                          onClick={() => toggleSubtask(activeTask.id, idx)}
                          className="flex items-center gap-2 text-xs text-on-surface-variant hover:text-white cursor-pointer"
                        >
                          <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${st.completed ? 'border-secondary bg-secondary/15' : 'border-outline'}`}>
                            {st.completed && <span className="w-1.5 h-1.5 bg-secondary rounded-full"></span>}
                          </span>
                          <span className={st.completed ? 'line-through text-on-surface-variant/50' : 'text-on-surface'}>{st.text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-[10px] text-on-surface-variant italic">No subtasks generated for this task yet.</p>
                )}
              </div>
            ) : (
              <p className="text-xs text-on-surface-variant">Select or create a task to begin focusing.</p>
            )}
          </div>
          <div className="pt-4 border-t border-outline/20">
            <span className="font-mono text-[9px] text-on-surface-variant block uppercase tracking-wider mb-2">Workspace HUD Noise</span>
            <div className="flex gap-2">
              <span className="px-3 py-1.5 bg-surface-container rounded-lg font-mono text-[9px] text-white">Brown Noise</span>
              <span className="px-3 py-1.5 bg-surface-container rounded-lg font-mono text-[9px] text-on-surface-variant/60">Rain Static</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
