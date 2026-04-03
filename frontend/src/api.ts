// Unified API Base URL
// Locally, this hits the Vite proxy (localhost:5173/api -> localhost:5000/api)
// In production, this hits Vercel's serverless routes (/api -> api/index.py)
// If VITE_API_URL is set, it will hit that directly (e.g. for Capacitor Android app)
const BASE = import.meta.env.VITE_API_URL || "/api";


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
  
  try {
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return await res.json() as Promise<T>;
  } catch (error) {
    console.warn(`Primary API call to ${url.toString()} failed. Attempting localhost fallback...`, error);
    try {
      const fallbackUrl = new URL(`http://localhost:5000/api${path}`);
      Object.entries(params).forEach(([k, v]) => v && fallbackUrl.searchParams.set(k, v));
      const fallbackRes = await fetch(fallbackUrl.toString());
      if (!fallbackRes.ok) throw new Error(`Fallback API error: ${fallbackRes.status}`);
      return await fallbackRes.json() as Promise<T>;
    } catch (fallbackError) {
      console.error("Both primary and localhost fallback API failed.");
      throw fallbackError; // Throw the ultimate failure
    }
  }
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

  stream: (videoId: string) => get<{ url: string }>(`/stream/${videoId}`),

  moods: () => get<{ categories: { title: string; items: { title: string; params: string; thumbnail: string }[] }[] }>("/explore/moods"),

  moodPlaylists: (params: string) => get<{ playlists: Playlist[] }>("/explore/mood", { params }),

  newReleases: () => get<{ albums: Album[] }>("/explore/new_releases"),
};
