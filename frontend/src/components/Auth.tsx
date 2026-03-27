import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { motion } from 'framer-motion';

interface AuthProps {
  onLogin: (user: any) => void;
}

export function Auth({ onLogin }: AuthProps) {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState('');

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { data, error: authError } = isSignUp
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    const supaUser = data?.user;
    if (supaUser) {
      const userData = {
        id: supaUser.id,
        email: supaUser.email ?? email,
        full_name: supaUser.user_metadata?.full_name ?? email.split('@')[0],
        avatar_url: supaUser.user_metadata?.avatar_url ?? '',
      };
      // Persist profile in profiles table
      await supabase.from('profiles').upsert(userData);
      localStorage.setItem('ytm_user', JSON.stringify(userData));
      onLogin(userData);
    }

    setLoading(false);
  };

  return (
    <div className="google-auth-page">
      <motion.div
        className="google-auth-card"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="google-header">
          <div className="google-brand">
            <svg viewBox="0 0 24 24" width="36" height="36">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" fill="#f00" />
            </svg>
            <span style={{ color: '#fff', fontSize: '26px', fontWeight: '800', letterSpacing: '-1px' }}>Music</span>
          </div>
          <h1>{isSignUp ? 'Create your account' : 'Sign in'}</h1>
          <p>to continue to YouTube Music</p>
        </div>

        <form onSubmit={handleEmailAuth} className="google-form">
          <div className="input-group">
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="input-group">
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <p style={{ color: '#d93025', fontSize: '13px', margin: '0 0 8px', textAlign: 'center' }}>
              {error}
            </p>
          )}

          <div className="form-actions">
            <button
              type="button"
              className="toggle-auth"
              onClick={() => { setIsSignUp(!isSignUp); setError(''); }}
            >
              {isSignUp ? 'Sign in instead' : 'Create account'}
            </button>
            <button type="submit" className="blue-btn" disabled={loading}>
              {loading ? 'Please wait…' : isSignUp ? 'Register' : 'Next'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
