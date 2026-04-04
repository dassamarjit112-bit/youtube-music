import React, { useEffect, useState, useRef, useCallback } from "react";
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { CapacitorMusicControls as MusicControls } from 'capacitor-music-controls';
import { BackgroundPlayback } from './plugins/BackgroundPlayback';

import {
  Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1,
  Volume2, ThumbsUp, MoreVertical, Search, Download, Mic,
  Home, Compass, Library, PlusCircle, ArrowLeft, Music2, Menu, ShieldCheck, Lock, Shield,
  RefreshCw
} from "lucide-react";
import { api } from "./api";
import type { Song, HomeSection, SearchResult, ArtistDetail, AlbumDetail } from "./api";
import { useYouTubePlayer } from "./useYouTubePlayer";
import { supabase } from "./lib/supabase";
import { Auth } from "./components/Auth";
import { motion, AnimatePresence } from "framer-motion";
import { ControlledAd } from "./components/ControlledAd";
import { SubscriptionModal } from "./components/SubscriptionModal";
import "./App.css";

type View =
  | { name: "home" }
  | { name: "search" }
  | { name: "explore" }
  | { name: "library" }
  | { name: "account" }
  | { name: "artist"; id: string }
  | { name: "album"; id: string }
  | { name: "playlist"; id: string }
  | { name: "plans" }
  | { name: "player" };

const FALLBACK_THUMB = "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=500&h=500&fit=crop";

