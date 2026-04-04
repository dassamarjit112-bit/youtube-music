/**
 * BackgroundPlayback Capacitor Plugin (Media3 Implementation)
 */
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface BackgroundPlaybackPlugin {
  /** Start/Update the Android Service (Legacy). */
  startService(options: { title: string; artist: string }): Promise<void>;

  /** Play/Update the native ExoPlayer. */
  playSong(options: { title: string; artist: string; url: string; imageUrl?: string; duration?: number }): Promise<void>;
  
  /** Pause native playback. */
  pause(): Promise<void>;
  
  /** Resume native playback. */
  resume(): Promise<void>;

  /** Skip to next in native queue. */
  next(): Promise<void>;

  /** Skip to previous in native queue. */
  previous(): Promise<void>;

  /** Seek to a specific time (seconds). */
  seekTo(options: { position: number }): Promise<void>;

  /** Get current playback position and duration. */
  getPlaybackState(): Promise<{ isPlaying: boolean; position: number; duration: number }>;

  /** Stop the service. */
  stopService(): Promise<void>;

  /** Listener for native player updates (track changes, state, errors). */
  addListener(
    eventName: 'onPlayerUpdate',
    listenerFunc: (data: { 
      type: string; 
      message?: string; 
      position?: number; 
      duration?: number; 
    }) => void
  ): Promise<PluginListenerHandle>;
}

const WebImpl: any = {
  startService:     async () => {},
  playSong:         async () => {},
  pause:            async () => {},
  resume:           async () => {},
  next:             async () => {},
  previous:         async () => {},
  seekTo:           async () => {},
  getPlaybackState: async () => ({ isPlaying: false, position: 0, duration: 0 }),
  stopService:      async () => {},
  addListener:      async () => ({ remove: async () => {} }),
};

export const BackgroundPlayback = registerPlugin<BackgroundPlaybackPlugin>(
  'BackgroundPlayback',
  { web: WebImpl }
);
