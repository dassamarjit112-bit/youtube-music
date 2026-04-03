import os
import sys
from flask import Flask, jsonify, request
from flask_cors import CORS
from ytmusicapi import YTMusic
from typing import List, Any

app = Flask(__name__)
CORS(app)

# Helper to limit items without using slices, avoiding indexing lint errors
def limit_items(items: Any, limit: int = 12) -> List[Any]:
    if not isinstance(items, list):
        return []
    res = []
    max_idx = min(limit, len(items))
    for i in range(max_idx):
        res.append(items[i])
    return res

# Initialize YTMusic
# Look for headers.json in the api directory for authenticated access
headers_file = os.path.join(os.path.dirname(__file__), "headers.json")

try:
    if os.path.exists(headers_file):
        yt = YTMusic(headers_file)
        print("YTMusic initialized with headers.json")
    else:
        yt = YTMusic()
        print("YTMusic initialized without authentication")
except Exception as e:
    print(f"YTMusic init error on Vercel: {e}")
    yt = YTMusic()


def safe_thumb(thumbs):
    """Pick the best thumbnail from a list and normalize resolution."""
    if not thumbs:
        return "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=544&h=544&fit=crop"
    
    # Get the best quality thumbnail
    sorted_thumbs = sorted(thumbs, key=lambda t: t.get("width", 0), reverse=True)
    url = sorted_thumbs[0].get("url", "")
    
    # Enhance resolution for Google thumbnails if possible
    if "googleusercontent.com" in url or "ggpht.com" in url:
        if "=" in url:
            return f"{url.split('=')[0]}=w544-h544-l90-rj"
        return f"{url}=w544-h544-l90-rj"
    return url

def fmt_song(item):
    """Normalize a song result for the frontend."""
    artist_data = item.get("artists", item.get("artist"))
    artist_name = "Unknown Artist"
    
    if isinstance(artist_data, list) and len(artist_data) > 0:
        if isinstance(artist_data[0], dict):
            artist_name = artist_data[0].get("name", "Unknown Artist")
        else:
            artist_name = str(artist_data[0])
    elif isinstance(artist_data, dict):
        artist_name = artist_data.get("name", "Unknown Artist")
    elif isinstance(artist_data, str):
        artist_name = artist_data

    album_data = item.get("album", {})
    album_name = album_data.get("name", "") if isinstance(album_data, dict) else str(album_data)

    return {
        "videoId": item.get("videoId", ""),
        "title": item.get("title", "Unknown"),
        "artist": artist_name,
        "album": album_name,
        "thumbnail": safe_thumb(item.get("thumbnails", [])),
        "duration": item.get("duration", ""),
        "year": item.get("year", ""),
        "type": item.get("resultType", "song") if "resultType" in item else "song"
    }

def fmt_artist(item):
    return {
        "browseId": item.get("browseId", ""),
        "name": item.get("artist", item.get("name", "Unknown")),
        "thumbnail": safe_thumb(item.get("thumbnails", [])),
        "subscribers": item.get("subscribers", ""),
        "type": "artist"
    }

def fmt_album(item):
    artist_data = item.get("artists", item.get("artist"))
    artist_name = ""
    if isinstance(artist_data, list) and len(artist_data) > 0:
        artist_name = artist_data[0].get("name", "") if isinstance(artist_data[0], dict) else artist_data[0]
    elif isinstance(artist_data, dict):
        artist_name = artist_data.get("name", "")

    return {
        "browseId": item.get("browseId", ""),
        "title": item.get("title", "Unknown"),
        "artist": artist_name,
        "thumbnail": safe_thumb(item.get("thumbnails", [])),
        "year": item.get("year", ""),
        "type": item.get("type", "album").lower(),
    }

def fmt_playlist(item):
    author = ""
    author_data = item.get("authors", item.get("author"))
    if isinstance(author_data, list) and len(author_data) > 0:
        author = author_data[0].get("name", "") if isinstance(author_data[0], dict) else author_data[0]
    elif isinstance(author_data, dict):
        author = author_data.get("name", "")
    elif isinstance(author_data, str):
        author = author_data

    return {
        "playlistId": item.get("playlistId", item.get("browseId", "")),
        "title": item.get("title", "Unknown"),
        "thumbnail": safe_thumb(item.get("thumbnails", [])),
        "count": item.get("count", ""),
        "author": author,
        "type": "playlist"
    }