const formatTime = (s: number) => {
  if (!s || s < 0 || !isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sc = Math.floor(s % 60);
  return `${m}:${sc.toString().padStart(2, "0")}`;
};

const GUEST_USER = { id: 'guest', email: '', full_name: 'Guest', avatar_url: '', subscription_tier: 'free', isGuest: true };

function App() {
  const [view, setView] = useState<View>({ name: "account" }); // Force login page on entry
  const [homeData, setHomeData] = useState<HomeSection[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  const [user, setUser] = useState<any>(GUEST_USER);

  const navigateTo = (v: View) => {
    // Only library and specific authenticated views are restricted
    if (v.name === 'library' && (!isLoggedIn || !isSubscribed)) {
      if (!isLoggedIn) setView({ name: 'account' });
      else setView({ name: 'plans' });
      setIsSidebarOpen(false);
      return;
    }
    setView(v);
    setIsSidebarOpen(false);
  };

  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [played, setPlayed] = useState(0);       // 0–1 fraction
  const [playedSeconds, setPlayedSeconds] = useState(0);
  const [duration, setDuration] = useState(0);
  const [queue, setQueue] = useState<Song[]>([]);
  const [exploreData, setExploreData] = useState<{ title: string; items: any[] }[]>([]);
  const [isLoadingExplore, setIsLoadingExplore] = useState(false);
  const [artistData, setArtistData] = useState<ArtistDetail | null>(null);
  const [albumData, setAlbumData] = useState<AlbumDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [showMobilePlayer, setShowMobilePlayer] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [favorites, setFavorites] = useState<Song[]>([]); // list of full song objects
  const [playbackHistory, setPlaybackHistory] = useState<Song[]>([]);
  const [downloads, setDownloads] = useState<Song[]>([]);
  const [activeChip, setActiveChip] = useState<string | null>(null);
  const [playlists, setPlaylists] = useState<{ id: string; name: string; tracks: Song[] }[]>([]);
  const [activeMenuSong, setActiveMenuSong] = useState<Song | null>(null);
  const [showPlaylistDialog, setShowPlaylistDialog] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [giftCodeToClaim, setGiftCodeToClaim] = useState('');

  const isPremium = user?.subscription_tier === 'premium';
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<'none' | 'all' | 'one'>('none');
  const [autoPlay, setAutoPlay] = useState(true);
  const [showFloatingControls, setShowFloatingControls] = useState(false);
  const [isRefreshingQueue, setIsRefreshingQueue] = useState(false);

  useEffect(() => {
    const hOnline = () => setIsOffline(false);
    const hOffline = () => setIsOffline(true);
    window.addEventListener('online', hOnline);
    window.addEventListener('offline', hOffline);

    // Request Microphone and Notification permissions when entering the app
    const setupPermissions = async () => {
      // 1. Notification Permission
      if ("Notification" in window && (Notification.permission === "default" || Notification.permission === "denied")) {
        try { await Notification.requestPermission(); } catch (e) { }
      }
      // 2. Microphone (Record Audio) — trigger Android system dialog
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach(track => track.stop()); // Stop immediately after getting permission
        }
      } catch (e) {
        console.warn("Microphone permission denied:", e);
      }
    };
    setupPermissions();

    return () => {
      window.removeEventListener('online', hOnline);
      window.removeEventListener('offline', hOffline);
    };
  }, []);
  useEffect(() => {
    const hydrate = async () => {
      try {
        // ── SYNC WITH SUPABASE (THE ONLY SOURCE OF TRUTH) ──
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session?.user) {
          // Check local cache first for instant UI
          const cachedUserStr = localStorage.getItem('ytm_user');
          if (cachedUserStr) {
            const cachedUser = JSON.parse(cachedUserStr);
            if (cachedUser.id === session.user.id) {
               setUser(cachedUser);
               if (cachedUser.subscription_tier !== 'free') setView({ name: 'home' });
               else setView({ name: 'plans' });
            }
          }

          // Then fetch from DB to be sure
          const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
          if (profile) {
            const userObj = {
              id: session.user.id,
              email: session.user.email,
              full_name: profile.full_name || 'User',
              avatar_url: profile.avatar_url || '',
              subscription_tier: profile.subscription_tier || 'free'
            };
            setUser(userObj);
            localStorage.setItem('ytm_user', JSON.stringify(userObj));
            fetchPlaylists(userObj.id);
            
            // Default view management: Let everyone land on home
            if (userObj.subscription_tier !== 'free') {
               // Premium users stay on home
               setView({ name: 'home' }); 
            }
          }
        } else {
          // No session: User is GUEST_USER, let them stay on home (default state)
        }

        // ─── Playback Resumption: Load last known state ───
        const lastPlayback = localStorage.getItem('ytm_playback_state');
        if (lastPlayback) {
          try {
            const { song, queue: q, seconds } = JSON.parse(lastPlayback);
            if (song && song.videoId) {
              setCurrentSong(song);
              setQueue(q || [song]);
              setPlayedSeconds(seconds || 0);
              // Don't auto-play on load, just restore state
            }
          } catch (e) {
            console.warn("Resumption failed:", e);
          }
        }
      } catch (e) {
        console.warn("Storage hydration failed:", e);
        setView({ name: 'account' });
      }
    };
    hydrate();
  }, []);

  const isSubscribed = user && !user.isGuest && (user.subscription_tier === 'premium' || user.subscription_tier === 'basic');

  useEffect(() => {
    // ─── Playback state Persistence (Foreground Service Persistence) ───
    const handleUnload = () => {
      if (currentSongRef.current && currentSongRef.current.videoId) {
        localStorage.setItem('ytm_playback_state', JSON.stringify({
          song: currentSongRef.current,
          queue: queueRef.current,
          seconds: playedSeconds
        }));
      }
    };
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [playedSeconds]); // Depend on seconds to keep ref fresh if needed, but currentSongRef.current is already stable via useRef updates elsewhere.

  useEffect(() => {
    // Also save on every song change for robustness 
    if (currentSong && currentSong.videoId) {
      localStorage.setItem('ytm_playback_state', JSON.stringify({
        song: currentSong,
        queue: queue,
        seconds: playedSeconds
      }));
    }
  }, [currentSong, queue]);

  const silentAudioRef = useRef<HTMLAudioElement | null>(null);
  const wakeLockRef = useRef<any>(null);

  // ─── Wake Lock & Background Persistence (Foreground Service Support) ───
  useEffect(() => {
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator && isPlaying) {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        }
      } catch (err) {
        console.error("Wake Lock failed:", err);
      }
    };

    if (isPlaying) {
      requestWakeLock();
      if (!silentAudioRef.current) {
        silentAudioRef.current = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFav7//v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+');
        silentAudioRef.current.loop = true;
      }
      silentAudioRef.current.play().catch(() => { });
      if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";
    } else {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().then(() => {
          wakeLockRef.current = null;
        });
      }
      silentAudioRef.current?.pause();
      if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
    }
  }, [isPlaying]);

  const currentSongRef = useRef(currentSong);
  currentSongRef.current = currentSong;
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const queueRef = useRef(queue);
  queueRef.current = queue;

  const staticCurrentSongId = useRef<string | null>(null);
  const handleNextRef = useRef<() => void>(() => { });
  const handlePrevRef = useRef<() => void>(() => { });
  const ytPlayRef = useRef<() => void>(() => { });
  const ytPauseRef = useRef<() => void>(() => { });
  const setIsPlayingRef = useRef<any>(null);
  const repeatModeRef = useRef(repeatMode);
  const isShuffleRef = useRef(isShuffle);
  repeatModeRef.current = repeatMode;
  isShuffleRef.current = isShuffle;
  setIsPlayingRef.current = setIsPlaying;

  const ytPlayer = useYouTubePlayer("yt-player-container", {
    onReady: () => setIsPlaying(p => p),
    onStateChange: (state) => {
      if (state === 1 || state === 3) {
        setIsPlaying(true);
        setPlayerError(null);
      } else if (state === 2) {
        // Sync state if player was paused natively or via browser tray
        setIsPlaying(false);
      } else if (state === 0) {
        if (repeatModeRef.current !== 'one') setIsPlaying(false);
        handleNextRef.current();
      } else if (state === -1 && isPlayingRef.current) {
        setTimeout(() => { if (isPlayingRef.current) ytPlayer.play(); }, 1000);
      }
    },
    onProgress: (p, secs) => {
      setPlayed(p);
      setPlayedSeconds(secs);
    },
    onDuration: (d) => setDuration(d),
    onError: async (code) => {
      console.error("YouTube player error:", code);
      if (code === 150 || code === 101) {
        setPlayerError("Content restricted. Finding alternative...");
        try {
          const query = `${currentSong?.title} ${currentSong?.artist} audio`;
          const { results } = await api.search(query);
          const choice = (results || []).find((i: any) => i.videoId !== currentSong?.videoId && (i.type === "song" || i.type === "video"));
          if (choice) {
            setTimeout(() => { setPlayerError(null); playSong(choice as Song); }, 1000);
            return;
          }
        } catch (e) {
          console.error("Alternative search failed", e);
        }
      }
      setPlayerError(code === 150 || code === 101 ? "Embedding restricted." : code === 5 ? "HTML5 error." : `Playback error (${code}). Skipping...`);
      setTimeout(() => { setPlayerError(null); handleNextRef.current(); }, 1000);
    },
  });
  ytPlayRef.current = ytPlayer.play;
  ytPauseRef.current = ytPlayer.pause;


  const handleNext = useCallback(async () => {
    const q = queueRef.current;
    if (q.length === 0) return;

    // ── Use REFS so the closure is never stale ──
    const currentRepeatMode = repeatModeRef.current;
    const currentIsShuffle = isShuffleRef.current;

    // 0. Repeat ONE
    if (currentRepeatMode === 'one' && currentSongRef.current) {
      ytPlayer.load(currentSongRef.current.videoId);
      setIsPlaying(true);
      return;
    }

    const currentIdx = q.findIndex((s) => s.videoId === currentSongRef.current?.videoId);
    let nextIdx = currentIdx + 1;

    // 1. Shuffle
    if (currentIsShuffle && q.length > 1) {
      let rand = Math.floor(Math.random() * q.length);
      while (rand === currentIdx) {
        rand = Math.floor(Math.random() * q.length);
      }
      nextIdx = rand;
    }

    // 2. End of queue
    if (nextIdx >= q.length || nextIdx < 0) {
      if (currentRepeatMode === 'all' && q.length > 0) {
        nextIdx = 0;
      } else if (autoPlay && currentSongRef.current) {
        // INFINITE MODE: Fetch from API if queue is empty
        try {
          const res = await api.watch(currentSongRef.current.videoId);
          if (res.tracks && res.tracks.length > 0) {
            const newTracks = res.tracks.filter(t => !q.some(sq => sq.videoId === t.videoId));
            if (newTracks.length > 0) {
              setQueue(prev => [...prev, ...newTracks]);
              setCurrentSong(newTracks[0]);
              setIsPlaying(true);
              return;
            } else {
               // If no new tracks found, play the first one from API results even if duplicate
               setCurrentSong(res.tracks[0]);
               setIsPlaying(true);
               return;
            }
          }
        } catch (e) {
          console.error("Autoplay failed", e);
        }
        setIsPlaying(false);
        return;
      } else {
        setIsPlaying(false);
        return;
      }
    }

    // 3. Play the next song
    const nextSong = q[nextIdx];
    setCurrentSong(nextSong);
    setIsPlaying(true);

    // 4. Proactive Fetching: near end → fetch more
    if (autoPlay && nextIdx >= q.length - 3) {
      triggerAutoPlayExtension(nextSong);
    }
  }, [ytPlayer, autoPlay]);

  // Always keep the ref pointing at the latest handleNext
  handleNextRef.current = handleNext;

  const handlePrev = () => {
    if (playedSeconds > 3) {
      ytPlayer.seekTo(0);
      return;
    }
    const q = queueRef.current;
    const currentRepeatMode = repeatModeRef.current;
    const currentIdx = q.findIndex((s) => s.videoId === currentSongRef.current?.videoId);
    if (currentIdx > 0) {
      setCurrentSong(q[currentIdx - 1]);
      setIsPlaying(true);
    } else if (currentRepeatMode === 'all' && q.length > 0) {
      setCurrentSong(q[q.length - 1]);
      setIsPlaying(true);
    } else {
      // Already at start, just restart
      ytPlayer.seekTo(0);
    }
  };
  handlePrevRef.current = handlePrev;


  const triggerAutoPlayExtension = async (seedSong: Song) => {
    try {
      // 1. Fetch smart queue from backend (includes artist + language-similar tracks)
      const res = await api.watch(seedSong.videoId);
      let tracks = res.tracks || [];

      // 2. Filter out already queued songs
      const currentIds = new Set(queueRef.current.map(s => s.videoId));
      let filteredTracks = tracks.filter(t => !currentIds.has(t.videoId));

      // 3. Shuffle slightly for variety on every refresh/play (keeps first 5 stable)
      if (filteredTracks.length > 5) {
        const top = filteredTracks.slice(0, 5);
        const rest = filteredTracks.slice(5);
        for (let i = rest.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [rest[i], rest[j]] = [rest[j], rest[i]];
        }
        filteredTracks = [...top, ...rest];
      }

      // 4. Deep fetch if queue is still small
      if (filteredTracks.length < 25 && tracks.length > 2) {
        const deepSeed = tracks[Math.floor(Math.random() * Math.min(5, tracks.length))];
        try {
          const deepRes = await api.watch(deepSeed.videoId);
          const deepTracks = (deepRes.tracks || []).filter(
            t => !currentIds.has(t.videoId) && !filteredTracks.some(f => f.videoId === t.videoId)
          );
          filteredTracks = [...filteredTracks, ...deepTracks];
        } catch { /* ignore secondary fetch failure */ }
      }

      const nextBatch = filteredTracks.slice(0, 60);
      setQueue(prev => [...prev, ...nextBatch]);

      // 5. Start playback if stopped
      if (!isPlayingRef.current && nextBatch.length > 0) {
        setCurrentSong(nextBatch[0]);
        setIsPlaying(true);
      }
    } catch (e) {
      console.error("Auto-play extension failed:", e);
    }
  };


  const currentStreamUrlRef = useRef("");

  const playSong = async (song: Song, songList?: Song[]) => {
    if (!song.videoId) return;

    if (!isSubscribed) {
      setShowSubscriptionModal(true);
      return;
    }

    if (isOffline && !downloads.some(d => d.videoId === song.videoId)) {
      setPlayerError("You are offline. Only downloaded songs can be played.");
      setTimeout(() => setPlayerError(null), 3000);
      return;
    }

    console.log("▶ Playing:", song.title, "| videoId:", song.videoId);

    if (song.videoId === currentSongRef.current?.videoId) {
      ytPlayer.seekTo(0);
      ytPlayer.play();
    }

    setCurrentSong(song);
    setIsPlaying(true);
    setPlayed(0);
    setPlayedSeconds(0);
    setDuration(0);
    logHistory(song);

    // ─── Native ExoPlayer Dispatch (Android) ───
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
      currentStreamUrlRef.current = ""; // Reset for new song
      // Cache stream URL securely without triggering IP block immediately.
      // This will be ready when the app goes to the background.
      api.stream(song.videoId).then(res => {
         if (res.url) {
           currentStreamUrlRef.current = res.url;
           // TRIGGER NATIVE PLAY IMMEDIATELY ONCE URL ARRIVES
           BackgroundPlayback.playSong({
             title:  song.title,
             artist: song.artist || 'MusicTube',
             url:    res.url,
             imageUrl: song.thumbnail,
             duration: duration // pass duration if we have it or let native find it
           }).catch(() => {});
         }
      }).catch(e => console.warn("Background stream prep failed:", e));

      // Keep process alive for Webview
      BackgroundPlayback.startService({
        title:  song.title,
        artist: song.artist || 'MusicTube',
      }).catch(() => {});
    }

    // ─── Smart Queue Building ───
    if (songList && songList.length >= 5) {
      // Use the provided list as the base queue
      setQueue(songList);
      // If the list is small, extend it with related tracks
      if (songList.length < 30) {
        triggerAutoPlayExtension(song);
      }
    } else {
      // No list or very small — build a fresh smart queue from this song
      setQueue([song]);
      triggerAutoPlayExtension(song);
    }
  };

  // (Moved up for scoping)

  useEffect(() => {
    const handleVisible = () => {
      // If we come back and it should be playing but yt-player is paused, resume it.
      if (document.visibilityState === 'visible' && isPlaying) {
        ytPlayer.play();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisible);
    return () => document.removeEventListener('visibilitychange', handleVisible);
  }, [isPlaying, ytPlayer]);

  // ─── BACKGROUND HANDOFF ───
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
    
    // Add real-time listener for native player updates
    const nativeListener = BackgroundPlayback.addListener('onPlayerUpdate', (data) => {
      // console.log("Native Player Update:", data.type, data.message);
      if (data.type === 'trackTransition') {
        if (data.message === 'skipNext') {
            handleNextRef.current();
        } else if (data.message === 'skipPrev') {
            handlePrevRef.current();
        } else {
            handleNextRef.current(); // default
        }
      } else if (data.type === 'positionUpdate') {
         // Real-time progress sync from native service
         if (data.position && data.position > 0) {
            setPlayedSeconds(data.position);
         }
         if (data.duration && data.duration > 0 && !isFinite(duration)) {
            setDuration(data.duration);
         }
      } else if (data.type === 'playerError') {
        setPlayerError(`Native Playback Error: ${data.message}`);
      }
    });

    const stateListener = CapacitorApp.addListener('appStateChange', async ({ isActive }) => {
      if (!currentSongRef.current) return;
      
      if (!isActive) {
        // APP CLOSED/BACKGROUNDED -> Hand off to Native ExoPlayer
        if (ytPlayer.player && typeof ytPlayer.player.getCurrentTime === 'function') {
          const currentTime = ytPlayer.player.getCurrentTime() || 0;
          ytPlayer.pause();
          
          if (currentStreamUrlRef.current && isPlaying) {
            BackgroundPlayback.playSong({
              title: currentSongRef.current.title,
              artist: currentSongRef.current.artist || 'MusicTube',
              url: currentStreamUrlRef.current,
              imageUrl: currentSongRef.current.thumbnail
            }).then(() => {
              BackgroundPlayback.seekTo({ position: currentTime });
            }).catch(() => {});
          }
        }
      } else {
        // APP OPENED/FOREGROUNDED -> Hand off back to WebView
        const nativeState = await BackgroundPlayback.getPlaybackState().catch(() => null);
        
        if (nativeState && nativeState.position > 0) {
          ytPlayer.seekTo(nativeState.position);
          // Only pause native if we are successfully playing in webview
          BackgroundPlayback.pause().catch(() => {});
        }
        if (isPlaying) {
          ytPlayer.play();
        }
      }
    });

    return () => { 
      stateListener.then(l => l.remove());
      nativeListener.then(l => l.remove());
    };
  }, [isPlaying, ytPlayer]);

  // Volume sync
  useEffect(() => {
    ytPlayer.setVolume(isMuted ? 0 : volume);
  }, [volume, isMuted, ytPlayer]);

  const isAppActiveRef = useRef(true);
  useEffect(() => {
    const sub = CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      isAppActiveRef.current = isActive;
    });
    return () => { sub.then(l => l.remove()); };
  }, []);

  // ─── Unified Playback Controller (Cross-Platform) ───
  // This effect handles loading new songs AND syncing play/pause state
  useEffect(() => {
    if (!currentSong?.videoId) return;

    // 1. Sync Native Background State (Android)
    // ONLY sync if app is NOT in foreground (Active) or if it's already playing natively.
    // If we call resume() while in foreground, it can steal focus from the WebView player.
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android' && !isAppActiveRef.current) {
       if (isPlaying) {
         BackgroundPlayback.resume().catch(() => {});
       } else {
         BackgroundPlayback.pause().catch(() => {});
       }
    }

    // ─── HYBRID PLAYBACK CONTROLLER: Webview for UI, Native for Background ───
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android' && !isAppActiveRef.current) {
       if (isPlaying) {
         BackgroundPlayback.resume().catch(() => {});
       } else {
         BackgroundPlayback.pause().catch(() => {});
       }
    }

    const player = ytPlayer.player;
    const playerState = player?.getPlayerState?.();

    if (staticCurrentSongId.current !== currentSong.videoId) {
      staticCurrentSongId.current = currentSong.videoId;
      setPlayerError(null);
      ytPlayer.load(currentSong.videoId);
      return;
    }

    if (player) {
      if (isPlaying) {
        if (playerState === 2 || playerState === 0 || playerState === 5 || playerState === -1) {
          ytPlayer.play();
        }
      } else {
        if (playerState === 1 || playerState === 3) {
          ytPlayer.pause();
        }
      }
    }
  }, [isPlaying, currentSong]);


  useEffect(() => {
    if (!currentSong) return;

    // Use CapacitorMusicControls as a secondary UI bridge for the notification shade
    // while the BackgroundPlayback service handles the actual audio process.
    MusicControls.create({
      track: currentSong.title,
      artist: currentSong.artist || "MusicTube",
      cover: currentSong.thumbnail,
      isPlaying: isPlaying,
      dismissable: true,
      hasPrev: true,
      hasNext: true,
      hasClose: true,
      ticker: 'Now playing ' + currentSong.title,
      playIcon: 'media_play',
      pauseIcon: 'media_pause',
      prevIcon: 'media_prev',
      nextIcon: 'media_next',
      closeIcon: 'media_close',
      notificationIcon: 'notification',
      duration: isFinite(duration) ? duration : 0,
      elapsed: isFinite(playedSeconds) ? playedSeconds : 0
    }).catch(() => {});

    MusicControls.updateIsPlaying({ isPlaying: isPlaying });
  }, [currentSong, isPlaying, duration]);

  // Global static native listeners
  useEffect(() => {
    let listener: any = null;

    MusicControls.addListener('controlsNotification', (action: any) => {
      if (!action || !action.message) return;
      switch (action.message) {
        case 'music-controls-next':
          handleNextRef.current();
          break;
        case 'music-controls-previous':
          handlePrevRef.current();
          break;
        case 'music-controls-pause':
          ytPauseRef.current();
          setIsPlayingRef.current(false);
          break;
        case 'music-controls-play':
          ytPlayRef.current();
          setIsPlayingRef.current(true);
          break;
        case 'music-controls-destroy':
          break;
      }
    }).then(l => listener = l);

    if ("mediaSession" in navigator) {
      navigator.mediaSession.setActionHandler("play", () => {
        ytPlayRef.current();
        setIsPlayingRef.current(true);
      });
      navigator.mediaSession.setActionHandler("pause", () => {
        ytPauseRef.current();
        setIsPlayingRef.current(false);
      });
      navigator.mediaSession.setActionHandler("previoustrack", () => handlePrevRef.current());
      navigator.mediaSession.setActionHandler("nexttrack", () => handleNextRef.current());
      
      // New: Support lock-screen seeking / sliding the progress bar
      navigator.mediaSession.setActionHandler("seekto", (details) => {
        if (details.seekTime !== undefined) {
          ytPlayer.seekTo(details.seekTime);
          setPlayedSeconds(details.seekTime); // Instant UI feedback
        }
      });
      navigator.mediaSession.setActionHandler("seekbackward", (details) => {
        const offset = details.seekOffset || 10;
        const target = Math.max(0, playedSeconds - offset);
        ytPlayer.seekTo(target);
        setPlayedSeconds(target);
      });
      navigator.mediaSession.setActionHandler("seekforward", (details) => {
        const offset = details.seekOffset || 10;
        const target = Math.min(duration, playedSeconds + offset);
        ytPlayer.seekTo(target);
        setPlayedSeconds(target);
      });

    }

    return () => {
      if (listener) listener.remove();
    };
  }, []);


  // (Silent Audio handling consolidated into the main Wake Lock effect above)


  useEffect(() => {
    if (!("mediaSession" in navigator) || !currentSong) return;
    if (isFinite(duration) && duration > 0 && isFinite(playedSeconds)) {
      try {
        navigator.mediaSession.setPositionState({
          duration: duration,
          playbackRate: 1,
          position: Math.min(playedSeconds, duration)
        });
      } catch (e) {
        console.warn("mediaSession.setPositionState failed:", e);
      }
    }
  }, [currentSong, duration, playedSeconds]);

  // ─── Persistent System Notification (Secondary Controls) ───
  useEffect(() => {
    if (!currentSong) return;

    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentSong.title,
        artist: currentSong.artist || "MusicTube",
        album: currentSong.album || "MusicTube",
        artwork: [{ src: currentSong.thumbnail, sizes: '512x512', type: 'image/jpeg' }]
      });
    }

    if (!("Notification" in window) || Notification.permission !== "granted") return;
    
    const showSongNotification = async () => {
      const reg = await navigator.serviceWorker.ready;
      if (!reg) return;

      // Close previous to avoid stacking
      const notes = await reg.getNotifications({ tag: 'musictube-player' });
      notes.forEach(n => n.close());

      // Show notification even if paused for persistence (standard for Foreground Services)
      reg.showNotification(currentSong.title, {
        body: `🎵 ${currentSong.artist} • ${currentSong.album || 'MusicTube'}`,
        icon: currentSong.thumbnail,
        image: currentSong.thumbnail, // HERO image for beauty!
        badge: '/favicon.png',
        tag: 'musictube-player',
        silent: true,
        requireInteraction: true,
        data: { videoId: currentSong.videoId },
        actions: [
          { action: isPlaying ? 'pause' : 'play', title: isPlaying ? '⏸ Pause' : '▶ Play' },
          { action: 'next', title: '⏭ Next' },
          { action: 'prev', title: '⏮ Prev' }
        ]
      } as any);
    };

    showSongNotification();
  }, [currentSong?.videoId, isPlaying]); // Update when song or play state changes

  // Listener for actions in sw.js would be needed for buttons to work, 
  // but most users will use the standard Media Session controls in the tray.

  // ─── Notification Action Dispatcher ───
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    
    const hMsg = (event: MessageEvent) => {
      // Direct action from notification or service worker background tasks
      if (event.data?.type === 'notification-action') {
        const action = event.data.action;
        if (action === 'play') {
          setIsPlaying(true);
          ytPlayer.play();
        }
        if (action === 'pause') {
          setIsPlaying(false);
          ytPlayer.pause();
        }
        if (action === 'next') handleNext();
        if (action === 'prev') handlePrev();
      }
    };

    navigator.serviceWorker.addEventListener('message', hMsg);
    return () => navigator.serviceWorker.removeEventListener('message', hMsg);
  }, [ytPlayer, handleNext, handlePrev]); // Stable handlers with dependencies


  // App Session Listener
  useEffect(() => {
    if (user?.id && !user.isGuest) {
      fetchFavorites(user.id);
      fetchHistory(user.id);
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log("🔐 Auth event:", _event, session?.user?.id);

      if (session?.user) {
        // 1. FAST PATH: Optimistic update from Cache
        const cachedUserStr = localStorage.getItem('ytm_user');
        const cachedUser = cachedUserStr ? JSON.parse(cachedUserStr) : null;

        // If the cache is for a different user, ignore it!
        const isValidCache = cachedUser && cachedUser.id === session.user.id;

        const fastUser = {
          id: session.user.id,
          email: session.user.email,
          full_name: isValidCache ? cachedUser.full_name : (session.user.user_metadata?.full_name ?? 'User'),
          avatar_url: isValidCache ? cachedUser.avatar_url : (session.user.user_metadata?.avatar_url ?? ''),
          subscription_tier: isValidCache ? cachedUser.subscription_tier : 'free',
          isGuest: false
        };

        setUser(fastUser);
        if (_event === 'SIGNED_IN' || _event === 'INITIAL_SESSION') {
           if (fastUser.subscription_tier !== 'free') setView({ name: 'home' });
        }

        // 2. BACKGROUND SYNC: Fetch real data from DB
        supabase
          .from('profiles')
          .select('subscription_tier, full_name, avatar_url, email')
          .eq('id', session.user.id)
          .single()
          .then(({ data: profile, error: profileError }) => {
            // Handle profile sync
            const finalUser = {
              id: session.user.id,
              email: session.user.email,
              full_name: profile?.full_name || fastUser.full_name,
              avatar_url: profile?.avatar_url || fastUser.avatar_url,
              subscription_tier: profile?.subscription_tier || fastUser.subscription_tier || 'free',
              isGuest: false
            };
            
            setUser(finalUser);
            localStorage.setItem('ytm_user', JSON.stringify(finalUser));

            // Sync favorites/history/playlists
            fetchFavorites(finalUser.id);
            fetchHistory(finalUser.id);
            fetchPlaylists(finalUser.id);

            // Handle view redirection
            if (_event === 'SIGNED_IN' || _event === 'INITIAL_SESSION') {
              // Stay on current view unless it's the entry screens
              if (['account', 'plans'].includes(view.name)) {
                setView(finalUser.subscription_tier === 'free' ? { name: 'plans' } : { name: 'home' });
              }
            }

            // 3. SECURE UPSERT: Only if profile is confirmed missing
            // We use error code PGRST116 (no rows found for .single())
            if (profileError && profileError.code === 'PGRST116') {
              console.log("🆕 Initializing new profile for:", finalUser.email);
              supabase.from('profiles').upsert({
                id: finalUser.id,
                email: finalUser.email,
                full_name: finalUser.full_name,
                avatar_url: finalUser.avatar_url
                // Let DB DEFAULT handle subscription_tier ('free') to avoid overwriting 
              }, { onConflict: 'id' }).then(({ error: upsertErr }) => {
                if (upsertErr) console.error("❌ Profile init failed:", upsertErr);
                else console.log("🔥 Profile created successfully");
              });
            }
          });

      } else if (_event === 'SIGNED_OUT') {
        setUser(GUEST_USER);
        localStorage.removeItem('ytm_user');
        setView({ name: 'account' });
      }
    });

    return () => subscription.unsubscribe();
  }, [user?.id]);


  // Sync session loading
  const isLoggedIn = user && !user.isGuest;

  // Fetch data on tab change (Allow even if not logged in for Home/Explore)
  useEffect(() => {
    if (view.name === "home" && homeData.length === 0) fetchHome();
    if (view.name === "explore" && exploreData.length === 0) fetchExplore();
    if (view.name === "artist") fetchArtist((view as any).id);
    if (view.name === "album") fetchAlbum((view as any).id);
    if (view.name === "playlist") fetchPlaylist((view as any).id);
  }, [view.name, (view as any).id]);

  // Autostart first song from home feed if none selected
  useEffect(() => {
    if (homeData.length > 0 && homeData[0].items.length > 0 && !currentSong) {
      const firstSection = homeData[0];
      const song = firstSection.items.find((i: any) => i.type === "song" || i.type === "video");
      if (song) {
        console.log("⚡ Autostarting first song...");
        setCurrentSong(song as Song);
        setQueue(firstSection.items.filter((i: any) => i.type === "song" || i.type === "video") as Song[]);
      }
    }
  }, [homeData, currentSong]);

  const fetchFavorites = async (userId: string) => {
    const { data } = await supabase.from('favorites').select('item_id, title, artist, thumbnail').eq('user_id', userId);
    if (data) {
      setFavorites(data.map(item => ({
        videoId: item.item_id,
        title: item.title,
        artist: item.artist,
        thumbnail: item.thumbnail,
        type: 'song'
      } as any)));
    }
  };

  const fetchHistory = async (userId: string) => {
    const { data } = await supabase.from('history').select('*').eq('user_id', userId).order('played_at', { ascending: false }).limit(30);
    if (data) setPlaybackHistory(data as any);
  };

  const fetchPlaylists = async (userId: string) => {
    // 1. Fetch playlist metadata
    const { data: pData } = await supabase.from('playlists').select('id, name').eq('user_id', userId);
    if (!pData) return;

    // 2. Fetch all items (Song list for each playlist)
    const playlistsWithTracks = await Promise.all(pData.map(async (p) => {
      const { data: items } = await supabase.from('playlist_items').select('*').eq('playlist_id', p.id).order('added_at', { ascending: true });
      return { 
        id: p.id, 
        name: p.name, 
        tracks: (items || []).map(i => ({
          videoId: i.video_id,
          title: i.title,
          artist: i.artist,
          thumbnail: i.thumbnail,
          type: 'song'
        } as Song)) 
      };
    }));
    setPlaylists(playlistsWithTracks);
  };

  const createPlaylist = async (name: string) => {
    if (!name.trim() || !user || user.isGuest) return;
    
    const { data, error } = await supabase.from('playlists').insert({
      user_id: user.id,
      name: name
    }).select().single();

    if (error) {
      console.error("Playlist creation failed:", error);
      return;
    }

    const newPlaylist = { id: data.id, name: data.name, tracks: activeMenuSong ? [activeMenuSong] : [] };

    // If there was an active menu song, add it too!
    if (activeMenuSong) {
      await supabase.from('playlist_items').insert({
        playlist_id: data.id,
        video_id: activeMenuSong.videoId,
        title: activeMenuSong.title,
        artist: activeMenuSong.artist,
        thumbnail: activeMenuSong.thumbnail
      });
    }

    setPlaylists(prev => [...prev, newPlaylist]);
    setActiveMenuSong(null);
  };

  const addToPlaylist = async (song: Song, playlistId: string) => {
    if (!user || user.isGuest) return;
    
    // Check if already in playlist (simplified)
    const target = playlists.find(p => p.id === playlistId);
    if (target?.tracks.some(t => t.videoId === song.videoId)) {
       setActiveMenuSong(null);
       return;
    }

    const { error } = await supabase.from('playlist_items').insert({
      playlist_id: playlistId,
      video_id: song.videoId,
      title: song.title,
      artist: song.artist,
      thumbnail: song.thumbnail
    });

    if (!error) {
      setPlaylists(prev => prev.map(p =>
        p.id === playlistId ? { ...p, tracks: [...p.tracks, song] } : p
      ));
    }
    setActiveMenuSong(null);
  };

  const logHistory = async (song: Song) => {
    if (!user) return;
    await supabase.from('history').insert({
      user_id: user.id,
      video_id: song.videoId,
      title: song.title,
      artist: song.artist,
      thumbnail: song.thumbnail,
    });
  };

  const toggleFavorite = async (song: Song) => {
    if (!user) return;
    const isFav = favorites.some(f => f.videoId === song.videoId);
    if (isFav) {
      await supabase.from('favorites').delete().eq('user_id', user.id).eq('item_id', song.videoId);
      setFavorites(f => f.filter(s => s.videoId !== song.videoId));
    } else {
      await supabase.from('favorites').insert({
        user_id: user.id,
        item_id: song.videoId,
        type: 'song',
        title: song.title,
        artist: song.artist,
        thumbnail: song.thumbnail,
      });
      setFavorites(f => [song, ...f]);
    }
  };

  const fetchHome = async () => {
    try {
      const data = await api.home();
      setHomeData(data.sections);
    } catch (err) {
      console.error("Home fetch failed:", err);
    }
  };

  const toggleDownload = (song: Song) => {
    const isDownloaded = downloads.some(s => s.videoId === song.videoId);
    if (isDownloaded) {
      setDownloads(d => d.filter(s => s.videoId !== song.videoId));
    } else {
      setDownloads(d => [...d, song]);
      // Trigger a real file download too!
      downloadFile(song);
    }
  };

  const downloadFile = (song: Song) => {
    // Premium Download Logic: Use an optimized MP3 download service
    // This allows real file saving to mobile or desktop storage
    const downloadUrl = `https://api.vevioz.com/@download/mp3/${song.videoId}`;
    window.open(downloadUrl, '_blank');
  };

  const fetchExplore = async () => {
    setIsLoadingExplore(true);
    try {
      const moodsRes = await api.moods().catch(() => ({ categories: [] }));
      const newsRes = await api.newReleases().catch(() => ({ albums: [] }));
      const chartsRes = await api.charts().catch(() => ({ songs: [] }));

      const sections = [];
      if (chartsRes.songs?.length) sections.push({ title: "Charts", items: chartsRes.songs });
      if (newsRes.albums?.length) sections.push({ title: "New Releases", items: newsRes.albums });
      if (moodsRes.categories?.length) sections.push(...moodsRes.categories);

      // If still empty, use a fallback
      if (sections.length === 0) {
        const homeFallback = await api.home();
        sections.push(...homeFallback.sections.slice(0, 3));
      }

      setExploreData(sections);
    } catch (err) {
      console.error("Explore fetch failed", err);
    } finally {
      setIsLoadingExplore(false);
    }
  };

  const fetchArtist = async (id: string) => {
    setIsLoading(true);
    setArtistData(null);
    try {
      const data = await api.artist(id);
      setArtistData(data);
    } catch (err) {
      console.error("Artist fetch failed:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPlaylist = async (id: string) => {
    if (id.startsWith('local_')) return;
    setIsLoading(true);
    setAlbumData(null); // Reuse albumData or add playlistData state
    try {
      const data = await api.playlist(id);
      // Map PlaylistDetail to AlbumDetail shape for existing UI reuse
      setAlbumData({
        title: data.title,
        artist: "Playlist",
        thumbnail: data.thumbnail,
        year: "",
        trackCount: data.trackCount,
        duration: "",
        tracks: data.tracks
      });
    } catch (err) {
      console.error("Playlist fetch failed:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const [isRecording, setIsRecording] = useState(false);

  const startVoiceSearch = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice search is not supported in this browser. Please use Chrome.");
      return;
    }

    const recognition = new SpeechRecognition();
    // Support multiple languages — browser picks best match from user's locale
    recognition.lang = navigator.language || 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 3;

    recognition.onstart = () => {
      setIsRecording(true);
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript.trim();
      if (!transcript) return;

      setIsRecording(false);
      
      // 1. Update UI and Search Query
      setSearchQuery(transcript);
      setView({ name: 'search' });
      setIsSearching(true);
      setSearchResults([]);

      // 2. Mark voice search as active so debounce doesn't duplicate the search
      isVoiceSearchActiveRef.current = true;

      // 3. Fire search immediately (don't wait for debounce)
      api.search(transcript)
        .then((res) => {
          console.log("Voice Search Results:", res.results);
          if (res.results && res.results.length > 0) {
            setSearchResults(res.results);
          } else {
            console.warn("Voice search returned no results for:", transcript);
          }
        })
        .catch((err) => {
          console.error('Voice search API failure:', err);
          setSearchResults([]);
        })
        .finally(() => setIsSearching(false));
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      setIsRecording(false);
      if (event.error === 'not-allowed') {
        alert("Microphone permission denied. Please enable microphone access in your browser settings.");
      } else if (event.error === 'no-speech') {
        // silently ignore — user just didn't speak
      } else {
        alert(`Voice search error: ${event.error}. Try again.`);
      }
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognition.start();
  };

  // ── Refresh Queue: generate a fresh set of related songs ──
  const handleRefreshQueue = async () => {
    if (!currentSongRef.current || isRefreshingQueue) return;
    setIsRefreshingQueue(true);
    try {
      const seed = currentSongRef.current;
      const res = await api.watch(seed.videoId);
      let tracks = (res.tracks || []) as Song[];
      // Shuffle them for variety
      for (let i = tracks.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
      }
      // Keep the current song at top, then new tracks
      const filtered = tracks.filter(t => t.videoId !== seed.videoId);
      const freshQueue = [seed, ...filtered.slice(0, 50)];
      setQueue(freshQueue);
      
      // If we are on player page, notify user? Maybe just let state update.
      console.log("Queue refreshed with", filtered.length, "songs.");
    } catch (e) {
      console.error('Refresh queue failed:', e);
    } finally {
      setIsRefreshingQueue(false);
    }
  };

  const fetchAlbum = async (id: string) => {
    setIsLoading(true);
    setAlbumData(null);
    try {
      const data = await api.album(id);
      setAlbumData(data);
    } catch (err) {
      console.error("Album fetch failed:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Debounced search-as-you-type
  // Note: voice search fires API immediately and sets isSearching=true; this debounce
  // will fire after 500ms but isSearching guard prevents double-loading UX flicker.
  const isVoiceSearchActiveRef = useRef(false);
  useEffect(() => {
    if (!searchQuery.trim()) {
      if (view.name === "search") setView({ name: "home" });
      setSearchResults([]);
      isVoiceSearchActiveRef.current = false;
      return;
    }

    // If voice search already fired an immediate search, skip the debounce this round
    if (isVoiceSearchActiveRef.current) {
      isVoiceSearchActiveRef.current = false;
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      if (view.name !== "search") setView({ name: "search" });
      try {
        const res = await api.search(searchQuery);
        setSearchResults(res.results);
      } catch (err) {
        console.error("Search failed:", err);
      } finally {
        setIsSearching(false);
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setView({ name: "search" });
    try {
      const res = await api.search(searchQuery);
      setSearchResults(res.results);
    } catch (err) {
      console.error("Search failed:", err);
    } finally {
      setIsSearching(false);
    }
  };
  // Chip navigation
  const handleChipClick = async (chip: string) => {
    setActiveChip(chip);
    try {
      // Mocking discovery path
      const res = await api.search(chip + " songs");
      setHomeData([{ title: chip + " Hits", items: res.results }]);
    } catch (e) { console.error(e); }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setPlayed(val);
    ytPlayer.seekTo(val);
  };



// (navigateTo was moved to top of App component)

  const handleShuffleToggle = () => setIsShuffle(!isShuffle);
  const handleRepeatToggle = () => {
    if (repeatMode === 'none') setRepeatMode('all');
    else if (repeatMode === 'all') setRepeatMode('one');
    else setRepeatMode('none');
  };

  // ─── Login Screen ────────────────────────────────────────────────────────────
  // Removed strict login wall to allow Guest browsing

  const handleLogout = async () => {
    try {
      // 1. Explicitly sign out with local scope to wipe session from browser storage
      await supabase.auth.signOut({ scope: 'local' });
    } catch (e) {
      console.warn("Supabase signout sync failed, forcing local scrub.", e);
    } finally {
      // 2. Comprehensive scrub of all storage types
      localStorage.clear();
      sessionStorage.clear();
      
      // 3. Clear all Cookies
      const cookies = document.cookie.split(";");
      for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i];
        const eqPos = cookie.indexOf("=");
        const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
        document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
        // Also try clearing at domain root to be safe
        document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=" + window.location.hostname;
      }

      // 4. Force state reset
      setUser(GUEST_USER);
      setIsPlaying(false);
      try { ytPlayer?.pause(); } catch (err) {}
      try { silentAudioRef.current?.pause(); } catch (err) {}
      setCurrentSong(null);
      setQueue([]);
      
      // 5. Hard reload to ensure all memory states and Supabase instances are nuked
      window.location.href = window.location.origin;
    }
  };

  // (Consolidated into the effect above)



  // --- Main App ---
  // App always renders; Auth is shown as a view (account page)

  return (
    <div className={`app-container ${isSidebarOpen ? 'sidebar-open' : ''}`}>
      {/* Sidebar Overlay (Mobile) */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            className="sidebar-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar - Only visible if subscribed */}
      {isSubscribed && (
        <aside className={`sidebar ${isSidebarOpen ? 'mobile-visible' : ''}`}>
          <div className="logo-section" onClick={() => navigateTo({ name: 'home' })} style={{ cursor: 'pointer' }}>
            <img src="/logo.png" className="logo-img" style={{ width: 28, height: 28 }} alt="" />
            <span style={{ fontWeight: 800, color: '#fff', marginLeft: 8 }}>MusicTube</span>
            <button className="mobile-only close-sidebar" onClick={() => setIsSidebarOpen(false)}>
              <ArrowLeft size={24} />
            </button>
          </div>
          <nav>
            <button onClick={() => navigateTo({ name: "home" })} className={view.name === "home" ? "active" : ""}>
              <Home size={24} /> <span>Home</span>
            </button>
            <button onClick={() => navigateTo({ name: "explore" })} className={view.name === "explore" ? "active" : ""}>
              <Compass size={24} /> <span>Explore</span>
            </button>
            <button
              onClick={() => isLoggedIn ? navigateTo({ name: "library" }) : setView({ name: 'account' })}
              className={view.name === "library" ? "active" : ""}
            >
              <Library size={24} /> <span>Library</span>
            </button>
          </nav>
          <div className="sidebar-divider" />
          <div className="playlists-section">
            <button className="new-playlist-btn" onClick={() => navigateTo({ name: 'library' })}>
              <PlusCircle size={20} /> <span>New Playlist</span>
            </button>
            <div className="playlist-item" onClick={() => navigateTo({ name: 'library' })}>
              <div className="playlist-icon liked"><ThumbsUp size={16} fill="currentColor" /></div>
              <span>Liked Songs</span>
            </div>
          </div>

          {/* Queue */}
          {queue.length > 0 && (
            <div className="queue-section">
              <p className="queue-title">Queue ({queue.length})</p>
              {queue.map((s, i) => (
                <div
                  key={i}
                  className={`queue-item ${currentSong?.videoId === s.videoId ? "active" : ""}`}
                  onClick={() => playSong(s)}
                >
                  <img src={s.thumbnail} alt="" />
                  <span>{s.title}</span>
                </div>
              ))}
            </div>
          )}
        </aside>
      )}

      {/* Main Content */}
      <main className={`main-content ${!isSubscribed ? 'full-width-minimal' : ''}`} style={!isSubscribed ? { gridColumn: '1 / -1', gridRow: '1 / -1' } : {}}>
        <header className="main-header glass-effect">
          <div className="header-left">
            {isSubscribed && (
              <>
                <button className="menu-btn" onClick={() => setIsSidebarOpen(true)}>
                  <Menu size={20} />
                </button>
                
                <div className="mobile-brand" onClick={() => navigateTo({ name: 'home' })}>
                  <img src="/logo.png" style={{ width: 22, height: 22 }} alt="" />
                  <span className="brand-text mobile-hide">MusicTube</span>
                </div>

                <form onSubmit={handleSearch} className="search-box">
                  <Search size={18} />
                  <input
                    type="text"
                    placeholder={isRecording ? "Listening..." : "Search music..."}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {isRecording && (
                    <div className="voice-animation">
                      <div className="voice-bar"></div>
                      <div className="voice-bar"></div>
                      <div className="voice-bar"></div>
                      <div className="voice-bar"></div>
                    </div>
                  )}
                  <button 
                    type="button" 
                    className={`mic-btn ${isRecording ? 'recording' : ''}`} 
                    onClick={startVoiceSearch}
                    style={{ background: 'none', border: 'none', color: isRecording ? '#ff1e14' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '0 8px' }}
                  >
                    <Mic size={18} />
                  </button>
                </form>
              </>
            )}
            {!isSubscribed && (
              <div className="mobile-brand" onClick={() => setView({ name: 'plans' })}>
                <img src="/logo.png" style={{ width: 22, height: 22 }} alt="" />
                <span className="brand-text">MusicTube</span>
              </div>
            )}
          </div>

          <div className="user-profile">
            <div 
              className="avatar" 
              onClick={() => setView({ name: 'account' })}
              title="Account Settings"
            >
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%' }} />
              ) : (
                (user?.full_name?.[0] || user?.email?.[0] || 'U').toUpperCase()
              )}
            </div>
          </div>
        </header>

        <section className="scroll-area">
          <AnimatePresence mode="wait">
            <motion.div
              key={view.name + ((view as any).id || "")}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
            >
              {/* ── HOME ── */}
              {view.name === "home" && (
                <div className="home-view">
                  <div className="chips">
                    {["Energize", "Relax", "Workout", "Commute", "Focus"].map((c) => (
                      <button
                        key={c}
                        className={`chip ${activeChip === c ? 'active' : ''}`}
                        onClick={() => handleChipClick(c)}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                  <ControlledAd isPremium={isPremium} adSlot="home_top" />
                  {homeData.length === 0 && (
                    <div className="loading-grid">
                      {[1, 2, 3, 4].map(i => <div key={i} className="skeleton-card" />)}
                    </div>
                  )}
                  {homeData.map((s, i) => (
                    <div key={i} className="section-container">
                      <h2>{s.title}</h2>
                      <div className="horizontal-scroll">
                        {s.items.map((item: any, j) => (
                          <div
                            key={j}
                            className="card"
                            onClick={() => {
                              if (item.type === "song" || item.type === "video") {
                                const songList = s.items.filter(
                                  (x: any) => x.type === "song" || x.type === "video"
                                ) as Song[];
                                playSong(item as Song, songList);
                              } else if (item.type === "artist" && item.browseId) {
                                setView({ name: "artist", id: item.browseId } as any);
                              } else if (item.type === "album" && item.browseId) {
                                setView({ name: "album", id: item.browseId } as any);
                              } else if (item.type === "playlist" && (item.playlistId || item.browseId)) {
                                setView({ name: "playlist", id: item.playlistId || item.browseId } as any);
                              }
                            }}
                          >
                            <div className="card-thumb">
                              <img
                                src={item.thumbnail}
                                alt=""
                                loading="lazy"
                                onError={(e) => { (e.target as any).src = 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=500&h=500&fit=crop'; }}
                              />
                              {(item.type === "song" || item.type === "video") && (
                                <div className="play-overlay">
                                  <Play size={24} fill="#fff" />
                                  <button
                                    className={`fav-btn ${favorites.some(f => f.videoId === item.videoId) ? 'active' : ''}`}
                                    onClick={(e) => { e.stopPropagation(); toggleFavorite(item as Song); }}
                                  >
                                    <ThumbsUp size={16} fill={favorites.some(f => f.videoId === item.videoId) ? "currentColor" : "none"} />
                                  </button>
                                </div>
                              )}
                            </div>
                            <div className="card-info">
                              <h3>{item.title || item.name}</h3>
                              <p>{item.artist || item.subscribers || ""}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── EXPLORE ── */}
              {view.name === "explore" && (
                <div className="explore-view">
                  <div className="section-header">
                    <h2>Explore</h2>
                    <div className="explore-chips">
                      <button className="chip active">Charts</button>
                      <button className="chip">New Releases</button>
                      <button className="chip">Moods</button>
                    </div>
                  </div>
                  <ControlledAd isPremium={isPremium} adSlot="explore_top" />
                  {isLoadingExplore ? (
                    <div className="loading-grid">
                      {[1, 2, 3].map(i => <div key={i} className="skeleton-card" />)}
                    </div>
                  ) : exploreData.map((s, i) => (
                    <div key={i} className="section-container">
                      <div className="section-header">
                        <h2>{s.title}</h2>
                        {s.title === "Charts" && <span className="badge">Global</span>}
                      </div>
                      <div className="horizontal-scroll">
                        {s.items.map((item: any, j) => (
                          <div
                            key={j}
                            className={`card ${s.title === 'Charts' ? 'chart-card' : ''}`}
                            onClick={() => {
                              if (item.type === "song" || item.type === "video") playSong(item as Song);
                              else if (item.type === "album" && item.browseId) setView({ name: "album", id: item.browseId } as any);
                              else if (item.type === "artist" && item.browseId) setView({ name: "artist", id: item.browseId } as any);
                              else if (item.type === "playlist" && item.playlistId) setView({ name: "playlist", id: item.playlistId } as any);
                            }}
                          >
                            <div className="card-thumb">
                              <img
                                src={item.thumbnail}
                                alt=""
                                onError={(e) => { (e.target as any).src = 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=200&h=200&fit=crop'; }}
                              />
                              {s.title === 'Charts' && <div className="rank">#{j + 1}</div>}
                            </div>
                            <div className="card-info">
                              <h3>{item.title || item.name}</h3>
                              <p>{item.artist || item.year || ""}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── LIBRARY ── */}
              {view.name === "library" && (
                <div className="library-view">
                  <div className="library-grid">
                    <section>
                      <div className="section-header">
                        <h2>Downloads</h2>
                        <span className="badge">Offline Available</span>
                      </div>
                      {downloads.length === 0 ? (
                        <p className="no-data">Songs you save for offline will appear here.</p>
                      ) : (
                        <div className="track-list">
                          {downloads.map((song, i) => (
                            <div key={i} className="track-row" onClick={() => playSong(song, downloads)}>
                              <span className="track-num">{i + 1}</span>
                              <img src={song.thumbnail} alt="" />
                              <div className="track-info-col">
                                <h3>{song.title}</h3>
                                <p>{song.artist}</p>
                              </div>
                              <button
                                className="more-btn-row"
                                onClick={(e) => { e.stopPropagation(); setActiveMenuSong(song); }}
                              >
                                <MoreVertical size={18} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>

                    <section className="playlist-creation-section">
                      <button className="big-create-btn" onClick={() => setShowPlaylistDialog(true)}>
                        <PlusCircle size={24} /> Create New Playlist
                      </button>
                    </section>

                    <section>
                      <div className="section-header">
                        <h2>Playlists</h2>
                      </div>
                      {playlists.length === 0 ? (
                        <p className="no-data">Create your first playlist to get started.</p>
                      ) : (
                        <div className="track-list">
                          {playlists.map((p) => (
                            <div key={p.id} className="track-row" onClick={() => {
                              setAlbumData({
                                title: p.name,
                                artist: "Your Playlist",
                                thumbnail: p.tracks[0]?.thumbnail || "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=200&h=200&fit=crop",
                                year: "",
                                trackCount: p.tracks.length,
                                duration: "",
                                tracks: p.tracks
                              });
                              setView({ name: 'playlist', id: p.id } as any);
                            }}>
                              <div className="playlist-icon-sm"><Music2 size={20} /></div>
                              <div className="track-info-col">
                                <h3>{p.name}</h3>
                                <p>{p.tracks.length} tracks</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                    <section>
                      <h2>Liked Songs</h2>
                      {favorites.length === 0 ? (
                        <p className="no-data">Your favorites will appear here.</p>
                      ) : (
                        <div className="track-list">
                          {favorites.map((song, i) => (
                            <div key={i} className="track-row" onClick={() => playSong(song, favorites)}>
                              <span className="track-num">{i + 1}</span>
                              <img src={song.thumbnail} alt="" />
                              <div className="track-info-col">
                                <h3>{song.title}</h3>
                                <p>{song.artist}</p>
                              </div>
                              <div className="track-actions-row">
                                <button
                                  className="more-btn-row"
                                  onClick={(e) => { e.stopPropagation(); setActiveMenuSong(song); }}
                                >
                                  <MoreVertical size={18} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>

                    <section className="library-history-section">
                      <div className="section-header">
                        <h2>Recent History</h2>
                      </div>
                      {playbackHistory.length === 0 ? (
                        <p className="no-data">No history yet.</p>
                      ) : (
                        <div className="track-list">
                          {playbackHistory.slice(0, 10).map((song, i) => (
                            <div key={i} className="track-row" onClick={() => playSong(song)}>
                              <span className="track-num">{i + 1}</span>
                              <img
                                src={song.thumbnail}
                                alt=""
                                onError={(e) => { (e.target as any).src = 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=200&h=200&fit=crop'; }}
                              />
                              <div className="track-info-col">
                                <h3>{song.title}</h3>
                                <p>{song.artist}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  </div>
                </div>
              )}

              {/* ── SEARCH ── */}
              {view.name === "search" && (
                <div className="search-view">
                  <h2>Results for "{searchQuery}"</h2>
                  {isSearching ? <div className="loader" /> : (
                    <div className="search-list">
                      {searchResults.map((item: any, i) => (
                        <div
                          key={i}
                          className="search-row"
                          onClick={() => {
                            if (item.type === "song" || item.type === "video") {
                              const songList = searchResults.filter(
                                (x: any) => x.type === "song" || x.type === "video"
                              ) as Song[];
                              playSong(item as Song, songList);
                            } else if (item.type === "artist" && item.browseId) {
                              setView({ name: "artist", id: item.browseId } as any);
                            } else if (item.type === "album" && item.browseId) {
                              setView({ name: "album", id: item.browseId } as any);
                            } else if (item.type === "playlist" && (item.playlistId || item.browseId)) {
                              setView({ name: "playlist", id: item.playlistId || item.browseId } as any);
                            }
                          }}
                        >
                          <img
                            src={item.thumbnail}
                            alt=""
                            className="row-thumb"
                            onError={(e) => { (e.target as any).src = FALLBACK_THUMB; }}
                          />
                          <div className="row-info">
                            <h3>{item.title || item.name}</h3>
                            <p className="row-type-badge">{item.type}</p>
                            <p>{item.artist || item.subscribers || ""}</p>
                          </div>
                          <div className="row-actions">
                            {(item.type === "song" || item.type === "video") && (
                              <button
                                className={`dl-btn ${downloads.some(d => d.videoId === item.videoId) ? 'active' : ''}`}
                                onClick={(e) => { e.stopPropagation(); toggleDownload(item as Song); }}
                              >
                                <PlusCircle size={18} />
                              </button>
                            )}
                            <button
                              className="more-btn-row"
                              onClick={(e) => { e.stopPropagation(); setActiveMenuSong(item as Song); }}
                            >
                              <MoreVertical size={18} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── CONTEXT MENU OVERLAY ── */}
              <AnimatePresence>
                {activeMenuSong && (
                  <div className="menu-overlay" onClick={() => setActiveMenuSong(null)}>
                    <motion.div
                      className="menu-content"
                      initial={{ y: "100%" }}
                      animate={{ y: 0 }}
                      exit={{ y: "100%" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="menu-header">
                        <img src={activeMenuSong.thumbnail} alt="" />
                        <div className="txt">
                          <h3>{activeMenuSong.title}</h3>
                          <p>{activeMenuSong.artist}</p>
                        </div>
                      </div>
                      <div className="menu-list">
                        <button onClick={() => { playSong(activeMenuSong); setActiveMenuSong(null); }}>
                          <Play size={20} /> Play
                        </button>
                        <button onClick={() => { toggleFavorite(activeMenuSong); setActiveMenuSong(null); }}>
                          <ThumbsUp size={20} fill={favorites.some(f => f.videoId === activeMenuSong.videoId) ? "currentColor" : "none"} />
                          {favorites.some(f => f.videoId === activeMenuSong.videoId) ? 'Remove from Liked' : 'Like'}
                        </button>
                        <button onClick={() => { toggleDownload(activeMenuSong); setActiveMenuSong(null); }}>
                          <PlusCircle size={20} /> {downloads.some(d => d.videoId === activeMenuSong.videoId) ? 'Remove from Downloads' : 'Save to Downloads'}
                        </button>
                        <button onClick={() => { downloadFile(activeMenuSong); setActiveMenuSong(null); }}>
                          <Download size={20} /> Download MP3 to Storage
                        </button>
                        <div className="submenu-section">
                          <p>Add to Playlist</p>
                          {playlists.map((p) => (
                            <button key={p.id} onClick={() => addToPlaylist(activeMenuSong, p.id)}>
                              <Music2 size={18} /> {p.name}
                            </button>
                          ))}
                          <button className="new-p-btn" onClick={() => { setShowPlaylistDialog(true); }}>
                            + New Playlist
                          </button>
                        </div>
                      </div>
                      <button className="menu-close" onClick={() => setActiveMenuSong(null)}>Close</button>
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>

              {/* ── NEW PLAYLIST DIALOG ── */}
              {showPlaylistDialog && (
                <div className="dialog-overlay">
                  <div className="dialog-card">
                    <h3>New Playlist</h3>
                    <input
                      type="text"
                      placeholder="Playlist name"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          createPlaylist((e.target as HTMLInputElement).value);
                          setShowPlaylistDialog(false);
                        }
                      }}
                    />
                    <div className="dialog-btns">
                      <button onClick={() => setShowPlaylistDialog(false)}>Cancel</button>
                      <button onClick={() => {
                        const input = document.querySelector('.dialog-card input') as HTMLInputElement;
                        createPlaylist(input.value);
                        setShowPlaylistDialog(false);
                      }}>Create</button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── ACCOUNT ── */}
              {view.name === "account" && (
                <div className="account-view">
                  {!isLoggedIn ? (
                    <div className="guest-login-zone">
                      <Auth onLogin={(u: any) => {
                        setUser(u);
                        const hasPlan = u.subscription_tier && u.subscription_tier !== 'free';
                        setView(hasPlan ? { name: 'home' } : { name: 'plans' });
                      }} />
                    </div>
                  ) : (
                    <div className="acc-container-premium">
                      <div className="acc-header-v3">
                        {user?.avatar_url ? (
                          <img src={user.avatar_url} className="acc-pfp-v3" alt="" />
                        ) : (
                          <div className="acc-pfp-v3-placeholder">{(user?.full_name?.[0] || user?.email?.[0] || '?').toUpperCase()}</div>
                        )}
                        <div className="acc-pfp-info">
                          <h1>{user?.full_name || 'My MusicTube'}</h1>
                          <p>{user?.email}</p>
                          <div className={`tier-badge ${user?.subscription_tier === 'premium' ? 'pro' : 'base'}`}>
                            {user?.subscription_tier === 'premium' ? 'Premium Pro' : (user?.subscription_tier === 'basic' ? 'Basic Member' : 'No Active Plan')}
                          </div>
                        </div>
                      </div>

                      <div className="acc-sections-v3">
                        <div className="acc-card-v3">
                          <h3>Subscription & Payments</h3>
                          {user?.subscription_tier === 'basic' && (
                            <div className="upgrad-banner">
                              <div className="txt">
                                <b>Upgrade to Pro</b>
                                <p>Get Ad-free experience and more.</p>
                              </div>
                              <button onClick={() => setView({ name: 'plans' })}>Upgrade Now</button>
                            </div>
                          )}
                          {(!user?.subscription_tier || user?.subscription_tier === 'free') && (
                            <button className="primary-acc-btn" onClick={() => setView({ name: 'plans' })}>Get MusicTube Premium</button>
                          )}
                          <button className="secondary-acc-btn" onClick={() => setView({ name: 'plans' })}>Manage Membership</button>
                        </div>

                        <div className="acc-card-v3">
                          <h3><ShieldCheck size={20} /> Account Security</h3>
                          <p className="subtext">Update your login password to keep your account secure.</p>
                          <form 
                            className="acc-security-form-v3"
                            onSubmit={async (e) => {
                              e.preventDefault();
                              const form = e.target as any;
                              const newPass = form.newPassword.value;
                              const confirmPass = form.confirmPassword.value;

                              if (newPass !== confirmPass) {
                                alert("Passwords do not match!");
                                return;
                              }

                              if (newPass.length < 6) {
                                alert("Password must be at least 6 characters long.");
                                return;
                              }

                              try {
                                const { error } = await supabase.auth.updateUser({ password: newPass });
                                if (error) throw error;
                                alert("Password updated successfully!");
                                form.reset();
                              } catch (err: any) {
                                alert(err.message);
                              }
                            }}
                          >
                            <div className="security-inputs-v3">
                              <div className="input-with-icon-v3">
                                <Lock size={18} />
                                <input
                                  type="password"
                                  name="newPassword"
                                  placeholder="New password"
                                  required
                                />
                              </div>
                              <div className="input-with-icon-v3">
                                <Shield size={18} />
                                <input
                                  type="password"
                                  name="confirmPassword"
                                  placeholder="Confirm new password"
                                  required
                                />
                              </div>
                            </div>
                            <button type="submit" className="security-submit-btn-v3">
                              Update Password
                            </button>
                          </form>
                        </div>

                        <div className="acc-card-v3">
                          <h3>Gift codes</h3>
                          <p className="subtext">Have a code? Claim it to activate features.</p>
                          <div className="claim-row-v3">
                            <input
                              type="text"
                              placeholder="Enter code"
                              value={giftCodeToClaim}
                              onChange={(e) => setGiftCodeToClaim(e.target.value)}
                            />
                            <button onClick={() => {
                              if (giftCodeToClaim.trim()) {
                                setShowSubscriptionModal(true);
                              }
                            }}>Claim</button>
                          </div>
                        </div>

                        <div className="acc-card-v3">
                          <h3>Preferences</h3>
                          <div className="pref-row">
                            <span>Playback Quality</span>
                            <b>Always High</b>
                          </div>
                          <div className="pref-row">
                            <span>Restricted Mode</span>
                            <b>Off</b>
                          </div>
                        </div>

                        <div className="acc-actions-footer">
                          <button onClick={handleLogout} className="logout-btn-v3">Logout</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── PLAYER VIEW (DESKTOP & MOBILE) ── */}
              {view.name === "player" && currentSong && (
                <div className="player-full-view">
                  <div className="player-bg-blur" style={{ backgroundImage: `url(${currentSong.thumbnail})` }} />
                  <div className="player-content-grid">
                    <div className="player-left">
                      <div className="player-back-zone">
                        <button className="back-btn-v4" onClick={() => setView({ name: 'home' })}>
                          <ArrowLeft size={24} /> <span>Home</span>
                        </button>
                      </div>
                      <div className="player-art-container" onClick={() => setShowFloatingControls(!showFloatingControls)}>
                        <img
                          src={currentSong.thumbnail}
                          className="player-art-v3"
                          alt=""
                          onError={(e) => { (e.target as any).src = FALLBACK_THUMB; }}
                        />
                        <AnimatePresence>
                          {showFloatingControls && (
                            <motion.div
                              className="floating-player-controls"
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.9 }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button onClick={handlePrev} className="float-btn"><SkipBack size={32} fill="currentColor" /></button>
                              <button className="float-play-circle" onClick={() => setIsPlaying(p => !p)}>
                                {isPlaying ? <Pause size={48} fill="currentColor" /> : <Play size={48} fill="currentColor" style={{ marginLeft: 6 }} />}
                              </button>
                              <button onClick={handleNext} className="float-btn"><SkipForward size={32} fill="currentColor" /></button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                      <div className="player-info-v3">
                        <h2>{currentSong.title}</h2>
                        <p>{currentSong.artist} • {currentSong.album}</p>
                        <div className="player-actions-v3">
                          <button className="act-btn"><ThumbsUp size={24} /></button>
                          <button className="act-btn" onClick={() => setActiveMenuSong(currentSong)}><PlusCircle size={24} /></button>
                          <button className="act-btn"><Search size={24} /></button>
                        </div>
                      </div>
                    </div>
                    <div className="player-right">
                      <div className="queue-header-v3">
                        <h3>Up Next</h3>
                        <div className="queue-modes">
                          <button
                            className={isShuffle ? 'active' : ''}
                            onClick={handleShuffleToggle}
                            title="Shuffle"
                          >
                            <Shuffle size={18} />
                          </button>
                          <button
                            className={`mode-btn ${repeatMode !== 'none' ? 'active' : ''}`}
                            onClick={handleRepeatToggle}
                            title={repeatMode === 'none' ? 'Repeat off' : repeatMode === 'all' ? 'Repeat all' : 'Repeat one'}
                          >
                            {repeatMode === 'one' ? (
                              <div style={{ position: 'relative' }}>
                                <Repeat size={18} />
                                <span className="repeat-one-indicator">1</span>
                              </div>
                            ) : <Repeat size={18} />}
                          </button>
                          <button
                            className={`refresh-queue-btn ${isRefreshingQueue ? 'spinning' : ''}`}
                            onClick={handleRefreshQueue}
                            title="Refresh queue with new music"
                            disabled={isRefreshingQueue}
                          >
                            <RefreshCw size={18} />
                          </button>
                        </div>
                      </div>
                      <div className="player-queue-list">
                        {queue.map((s, i) => (
                          <div
                            key={i}
                            className={`q-row-v3 ${s.videoId === currentSong.videoId ? 'active' : ''}`}
                            onClick={() => playSong(s)}
                          >
                            <img src={s.thumbnail} alt="" onError={(e) => { (e.target as any).src = FALLBACK_THUMB; }} />
                            <div className="q-info">
                              <p className="q-title">{s.title}</p>
                              <p className="q-artist">{s.artist}</p>
                            </div>
                            {s.videoId === currentSong.videoId 
                              ? <div className="q-playing-icon"><Music2 size={16} className={isPlaying ? 'eq-anim' : ''} /></div>
                              : <div className="q-num">{i + 1}</div>
                            }
                          </div>
                        ))}

                        <div className="auto-play-indicator">
                          <div className="ap-header">
                            <span>Autoplay</span>
                            <button
                              className={`ap-toggle ${autoPlay ? 'active' : ''}`}
                              onClick={() => setAutoPlay(!autoPlay)}
                            >
                              <div className="ap-dot" />
                            </button>
                          </div>
                          <p className="ap-desc">{autoPlay ? 'Similar songs will play automatically' : 'Autoplay is off'}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Floating Bottom Controls for Player View */}
                  <div className="player-floating-bottom">
                    <div className="player-controls-pill">
                      <div className="player-mode-strip">
                        <button
                          className={`mode-btn ${isShuffle ? 'active' : ''}`}
                          onClick={handleShuffleToggle}
                          title={isShuffle ? 'Shuffle On' : 'Shuffle Off'}
                        >
                          <Shuffle size={18} />
                          {isShuffle && <span className="mode-label">Shuffle</span>}
                        </button>
                        <button
                          className={`mode-btn ${repeatMode !== 'none' ? 'active' : ''}`}
                          onClick={handleRepeatToggle}
                          title={repeatMode === 'none' ? 'Repeat Off' : repeatMode === 'all' ? 'Repeat All' : 'Repeat One'}
                        >
                          {repeatMode === 'one' ? <Repeat1 size={18} /> : <Repeat size={18} />}
                          {repeatMode !== 'none' && <span className="mode-label">{repeatMode === 'one' ? 'One' : 'All'}</span>}
                        </button>
                        <button
                          className={`mode-btn ${isRefreshingQueue ? 'spinning' : ''}`}
                          onClick={handleRefreshQueue}
                          title="Refresh Queue"
                          disabled={isRefreshingQueue}
                        >
                          <RefreshCw size={18} />
                          {isRefreshingQueue && <span className="mode-label">Loading...</span>}
                        </button>
                      </div>
                      <div className="prog-container-v4">
                        <span className="time">{formatTime(playedSeconds)}</span>
                        <input type="range" min={0} max={0.9999} step="any" value={played} onChange={handleSeek} />
                        <span className="time">{formatTime(duration)}</span>
                      </div>
                      <div className="ctrl-btns-v4">
                        <button onClick={handlePrev} className="ctrl-side-btn"><SkipBack size={28} fill="currentColor" /></button>
                        <button className="play-pill-btn" onClick={() => setIsPlaying(p => !p)}>
                          {isPlaying ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" style={{ marginLeft: 4 }} />}
                        </button>
                        <button onClick={handleNext} className="ctrl-side-btn"><SkipForward size={28} fill="currentColor" /></button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── PLANS SELECTION ── */}
              {view.name === "plans" && (
                <div className="plans-selection-view">
                  <div className="plans-hero">
                    <img src="/logo.png" alt="" />
                    <h1>MusicTube Premium</h1>
                    <p>Pick a plan to start your journey.</p>
                  </div>
                  <div className="plans-grid-v3">
                    <div className="plan-card-v3">
                      <div className="p-header">Basic</div>
                      <div className="p-price">₹199<span>/lifetime</span></div>
                      <ul className="p-list">
                        <li>Play music & entire features</li>
                        <li>Core app access</li>
                        <li>Contains Ads</li>
                      </ul>
                      <button className="p-btn" onClick={() => setShowSubscriptionModal(true)}>Get Basic</button>
                    </div>
                    <div className="plan-card-v3 pro">
                      <div className="p-header">Premium Pro</div>
                      <div className="p-price">₹399<span>/lifetime</span></div>
                      <ul className="p-list">
                        <li>No Ads</li>
                        <li>Background Play</li>
                        <li>Priority Updates</li>
                      </ul>
                      <button className="p-btn pro" onClick={() => setShowSubscriptionModal(true)}>Get Pro</button>
                    </div>
                  </div>
                  <div className="plans-footer">
                    <button onClick={() => setView({ name: 'home' })} className="skip-link">Maybe Later</button>
                  </div>
                </div>
              )}


              {/* ── PLAYER ── */}
              {view.name === "artist" && (
                <motion.div
                  className="detail-view"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  {isLoading && <div className="loader" />}
                  {artistData && (
                    <>
                      <div className="detail-hero" style={{ backgroundImage: `url(${artistData.thumbnail})` }}>
                        <div className="detail-hero-overlay">
                          <h1>{artistData.name}</h1>
                          <p>{artistData.subscribers}</p>
                          {artistData.description && <p className="desc">{artistData.description}</p>}
                        </div>
                      </div>
                      <div className="detail-body">
                        {artistData.songs.length > 0 && (
                          <div className="section-container">
                            <h2>Popular Songs</h2>
                            <div className="track-list">
                              {artistData.songs.map((song, i) => (
                                <div
                                  key={i}
                                  className={`track-row ${currentSong?.videoId === song.videoId ? "playing" : ""}`}
                                  onClick={() => playSong(song, artistData.songs)}
                                >
                                  <span className="track-num">
                                    {currentSong?.videoId === song.videoId && isPlaying
                                      ? <Music2 size={14} className="eq-anim" />
                                      : i + 1}
                                  </span>
                                  <img src={song.thumbnail} alt="" />
                                  <div className="track-info-col">
                                    <h3>{song.title}</h3>
                                    <p>{song.artist}</p>
                                  </div>
                                  <div className="track-actions-row">
                                    <button
                                      className={`dl-btn ${downloads.some(d => d.videoId === song.videoId) ? 'active' : ''}`}
                                      onClick={(e) => { e.stopPropagation(); toggleDownload(song); }}
                                    >
                                      <PlusCircle size={16} />
                                    </button>
                                    <span className="track-dur">{song.duration}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {artistData.albums.length > 0 && (
                          <div className="section-container">
                            <h2>Albums</h2>
                            <div className="horizontal-scroll">
                              {artistData.albums.map((album, i) => (
                                <div key={i} className="card" onClick={() => album.browseId && setView({ name: "album", id: album.browseId } as any)}>
                                  <div className="card-thumb"><img src={album.thumbnail} alt="" /></div>
                                  <div className="card-info"><h3>{album.title}</h3><p>{album.year}</p></div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </motion.div>
              )}

              {/* ── ALBUM / PLAYLIST ── */}
              {(view.name === "album" || view.name === "playlist") && (
                <motion.div
                  className="detail-view"
                  initial={{ scale: 0.98, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 1.02, opacity: 0 }}
                >
                  {isLoading && <div className="loader" />}
                  {albumData && (
                    <>
                      <div className="album-header">
                        <img src={albumData.thumbnail} alt="" className="album-cover" />
                        <div className="album-meta">
                          <p className="album-label">{view.name.toUpperCase()}</p>
                          <h1>{albumData.title}</h1>
                          <p>{albumData.artist} {albumData.year && `• ${albumData.year}`}</p>
                          <p>{albumData.trackCount} tracks {albumData.duration && `• ${albumData.duration}`}</p>
                          <button
                            className="play-all-btn"
                            onClick={() => albumData.tracks.length > 0 && playSong(albumData.tracks[0], albumData.tracks)}
                          >
                            <Play size={18} fill="#000" /> Play All
                          </button>
                        </div>
                      </div>
                      <div className="track-list">
                        {albumData.tracks.map((track, i) => (
                          <div
                            key={i}
                            className={`track-row ${currentSong?.videoId === track.videoId ? "playing" : ""}`}
                            onClick={() => playSong(track, albumData.tracks)}
                          >
                            <span className="track-num">
                              {currentSong?.videoId === track.videoId && isPlaying
                                ? <Music2 size={14} className="eq-anim" />
                                : i + 1}
                            </span>
                            <div className="track-info-col">
                              <h3>{track.title}</h3>
                              <p>{track.artist}</p>
                            </div>
                            <div className="track-actions-row">
                              <button
                                className="more-btn-row"
                                onClick={(e) => { e.stopPropagation(); setActiveMenuSong(track); }}
                              >
                                <MoreVertical size={18} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </motion.div>
              )}
              {/* End of view checks */}
            </motion.div>
          </AnimatePresence>
        </section>
      </main>

      <SubscriptionModal
        user={user}
        isOpen={showSubscriptionModal}
        onClose={() => {
          setShowSubscriptionModal(false);
          setGiftCodeToClaim('');
        }}
        onRefreshUser={(u) => {
          setUser(u);
          setView({ name: 'home' });
          setShowSubscriptionModal(false);
          setGiftCodeToClaim('');
        }}
        initialGiftCode={giftCodeToClaim}
      />

      {/* Player Bar - Visible if song is selected AND user is subscribed */}
      {currentSong && isSubscribed && (
        <footer className="player-bar-v2" onClick={() => navigateTo({ name: 'player' })}>
          <div className="mini-player-bg" style={{ backgroundImage: currentSong ? `url(${currentSong.thumbnail})` : 'none' }} />
          <div className="progress-bar-container">
            <input
              type="range" min={0} max={0.9999} step="any"
              value={played}
              onChange={handleSeek}
              className="progress-range"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div className="player-main">
            <div className="track-info">
              {currentSong ? (
                <>
                  <img
                    src={currentSong.thumbnail}
                    alt=""
                    className="thumb"
                    onError={(e) => { (e.target as any).src = 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=100&h=100&fit=crop'; }}
                  />
                  <div className="text">
                    <h3>{currentSong.title}</h3>
                    <p>{currentSong.artist} • {currentSong.duration}</p>
                  </div>
                </>
              ) : <p className="no-song">No song playing</p>}
            </div>

            {playerError && (
              <div className="player-error">{playerError}</div>
            )}

            <div className="controls">
              <button onClick={(e) => { e.stopPropagation(); handlePrev(); }}><SkipBack size={24} fill="currentColor" /></button>
              <button
                className="play-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!currentSong) return;
                  setIsPlaying(p => !p);
                }}
              >
                {isPlaying ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" />}
              </button>
              <button onClick={(e) => { e.stopPropagation(); handleNext(); }}><SkipForward size={24} fill="currentColor" /></button>
            </div>

            <div className="actions">
              <div className="progress-labels">
                <span>{formatTime(playedSeconds)} / {formatTime(duration)}</span>
              </div>
              <button
                className="icon-btn"
                onClick={(e) => { e.stopPropagation(); setIsMuted((m) => !m); }}
                title={isMuted ? "Unmute" : "Mute"}
              >
                <Volume2 size={20} style={{ opacity: isMuted ? 0.4 : 1 }} />
              </button>
              <input
                type="range" min={0} max={1} step="any"
                value={isMuted ? 0 : volume}
                onChange={(e) => { setVolume(parseFloat(e.target.value)); setIsMuted(false); }}
                className="volume-range"
                onClick={(e) => e.stopPropagation()}
              />
              <button
                className={`icon-btn ${isShuffle ? 'active' : ''}`}
                onClick={(e) => { e.stopPropagation(); handleShuffleToggle(); }}
                title="Shuffle"
              >
                <Shuffle size={18} />
              </button>
              <button
                className={`icon-btn ${repeatMode !== 'none' ? 'active' : ''}`}
                onClick={(e) => { e.stopPropagation(); handleRepeatToggle(); }}
                title={repeatMode === 'none' ? 'Repeat off' : repeatMode === 'all' ? 'Repeat all' : 'Repeat one'}
              >
                {repeatMode === 'one' ? (
                  <div style={{ position: 'relative' }}>
                    <Repeat size={18} />
                    <span className="repeat-one-indicator">1</span>
                  </div>
                ) : <Repeat size={18} />}
              </button>
            </div>
          </div>
        </footer>
      )}

      {/* ── Mobile Bottom Navigation ── */}
      {isSubscribed && (
        <nav className="mobile-bottom-nav">
          <button
            className={view.name === "home" ? "active" : ""}
            onClick={() => navigateTo({ name: "home" })}
          >
            <Home size={24} />
            <span>Home</span>
          </button>
          <button
            className={view.name === "library" ? "active" : ""}
            onClick={() => isLoggedIn ? navigateTo({ name: "library" }) : setView({ name: 'account' })}
          >
            <Library size={24} />
            <span>Library</span>
          </button>
        </nav>
      )}

      {/* ── Hidden YouTube IFrame Container ── */}
      <div className="yt-engine">
        <div id="yt-player-container" />
      </div>
      <AnimatePresence>
        {showMobilePlayer && currentSong && (
          <FullScreenPlayer
            song={currentSong}
            isPlaying={isPlaying}
            played={played}
            playedSeconds={playedSeconds}
            duration={duration}
            queue={queue}
            favorites={favorites}
            onClose={() => setShowMobilePlayer(false)}
            onTogglePlay={() => setIsPlaying(!isPlaying)}
            onNext={handleNext}
            onPrev={handlePrev}
            onSeek={handleSeek}
            onPlaySong={playSong}
            onToggleFavorite={toggleFavorite}
            downloads={downloads}
            toggleDownload={toggleDownload}
            onShowMenu={setActiveMenuSong}
            goBack={() => setView({ name: 'home' })}
            isRefreshingQueue={isRefreshingQueue}
            onRefreshQueue={handleRefreshQueue}
          />
        )}
      </AnimatePresence>

      <audio 
        ref={silentAudioRef} 
        src="data:audio/wav;base64,UklGRigAAABXQVZFav7//v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+" 
        loop 
        muted={false} 
        preload="metadata"
        playsInline
        style={{ display: 'none', position: 'absolute', opacity: 0 }} 
      />
    </div>
  );
}

// ─── FULL SCREEN MOBILE PLAYER ───
const FullScreenPlayer = ({
  song,
  isPlaying,
  played,
  playedSeconds,
  duration,
  onClose,
  onTogglePlay,
  onNext,
  onPrev,
  onSeek,
  queue,
  onPlaySong,
  favorites,
  onToggleFavorite,
  downloads,
  toggleDownload,
  onShowMenu,
  goBack,
  isRefreshingQueue,
  onRefreshQueue
}: any) => {
  return (
    <motion.div
      className="mobile-player-overlay"
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
    >
      <header className="mobile-player-header">
        <button className="close-btn" onClick={() => { onClose(); goBack(); }} title="Go Home">
          <Home size={22} />
        </button>
        <div className="title">Now Playing</div>
        <button className="more-btn" onClick={() => onShowMenu(song)}><MoreVertical size={24} /></button>
        <button 
          className={`refresh-mobile-btn ${isRefreshingQueue ? 'spinning' : ''}`} 
          onClick={(e) => { e.stopPropagation(); onRefreshQueue(); }}
          title="Refresh Playlist"
        >
          <RefreshCw size={20} />
        </button>
      </header>

      <div className="player-content-scroll">
        <div className="player-hero">
          <motion.img
            layoutId={`player-thumb-${song.videoId}`}
            src={song.thumbnail}
            alt=""
            className="big-thumb"
            onError={(e) => { (e.target as any).src = 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=800&h=800&fit=crop'; }}
          />
          <div className="meta">
            <div className="text">
              <h2>{song.title}</h2>
              <p>{song.artist}</p>
            </div>
            <div className="meta-actions">
              <button
                className={`dl-btn-lg ${downloads.some((d: any) => d.videoId === song.videoId) ? 'active' : ''}`}
                onClick={() => toggleDownload(song)}
              >
                <PlusCircle size={24} />
              </button>
              <button
                className={`fav-btn ${favorites.some((f: any) => f.videoId === song.videoId) ? 'active' : ''}`}
                onClick={() => onToggleFavorite(song)}
              >
                <ThumbsUp size={24} fill={favorites.some((f: any) => f.videoId === song.videoId) ? "currentColor" : "none"} />
              </button>
            </div>
          </div>
        </div>

        <div className="player-controls-section">
          <div className="progress-section">
            <input
              type="range" min={0} max={0.9999} step="any"
              value={played}
              onChange={onSeek}
              className="mobile-progress"
            />
            <div className="time-labels">
              <span>{formatTime(playedSeconds)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          <div className="main-btns">
            <button onClick={onPrev}><SkipBack size={32} fill="currentColor" /></button>
            <button className="big-play" onClick={onTogglePlay}>
              {isPlaying ? <Pause size={42} fill="currentColor" /> : <Play size={42} fill="currentColor" style={{ marginLeft: '4px' }} />}
            </button>
            <button onClick={onNext}><SkipForward size={32} fill="currentColor" /></button>
          </div>
        </div>

        <div className="mobile-up-next">
          <div className="section-header">
            <h3>Up Next</h3>
            <span className="badge">Radio</span>
          </div>
          <div className="up-next-list">
            {queue.slice(0, 50).map((s: any, i: number) => (
              <div
                key={i}
                className={`next-row ${song.videoId === s.videoId ? 'active' : ''}`}
                onClick={() => onPlaySong(s)}
              >
                <div className="img-wrap">
                  <img
                    src={s.thumbnail}
                    alt=""
                    onError={(e) => { (e.target as any).src = 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=100&h=100&fit=crop'; }}
                  />
                  {song.videoId === s.videoId && <div className="playing-overlay"><Music2 size={16} /></div>}
                </div>
                <div className="txt">
                  <p className="t">{s.title}</p>
                  <p className="a">{s.artist}</p>
                </div>
                <MoreVertical size={18} className="more-icon" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default App;
