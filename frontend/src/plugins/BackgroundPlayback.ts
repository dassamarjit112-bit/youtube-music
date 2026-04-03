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
  playSong(options: { title: string; artist: string; url: string }): Promise<void>;
  
  /** Pause native playback. */
  pause(): Promise<void>;
  
  /** Resume native playback. */
  resume(): Promise<void>;

  /** Stop the service (call when playback is fully stopped). */
  stopService(): Promise<void>;
  
  /** Update metadata. */
  updateMetadata(options: { title: string; artist: string }): Promise<void>;
}

// Web stub — all methods are no-ops when running outside Android
const WebImpl: BackgroundPlaybackPlugin = {
  startService:   async () => {},
  playSong:       async () => {},
  pause:          async () => {},
  resume:         async () => {},
  stopService:    async () => {},
  updateMetadata: async () => {},
};

export const BackgroundPlayback = registerPlugin<BackgroundPlaybackPlugin>(
  'BackgroundPlayback',
  { web: WebImpl }
);
