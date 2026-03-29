# Supabase Database Setup for MusicTube

Please run the following SQL commands in your Supabase SQL Editor to enable the new monetization and gift code features.

## 1. Update Profiles Table
Add the `subscription_tier` column to track user subscription status.

```sql
-- Add subscription_tier column to profiles if it doesn't exist
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS subscription_tier TEXT DEFAULT 'free';

-- Possible values: 'free', 'basic', 'premium'
```

## 2. Create Gift Codes Table
This table will store the gift codes that can be purchased or generated.

```sql
CREATE TABLE IF NOT EXISTS gift_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  tier TEXT NOT NULL DEFAULT 'basic', -- 'basic' or 'premium'
  is_used BOOLEAN DEFAULT false,
  used_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Enable Row Level Security (OPTIONAL)
-- ALTER TABLE gift_codes ENABLE ROW LEVEL SECURITY;
```

## 3. Seed some Gift Codes (Optional)
Run this to create some test codes.

```sql
INSERT INTO gift_codes (code, tier) 
VALUES 
  ('BASIC199', 'basic'),
  ('PREMIUM399', 'premium'),
  ('GIFT-MUSIC-TUBE', 'premium');
```

---
> [!IMPORTANT]
> Ensure you have your Razorpay keys added to the `.env` file in the `frontend` directory.
> `VITE_RAZORPAY_KEY_ID=rzp_live_YOUR_KEY_ID`
> `VITE_RAZORPAY_KEY_SECRET=YOUR_KEY_SECRET`
