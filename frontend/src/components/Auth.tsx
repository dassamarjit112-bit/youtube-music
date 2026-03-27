import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { motion } from 'framer-motion';
import { GoogleLogin } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';

interface AuthProps {
  onLogin: (user: any) => void;
}

export function Auth({ onLogin }: AuthProps) {
  const [loading, setLoading] = useState(false);

  const handleSuccess = async (response: any) => {
    setLoading(true);
    try {
      const decoded: any = jwtDecode(response.credential);
      const userData = {
        id: decoded.sub,
        email: decoded.email,
        full_name: decoded.name,
        avatar_url: decoded.picture,
      };

      // Direct Database persistence (instead of Supabase Auth)
      // This satisfies the "accounts in the app only" requirement
      const { error } = await supabase
        .from('profiles')
        .upsert(userData);

      if (error) {
        console.error("Profile sync failed:", error.message);
      }

      // Persist locally and update app state
      localStorage.setItem('ytm_user', JSON.stringify(userData));
      onLogin(userData);
    } catch (err) {
      console.error("Login decoding failed:", err);
      alert('Google Login failed to process. Check console.');
    } finally {
      setLoading(false);
    }
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
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" fill="#f00"/>
            </svg>
            <span style={{color: '#fff', fontSize: '26px', fontWeight: '800', letterSpacing: '-1px'}}>Music</span>
          </div>
          <h1 style={{ marginTop: '20px' }}>Sign in</h1>
          <p>to continue to YouTube Music</p>
        </div>

        <div className="google-center-login" style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
          {loading ? (
            <div className="loader" style={{ margin: '20px 0' }}></div>
          ) : (
            <GoogleLogin 
              onSuccess={handleSuccess} 
              onError={() => alert('Google Sign-In failed')}
              useOneTap
              theme="filled_black"
              shape="pill"
              size="large"
              width="300"
            />
          )}
        </div>

        <div className="auth-divider" style={{ margin: '30px 0' }}>
          <span>Secure direct authentication</span>
        </div>

        <p style={{ fontSize: '12px', color: '#5f6368', textAlign: 'center', lineHeight: '1.6' }}>
          By signing in, you agree to the Terms of Service. Your account information will be stored securely in our database.
        </p>

        <div className="form-actions" style={{ justifyContent: 'center' }}>
          <button 
            type="button" 
            className="toggle-auth"
            onClick={() => alert('Direct Google login is the only supported method for security.')}
          >
            Privacy Policy
          </button>
        </div>
      </motion.div>
    </div>
  );
}
