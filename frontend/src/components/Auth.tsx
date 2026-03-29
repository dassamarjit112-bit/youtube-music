import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { motion } from 'framer-motion';
import { Headphones, ShieldCheck, Monitor } from 'lucide-react';

interface AuthProps {
  onLogin: (user: any) => void;
}

export function Auth({ onLogin }: AuthProps) {
  const [loading, setLoading] = useState(false);
  const [isFlutterApp, setIsFlutterApp] = useState(false);

  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
    const isWebView =
      (/flutter/i.test(userAgent) || (window as any).flutter_inappwebview !== undefined) &&
      window.location.port !== '8080';

    setIsFlutterApp(isWebView);
    if (isWebView) setIsSyncing(true);

    (window as any).onNativeLoginSuccess = async (nativeUserData: any) => {
      setLoading(true);
      setIsSyncing(false);
      try {
        const userToSync = {
          id: nativeUserData.id || nativeUserData.sub,
          email: nativeUserData.email,
          full_name: nativeUserData.name || nativeUserData.full_name || 'User',
          avatar_url: nativeUserData.picture || nativeUserData.avatar_url || '',
        };

        const { error: upsertError } = await supabase.from('profiles').upsert(userToSync);
        if (upsertError) console.error("Native Profile sync error:", upsertError.message);

        localStorage.setItem('ytm_user', JSON.stringify(userToSync));
        onLogin(userToSync);
      } catch (err) {
        console.error("Flutter App Sync failed:", err);
      } finally {
        setLoading(false);
      }
    };

    // Auto-timeout for sync (if stuck on mobile browser wrongly identified)
    let syncTimeout: ReturnType<typeof setTimeout>;
    if (isWebView) {
      syncTimeout = setTimeout(() => {
        setIsSyncing(false);
      }, 5000); // 5 sec fallback
    }

    return () => {
      delete (window as any).onNativeLoginSuccess;
      if (syncTimeout) clearTimeout(syncTimeout);
    };
  }, [onLogin]);

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

  if (isFlutterApp && isSyncing) {
    return (
      <div className="app-loader-container">
        <div className="mini-loader" />
        <p>Syncing your profile...</p>
        <button className="bypass-btn" onClick={() => setIsSyncing(false)}>Skip Sync</button>
      </div>
    );
  }

  return (
    <div className="auth-container-v2">
      <div className="auth-bg-overlay" />
      <motion.div
        className="auth-card-v2"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="auth-header-v2">
          <div className="auth-logo-v2">
            <img src="/logo.png" alt="MusicTube" className="auth-logo-img" />
            <h1 className="auth-title-v2">MusicTube</h1>
          </div>
          <p className="auth-subtitle-v2">Connect your music universe.</p>
        </div>

        <div className="auth-content-v2">
          <button
            onClick={handleSupabaseGoogleLogin}
            disabled={loading}
            className="google-btn-premium"
          >
            {loading ? (
              <div className="mini-loader" />
            ) : (
              <>
                <img src="https://www.gstatic.com/images/branding/googleg/1x/googleg_standard_color_128dp.png" className="google-icon-v2" />
                Sign in with Google
              </>
            )}
          </button>

          <div className="auth-benefits-v2">
            <div className="benefit-item-v2">
              <Headphones size={20} className="benefit-icon-v2" />
              <span>Listen and discover music you love.</span>
            </div>
            <div className="benefit-item-v2">
              <ShieldCheck size={20} className="benefit-icon-v2" />
              <span>Safe and secure authentication.</span>
            </div>
            <div className="benefit-item-v2">
              <Monitor size={20} className="benefit-icon-v2" />
              <span>Sync across all your devices.</span>
            </div>
          </div>
        </div>

        <div className="auth-footer-v2">
          <p>By signing in, you agree to our Terms and Conditions.</p>
          <div className="secure-badge-v2">
            <ShieldCheck size={12} /> Secure Account
          </div>
        </div>
      </motion.div>
    </div>
  );
}
