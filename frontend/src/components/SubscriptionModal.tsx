import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Check, Zap, Star, Gift, Shield } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface SubscriptionModalProps {
  user: any;
  isOpen: boolean;
  onClose: () => void;
  onRefreshUser: (updatedUser: any) => void;
}

export const SubscriptionModal: React.FC<SubscriptionModalProps> = ({ user, isOpen, onClose, onRefreshUser }) => {
  const [loading, setLoading] = useState(false);
  const [giftCode, setGiftCode] = useState('');
  const [giftError, setGiftError] = useState('');

  const handleRazorpay = async (plan: string, originalAmount: number) => {
    setLoading(true);
    let amount = originalAmount;

    // UPGRADE LOGIC: Cut basic amount if already subscribed
    if (user?.subscription_tier === 'basic' && plan === 'Premium') {
      amount = originalAmount - 199; // Difference (399 - 199 = 200)
    }

    const keyId = import.meta.env.VITE_RAZORPAY_KEY_ID;
    if (!keyId || keyId.includes('PLACEHOLDER')) {
      alert("Razorpay Key ID is not configured in .env file.");
      setLoading(false);
      return;
    }

    const options = {
      key: keyId,
      amount: amount * 100, // in paise
      currency: "INR",
      name: "MusicTube Premium",
      description: `Lifetime ${plan} Subscription`,
      image: "/logo.png",
      handler: async function (response: any) {
        // In a real app, verify signature on backend
        console.log("Payment Success:", response);
        await updateSubscriptionInSupabase(plan === 'Premium');
        onClose();
      },
      prefill: {
        name: user?.full_name || "",
        email: user?.email || "",
      },
      theme: {
        color: "#6600ff"
      }
    };

    // @ts-ignore
    const rzp = new window.Razorpay(options);
    rzp.open();
    setLoading(false);
  };

  const updateSubscriptionInSupabase = async (isPremium: boolean) => {
    if (!user?.id) return;
    const tier = isPremium ? 'premium' : 'basic';
    const { error } = await supabase
      .from('profiles')
      .update({ subscription_tier: tier })
      .eq('id', user.id);
    
    if (!error) {
      const updated = { ...user, subscription_tier: tier };
      localStorage.setItem('ytm_user', JSON.stringify(updated));
      onRefreshUser(updated);
      alert(`Success! You are now a ${tier} member.`);
    }
  };

  const handleGiftCode = async () => {
    if (!giftCode.trim()) return;
    setLoading(true);
    setGiftError('');

    try {
      const { data, error } = await supabase
        .from('gift_codes')
        .select('*')
        .eq('code', giftCode.trim())
        .eq('is_used', false)
        .single();

      if (error || !data) {
        setGiftError('Invalid or already used gift code.');
      } else {
        // Apply gift code
        const { error: updateError } = await supabase
          .from('gift_codes')
          .update({ is_used: true, used_by: user.id })
          .eq('id', data.id);
        
        if (!updateError) {
          await updateSubscriptionInSupabase(data.tier === 'premium');
        }
      }
    } catch (e) {
      setGiftError('An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <motion.div 
        className="w-full max-w-2xl bg-[#0f0f0f] border border-[#333] rounded-3xl overflow-hidden shadow-2xl"
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
      >
        <div className="p-6 md:p-8">
          <div className="flex justify-between items-center mb-8">
            <div className="flex items-center gap-3">
              <img src="/logo.png" className="w-10 h-10" alt="" />
              <h2 className="text-2xl font-bold text-white">MusicTube Premium</h2>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
              <X className="text-gray-400" />
            </button>
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-8">
            {/* Basic Plan */}
            <div className="p-6 rounded-2xl bg-white/5 border border-white/10 hover:border-purple-500/50 transition-all group flex flex-col">
              <div className="flex items-center gap-2 mb-4 text-purple-400">
                <Zap size={20} />
                <span className="font-semibold uppercase text-xs tracking-wider">Lifetime Basic</span>
              </div>
              <h3 className="text-3xl font-bold text-white mb-2">₹199</h3>
              <p className="text-gray-400 text-sm mb-6">Support the developer and get lifetime access to MusicTube.</p>
              
              <ul className="space-y-3 mb-8 flex-grow">
                <li className="flex items-center gap-2 text-sm text-gray-300">
                  <Check size={16} className="text-green-500" /> Lifetime access
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-300">
                  <Check size={16} className="text-green-500" /> All core features
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-400">
                  <Shield size={16} className="text-gray-500" /> Contains Ads
                </li>
              </ul>

              <button 
                disabled={loading || user?.subscription_tier === 'basic' || user?.subscription_tier === 'premium'}
                onClick={() => handleRazorpay('Basic', 199)}
                className="w-full py-3 rounded-xl bg-white text-black font-bold hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                {user?.subscription_tier === 'basic' || user?.subscription_tier === 'premium' ? 'Current Tier' : 'Buy Now'}
              </button>
            </div>

            {/* Premium Plan */}
            <div className="p-6 rounded-2xl bg-gradient-to-br from-purple-900/20 to-blue-900/20 border border-purple-500/30 hover:border-purple-500 transition-all group relative overflow-hidden flex flex-col">
              <div className="absolute top-0 right-0 bg-purple-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg uppercase tracking-tighter">Recommended</div>
              <div className="flex items-center gap-2 mb-4 text-yellow-400">
                <Star size={20} fill="currentColor" />
                <span className="font-semibold uppercase text-xs tracking-wider">Lifetime Pro</span>
              </div>
              <h3 className="text-3xl font-bold text-white mb-2">₹399</h3>
              <p className="text-gray-400 text-sm mb-6">The ultimate music experience. No interruptions, ever.</p>
              
              <ul className="space-y-3 mb-8 flex-grow">
                <li className="flex items-center gap-2 text-sm text-gray-300">
                  <Check size={16} className="text-green-500" /> Ad-Free Experience
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-300">
                  <Check size={16} className="text-green-500" /> Future App Updates
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-300">
                  <Check size={16} className="text-green-500" /> Priority Support
                </li>
              </ul>

              <button 
                disabled={loading || user?.subscription_tier === 'premium'}
                onClick={() => handleRazorpay('Premium', 399)}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold hover:opacity-90 transition-all disabled:opacity-50"
              >
                {user?.subscription_tier === 'premium' 
                  ? 'Current Tier' 
                  : (user?.subscription_tier === 'basic' ? 'Upgrade for ₹200' : 'Go Premium')}
              </button>
            </div>
          </div>

          <div className="pt-6 border-t border-white/10">
            <p className="text-sm text-gray-400 mb-4 flex items-center gap-2"><Gift size={16} /> Have a gift code?</p>
            <div className="flex gap-2">
              <input 
                type="text" 
                placeholder="Enter code"
                readOnly={loading}
                value={giftCode}
                onChange={(e) => setGiftCode(e.target.value)}
                className="flex-grow bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-purple-500"
              />
              <button 
                disabled={loading || !giftCode.trim()}
                onClick={handleGiftCode}
                className="px-6 py-2 bg-white/10 text-white rounded-xl hover:bg-white/20 transition-colors disabled:opacity-50"
              >
                Redeem
              </button>
            </div>
            {giftError && <p className="text-red-500 text-xs mt-2">{giftError}</p>}
          </div>
        </div>
      </motion.div>
    </div>
  );
};
