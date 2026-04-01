// 1. Enter your DEPLOYED backend URL here (e.g., Render, Railway, Vercel, etc.)
// Make sure to include /api at the end if your backend routes are prefixed with it.
const DEPLOYED_BACKEND_URL = "https://musictube-api-khwh.onrender.com/api";

// 2. Automated logic to use local IP for development and Deployed URL for the APK
const isLocal = window.location.hostname === "localhost" || 
                window.location.hostname === "127.0.0.1";

// In Capacitor/APK, the hostname is usually 'localhost' or an internal scheme.
// We force the deployed URL for the production APK.
const BASE = isLocal 
  ? `http://${window.location.hostname}:5000/api` 
  : DEPLOYED_BACKEND_URL;

// ... rest of your Song interfaces and api object ...


export interface Song {
  type: "song" | "video";
  videoId: string;
  title: string;
  artist: string;
  album: string;
  thumbnail: string;
  duration: string;
  year?: string;
}
export interface Artist {
  type: "artist";
  browseId: string;
  name: string;
  thumbnail: string;
  subscribers: string;
}
export interface Album {
  type: "album";
  browseId: string;
  title: string;
  artist: string;
  thumbnail: string;
  year: string;
  albumType?: string;
}
export interface Playlist {
  type: "playlist";
  playlistId: string;
  title: string;
  thumbnail: string;
  count: string;
  author: string;
}
export type SearchResult = Song | Artist | Album | Playlist | { type: string; title: string; thumbnail: string };

export interface HomeSection {
  title: string;
  items: SearchResult[];
}

export interface ArtistDetail {
  name: string;
  description: string;
  thumbnail: string;
  subscribers: string;
  songs: Song[];
  albums: Album[];
}

export interface AlbumDetail {
  title: string;
  artist: string;
  thumbnail: string;
  year: string;
  trackCount: string | number;
  duration: string;
  tracks: Song[];
}

export interface PlaylistDetail {
  title: string;
  thumbnail: string;
  description: string;
  trackCount: string | number;
  tracks: Song[];
}

async function get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = BASE.startsWith("http")
    ? new URL(BASE + path)
    : new URL(BASE + path, window.location.origin);
  Object.entries(params).forEach(([k, v]) => v && url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  search: (q: string, filter?: string) =>
    get<{ results: SearchResult[] }>("/search", { q, ...(filter ? { filter } : {}) }),

  home: () => get<{ sections: HomeSection[] }>("/home"),

  charts: (country = "ZZ") => get<{ songs: Song[]; trending: Song[] }>("/charts", { country }),

  artist: (browseId: string) => get<ArtistDetail>(`/artist/${browseId}`),

  album: (browseId: string) => get<AlbumDetail>(`/album/${browseId}`),

  playlist: (playlistId: string) => get<PlaylistDetail>(`/playlist/${playlistId}`),

  watch: (videoId: string) => get<{ tracks: Song[] }>(`/watch/${videoId}`),

  moods: () => get<{ categories: { title: string; items: { title: string; params: string; thumbnail: string }[] }[] }>("/explore/moods"),

  moodPlaylists: (params: string) => get<{ playlists: Playlist[] }>("/explore/mood", { params }),

  newReleases: () => get<{ albums: Album[] }>("/explore/new_releases"),
};
