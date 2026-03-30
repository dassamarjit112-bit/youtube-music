import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { AnimatePresence } from 'framer-motion';
import { ShieldCheck } from 'lucide-react';
import { LoginView } from './auth/LoginView';
import { RegisterView } from './auth/RegisterView';
import { ProfileSetupView } from './auth/ProfileSetupView';

interface AuthProps {
  onLogin: (user: any) => void;
}

type AuthPage = 'login' | 'register' | 'profile-setup';

export function Auth({ onLogin }: AuthProps) {
  const [loading, setLoading] = useState(false);
  const [activePage, setActivePage] = useState<AuthPage>('login');
  const [error, setError] = useState<string | null>(null);
  
  // Temporary storage for OAuth users during setup
  const [tempUser, setTempUser] = useState<{ email: string, name: string } | null>(null);

  useEffect(() => {
    // Check if we just returned from OAuth and need to complete profile
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        // Check if profile is complete
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
        
        if (!profile || !profile.full_name) {
          setTempUser({ 
            email: session.user.email || '', 
            name: session.user.user_metadata?.full_name || '' 
          });
          setActivePage('profile-setup');
        } else {
          onLogin({
            id: session.user.id,
            email: session.user.email,
            full_name: profile.full_name,
            avatar_url: profile.avatar_url || '',
            subscription_tier: profile.subscription_tier || 'free'
          });
        }
      }
    };
    
    checkSession();
  }, [onLogin]);

  const handleOAuth = async (provider: 'google') => {
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin }
    });
    if (error) { setError(error.message); setLoading(false); }
  };

  const handleLogin = async (email: string, pass: string) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
      if (error) throw error;
      if (data.user) {
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', data.user.id).single();
        const userObj = {
          id: data.user.id,
          email: data.user.email,
          full_name: profile?.full_name || 'User',
          avatar_url: profile?.avatar_url || '',
          subscription_tier: profile?.subscription_tier || 'free'
        };
        localStorage.setItem('ytm_user', JSON.stringify(userObj));
        onLogin(userObj);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleProfileSetup = async (data: { name: string, email: string, pass: string }) => {
    setLoading(true);
    setError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      
      if (sessionData?.session?.user) {
        // If logged in via OAuth, update profile and maybe password
        const { error: updateError } = await supabase.auth.updateUser({ 
          password: data.pass, 
          data: { full_name: data.name } 
        });
        if (updateError) throw updateError;
        
        // Upsert profile
        const { error: profileError } = await supabase.from('profiles').upsert({
          id: sessionData.session.user.id,
          email: sessionData.session.user.email,
          full_name: data.name,
          subscription_tier: 'free'
        });
        if (profileError) throw profileError;

        onLogin({
          id: sessionData.session.user.id,
          email: sessionData.session.user.email,
          full_name: data.name,
          avatar_url: sessionData.session.user.user_metadata?.avatar_url || '',
          subscription_tier: 'free'
        });
      } else {
        // If not logged in, create new account
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: data.email,
          password: data.pass,
          options: { data: { full_name: data.name } }
        });
        if (signUpError) throw signUpError;
        
        if (signUpData.user) {
          // Profile is usually created via trigger in Supabase, but let's be explicit
          await supabase.from('profiles').upsert({
            id: signUpData.user.id,
            email: signUpData.user.email,
            full_name: data.name,
            subscription_tier: 'free'
          });

          onLogin({
            id: signUpData.user.id,
            email: signUpData.user.email,
            full_name: data.name,
            avatar_url: '',
            subscription_tier: 'free'
          });
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-overlay-premium">
      <div className="auth-background-canvas" />
      <div className="auth-scroll-container">
        <div className="auth-inner-card">
          <div className="auth-branding-v4">
            <img src="/logo.png" alt="MusicTube" />
            <h1>MusicTube</h1>
          </div>
          
          <AnimatePresence mode="wait">
            {activePage === 'login' && (
              <LoginView 
                onBack={() => {}} // No back from login entry
                onRegisterClick={() => setActivePage('register')}
                onOAuth={handleOAuth}
                onSubmit={handleLogin}
                loading={loading}
                error={error}
              />
            )}
            {activePage === 'register' && (
              <RegisterView 
                onBack={() => setActivePage('login')}
                onLoginClick={() => setActivePage('login')}
                onNext={() => setActivePage('profile-setup')}
                onOAuth={handleOAuth}
                loading={loading}
              />
            )}
            {activePage === 'profile-setup' && (
              <ProfileSetupView 
                onBack={() => setActivePage('register')}
                onSubmit={handleProfileSetup}
                loading={loading}
                error={error}
                initialName={tempUser?.name}
                initialEmail={tempUser?.email}
              />
            )}
          </AnimatePresence>

          <footer className="auth-security-footer">
            <ShieldCheck size={14} /> End-to-end secure authentication powered by Supabase
          </footer>
        </div>
      </div>
    </div>
  );
}
