/**
 * BackgroundPlayback Capacitor Plugin (Media3 Implementation)
 *
 * Bridges JavaScript to the native MusicPlayerService (ExoPlayer) on Android.
 */
import { registerPlugin } from '@capacitor/core';

export interface BackgroundPlaybackPlugin {
  /** Start/Update the Android Service (Legacy). */
  startService(options: { title: string; artist: string }): Promise<void>;
  
  /** Play a song via native ExoPlayer. */
  playSong(options: { title: string; artist: string; url: string; imageUrl?: string }): Promise<void>;
  
  /** Pause native playback. */
  pause(): Promise<void>;
  
  /** Resume native playback. */
  resume(): Promise<void>;

  /** Stop the service (call when playback is fully stopped). */
  stopService(): Promise<void>;
  
  /** Update metadata. */
  updateMetadata(options: { title: string; artist: string; imageUrl?: string }): Promise<void>;

  /** NEW: Get current playback position and duration. */
  getPlaybackState(): Promise<{ isPlaying: boolean; position: number; duration: number }>;

  /** NEW: Seek to a specific time (seconds). */
  seekTo(options: { position: number }): Promise<void>;
}

// Web stub — all methods are no-ops when running outside Android
const WebImpl: BackgroundPlaybackPlugin = {
  startService:     async () => {},
  playSong:         async () => {},
  pause:            async () => {},
  resume:           async () => {},
  stopService:      async () => {},
  updateMetadata:   async () => {},
  getPlaybackState: async () => ({ isPlaying: false, position: 0, duration: 0 }),
  seekTo:           async () => {},
};

export const BackgroundPlayback = registerPlugin<BackgroundPlaybackPlugin>(
  'BackgroundPlayback',
  { web: WebImpl }
);
