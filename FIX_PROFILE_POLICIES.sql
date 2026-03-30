-- Ensure that only one profile can exist per user 
-- This is already guaranteed by id being a PRIMARY KEY in the profiles table.

-- Add Secure RLS Policies for Profiles
-- 1. Ensure RLS is enabled
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies if need be 
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can create their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;

-- 3. Create strict policies
-- Anyone who is logged in can ONLY see THEIR profile.
-- Anyone who is logged in can ONLY create THEIR profile.
-- Anyone who is logged in can ONLY update THEIR profile.

CREATE POLICY "Users can view their own profile" ON profiles 
FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can create their own profile" ON profiles 
FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON profiles 
FOR UPDATE USING (auth.uid() = id);

-- This ensures data integrity and that no "duplicate" profiles for the same UUID can be created.
