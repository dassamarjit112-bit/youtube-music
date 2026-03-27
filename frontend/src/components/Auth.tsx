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
    // Detect platform
    const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
    const isWebView = 
      /wv/i.test(userAgent) || 
      /flutter/i.test(userAgent) || 
      (window as any).flutter_inappwebview !== undefined ||
      window.location.port === '8080'; 
    
    setIsFlutterApp(isWebView);

    // Listen for the native login success from Flutter
    (window as any).onNativeLoginSuccess = (userData: any) => {
      handleNativeSuccess(userData);
    };

    // Cleanup global function on unmount
    return () => {
      delete (window as any).onNativeLoginSuccess;
    };
  }, []);

  const handleNativeSuccess = async (userData: any) => {
    setLoading(true);
    try {
      const { error } = await supabase.from('profiles').upsert({
        id: userData.id,
        email: userData.email,
        full_name: userData.full_name,
        avatar_url: userData.avatar_url,
      });

      if (error) throw error;

      localStorage.setItem('ytm_user', JSON.stringify(userData));
      onLogin(userData); 
    } catch (err) {
      console.error("Native login sync failed:", err);
      alert('Syncing native login failed.');
    } finally {
      setLoading(false);
    }
  };

  const triggerNativeGoogleLogin = () => {
  // InAppWebView uses a different syntax for handlers:
  if ((window as any).flutter_inappwebview) {
    (window as any).flutter_inappwebview.callHandler('FlutterAuth', 'triggerGoogleLogin');
  } else {
    alert("Native bridge not found. Are you running in the Flutter app?");
  }
};

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
            <span style={{ color: '#000000', fontSize: '28px', fontWeight: '800', letterSpacing: '-1px' }}>Music</span>
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
                <div className="direct-google-auth" style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <p style={{ fontSize: '13px', color: '#666', marginBottom: '16px', textAlign: 'center' }}>
                    Native App Authentication
                  </p>
                  <button
                    onClick={triggerNativeGoogleLogin}
                    className="google-signin-btn"
                    style={{ 
                      background: '#fff', 
                      color: '#000', 
                      border: '1px solid #dadce0', 
                      display: 'flex', 
                      alignItems: 'center',
                      justifyContent: 'center', 
                      padding: '12px', 
                      borderRadius: '24px', 
                      width: '300px', 
                      margin: '0 auto', 
                      fontSize: '15px',
                      fontWeight: '500',
                      cursor: 'pointer'
                    }}
                  >
                    <img src="https://fonts.gstatic.com/s/i/productlogos/googleg/v6/24px.svg" alt="G" style={{ width: '18px', marginRight: '10px' }} />
                    Sign in with Google
                  </button>
                </div>
              ) : (
                <div className="supabase-google-auth" style={{ width: '100%' }}>
                  <button
                    onClick={handleSupabaseGoogleLogin}
                    className="google-signin-btn"
                    style={{ background: '#111', color: '#fff', border: '1px solid #333', display: 'flex', justifyContent: 'center', padding: '12px', borderRadius: '24px', width: '300px', margin: '0 auto', fontSize: '15px' }}
                  >
                    <img src="https://www.gstatic.com/images/branding/product/1x/gsa_512dp.png" alt="Google" style={{ width: '20px', height: '20px', background: '#fff', borderRadius: '50%', padding: '2px', marginRight: '8px' }} />
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

        <p style={{ fontSize: '10px', color: '#ccc', textAlign: 'center', marginTop: '20px' }}>
          Running Mode: {isFlutterApp ? 'Flutter Mobile App' : 'Browser Web App'}
        </p>
      </motion.div>
    </div>
  );
}
