import React, { useState } from 'react';
import {
  Terminal,
  Zap,
  ArrowRight,
  Sparkles,
  TrendingUp,
  Brain,
  AlertTriangle,
  Mail,
  CheckCircle2,
  Globe,
  Cpu,
  Lock,
  Loader2
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../services/supabase';

interface LandingViewProps {
  onEnterApp: () => void;
  session?: any;
}

export default function LandingView({ onEnterApp, session }: LandingViewProps) {
  // Auth Form States
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);

  const hasDb = isSupabaseConfigured();

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setAuthLoading(true);
    setAuthError(null);
    setAuthSuccess(null);

    try {
      if (isSignUp) {
        // Register flow
        const { data, error } = await supabase.auth.signUp({
          email,
          password
        });

        if (error) throw error;
        
        if (data.user) {
          // Create matching row in users profiles table
          const { error: profileErr } = await supabase
            .from('users')
            .upsert({ id: data.user.id, channel: 'web' });
            
          if (profileErr) console.error('Failed to create profile row:', profileErr);
          
          setAuthSuccess('Account created! Please check your email to confirm registration or sign in.');
        }
      } else {
        // Login flow
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (error) throw error;
        
        if (data.session) {
          onEnterApp(); // successful login transition
        }
      }
    } catch (err: any) {
      setAuthError(err.message || 'Authentication failed.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthLoading(true);
    setAuthError(null);
    setAuthSuccess(null);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
          scopes: 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events'
        }
      });

      if (error) throw error;
    } catch (err: any) {
      setAuthError(err.message || 'Google authentication failed.');
      setAuthLoading(false);
    }
  };

  return (
    <div className="bg-[#0A0A0A] min-h-screen text-on-surface select-none relative overflow-x-hidden font-sans">
      {/* Background visual glows */}
      <div className="absolute top-[-10%] left-[30%] w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] pointer-events-none -z-10"></div>
      <div className="absolute top-[40%] right-[10%] w-[400px] h-[400px] bg-secondary/5 rounded-full blur-[100px] pointer-events-none -z-10"></div>

      {/* Floating Header */}
      <header className="fixed top-0 left-0 right-0 z-50 flex justify-between items-center px-10 py-4 bg-background/80 backdrop-blur-md border-b border-outline/30">
        <div className="flex items-center gap-3">
          <Terminal className="text-primary w-6 h-6" />
          <span className="font-sans text-lg font-extrabold text-white tracking-tighter">
            Deadline<span className="text-primary">OS</span>
          </span>
        </div>
        
        <div className="flex items-center gap-4">
          <span className="font-mono text-[9px] text-on-surface-variant uppercase tracking-widest font-bold">
            Secured via Supabase Auth
          </span>
        </div>
      </header>

      {/* Hero / Split login Container */}
      <main className="relative pt-32 pb-24 max-w-6xl mx-auto px-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          {/* Left Column: Headlines */}
          <div className="lg:col-span-7 space-y-8 text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-surface-container rounded-full border border-outline/50">
              <Zap className="text-secondary w-3.5 h-3.5 fill-current" />
              <span className="font-mono text-[9px] text-secondary uppercase tracking-widest font-bold">
                WhatsApp Webhook Enabled
              </span>
            </div>

            <h1 className="font-sans text-4xl md:text-6xl font-extrabold leading-none tracking-tight text-white select-none">
              Stop Managing Tasks.<br />
              <span className="text-primary shimmer-text">Start Finishing Them.</span>
            </h1>

            <p className="font-sans text-on-surface-variant/80 text-base md:text-lg leading-relaxed max-w-xl">
              An AI Chief of Staff that plans, prioritizes, schedules, and mitigates risks dynamically. Connect your WhatsApp to manage goals on the go.
            </p>

            {/* Feature small bullet stats */}
            <div className="grid grid-cols-2 gap-6 pt-4 max-w-md">
              <div className="flex gap-3">
                <Brain className="text-primary w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-white">AI Task Brain</h4>
                  <p className="text-[10px] text-on-surface-variant leading-normal">Goals decomposed into checklists by Gemini.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <Globe className="text-secondary w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-white">WhatsApp Sync</h4>
                  <p className="text-[10px] text-on-surface-variant leading-normal">Text plans and done logs straight to WhatsApp.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Auth Card Panel */}
          <div className="lg:col-span-5 flex justify-center lg:justify-end">
            {session?.user ? (
              <div className="w-full max-w-md glass-card rounded-3xl p-8 border border-primary/30 shadow-2xl space-y-6 bg-surface-container/20 text-center">
                <div className="w-12 h-12 bg-primary/10 border border-primary/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="text-primary w-5 h-5" />
                </div>
                <h2 className="font-sans text-white text-xl font-bold tracking-tight">
                  Session Active
                </h2>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  You are logged in as <span className="text-white font-semibold">{session.user.email}</span>.
                </p>
                <button
                  onClick={onEnterApp}
                  className="w-full py-3.5 bg-primary text-on-primary font-sans font-bold text-xs rounded-xl shadow-xl shadow-primary/20 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Enter Workspace</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <div className="pt-2">
                  <button
                    onClick={async () => {
                      await supabase.auth.signOut();
                      window.location.reload();
                    }}
                    className="text-[10px] text-on-surface-variant hover:text-white font-semibold hover:underline bg-transparent border-none cursor-pointer"
                  >
                    Sign Out / Switch Account
                  </button>
                </div>
              </div>
            ) : (
              <div className="w-full max-w-md glass-card rounded-3xl p-8 border border-outline/40 shadow-2xl space-y-6 bg-surface-container/20">
                <div className="text-center space-y-1.5">
                  <div className="w-12 h-12 bg-primary/10 border border-primary/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Lock className="text-primary w-5 h-5" />
                  </div>
                  <h2 className="font-sans text-white text-xl font-bold tracking-tight">
                    {isSignUp ? 'Create Account' : 'Sign In to Workspace'}
                  </h2>
                  <p className="text-[10px] text-on-surface-variant">
                    {isSignUp ? 'Sign up to configure your WhatsApp planner' : 'Enter your credentials to unlock your dashboard'}
                  </p>
                </div>



                {/* Auth error/success feedback logs */}
                {authError && (
                  <div className="bg-error/10 border border-error/25 p-3 rounded-lg text-xs text-error font-sans leading-normal">
                    ⚠️ {authError}
                  </div>
                )}

                {authSuccess && (
                  <div className="bg-secondary-container/10 border border-secondary/35 p-3 rounded-lg text-xs text-secondary font-sans leading-normal">
                    ✓ {authSuccess}
                  </div>
                )}

                <form onSubmit={handleAuthSubmit} className="space-y-4">
                  <div className="space-y-1">
                    <label className="font-mono text-[9px] text-on-surface-variant uppercase block font-bold">Email Address</label>
                    <input
                      type="email"
                      required
                      placeholder="work@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-surface-container border border-outline rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-on-surface-variant/30 focus:ring-1 focus:ring-primary outline-none"
                      disabled={authLoading}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-mono text-[9px] text-on-surface-variant uppercase block font-bold">Password</label>
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-surface-container border border-outline rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-on-surface-variant/30 focus:ring-1 focus:ring-primary outline-none"
                      disabled={authLoading}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full py-3 bg-primary text-on-primary font-sans font-bold text-xs rounded-xl shadow-xl shadow-primary/20 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
                  >
                    {authLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Processing...</span>
                      </>
                    ) : (
                      <span>{isSignUp ? 'Create Workspace' : 'Unlock Dashboard'}</span>
                    )}
                  </button>
                </form>

                <div className="relative flex py-2 items-center">
                  <div className="flex-grow border-t border-outline/20"></div>
                  <span className="flex-shrink mx-4 font-mono text-[9px] text-on-surface-variant uppercase tracking-wider font-bold">Or</span>
                  <div className="flex-grow border-t border-outline/20"></div>
                </div>

                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={authLoading}
                  className="w-full py-3 bg-surface-container border border-outline hover:bg-surface-container-high text-white font-sans font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-40"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
                  </svg>
                  <span>Continue with Google</span>
                </button>

                {/* Tabs Switch Button */}
                <div className="text-center pt-2">
                  <button
                    onClick={() => {
                      setIsSignUp(!isSignUp);
                      setAuthError(null);
                      setAuthSuccess(null);
                    }}
                    className="text-[10px] text-primary font-semibold hover:underline bg-transparent border-none cursor-pointer"
                    disabled={authLoading}
                  >
                    {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>
      </main>

      {/* Trustmarks footer */}
      <footer className="mt-auto border-t border-outline/10 py-8 text-center text-[10px] text-on-surface-variant/40 font-mono">
        © 2026 DeadlineOS Inc. Secured auth loop.
      </footer>
    </div>
  );
}
