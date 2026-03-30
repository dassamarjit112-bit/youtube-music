-- 1. Create the Profiles Table with all necessary columns
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  subscription_tier TEXT DEFAULT 'free'
);

-- 2. Ensure RLS is enabled for data protection
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. Setup RLS Policies (Owner-only access)
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can create their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can view their own profile" ON public.profiles 
FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can create their own profile" ON public.profiles 
FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON public.profiles 
FOR UPDATE USING (auth.uid() = id);

-- 4. Manual Seed Data (Your provided profiles)
-- These use ON CONFLICT to ensure they don't cause errors if they already exist
INSERT INTO public.profiles (id, email, full_name, avatar_url, updated_at, subscription_tier) 
VALUES 
  ('301bff6b-7099-4251-9f05-0ff6d7ecc280', 'dassamarjit112@gmail.com', 'SAMARJIT DAS', 'https://lh3.googleusercontent.com/a/ACg8ocJq54z0gRISyeSJx8RQUpichYE3kPP937vECuIprREQi9jq9hY=s96-c', '2026-03-29 21:33:49.284538+00', 'premium'),
  ('dbeb2362-1722-4adf-bebe-13d01d9d38c1', 'ccbuyingbot01@gmail.com', 'Cc Shop', 'https://lh3.googleusercontent.com/a/ACg8ocK6I-B6azoQHPC1Zpl3kapI57_4bDf9HscmkwY67WKJVJIsdH0=s96-c', '2026-03-29 22:51:29.279+00', 'premium')
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  full_name = EXCLUDED.full_name,
  avatar_url = EXCLUDED.avatar_url,
  updated_at = EXCLUDED.updated_at,
  subscription_tier = EXCLUDED.subscription_tier;
