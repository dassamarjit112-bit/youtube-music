import { motion } from 'framer-motion';
import { Mail, Lock, ChevronLeft, LogIn } from 'lucide-react';
import { useState } from 'react';

interface LoginViewProps {
  onBack: () => void;
  onRegisterClick: () => void;
  onOAuth: (provider: 'google') => void;
  onSubmit: (email: string, pass: string) => void;
  loading: boolean;
  error: string | null;
}

export function LoginView({ onBack, onRegisterClick, onOAuth, onSubmit, loading, error }: LoginViewProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(email, password);
  };

  return (
    <motion.form 
      initial={{ x: 20, opacity: 0 }} 
      animate={{ x: 0, opacity: 1 }} 
      className="auth-standalone-form" 
      onSubmit={handleSubmit}
    >
      <header className="form-head">
        <button type="button" className="mini-back" onClick={onBack}><ChevronLeft size={20} /></button>
        <h3>Sign In</h3>
        <p>Enter your details below to continue.</p>
      </header>

      <div className="social-login-grid" style={{ marginBottom: '24px' }}>
        <button type="button" onClick={() => onOAuth('google')} className="social-pill-btn google">
          <img src="https://www.gstatic.com/images/branding/googleg/1x/googleg_standard_color_128dp.png" alt="G" />
          Continue with Google
        </button>
      </div>

      <div className="auth-divider-v2" style={{ marginBottom: '24px' }}><span>OR USE EMAIL</span></div>

      <div className="modern-input-group">
        <label>Email Address</label>
        <div className="input-field-v2">
          <Mail size={18} />
          <input 
            type="email" 
            placeholder="name@example.com" 
            value={email} 
            onChange={e => setEmail(e.target.value)} 
            required 
          />
        </div>
      </div>

      <div className="modern-input-group">
        <label>Password</label>
        <div className="input-field-v2">
          <Lock size={18} />
          <input 
            type="password" 
            placeholder="••••••••" 
            value={password} 
            onChange={e => setPassword(e.target.value)} 
            required 
          />
        </div>
      </div>

      {error && <div className="modern-auth-error">{error}</div>}

      <button type="submit" disabled={loading} className="giant-gradient-btn">
        {loading ? <div className="mini-loader" /> : (
          <><LogIn size={20} /> Sign In</>
        )}
      </button>

      <p className="form-footer-switch">
        Don't have an account?
        <span onClick={onRegisterClick}> Register Now</span>
      </p>
    </motion.form>
  );
}
