import { motion } from 'framer-motion';
import { UserPlus, ChevronLeft, LogIn } from 'lucide-react';

interface RegisterViewProps {
  onBack: () => void;
  onLoginClick: () => void;
  onNext: () => void;
  onOAuth: (provider: 'google') => void;
  loading: boolean;
}

export function RegisterView({ onBack, onLoginClick, onNext, onOAuth, loading }: RegisterViewProps) {
  return (
    <motion.div 
      key="register" 
      initial={{ opacity: 0, scale: 0.9 }} 
      animate={{ opacity: 1, scale: 1 }} 
      className="auth-step-container"
    >
      <header className="form-head">
        <button type="button" className="mini-back" onClick={onBack}><ChevronLeft size={20} /></button>
        <h3>Create Account</h3>
        <p>Pick a method to start your journey.</p>
      </header>
      
      <div className="social-login-grid" style={{ marginBottom: '24px' }}>
        <button 
          onClick={() => onOAuth('google')} 
          disabled={loading} 
          className="social-pill-btn google"
        >
          <img src="https://www.gstatic.com/images/branding/googleg/1x/googleg_standard_color_128dp.png" alt="G" />
          Sign up with Google
        </button>
      </div>

      <div className="auth-divider-v2" style={{ marginBottom: '24px' }}><span>OR USE EMAIL</span></div>

      <div className="landing-actions">
        <button className="primary-glass-btn" onClick={onNext} disabled={loading}>
          <UserPlus size={20} /> Register with Email
        </button>
      </div>

      <p className="form-footer-switch" style={{ marginTop: '24px' }}>
        Already have an account?
        <span onClick={onLoginClick}> <LogIn size={16} /> Sign In Instead</span>
      </p>
    </motion.div>
  );
}
