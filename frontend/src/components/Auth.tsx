import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { motion } from 'framer-motion';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';

interface AuthProps {
  onLogin: (user: any) => void;
}

const ANDROID_CLIENT_ID = "79361906244-0umpdsl6bk6grunhuotbe5qhhb2911uf.apps.googleusercontent.com";

export function Auth({ onLogin }: AuthProps) {
  const [loading, setLoading] = useState(false);
  const [isFlutterApp, setIsFlutterApp] = useState(false);

  useEffect(() => {
    // Detect if running inside a Flutter WebView or an Android environment
    const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
    const isMobileDevice = /android|iphone|ipad|ipod/i.test(userAgent);
    const isWebView = /wv|flutter/i.test(userAgent) || (window as any).flutter_inappwebview !== undefined;

    // Set to true if it is a mobile device and/or webview.
    setIsFlutterApp(isMobileDevice || isWebView);
  }, []);

  // 1. SUPABASE GOOGLE AUTH (For standard Web App)
  const handleSupabaseGoogleLogin = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    });

    if (error) {
      alert(error.message);
      setLoading(false);
    }
    // Supabase handles the redirection automatically
  };

  // 2. DIRECT CLIENT ID GOOGLE AUTH (For Flutter Mobile App)
  const handleDirectGoogleLoginSuccess = async (response: any) => {
    setLoading(true);
    try {
      const decoded: any = jwtDecode(response.credential);
      const userData = {
        id: decoded.sub,
        email: decoded.email,
        full_name: decoded.name,
        avatar_url: decoded.picture,
      };

      // Upsert direct into profiles table
      const { error } = await supabase.from('profiles').upsert(userData);
      if (error) throw error;

      // Update state to trigger smooth redirect to home
      localStorage.setItem('ytm_user', JSON.stringify(userData));
      onLogin(userData); // This logs the user in instantly

    } catch (err) {
      console.error("Login verification failed:", err);
      alert('Google Login failed.');
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
        style={{ padding: '40px 30px' }}
      >
        <div className="google-header" style={{ marginBottom: '40px' }}>
          <div className="google-brand">
            <svg viewBox="0 0 24 24" width="40" height="40">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" fill="#f00" />
            </svg>
            <span style={{ color: '#fff', fontSize: '28px', fontWeight: '800', letterSpacing: '-1px' }}>Music</span>
          </div>
          <h1 style={{ marginTop: '20px' }}>Sign in</h1>
          <p>to continue to YouTube Music</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
          {loading ? (
            <div className="loader" style={{ margin: '20px 0' }}></div>
          ) : (
            <>
              {isFlutterApp ? (
                /* FLUTTER APP PATH */
                <div className="direct-google-auth" style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <p style={{ fontSize: '13px', color: '#666', marginBottom: '16px', textAlign: 'center' }}>
                    Native App Authentication
                  </p>
                  <GoogleOAuthProvider clientId={ANDROID_CLIENT_ID}>
                    <GoogleLogin
                      onSuccess={handleDirectGoogleLoginSuccess}
                      onError={() => alert('App Sign-In failed')}
                      useOneTap
                      theme="filled_black"
                      shape="pill"
                      size="large"
                      width="300"
                    />
                  </GoogleOAuthProvider>
                </div>
              ) : (
                /* WEB APP PATH */
                <div className="supabase-google-auth" style={{ width: '100%' }}>
                  <button
                    onClick={handleSupabaseGoogleLogin}
                    className="google-signin-btn"
                    style={{ background: '#111', color: '#fff', border: '1px solid #333', display: 'flex', justifyContent: 'center', padding: '12px', borderRadius: '24px', width: '300px', margin: '0 auto', fontSize: '15px' }}
                  >
                    <img src="https://lh3.googleusercontent.com/COxitqgJr1sICpeqCu7IFH7I64k3-7B14mRLeuS60B8_8D-0v6S6_08I3vj7U8-p-n0=w300" alt="Google" style={{ width: '20px', height: '20px', background: '#fff', borderRadius: '50%', padding: '2px', marginRight: '8px' }} />
                    Sign in with Google
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <div className="auth-divider" style={{ margin: '40px 0 20px' }}>
          <span>Secure authentication</span>
        </div>

        <p style={{ fontSize: '12px', color: '#5f6368', textAlign: 'center', lineHeight: '1.6' }}>
          By signing in, you agree to the Terms of Service. Your account information will be stored securely.
        </p>

        {/* Helper debug text to verify platform logic */}
        <p style={{ fontSize: '10px', color: '#ccc', textAlign: 'center', marginTop: '20px' }}>
          Running Mode: {isFlutterApp ? 'Flutter Mobile App' : 'Browser Web App'}
        </p>
      </motion.div>
    </div>
  );
}
