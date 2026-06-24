import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, X, RefreshCw, Volume2, CheckCircle2, Navigation, FileText, AlertTriangle } from 'lucide-react';
import { TaskType } from '../types';
import { transcribeAudio, parseVoiceCommand, generateSpeech, playAudio } from '../services/gemini';

interface VoiceCommandPanelProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: TaskType[];
  onCreateTask: (title: string, hours: number, status: 'critical' | 'normal' | 'deferred') => void;
  onNavigate: (screen: any) => void;
  onPlanGoal: (goal: string) => void;
}

export default function VoiceCommandPanel({
  isOpen,
  onClose,
  tasks,
  onCreateTask,
  onNavigate,
  onPlanGoal
}: VoiceCommandPanelProps) {
  const [status, setStatus] = useState<'idle' | 'listening' | 'transcribing' | 'processing' | 'speaking' | 'completed' | 'error'>('idle');
  const [transcription, setTranscription] = useState('');
  const [timer, setTimer] = useState(0);
  const [voiceFeedback, setVoiceFeedback] = useState('');
  const [parsedCommand, setParsedCommand] = useState<any>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    if (isOpen) {
      startRecording();
    } else {
      cleanup();
    }
    return () => cleanup();
  }, [isOpen]);

  useEffect(() => {
    if (status === 'listening') {
      timerRef.current = setInterval(() => {
        setTimer((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [status]);

  const cleanup = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    setStatus('idle');
    setTimer(0);
  };

  const startRecording = async () => {
    try {
      setTranscription('');
      setVoiceFeedback('');
      setParsedCommand(null);
      setTimer(0);

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
        setStatus('transcribing');
        const audioBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          try {
            const base64Data = (reader.result as string).split(',')[1];
            const actualMimeType = recorder.mimeType.split(';')[0] || 'audio/webm';
            
            const text = await transcribeAudio(base64Data, actualMimeType);
            if (!text) {
              setStatus('error');
              setVoiceFeedback('No voice command detected. Please speak clearly.');
              return;
            }

            setTranscription(text);
            setStatus('processing');
            
            const parsed = await parseVoiceCommand(text, tasks);
            setParsedCommand(parsed);
            setVoiceFeedback(parsed.spokenResponse);

            // Execute Actions
            if (parsed.action === 'CREATE_TASK' && parsed.taskDetails) {
              onCreateTask(parsed.taskDetails.title, parsed.taskDetails.hours, parsed.taskDetails.status);
            } else if (parsed.action === 'NAVIGATE' && parsed.screen) {
              onNavigate(parsed.screen);
            } else if (parsed.action === 'INTELLIGENCE_PLAN' && parsed.planPrompt) {
              onPlanGoal(parsed.planPrompt);
            }

            // Text-to-Speech playback using Gemini TTS
            setStatus('speaking');
            try {
              const audioResponse = await generateSpeech(parsed.spokenResponse);
              await playAudio(audioResponse.base64Data, audioResponse.mimeType);
            } catch (ttsErr) {
              console.error('Gemini TTS error:', ttsErr);
            }
            
            setStatus('completed');
          } catch (err: any) {
            console.error(err);
            setStatus('error');
            setVoiceFeedback('Command processing failed: ' + (err.message || err));
          }
        };

        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setStatus('listening');
    } catch (err) {
      console.error(err);
      setStatus('error');
      setVoiceFeedback('Unable to access microphone. Please verify permission options.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-lg z-[100] flex items-center justify-center select-none animate-in fade-in duration-200">
      <div className="w-full max-w-lg glass-card rounded-3xl border border-primary/20 bg-surface-container-low/95 p-8 relative shadow-2xl space-y-8 flex flex-col items-center">
        {/* Header Close button */}
        <button
          onClick={onClose}
          className="absolute right-6 top-6 p-2 rounded-xl text-on-surface-variant hover:text-white hover:bg-surface-container transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Dynamic Title based on state */}
        <div className="text-center space-y-1 mt-4">
          <h3 className="font-sans text-xl font-bold tracking-tight text-white">
            {status === 'listening' && 'Listening to speech commands...'}
            {status === 'transcribing' && 'Transcribing audio...'}
            {status === 'processing' && 'Processing your request...'}
            {status === 'speaking' && 'AI Response...'}
            {status === 'completed' && 'Execution Complete'}
            {status === 'error' && 'Voice Assistant Error'}
          </h3>
          <p className="text-xs text-on-surface-variant max-w-sm">
            {status === 'listening' && 'Say tasks to add, screens to visit, or ask a question.'}
            {status === 'transcribing' && 'Contacting Gemini model for audio layout mapping.'}
            {status === 'processing' && 'Routing task intents, planning nodes, or search filters.'}
            {status === 'speaking' && 'Gemini Voice response playback active.'}
            {status === 'completed' && 'Command parsed and state parameters synchronized.'}
            {status === 'error' && 'Something went wrong. Let us try speaking again.'}
          </p>
        </div>

        {/* Visual Pulse / Recorder Circle */}
        <div className="relative flex items-center justify-center w-40 h-40">
          {status === 'listening' && (
            <>
              <span className="absolute w-36 h-36 bg-error/10 rounded-full animate-ping duration-1000"></span>
              <span className="absolute w-28 h-28 bg-error/20 rounded-full animate-pulse"></span>
            </>
          )}
          {status === 'speaking' && (
            <>
              <span className="absolute w-36 h-36 bg-primary/10 rounded-full animate-ping duration-1500"></span>
              <span className="absolute w-28 h-28 bg-primary/20 rounded-full animate-pulse"></span>
            </>
          )}

          <button
            onClick={status === 'listening' ? stopRecording : startRecording}
            disabled={status === 'transcribing' || status === 'processing'}
            className={`w-24 h-24 rounded-full flex items-center justify-center border shadow-xl relative z-10 transition-all ${
              status === 'listening'
                ? 'bg-error border-error text-white hover:brightness-110 active:scale-95'
                : status === 'speaking'
                ? 'bg-primary border-primary text-white animate-pulse'
                : 'bg-surface-container border-outline text-on-surface-variant hover:text-white hover:bg-surface-container-high active:scale-95'
            } cursor-pointer disabled:opacity-40`}
          >
            {status === 'listening' ? (
              <MicOff className="w-8 h-8" />
            ) : status === 'transcribing' || status === 'processing' ? (
              <RefreshCw className="w-8 h-8 animate-spin" />
            ) : (
              <Mic className="w-8 h-8" />
            )}
          </button>
        </div>

        {/* Timer during recording */}
        {status === 'listening' && (
          <div className="font-mono text-sm font-bold text-error animate-pulse">
            Recording • {formatTimer(timer)}
          </div>
        )}

        {/* Audio response text block / transcription display */}
        {(transcription || voiceFeedback || status === 'error') && (
          <div className="w-full bg-[#0A0A0A]/40 border border-outline/20 p-5 rounded-2xl space-y-4 text-left">
            {transcription && (
              <div className="space-y-1">
                <span className="font-mono text-[9px] text-on-surface-variant uppercase tracking-widest block font-bold">You Said</span>
                <p className="text-xs text-white italic">"{transcription}"</p>
              </div>
            )}
            
            {voiceFeedback && (
              <div className="space-y-2 pt-3 border-t border-outline/10">
                <div className="flex items-center gap-2">
                  <Volume2 className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="font-mono text-[9px] text-primary uppercase tracking-widest block font-bold">AI Assistant</span>
                </div>
                <p className="text-xs text-white font-medium">{voiceFeedback}</p>
              </div>
            )}

            {parsedCommand && (
              <div className="pt-3 border-t border-outline/10 flex items-center justify-between text-[9px] font-mono font-semibold uppercase text-on-surface-variant">
                <span>Action: {parsedCommand.action}</span>
                {parsedCommand.action === 'CREATE_TASK' && parsedCommand.taskDetails && (
                  <span className="flex items-center gap-1 text-secondary">
                    <CheckCircle2 className="w-3 h-3" />
                    Task: {parsedCommand.taskDetails.title} (+{parsedCommand.taskDetails.hours}h)
                  </span>
                )}
                {parsedCommand.action === 'NAVIGATE' && parsedCommand.screen && (
                  <span className="flex items-center gap-1 text-primary">
                    <Navigation className="w-3 h-3" />
                    Screen: {parsedCommand.screen}
                  </span>
                )}
                {parsedCommand.action === 'INTELLIGENCE_PLAN' && parsedCommand.planPrompt && (
                  <span className="flex items-center gap-1 text-tertiary">
                    <FileText className="w-3 h-3" />
                    Planning: {parsedCommand.planPrompt}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Actions panel */}
        {status === 'completed' && (
          <button
            onClick={onClose}
            className="w-full py-3 bg-surface-container hover:bg-surface-container-high text-xs text-white font-bold rounded-2xl transition-colors cursor-pointer border border-outline/40"
          >
            Close Assistant
          </button>
        )}
      </div>
    </div>
  );
}
