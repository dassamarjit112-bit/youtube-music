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

  useEffect(() => {
    // Check if we just returned from OAuth redirect
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      // Read the intent that was saved before OAuth redirect
      const oauthIntent = localStorage.getItem('oauth_intent');
      localStorage.removeItem('oauth_intent'); // Clean up

      // Check if profile already exists in database
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();

      if (profile) {
        // Profile exists — log in directly with existing data (works for both login & register)
        onLogin({
          id: session.user.id,
          email: session.user.email,
          full_name: profile.full_name || session.user.user_metadata?.full_name || 'User',
          avatar_url: profile.avatar_url || session.user.user_metadata?.avatar_url || '',
          subscription_tier: profile.subscription_tier || 'free'
        });
      } else if (oauthIntent === 'register') {
        // No profile + came from Register page → Create new profile
        const newUser = {
          id: session.user.id,
          email: session.user.email || '',
          full_name: session.user.user_metadata?.full_name || session.user.user_metadata?.name || 'User',
          avatar_url: session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture || ''
        };

        await supabase.from('profiles').upsert({
          id: newUser.id,
          email: newUser.email,
          full_name: newUser.full_name,
          avatar_url: newUser.avatar_url
          // Let DB DEFAULT handle subscription_tier ('free')
        });

        onLogin({
          ...newUser,
          subscription_tier: 'free'
        });
      } else {
        // No profile + came from Login page → Reject, must register first
        await supabase.auth.signOut();
        setError('No account found. Please register first with Google, then log in.');
        setActivePage('login');
      }
    };
    
    checkSession();
  }, [onLogin]);

  // OAuth with intent tracking
  const handleOAuthLogin = async (provider: 'google') => {
    setLoading(true);
    setError(null);
    localStorage.setItem('oauth_intent', 'login'); // Mark as login intent
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin }
    });
    if (error) { setError(error.message); setLoading(false); localStorage.removeItem('oauth_intent'); }
  };

  const handleOAuthRegister = async (provider: 'google') => {
    setLoading(true);
    setError(null);
    localStorage.setItem('oauth_intent', 'register'); // Mark as register intent
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin }
    });
    if (error) { setError(error.message); setLoading(false); localStorage.removeItem('oauth_intent'); }
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
        
        const { error: profileError } = await supabase.from('profiles').upsert({
          id: sessionData.session.user.id,
          email: sessionData.session.user.email,
          full_name: data.name
          // DO NOT specify subscription_tier here to avoid overwriting existing plans!
        });
        if (profileError) throw profileError;

        onLogin({
          id: sessionData.session.user.id,
          email: sessionData.session.user.email,
          full_name: data.name,
          avatar_url: sessionData.session.user.user_metadata?.avatar_url || '',
          subscription_tier: 'unknown' // App.tsx will fetch the real one in background sync
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
          await supabase.from('profiles').upsert({
            id: signUpData.user.id,
            email: signUpData.user.email,
            full_name: data.name
            // Let DB DEFAULT handle 'free' for truly new accounts
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
                onBack={() => {}} 
                onRegisterClick={() => setActivePage('register')}
                onOAuth={handleOAuthLogin}
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
                onOAuth={handleOAuthRegister}
                loading={loading}
              />
            )}
            {activePage === 'profile-setup' && (
              <ProfileSetupView 
                onBack={() => setActivePage('register')}
                onSubmit={handleProfileSetup}
                loading={loading}
                error={error}
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
