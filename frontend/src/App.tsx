import React, { useEffect, useState, useRef, useCallback } from "react";
import { Capacitor } from '@capacitor/core';
import { BackgroundPlayback } from './plugins/BackgroundPlayback';

import {
  Play, Pause, SkipBack, SkipForward,
  Home, Compass, Library, Menu,
  Search
} from "lucide-react";
import { api } from "./api";
import type { Song, HomeSection, SearchResult } from "./api";
import { useYouTubePlayer } from "./useYouTubePlayer";
import { supabase } from "./lib/supabase";
import { Auth } from "./components/Auth";
import { motion, AnimatePresence } from "framer-motion";
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

const formatTime = (s: number) => {
  if (!s || s < 0 || !isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sc = Math.floor(s % 60);
  return `${m}:${sc.toString().padStart(2, "0")}`;
};

const GUEST_USER = { id: 'guest', email: '', full_name: 'Guest', avatar_url: '', subscription_tier: 'free', isGuest: true };

function App() {
  const [view, setView] = useState<View>({ name: "account" });
  const [homeData, setHomeData] = useState<HomeSection[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [user, setUser] = useState<any>(GUEST_USER);

  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playedSeconds, setPlayedSeconds] = useState(0);
  const [duration, setDuration] = useState(0);
  const [queue, setQueue] = useState<Song[]>([]);
  const [exploreData, setExploreData] = useState<{ title: string; items: any[] }[]>([]);
  const [isLoadingExplore, setIsLoadingExplore] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showMobilePlayer, setShowMobilePlayer] = useState(false);
  const [activeChip, setActiveChip] = useState<string | null>(null);

  // Refs for stability
  const currentSongRef = useRef(currentSong);
  useEffect(() => { currentSongRef.current = currentSong; }, [currentSong]);
  const isPlayingRef = useRef(isPlaying);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  const isLoggedIn = user && !user.isGuest;
  const isSubscribed = user && !user.isGuest && (user.subscription_tier === 'premium' || user.subscription_tier === 'basic');

  const handleNext = useCallback(() => {
    if (queue.length === 0 || !currentSongRef.current) return;
    const idx = queue.findIndex((s: Song) => s.videoId === currentSongRef.current?.videoId);
    if (idx === -1) return;
    let nextIdx = idx + 1;
    if (nextIdx >= queue.length) nextIdx = 0;
    setCurrentSong(queue[nextIdx]);
    setIsPlaying(true);
  }, [queue]);

  const handlePrev = useCallback(() => {
    if (queue.length === 0 || !currentSongRef.current) return;
    const idx = queue.findIndex((s: Song) => s.videoId === currentSongRef.current?.videoId);
    if (idx <= 0) return;
    setCurrentSong(queue[idx - 1]);
    setIsPlaying(true);
  }, [queue]);

  const ytPlayer = useYouTubePlayer("yt-player-container", {
    onProgress: (_, seconds) => setPlayedSeconds(seconds),
    onDuration: (d) => setDuration(d),
    onEnded: () => handleNext()
  });

  const navigateTo = (v: View) => {
    if (v.name === 'library' && (!isLoggedIn || !isSubscribed)) {
      if (!isLoggedIn) setView({ name: 'account' });
      else setView({ name: 'plans' });
      setIsSidebarOpen(false);
      return;
    }
    setView(v);
    setIsSidebarOpen(false);
  };

  const playSong = async (song: Song, songList?: Song[]) => {
    if (!song) return;
    setCurrentSong(song);
    setIsPlaying(true);
    if (songList) setQueue(songList);
    else if (!queue.some((s: Song) => s.videoId === song.videoId)) setQueue([song, ...queue]);
    if (user && !user.isGuest) {
       await supabase.from('history').insert({ user_id: user.id, video_id: song.videoId, title: song.title, artist: song.artist, thumbnail: song.thumbnail });
    }
  };

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const commandListener = BackgroundPlayback.addListener('onCommand', (data) => {
      switch (data.command) {
        case 'play':     setIsPlaying(true); break;
        case 'pause':    setIsPlaying(false); break;
        case 'next':     handleNext(); break;
        case 'previous': handlePrev(); break;
        case 'seekTo':   if (data.position !== undefined) ytPlayer.seekTo(data.position / (duration || 1)); break;
      }
    });
    return () => { commandListener.then(h => h.remove()); };
  }, [ytPlayer, handleNext, handlePrev, duration]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !currentSong) return;
    BackgroundPlayback.notify({
      title: currentSong.title,
      artist: currentSong.artist || 'MusicTube',
      imageUrl: currentSong.thumbnail,
      duration: duration
    }).catch(() => {});
  }, [currentSong, duration]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const syncInterval = setInterval(() => {
        BackgroundPlayback.notifyProgress({ isPlaying: isPlayingRef.current, position: playedSeconds }).catch(() => {});
    }, 2000);
    return () => clearInterval(syncInterval);
  }, [playedSeconds]);

  useEffect(() => {
    if (!currentSong) return;
    ytPlayer.load(currentSong.videoId);
    setIsPlaying(true);
  }, [currentSong?.videoId]);

  useEffect(() => {
    if (!currentSong) return;
    if (isPlaying) ytPlayer.play();
    else ytPlayer.pause();
  }, [isPlaying, currentSong, ytPlayer]);

  useEffect(() => {
    ytPlayer.setVolume(0.8); // Default high volume for native app
  }, [ytPlayer]);

  const fetchHome = async () => { try { const res = await api.home(); setHomeData(res.sections); } catch (e) { console.error(e); } };
  const fetchExplore = async () => { setIsLoadingExplore(true); try { const res = await api.charts(); setExploreData([{ title: "Charts", items: res.songs }]); } catch (e) { console.error(e); } finally { setIsLoadingExplore(false); } };
  const handleSearch = async (e: React.FormEvent) => { e.preventDefault(); if (!searchQuery.trim()) return; setIsSearching(true); setView({ name: 'search' }); const res = await api.search(searchQuery); setSearchResults(res.results); setIsSearching(false); };
  const handleChipClick = (chip: string) => { setActiveChip(chip); fetchHome(); };

  useEffect(() => {
    fetchHome();
    const hydrate = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
        if (profile) {
          setUser({ id: session.user.id, email: session.user.email, full_name: profile.full_name, avatar_url: profile.avatar_url, subscription_tier: profile.subscription_tier });
          setView({ name: 'home' });
        }
      }
    };
    hydrate();
  }, []);

  useEffect(() => {
    if (view.name === "explore") fetchExplore();
  }, [view.name]);

  return (
    <div className="app-container">
      <div 
        id="yt-player-container" 
        style={{ 
          position: 'fixed', 
          bottom: 0, 
          right: 0, 
          width: '1px', 
          height: '1px', 
          opacity: 0.001, 
          pointerEvents: 'none',
          overflow: 'hidden'
        }}
      ></div>
      
      {isSubscribed && (
        <aside className={`sidebar glass-effect ${isSidebarOpen ? 'open' : ''}`}>
          <div className="sidebar-header">
            <img src="/logo.png" style={{ width: 32, height: 32 }} alt="" />
            <span className="brand-text">MusicTube</span>
            <button className="close-sidebar" onClick={() => setIsSidebarOpen(false)}>×</button>
          </div>
          <nav>
            <div className={`nav-item ${view.name === 'home' ? 'active' : ''}`} onClick={() => navigateTo({ name: 'home' })}>
              <Home size={20} /> <span>Home</span>
            </div>
            <div className={`nav-item ${view.name === 'explore' ? 'active' : ''}`} onClick={() => navigateTo({ name: 'explore' })}>
              <Compass size={20} /> <span>Explore</span>
            </div>
            <div className={`nav-item ${view.name === 'library' ? 'active' : ''}`} onClick={() => navigateTo({ name: 'library' })}>
              <Library size={20} /> <span>Library</span>
            </div>
          </nav>
        </aside>
      )}

      <main className="main-content">
        <header className="main-header glass-effect">
          <button className="menu-btn" onClick={() => setIsSidebarOpen(true)}><Menu size={20} /></button>
          <form onSubmit={handleSearch} className="search-box">
             <Search size={18} />
             <input type="text" placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </form>
          <div className="user-profile" onClick={() => setView({ name: 'account' })}><div className="avatar">{(user?.full_name?.[0] || 'U').toUpperCase()}</div></div>
        </header>

        <section className="scroll-area">
          <AnimatePresence mode="wait">
            <motion.div key={view.name} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              {view.name === "account" && <Auth onLogin={(u) => setUser(u)} />}
              {view.name === "home" && (
                <div className="home-view">
                   <div className="chips">
                    {["Energize", "Relax", "Workout"].map(c => (
                      <button key={c} className={`chip ${activeChip === c ? 'active' : ''}`} onClick={() => handleChipClick(c)}>{c}</button>
                    ))}
                  </div>
                  {homeData.map((s, i) => (
                    <div key={i} className="section-container">
                      <h2>{s.title}</h2>
                      <div className="horizontal-scroll">
                        {s.items.map((item: any, j) => (
                          <div key={j} className="card" onClick={() => playSong(item)}>
                            <div className="card-thumb"><img src={item.thumbnail} alt="" /></div>
                            <div className="card-info"><h3>{item.title}</h3><p>{item.artist}</p></div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {view.name === "explore" && (
                <div className="explore-view">
                   {isLoadingExplore ? <div className="loader">Loading...</div> : exploreData.map((s, i) => (
                    <div key={i} className="section-container">
                      <h2>{s.title}</h2>
                      <div className="horizontal-scroll">
                        {s.items.map((item: any, j) => (
                          <div key={j} className="card" onClick={() => playSong(item)}>
                            <div className="card-thumb"><img src={item.thumbnail} alt="" /></div>
                            <div className="card-info"><h3>{item.title}</h3><p>{item.artist}</p></div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {view.name === "search" && (
                <div className="search-view">
                  {isSearching ? <div className="loader">Searching...</div> : (
                    <div className="search-results">
                      {searchResults.map((item: any, i) => (
                        <div key={i} className="list-item" onClick={() => playSong(item)}>
                          <img src={item.thumbnail} alt="" />
                          <div className="info"><h3>{item.title}</h3><p>{item.artist || item.type}</p></div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </section>
      </main>

      {currentSong && (
        <div className={`player-strip ${showMobilePlayer ? 'full' : ''}`} onClick={() => setShowMobilePlayer(true)}>
           {showMobilePlayer && <button className="close-player" onClick={(e) => { e.stopPropagation(); setShowMobilePlayer(false); }}>↓</button>}
           <img src={currentSong.thumbnail} alt="" />
           <div className="player-info"><h3>{currentSong.title}</h3><p>{currentSong.artist}</p></div>
           <div className="controls"><button className="play-btn" onClick={(e) => { e.stopPropagation(); setIsPlaying(!isPlaying); }}>{isPlaying ? <Pause size={28} /> : <Play size={28} />}</button></div>
           {showMobilePlayer && (
             <div className="player-extra">
                <input type="range" min="0" max={duration} step="1" value={playedSeconds} onChange={(e) => ytPlayer.seekTo(parseFloat(e.target.value) / (duration || 1))} />
                <div className="times"><span>{formatTime(playedSeconds)}</span><span>{formatTime(duration)}</span></div>
                <div className="main-controls">
                   <button onClick={() => handlePrev()}><SkipBack size={32} /></button>
                   <button className="big-play" onClick={() => setIsPlaying(!isPlaying)}>{isPlaying ? <Pause size={48} /> : <Play size={48} />}</button>
                   <button onClick={() => handleNext()}><SkipForward size={32} /></button>
                </div>
             </div>
           )}
        </div>
      )}

      {isSubscribed && (
        <div className="bottom-nav">
          <div className={`nav-item ${view.name === 'home' ? 'active' : ''}`} onClick={() => setView({ name: 'home' })}><Home /></div>
          <div className={`nav-item ${view.name === 'explore' ? 'active' : ''}`} onClick={() => setView({ name: 'explore' })}><Compass /></div>
          <div className={`nav-item ${view.name === 'library' ? 'active' : ''}`} onClick={() => setView({ name: 'library' })}><Library /></div>
        </div>
      )}
    </div>
  );
}

export default App;
