-- Playlist & Items Schema
CREATE TABLE IF NOT EXISTS playlists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS playlist_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  playlist_id UUID REFERENCES playlists(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  thumbnail TEXT NOT NULL,
  added_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Note: Enable RLS in Supabase if needed.
-- Policies:
-- CREATE POLICY "Users can view their own playlists" ON playlists FOR SELECT USING (auth.uid() = user_id);
-- CREATE POLICY "Users can create their own playlists" ON playlists FOR INSERT WITH CHECK (auth.uid() = user_id);
-- CREATE POLICY "Users can delete their own playlists" ON playlists FOR DELETE USING (auth.uid() = user_id);
