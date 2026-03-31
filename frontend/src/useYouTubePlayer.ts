/**
 * useYouTubePlayer – wraps the YouTube IFrame API directly.
 * Improved for stability and control responsive-ness.
 */
import { useEffect, useRef, useCallback } from "react";

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

let apiLoaded = false;
let apiReadyCallbacks: (() => void)[] = [];

function loadYTApi() {
  if (apiLoaded || document.getElementById("yt-iframe-api")) return;
  const tag = document.createElement("script");
  tag.id = "yt-iframe-api";
  tag.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(tag);
  window.onYouTubeIframeAPIReady = () => {
    apiLoaded = true;
    apiReadyCallbacks.forEach((cb) => cb());
    apiReadyCallbacks = [];
  };
}

export interface YTPlayerOptions {
  onReady?: () => void;
  onStateChange?: (state: number) => void;
  onProgress?: (played: number, playedSeconds: number) => void;
  onDuration?: (duration: number) => void;
  onEnded?: () => void;
  onError?: (code: number) => void;
}

export function useYouTubePlayer(
  containerId: string,
  options: YTPlayerOptions
) {
  const playerRef = useRef<any>(null);
  const isReadyRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // Keep options stable in refs so player events can always access latest callbacks
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const stopProgress = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startProgress = useCallback(() => {
    stopProgress();
    intervalRef.current = setInterval(() => {
      const p = playerRef.current;
      if (!p || !isReadyRef.current || typeof p.getCurrentTime !== "function") return;
      try {
        const cur = p.getCurrentTime();
        const dur = p.getDuration();
        if (dur > 0) {
          optionsRef.current.onProgress?.(cur / dur, cur);
          optionsRef.current.onDuration?.(dur);
        }
      } catch {}
    }, 500);
  }, [stopProgress]);

  const onStateChange = (e: any) => {
    const state = e.data;
    optionsRef.current.onStateChange?.(state);

    // YouTube State Codes: 1 is PLAYING, 3 is BUFFERING
    if (state === 1 || state === 3) {
      startProgress();
    } else {
      stopProgress();
    }

    if (state === 0) {
      optionsRef.current.onEnded?.();
    }
  };

  const initPlayer = useCallback(
    (videoId: string) => {
      const container = document.getElementById(containerId);
      if (!container) return;

      if (playerRef.current && isReadyRef.current) {
        try {
          playerRef.current.loadVideoById(videoId);
          return;
        } catch (e) {
          console.error("Re-creation fallback", e);
        }
      }

      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch {}
      }

      isReadyRef.current = false;
      playerRef.current = new window.YT.Player(containerId, {
        videoId,
        playerVars: {
          autoplay: 1,
          playsinline: 1, // CRITICAL: Tells iOS/Android NOT to open native video player
          controls: 0,
          disablekb: 1,
          fs: 0,
          showinfo: 0,
          modestbranding: 1,
          rel: 0,
          origin: window.location.origin,
          widget_referrer: window.location.href,
          iv_load_policy: 3,
          enablejsapi: 1,
        },
        events: {
          onReady: () => {
            isReadyRef.current = true;
            optionsRef.current.onReady?.();
          },
          onStateChange: (e: any) => onStateChange(e),
          onError: (e: any) => optionsRef.current.onError?.(e.data),
        },
      });
      // Set ref immediately (redundant but matches previous lifecycle if needed)
    },
    [containerId, startProgress, stopProgress]
  );

  useEffect(() => {
    loadYTApi();
    return () => {
      stopProgress();
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch {}
      }
    };
  }, [stopProgress]);

  const load = useCallback(
    (videoId: string) => {
      if (!videoId) return;
      if (window.YT && window.YT.Player) {
        initPlayer(videoId); // This resolves the TS6133 error
      } else {
        apiReadyCallbacks.push(() => initPlayer(videoId));
      }
    },
    [initPlayer]
  ); 
 
  const play = useCallback(() => {
    try {
      if (playerRef.current && typeof playerRef.current.playVideo === 'function') {
        playerRef.current.playVideo();
      }
    } catch (e) {
      console.warn("Play command failed", e);
    }
  }, []);

  const pause = useCallback(() => {
    try {
      if (playerRef.current && typeof playerRef.current.pauseVideo === 'function') {
        playerRef.current.pauseVideo();
      }
      stopProgress();
    } catch (e) {
      console.warn("Pause command failed", e);
    }
  }, [stopProgress]);

  const seekTo = useCallback((fraction: number) => {
    if (!isReadyRef.current) return;
    const p = playerRef.current;
    if (!p || typeof p.getDuration !== "function") return;
    try {
      const dur = p.getDuration();
      p.seekTo(fraction * dur, true);
    } catch {}
  }, []);

  const setVolume = useCallback((vol: number) => {
    if (!isReadyRef.current) return;
    try { playerRef.current?.setVolume(vol * 100); } catch {}
  }, []);

  const cue = useCallback((videoId: string) => {
    if (!videoId || !isReadyRef.current) return;
    try {
      playerRef.current?.cueVideoById(videoId);
    } catch (e) {
      console.error("Cue failed", e);
    }
  }, []);

  return { 
    load, 
    cue, 
    play, 
    pause, 
    seekTo, 
    setVolume, 
    get player() { return playerRef.current; }
  };
}
