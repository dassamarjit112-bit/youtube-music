import React, { useEffect, useState, useRef } from "react";
import {
  Play, Pause, SkipBack, SkipForward, Shuffle, Repeat,
  Volume2, ThumbsUp, MoreVertical, Search,
  Home, Compass, Library, PlusCircle, ArrowLeft, Music2, Menu
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
  | { name: "plans" };

function App() {
  const [view, setView] = useState<View>({ name: "home" });
  const [homeData, setHomeData] = useState<HomeSection[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const isWebView = /wv/i.test(navigator.userAgent) || /flutter/i.test(navigator.userAgent) || window.location.port === '8080';

  const [user, setUser] = useState<any>(() => {
    try {
      if (isWebView) {
        return {
          id: 'flutter_guest_id',
          email: 'app@youtube.music',
          full_name: 'My Music',
          avatar_url: ''
        };
      }
      const saved = localStorage.getItem('ytm_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  
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
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [playlists, setPlaylists] = useState<{ name: string; tracks: Song[] }[]>([]);
  const [activeMenuSong, setActiveMenuSong] = useState<Song | null>(null);
  const [showPlaylistDialog, setShowPlaylistDialog] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);

  const isPremium = user?.subscription_tier === 'premium';

  useEffect(() => {
    const hOnline = () => setIsOffline(false);
    const hOffline = () => setIsOffline(true);
    window.addEventListener('online', hOnline);
    window.addEventListener('offline', hOffline);
    return () => {
      window.removeEventListener('online', hOnline);
      window.removeEventListener('offline', hOffline);
    };
  }, []);
  // Persistence Layer
  useEffect(() => {
    const savedFavs = localStorage.getItem("ytm_favorites");
    const savedDLs = localStorage.getItem("ytm_downloads");
    const savedPlaylists = localStorage.getItem("ytm_playlists");
    const savedSong = localStorage.getItem("ytm_currentSong");
    const savedView = localStorage.getItem("ytm_view");
    
    if (savedFavs) setFavorites(JSON.parse(savedFavs));
    if (savedDLs) setDownloads(JSON.parse(savedDLs));
    if (savedPlaylists) setPlaylists(JSON.parse(savedPlaylists));
    if (savedSong) setCurrentSong(JSON.parse(savedSong));
    
    // Auto-redirect to Plans if no subscription
    if (user && !user.subscription_tier) {
      setView({ name: 'plans' });
    } else if (savedView) {
      setView(JSON.parse(savedView));
    }
  }, [user]);

  useEffect(() => {
    localStorage.setItem("ytm_favorites", JSON.stringify(favorites));
    localStorage.setItem("ytm_downloads", JSON.stringify(downloads));
    localStorage.setItem("ytm_playlists", JSON.stringify(playlists));
    if (currentSong) localStorage.setItem("ytm_currentSong", JSON.stringify(currentSong));
    localStorage.setItem("ytm_queue", JSON.stringify(queue));
    localStorage.setItem("ytm_view", JSON.stringify(view));
  }, [favorites, downloads, playlists, currentSong, queue, view]);

  const silentRef = useRef<HTMLAudioElement | null>(null);

  // Android Background Play Persistence
  useEffect(() => {
    if (isPlaying) {
      silentRef.current?.play().catch(() => {});
    } else {
      silentRef.current?.pause();
    }
  }, [isPlaying]);


  const currentSongRef = useRef(currentSong);
  currentSongRef.current = currentSong;
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const queueRef = useRef(queue);
  queueRef.current = queue;

  const ytPlayer = useYouTubePlayer("yt-player-container", {
    onStateChange: (state) => {
      // YT.PlayerState: -1=unstarted, 0=ended, 1=playing, 2=paused, 3=buffering, 5=cued
      if (state === 1) setIsPlaying(true);
      else if (state === 2) setIsPlaying(false);
    },
    onProgress: (p, secs) => {
      setPlayed(p);
      setPlayedSeconds(secs);
    },
    onDuration: (d) => setDuration(d),
    onEnded: () => handleNext(),
    onError: (code) => {
      console.error("YouTube player error code:", code);
      const msg =
        code === 150 || code === 101
          ? "This video is restricted from being embedded."
          : code === 5
          ? "HTML5 player error."
          : `Playback error (code ${code}). Trying next track…`;
      setPlayerError(msg);
      setTimeout(() => {
        setPlayerError(null);
        handleNext();
      }, 2500);
    },
  });

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

  // Volume sync
  useEffect(() => {
    ytPlayer.setVolume(isMuted ? 0 : volume);
  }, [volume, isMuted, ytPlayer]);

  // Play/pause sync
  useEffect(() => {
    if (!currentSong) return;
    if (isPlaying) ytPlayer.play();
    else ytPlayer.pause();
  }, [isPlaying, currentSong, ytPlayer]);

  // Load new song
  useEffect(() => {
    if (!currentSong?.videoId) return;
    setPlayerError(null);
    ytPlayer.load(currentSong.videoId);
    setIsPlaying(true);
  }, [currentSong?.videoId, ytPlayer]);

  // Media session
  useEffect(() => {
    if (!("mediaSession" in navigator) || !currentSong) return;
    navigator.mediaSession.metadata = new window.MediaMetadata({
      title: currentSong.title,
      artist: currentSong.artist,
      album: currentSong.album || "MusicTube",
      artwork: [
        { src: currentSong.thumbnail, sizes: "96x96", type: "image/png" },
        { src: currentSong.thumbnail, sizes: "128x128", type: "image/png" },
        { src: currentSong.thumbnail, sizes: "192x192", type: "image/png" },
        { src: currentSong.thumbnail, sizes: "256x256", type: "image/png" },
        { src: currentSong.thumbnail, sizes: "384x384", type: "image/png" },
        { src: currentSong.thumbnail, sizes: "512x512", type: "image/png" },
      ],
    });
    navigator.mediaSession.setActionHandler("play", () => setIsPlaying(true));
    navigator.mediaSession.setActionHandler("pause", () => setIsPlaying(false));
    navigator.mediaSession.setActionHandler("previoustrack", handlePrev);
    navigator.mediaSession.setActionHandler("nexttrack", handleNext);
    navigator.mediaSession.setActionHandler("seekbackward", () => {
      ytPlayer.seekTo(Math.max(0, playedSeconds - 10));
    });
    navigator.mediaSession.setActionHandler("seekforward", () => {
      ytPlayer.seekTo(Math.min(duration, playedSeconds + 10));
    });
    
    // Smooth Android Playback
    if (isPlaying) navigator.mediaSession.playbackState = 'playing';
    else navigator.mediaSession.playbackState = 'paused';
  }, [currentSong, ytPlayer, playedSeconds, duration, isPlaying]);

  // App Session Listener
  useEffect(() => {
    if (isWebView) {
      if (user?.id) {
        fetchFavorites(user.id);
        fetchHistory(user.id);
      }
      return;
    }

    // If already loaded from localStorage, just fetch dependent data
    if (user?.id) {
      fetchFavorites(user.id);
      fetchHistory(user.id);
      return;
    }

    // Fallback: check Supabase session (e.g. after OAuth redirect or page refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user && !isWebView) {
        const u = {
          id: session.user.id,
          email: session.user.email,
          full_name: session.user.user_metadata?.full_name ?? session.user.email?.split('@')[0] ?? '',
          avatar_url: session.user.user_metadata?.avatar_url ?? '',
        };
        
        // Fix: Automatically sync metadata to Profiles table
        try {
          await supabase.from('profiles').upsert(u);
          console.log("🔥 Profile Synced:", u.full_name);
        } catch (e) {
          console.warn("Profile sync delay:", e);
        }

        localStorage.setItem('ytm_user', JSON.stringify(u));
        setUser(u);
        fetchFavorites(u.id);
        fetchHistory(u.id);
      }
    });

    return () => subscription.unsubscribe();
  }, [user?.id]);


  // Sync session loading
  const isLoggedIn = !!user;

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

  const createPlaylist = (name: string) => {
    if (!name.trim()) return;
    const newPlaylist = { name, tracks: activeMenuSong ? [activeMenuSong] : [] };
    setPlaylists(prev => [...prev, newPlaylist]);
    setActiveMenuSong(null);
  };

  const addToPlaylist = (song: Song, playlistName: string) => {
    setPlaylists(prev => prev.map(p => 
      p.name === playlistName ? { ...p, tracks: [...p.tracks.filter(t => t.videoId !== song.videoId), song] } : p
    ));
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
    }
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

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
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

  const handleNext = async () => {
    const idx = queueRef.current.findIndex((s) => s.videoId === currentSongRef.current?.videoId);
    
    // Proactive Infinite Radio: Fetch 40 tracks when nearing end of current batch
    if (idx >= queueRef.current.length - 3) {
      const lastSong = currentSongRef.current;
      if (lastSong) {
        console.log("🌌 Deepening AI Radio Vibe...");
        try {
          const res = await api.watch(lastSong.videoId);
          if (res.tracks && res.tracks.length > 0) {
            const nextBatch = res.tracks.slice(1, 40);
            setQueue(q => {
              const uniqueBatch = nextBatch.filter(s => !q.find(sq => sq.videoId === s.videoId));
              return [...q, ...uniqueBatch];
            });
          }
        } catch (e) { console.error(e); }
      }
    }

    if (idx < queueRef.current.length - 1) {
      setCurrentSong(queueRef.current[idx + 1]);
    } else {
      setIsPlaying(false);
    }
  };

  const handlePrev = () => {
    if (playedSeconds > 3) {
      // Restart current song
      ytPlayer.seekTo(0);
      return;
    }
    const song = currentSongRef.current;
    if (!song || queue.length === 0) return;
    const idx = queue.findIndex((s) => s.videoId === song.videoId);
    if (idx > 0) setCurrentSong(queue[idx - 1]);
  };

  const playSong = async (song: Song, songList?: Song[]) => {
    if (!song.videoId) return;
    console.log("▶ Playing:", song.title, "| videoId:", song.videoId);
    
    // Set immediate song to start playback
    if (isOffline && !downloads.some(d => d.videoId === song.videoId)) {
      setPlayerError("You are offline. Only downloaded songs can be played.");
      setTimeout(() => setPlayerError(null), 3000);
      return;
    }

    setCurrentSong(song);
    setPlayed(0);
    setPlayedSeconds(0);
    setDuration(0);
    logHistory(song);

    // Initialize/Restart Silent Audio on User Interaction (CRITICAL FOR BACKGROUND PLAY)
    if (!silentRef.current) {
      silentRef.current = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFav7//v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+');
      silentRef.current.loop = true;
    }
    silentRef.current.play().catch(() => {});
    
    // NEW: MusicTube 'Radio' Logic (30+ tracks)
    // If a list was provided (e.g. from an album), use it.
    // Otherwise, generate an AI Radio based on the song clicked.
    if (songList && songList.length > 5) {
      setQueue(songList);
    } else {
      console.log("🔮 Infinite Radio Initializing for:", song.title);
      try {
        const res = await api.watch(song.videoId);
        if (res.tracks && res.tracks.length > 0) {
          // Flattening and diversifying the list
          const radioMix = [song, ...res.tracks.slice(1, 40)]; // Up to 40 tracks of same vibe
          setQueue(radioMix);
        } else {
          setQueue(q => q.find(s => s.videoId === song.videoId) ? q : [...q, song]);
        }
      } catch (e) {
        console.error("Radio Generation Failed:", e);
        setQueue(q => q.find(s => s.videoId === song.videoId) ? q : [...q, song]);
      }
    }
  };

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

  const formatTime = (s: number) => {
    if (!s || s < 0 || !isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sc = Math.floor(s % 60);
    return `${m}:${sc.toString().padStart(2, "0")}`;
  };

  const goBack = () => setView({ name: "home" });

  const navigateTo = (v: View) => {
    setView(v);
    setIsSidebarOpen(false); // Close sidebar on mobile after selection
  };

  // ─── Login Screen ────────────────────────────────────────────────────────────
  // Removed strict login wall to allow Guest browsing

  const handleLogout = () => {
    localStorage.removeItem("ytm_user");
    setUser(null);
    setView({ name: "home" });
  };

  // ─── Main App ────────────────────────────────────────────────────────────────
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

      {/* Sidebar */}
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

      {/* Main Content */}
      <main className="main-content">
        <header className="main-header">
          <div className="header-left">
            {isOffline && <div className="offline-pill"><PlusCircle size={14} /> Offline Mode</div>}
            <button className="mobile-hide menu-btn" onClick={() => setIsSidebarOpen(true)}>
              <Menu size={24} />
            </button>
            {!isSearchActive ? (
              <div className="mobile-only mobile-brand" onClick={() => navigateTo({ name: 'home' })}>
                <img src="/logo.png" style={{ width: 24, height: 24, marginRight: 8 }} alt="" />
                <span>MusicTube</span>
              </div>
            ) : (
              <div className="mobile-search-active">
                <button className="back-btn-sm" onClick={() => setIsSearchActive(false)}>
                  <ArrowLeft size={20} />
                </button>
                <form onSubmit={handleSearch} className="m-search-form">
                   <input
                    type="text"
                    autoFocus
                    placeholder="Search music"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </form>
              </div>
            )}
            {(view.name === "artist" || view.name === "album" || view.name === "search") && !isSearchActive && (
              <button className="back-btn" onClick={goBack}><ArrowLeft size={20} /></button>
            )}
            <div className="search-box desktop-only">
              <Search size={20} />
              <form onSubmit={handleSearch}>
                <input
                  type="text"
                  placeholder="Search songs, albums, artists"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </form>
            </div>
          </div>
          <div className="user-profile">
            {!isSearchActive && (
              <button className="mobile-only search-trigger" onClick={() => setIsSearchActive(true)}>
                <Search size={24} />
              </button>
            )}
            <button 
          className="mobile-only search-trigger" 
          onClick={(e) => { e.stopPropagation(); setActiveMenuSong(currentSong); }}
        >
          <MoreVertical size={24} />
        </button>
            {isLoggedIn ? (
              <div className="flex items-center gap-3">
                {!isPremium && (
                  <button className="premium-btn desktop-only" onClick={() => setShowSubscriptionModal(true)}>
                    Upgrade
                  </button>
                )}
                <div className="avatar" onClick={() => setView({ name: 'account' })} style={user?.avatar_url ? { backgroundImage: `url(${user.avatar_url})`, backgroundSize: 'cover', backgroundPosition: 'center', color: 'transparent' } : {}}>
                  {!user?.avatar_url && (user?.full_name?.[0] || user?.email?.[0] || '?').toUpperCase()}
                </div>
              </div>
            ) : (
              <button className="sign-in-btn-sm" style={{ display: /wv|flutter/i.test(navigator.userAgent) || window.location.port === '8080' ? 'none' : 'block' }} onClick={() => setView({ name: 'account' })}>Sign In</button>
            )}
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
                      {[1,2,3,4].map(i => <div key={i} className="skeleton-card" />)}
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
                      {[1,2,3].map(i => <div key={i} className="skeleton-card" />)}
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
                              {s.title === 'Charts' && <div className="rank">#{j+1}</div>}
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
                          {playlists.map((p, i) => (
                            <div key={i} className="track-row" onClick={() => {
                              // We reuse albumData for simplicity but set view to playlist + local ID
                              setAlbumData({
                                title: p.name,
                                artist: "Your Playlist",
                                thumbnail: p.tracks[0]?.thumbnail || "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=200&h=200&fit=crop",
                                year: "",
                                trackCount: p.tracks.length,
                                duration: "",
                                tracks: p.tracks
                              });
                              setView({ name: 'playlist', id: 'local_' + i } as any);
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
                          onError={(e) => { (e.target as any).src = 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=200&h=200&fit=crop'; }} 
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
                          <PlusCircle size={20} /> {downloads.some(d => d.videoId === activeMenuSong.videoId) ? 'Remove Download' : 'Download'}
                        </button>
                        <div className="submenu-section">
                          <p>Add to Playlist</p>
                          {playlists.map((p, i) => (
                            <button key={i} onClick={() => addToPlaylist(activeMenuSong, p.name)}>
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
                      <Auth onLogin={setUser} />
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
                          {!user?.subscription_tier && (
                            <button className="primary-acc-btn" onClick={() => setView({ name: 'plans' })}>Get MusicTube Premium</button>
                          )}
                          <button className="secondary-acc-btn">Manage Membership</button>
                        </div>

                        <div className="acc-card-v3">
                          <h3>Gift Codes</h3>
                          <p className="subtext">Have a code? Claim it to activate features.</p>
                          <div className="claim-row-v3">
                            <input type="text" placeholder="Enter code" id="gift-input-acc" />
                            <button onClick={() => {
                              const input = document.getElementById('gift-input-acc') as HTMLInputElement;
                              if (input.value) setShowSubscriptionModal(true); // Re-use gift logic from modal
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
        onClose={() => setShowSubscriptionModal(false)}
        onRefreshUser={(u) => setUser(u)}
      />

      {/* ── Player Bar ── */}
      <footer className="player-bar-v2" onClick={() => window.innerWidth < 768 && setShowMobilePlayer(true)}>
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
                setIsPlaying(!isPlaying);
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
            <Shuffle size={18} />
            <Repeat size={18} />
          </div>
        </div>
      </footer>

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
          />
        )}
      </AnimatePresence>

      {/* Mobile Bottom Navigation */}
      <div className="bottom-nav mobile-only">
        <button onClick={() => setView({ name: 'home' })} className={view.name === 'home' ? 'active' : ''}>
          <Home size={22} />
          <span>Home</span>
        </button>
        <button onClick={() => setView({ name: 'explore' })} className={view.name === 'explore' ? 'active' : ''}>
          <Compass size={22} />
          <span>Explore</span>
        </button>
        <button onClick={() => setView({ name: 'library' })} className={view.name === 'library' ? 'active' : ''}>
          <Library size={22} />
          <span>Library</span>
        </button>
      </div>

      <SubscriptionModal 
        user={user} 
        isOpen={showSubscriptionModal} 
        onClose={() => setShowSubscriptionModal(false)}
        onRefreshUser={(u) => setUser(u)}
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
  onShowMenu
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
        <button className="close-btn" onClick={onClose}><SkipBack size={24} style={{ transform: 'rotate(-90deg)' }} /></button>
        <div className="title">Now Playing</div>
        <button className="more-btn" onClick={() => onShowMenu(song)}><MoreVertical size={24} /></button>
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
                className={`dl-btn-lg ${downloads.some((d:any) => d.videoId === song.videoId) ? 'active' : ''}`}
                onClick={() => toggleDownload(song)}
              >
                <PlusCircle size={24} />
              </button>
              <button 
                className={`fav-btn ${favorites.some((f:any) => f.videoId === song.videoId) ? 'active' : ''}`}
                onClick={() => onToggleFavorite(song)}
              >
                <ThumbsUp size={24} fill={favorites.some((f:any) => f.videoId === song.videoId) ? "currentColor" : "none"} />
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
              <span>{Math.floor(playedSeconds/60)}:{(Math.floor(playedSeconds%60)).toString().padStart(2,'0')}</span>
              <span>{Math.floor(duration/60)}:{(Math.floor(duration%60)).toString().padStart(2,'0')}</span>
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
