import { motion } from 'framer-motion';
import { User, Mail, Lock, ChevronLeft, ArrowRight } from 'lucide-react';
import { useState } from 'react';

interface ProfileSetupViewProps {
  onBack: () => void;
  onSubmit: (data: { name: string, email: string, pass: string }) => void;
  loading: boolean;
  error: string | null;
  initialName?: string;
  initialEmail?: string;
}

export function ProfileSetupView({ onBack, onSubmit, loading, error, initialName = '', initialEmail = '' }: ProfileSetupViewProps) {
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ name, email, pass: password });
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
        <h3>Finalize Profile</h3>
        <p>Please set a password and name for your account.</p>
      </header>

      <div className="modern-input-group">
        <label>Full Name</label>
        <div className="input-field-v2">
          <User size={18} />
          <input 
            type="text" 
            placeholder="John Doe" 
            value={name} 
            onChange={e => setName(e.target.value)} 
            required 
          />
        </div>
      </div>

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
            readOnly={!!initialEmail}
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
          <>Create Account <ArrowRight size={20} /></>
        )}
      </button>
    </motion.form>
  );
}
