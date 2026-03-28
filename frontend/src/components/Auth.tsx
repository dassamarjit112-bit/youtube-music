import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { motion } from 'framer-motion';

interface AuthProps {
  onLogin: (user: any) => void;
}

export function Auth({ onLogin }: AuthProps) {
  const [loading, setLoading] = useState(false);
  const [isFlutterApp, setIsFlutterApp] = useState(false);

  useEffect(() => {
    // Strictly detect if running inside a Flutter WebView or Android WebView
    const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
    const isWebView = 
      /wv/i.test(userAgent) || 
      /flutter/i.test(userAgent) || 
      (window as any).flutter_inappwebview !== undefined ||
      window.location.port === '8080'; // The Flutter App's Dart server runs on port 8080
    
    setIsFlutterApp(isWebView);

    // Register globally for the Flutter app to call back
    (window as any).onNativeLoginSuccess = async (nativeUserData: any) => {
      setLoading(true);
      try {
        // Map native data to our profile schema (sub -> id, picture -> avatar_url)
        const userToSync = {
          id: nativeUserData.id || nativeUserData.sub,
          email: nativeUserData.email,
          full_name: nativeUserData.name || nativeUserData.full_name || 'User',
          avatar_url: nativeUserData.picture || nativeUserData.avatar_url || '',
        };

        // Sync to profiles
        const { error: upsertError } = await supabase.from('profiles').upsert(userToSync);
        if (upsertError) console.error("Native Profile sync error:", upsertError.message);

        localStorage.setItem('ytm_user', JSON.stringify(userToSync));
        onLogin(userToSync);
      } catch (err) {
        console.error("Flutter App Sync failed:", err);
        alert('App Authentication failed.');
      } finally {
        setLoading(false);
      }
    };

    return () => {
      delete (window as any).onNativeLoginSuccess;
    };
  }, [onLogin]);

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

  // 2. DIRECT APP GOOGLE AUTH TRIGGER
  const handleNativeTrigger = () => {
    try {
      if ((window as any).flutter_inappwebview) {
        (window as any).flutter_inappwebview.callHandler('FlutterAuth', 'triggerGoogleLogin');
      } else {
        alert("App bridge not fully loaded yet. Please wait a moment.");
      }
    } catch (e) {
      console.error(e);
      alert("Error triggering native auth.");
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
                <div className="direct-google-auth" style={{ width: '100%' }}>
                  <button 
                    onClick={handleNativeTrigger} 
                    className="google-signin-btn"
                    style={{ background: '#fff', color: '#111', border: '1px solid #ccc', display: 'flex', justifyContent: 'center', padding: '12px', borderRadius: '24px', width: '300px', margin: '0 auto', fontSize: '15px' }}
                  >
                    <img src="https://lh3.googleusercontent.com/COxitqgJr1sICpeqCu7IFH7I64k3-7B14mRLeuS60B8_8D-0v6S6_08I3vj7U8-p-n0=w300" alt="Google" style={{width: '20px', height: '20px', background: '#fff', borderRadius: '50%', padding: '2px', marginRight: '8px'}} />
                    Continue with Google App
                  </button>
                </div>
              ) : (
                /* WEB APP PATH */
                <div className="supabase-google-auth" style={{ width: '100%' }}>
                  <button 
                    onClick={handleSupabaseGoogleLogin} 
                    className="google-signin-btn"
                    style={{ background: '#111', color: '#fff', border: '1px solid #333', display: 'flex', justifyContent: 'center', padding: '12px', borderRadius: '24px', width: '300px', margin: '0 auto', fontSize: '15px' }}
                  >
                    <img src="https://lh3.googleusercontent.com/COxitqgJr1sICpeqCu7IFH7I64k3-7B14mRLeuS60B8_8D-0v6S6_08I3vj7U8-p-n0=w300" alt="Google" style={{width: '20px', height: '20px', background: '#fff', borderRadius: '50%', padding: '2px', marginRight: '8px'}} />
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