# ─── API ROUTES ──────────────────────────────────────────────────────────────

@app.route("/api/stream/<video_id>")
@app.route("/stream/<video_id>")
def stream(video_id):
    if not video_id:
        return jsonify({"error": "No videoId"}), 400
    try:
        import yt_dlp
        # Extract direct stream URL without downloading
        ydl_opts = {
            'format': 'bestaudio/best',
            'quiet': True,
            'no_warnings': True,
            'nocheckcertificate': True
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            url = f"https://www.youtube.com/watch?v={video_id}"
            info = ydl.extract_info(url, download=False)
            return jsonify({"url": info.get("url")})
    except Exception as e:
        print(f"Stream resolve error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/search")
@app.route("/search")
def search():
    q = request.args.get("q", "")
    filter_type = request.args.get("filter", None)
    if not q:
        return jsonify({"results": []})
    try:
        results = yt.search(q, filter=filter_type, limit=20)
        formatted = []
        for item in results:
            t = item.get("resultType", "")
            if t == "song": formatted.append(fmt_song(item))
            elif t == "artist": formatted.append(fmt_artist(item))
            elif t == "album": formatted.append(fmt_album(item))
            elif t == "playlist": formatted.append(fmt_playlist(item))
            elif t == "video":
                f = fmt_song(item)
                f["type"] = "video"
                formatted.append(f)
        return jsonify({"results": formatted})
    except Exception as e:
        return jsonify({"results": [], "error": str(e)})

@app.route("/api/home")
@app.route("/home")
def home():
    sections = []
    try:
        results = yt.get_home(limit=8)
        for section in results:
            title = section.get("title", "")
            contents = section.get("contents", [])
            items = []
            for item in contents:
                t = item.get("resultType", "")
                if not t:
                    if "videoId" in item: t = "song"
                    elif "subscribers" in item: t = "artist"
                    elif "year" in item: t = "album"
                    elif "playlistId" in item: t = "playlist"
                    elif "browseId" in item:
                        if "author" in item: t = "playlist"
                        elif "artists" in item: t = "album"
                        else: t = "artist"
                
                if t in ("song", "video"): items.append(fmt_song(item))
                elif t == "artist": items.append(fmt_artist(item))
                elif t == "album": items.append(fmt_album(item))
                elif t == "playlist": items.append(fmt_playlist(item))
            
            if items:
                sections.append({"title": title, "items": items})
    except Exception as e:
        print(f"get_home failed: {e}")

    # Always try to append a 'Global Charts' section if results are sparse
    if len(sections) < 3:
        try:
            charts_data = yt.get_charts(country="ZZ")
            if "songs" in charts_data and not any(s["title"] == "Top Songs" for s in sections):
                song_items = limit_items(charts_data["songs"].get("items", []), 12)
                sections.append({"title": "Global Top Songs", "items": [fmt_song(s) for s in song_items]})
        except: pass

    # Last resort: search for popular music
    if len(sections) < 2:
        try:
            res = yt.search("Popular Music", limit=20)
            items = [fmt_song(i) for i in res if i.get("resultType") == "song"]
            if items:
                sections.append({"title": "Popular Hits", "items": items[:12]})
        except: pass

    # If still empty, try trending
    if len(sections) == 0:
        try:
            res = yt.search("Trending songs 2026", limit=20)
            items = [fmt_song(i) for i in res if i.get("resultType") in ("song", "video")]
            if items:
                sections.append({"title": "Trending Now", "items": items[:12]})
        except: pass

    return jsonify({"sections": sections})

@app.route("/api/charts")
@app.route("/charts")
def charts():
    country = request.args.get("country", "ZZ")
    try:
        data = yt.get_charts(country=country)
        songs = [fmt_song(s) for s in data.get("songs", {}).get("items", [])[:20]]
        trending = [fmt_song(s) for s in data.get("trending", {}).get("items", [])[:20]]
        return jsonify({"songs": songs, "trending": trending})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/artist/<browse_id>")
@app.route("/artist/<browse_id>")
def artist(browse_id):
    try:
        data = yt.get_artist(browse_id)
        song_data = data.get("songs") or {}
        songs_raw = song_data.get("results", song_data.get("items", [])) if isinstance(song_data, dict) else (song_data if isinstance(song_data, list) else [])
        songs = [fmt_song(s) for s in limit_items(songs_raw, 12)]
        
        album_data = data.get("albums", {})
        albums_raw = album_data.get("results", album_data.get("items", [])) if isinstance(album_data, dict) else (album_data if isinstance(album_data, list) else [])
        albums = [fmt_album(a) for a in limit_items(albums_raw, 12)]
        
        return jsonify({
            "name": data.get("name", "Unknown"),
            "description": data.get("description", ""),
            "thumbnail": safe_thumb(data.get("thumbnails", [])),
            "subscribers": data.get("subscribers", ""),
            "songs": songs,
            "albums": albums,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/album/<browse_id>")
@app.route("/album/<browse_id>")
def album(browse_id):
    try:
        data = yt.get_album(browse_id)
        tracks = [fmt_song(t) for t in data.get("tracks", [])]
        artists = data.get("artists", [])
        artist_name = artists[0].get("name", "") if artists and isinstance(artists[0], dict) else ""
        return jsonify({
            "title": data.get("title", "Unknown"),
            "artist": artist_name,
            "thumbnail": safe_thumb(data.get("thumbnails", [])),
            "tracks": tracks,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/playlist/<playlist_id>")
@app.route("/playlist/<playlist_id>")
def playlist(playlist_id):
    try:
        data = yt.get_playlist(playlist_id, limit=100)
        tracks = [fmt_song(t) for t in data.get("tracks", [])]
        return jsonify({
            "title": data.get("title", "Unknown"),
            "thumbnail": safe_thumb(data.get("thumbnails", [])),
            "tracks": tracks,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/watch/<video_id>")
@app.route("/watch/<video_id>")
def watch(video_id):
    try:
        seen_ids = set()
        all_tracks = []

        def add_unique(tracks_list):
            for t in tracks_list:
                vid = t.get("videoId", "")
                if vid and vid not in seen_ids:
                    seen_ids.add(vid)
                    all_tracks.append(fmt_song(t))

        # 1. Primary: YouTube's "Up Next" queue
        try:
            data = yt.get_watch_playlist(videoId=video_id, limit=50)
            add_unique(data.get("tracks", []))
        except: pass

        # 2. Extract artist/title for smarter searches
        song_artist = all_tracks[0].get("artist", "") if all_tracks else ""
        song_title = all_tracks[0].get("title", "") if all_tracks else ""

        # 3. More songs by same artist
        if song_artist and song_artist != "Unknown Artist":
            try:
                artist_results = yt.search(song_artist, filter="songs", limit=15)
                add_unique([r for r in artist_results if r.get("resultType") == "song"])
            except: pass

        # 4. Filter out current song
        final_tracks = [t for t in all_tracks if t.get("videoId") != video_id]
        return jsonify({"tracks": final_tracks})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/explore/moods")
@app.route("/explore/moods")
def moods():
    try:
        data = yt.get_mood_categories()
        categories = []
        for title, items in data.items():
            categories.append({
                "title": title,
                "items": [{"title": i.get("title", ""), "params": i.get("params", ""), "thumbnail": safe_thumb(i.get("thumbnails", []))} for i in items]
            })
        return jsonify({"categories": categories})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/explore/mood")
@app.route("/explore/mood")
def mood_playlists():
    params = request.args.get("params", "")
    try:
        data = yt.get_mood_playlists(params)
        playlists = [fmt_playlist(p) for p in data]
        return jsonify({"playlists": playlists})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/explore/new_releases")
@app.route("/explore/new_releases")
def new_releases():
    try:
        data = yt.get_new_releases()
        if isinstance(data, list):
            albums_raw = data
        else:
            albums_raw = data.get("albums", {}).get("results", []) or data
        
        albums = [fmt_album(a) for a in albums_raw]
        if not albums:
            # Fallback to general albums search
            res = yt.search("New Albums", filter="albums", limit=20)
            albums = [fmt_album(a) for a in res if a.get("resultType") == "album"]
            
        return jsonify({"albums": albums})
    except Exception as e:
        print(f"New releases error: {e}")
        return jsonify({"albums": []})

@app.route("/api/health")
@app.route("/health")
def health():
    return jsonify({"status": "ok", "ytmusic": "initialized"})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
