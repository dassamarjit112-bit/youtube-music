/**
 * BackgroundPlayback Capacitor Plugin (NouTube Style)
 */
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface BackgroundPlaybackPlugin {
  /** Update the native MediaSession metadata. */
  notify(options: { 
    title: string; 
    artist: string; 
    imageUrl?: string; 
    duration?: number 
  }): Promise<void>;

  /** Update the native playback state (Position/Play/Pause). */
  notifyProgress(options: { 
    isPlaying: boolean; 
    position: number 
  }): Promise<void>;

  /** Stop the service. */
  stopService(): Promise<void>;

  /** Listener for native transport commands (Play/Pause/Next/Prev/Seek). */
  addListener(
    eventName: 'onCommand',
    listenerFunc: (data: { command: string; position?: number }) => void
  ): Promise<PluginListenerHandle>;

  // --- Legacy stubs for compatibility during refactoring ---
  startService(options: any): Promise<void>;
  playSong(options: any): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
}

const WebImpl: any = {
  notify:         async () => {},
  notifyProgress: async () => {},
  stopService:    async () => {},
  addListener:    async () => ({ remove: async () => {} }),
  startService:   async () => {},
  playSong:       async () => {},
  pause:          async () => {},
  resume:         async () => {},
};

export const BackgroundPlayback = registerPlugin<BackgroundPlaybackPlugin>(
  'BackgroundPlayback',
  { web: WebImpl }
);
