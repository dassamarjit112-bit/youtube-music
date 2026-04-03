import sys
import os

# Add ytmusicapi to path if folder exists in parent
# Using system-installed ytmusicapi package (1.11.5)
# sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'ytmusicapi'))


from flask import Flask, jsonify, request
from flask_cors import CORS
from ytmusicapi import YTMusic
from typing import List, Any
import yt_dlp

app = Flask(__name__)
CORS(app)

# ─── STREAM RESOLVER (For Native ExoPlayer) ──────────────────────────────

@app.route("/api/stream/<video_id>")
def stream(video_id):
    if not video_id:
        return jsonify({"error": "No videoId"}), 400
    try:
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

def limit_items(items: Any, limit: int = 12) -> List[Any]:
    """Helper to limit items without using slices, avoiding indexing lint errors."""
    if not isinstance(items, list):
        return []
    res = []
    max_idx = min(limit, len(items))
    for i in range(max_idx):
        res.append(items[i])
    return res

# Initialize YTMusic
# Look for headers.json in the backend directory for authenticated access
headers_file = os.path.join(os.path.dirname(__file__), "headers.json")

try:
    if os.path.exists(headers_file):
        yt = YTMusic(headers_file)
        print("YTMusic initialized with headers.json")
    else:
        yt = YTMusic()
        print("YTMusic initialized without authentication")
except Exception as e:
    print(f"YTMusic init error with headers: {e}. Falling back to unauthenticated.")
    yt = YTMusic()


def safe_thumb(thumbs):
    """Pick the best thumbnail from a list."""
    if not thumbs:
        return "https://music.youtube.com/img/on_media_mc.png" # generic placeholder
    # Sort by width descending and pick the best (but not too massive)
    sorted_thumbs = sorted(thumbs, key=lambda t: t.get("width", 0), reverse=True)
    return sorted_thumbs[0].get("url", "")

def fmt_song(item):
    """Normalize a search/browse song result."""
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
        "type": "song"
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

# ─── SEARCH ────────────────────────────────────────────────────────────────────

@app.route("/api/search")
def search():
    global yt
    q = request.args.get("q", "")
    filter_type = request.args.get("filter", None)
    if not q:
        return jsonify({"results": []})
    try:
        results = yt.search(q, filter=filter_type, limit=20)
        formatted = []
        for item in results:
            t = item.get("resultType", "")
            if t == "song":
                formatted.append(fmt_song(item))
            elif t == "artist":
                formatted.append(fmt_artist(item))
            elif t == "album":
                formatted.append(fmt_album(item))
            elif t == "playlist":
                formatted.append(fmt_playlist(item))
            elif t == "video":
                # Treat videos like songs for playback
                f = fmt_song(item)
                f["type"] = "video"
                formatted.append(f)
        return jsonify({"results": formatted})
    except Exception as e:
        print(f"Search error: {e}")
        try:
            yt = YTMusic()
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
        except Exception as re_e:
            return jsonify({"results": []})

# ─── HOME / BROWSE ─────────────────────────────────────────────────────────────

@app.route("/api/home")
def home():
    sections = []
    try:
        # get_home() works best with authentication, may fail without it
        results = yt.get_home(limit=8)
        for section in results:
            title = section.get("title", "")
            contents = section.get("contents", [])
            items = []
            for item in contents:
                t = item.get("resultType", "")
                if not t:
                    if "videoId" in item: t = "song"
                    elif "category" in item: continue
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

    # Last resort attempt for variety (if less than 4 sections)
    if len(sections) < 4:
        try:
            res = yt.search("Popular Music", limit=20)
            items = [fmt_song(i) for i in res if i.get("resultType") == "song"]
            if items:
                sections.append({"title": "Popular Hits", "items": items[:12]})
        except: pass

    return jsonify({"sections": sections})

# ─── CHARTS ────────────────────────────────────────────────────────────────────

@app.route("/api/charts")
def charts():
    country = request.args.get("country", "ZZ")
    try:
        data = yt.get_charts(country=country)
        songs = [fmt_song(s) for s in data.get("songs", {}).get("items", [])[:20]]
        trending = [fmt_song(s) for s in data.get("trending", {}).get("items", [])[:20]]
        return jsonify({"songs": songs, "trending": trending})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ─── ARTIST ────────────────────────────────────────────────────────────────────

@app.route("/api/artist/<browse_id>")
def artist(browse_id):
    try:
        data = yt.get_artist(browse_id)
        # Handle cases where sections might be lists directly or have "results"
        song_data = data.get("songs") or {}
        if isinstance(song_data, list):
            songs_raw = song_data
        else:
            # Try to get results or items, ensuring we get a list back
            res_data = song_data.get("results")
            if not isinstance(res_data, list):
                res_data = song_data.get("items", [])
            songs_raw = res_data
        
        songs_list = limit_items(songs_raw, 12)
        songs = [fmt_song(s) for s in songs_list]
        
        album_data = data.get("albums", {})
        if isinstance(album_data, list):
            albums_raw = album_data
        else:
            alb_res_data = album_data.get("results")
            if not isinstance(alb_res_data, list):
                alb_res_data = album_data.get("items", [])
            albums_raw = alb_res_data if isinstance(alb_res_data, list) else []
        
        albums_list = limit_items(albums_raw, 12)
        albums = [fmt_album(a) for a in albums_list]
        
        return jsonify({
            "name": data.get("name", "Unknown"),
            "description": data.get("description", ""),
            "thumbnail": safe_thumb(data.get("thumbnails", [])),
            "subscribers": data.get("subscribers", ""),
            "songs": songs,
            "albums": albums,
        })
    except Exception as e:
        print(f"Artist error: {e}")
        return jsonify({"error": str(e)}), 500

# ─── ALBUM ─────────────────────────────────────────────────────────────────────

@app.route("/api/album/<browse_id>")
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
            "year": data.get("year", ""),
            "trackCount": data.get("trackCount", len(tracks)),
            "duration": data.get("duration", ""),
            "tracks": tracks,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ─── PLAYLIST ──────────────────────────────────────────────────────────────────

@app.route("/api/playlist/<playlist_id>")
def playlist(playlist_id):
    try:
        data = yt.get_playlist(playlist_id, limit=100)
        tracks = [fmt_song(t) for t in data.get("tracks", [])]
        return jsonify({
            "title": data.get("title", "Unknown"),
            "thumbnail": safe_thumb(data.get("thumbnails", [])),
            "description": data.get("description", ""),
            "trackCount": data.get("trackCount", len(tracks)),
            "tracks": tracks,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ─── WATCH (Smart Queue Builder) ────────────────────────────────────────────

@app.route("/api/watch/<video_id>")
def watch(video_id):
    try:
        seen_ids = set()
        all_tracks = []

        def add_unique(tracks_list):
            """Add tracks to the queue, skipping duplicates."""
            for t in tracks_list:
                vid = t.get("videoId", "")
                if vid and vid not in seen_ids:
                    seen_ids.add(vid)
                    all_tracks.append(fmt_song(t))

        # 1. Primary: Get watch playlist (YouTube's own "Up Next" queue)
        try:
            data = yt.get_watch_playlist(videoId=video_id, limit=50)
            add_unique(data.get("tracks", []))
        except:
            pass

        # 2. Get song info to extract artist and title for smarter searches
        song_artist = ""
        song_title = ""
        if all_tracks:
            song_artist = all_tracks[0].get("artist", "")
            song_title = all_tracks[0].get("title", "")

        # 3. Secondary: Search for more songs by the same artist
        if song_artist and song_artist != "Unknown Artist":
            try:
                artist_results = yt.search(song_artist, filter="songs", limit=15)
                add_unique([r for r in artist_results if r.get("resultType") == "song"])
            except:
                pass

        # 4. Tertiary: Search by song title keywords to find language-similar songs
        # This is key for Hindi/regional language matching
        if song_title:
            # Extract meaningful keywords (skip very short words)
            keywords = [w for w in song_title.split() if len(w) > 2]
            # Use first 2-3 keywords for a targeted search
            search_query = " ".join(keywords[:3]) if keywords else song_title
            try:
                title_results = yt.search(search_query, filter="songs", limit=15)
                add_unique([r for r in title_results if r.get("resultType") == "song"])
            except:
                pass

        # 5. If still low on tracks, try a Radio mix via get_watch_playlist with radio=True
        if len(all_tracks) < 30:
            try:
                radio_data = yt.get_watch_playlist(videoId=video_id, limit=50, radio=True)
                add_unique(radio_data.get("tracks", []))
            except:
                pass

        # 6. Filter out the current song from the queue
        final_tracks = [t for t in all_tracks if t.get("videoId") != video_id]

        return jsonify({"tracks": final_tracks})
    except Exception as e:
        print(f"Watch/queue error: {e}")
        return jsonify({"error": str(e)}), 500


# ─── EXPLORE ───────────────────────────────────────────────────────────────────

@app.route("/api/explore/moods")
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
def mood_playlists():
    params = request.args.get("params", "")
    try:
        data = yt.get_mood_playlists(params)
        playlists = [fmt_playlist(p) for p in data]
        return jsonify({"playlists": playlists})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/explore/new_releases")
def new_releases():
    try:
        data = yt.get_new_releases()
        if isinstance(data, list): albums_raw = data
        else: albums_raw = data.get("albums", {}).get("results", []) or data
        
        albums = [fmt_album(a) for a in albums_raw]
        if not albums:
            # Fallback to general albums search
            res = yt.search("New Albums", filter="albums", limit=20)
            albums = [fmt_album(a) for a in res if a.get("resultType") == "album"]
            
        return jsonify({"albums": albums})
    except Exception as e:
        print(f"New releases error: {e}")
        return jsonify({"albums": []})

if __name__ == "__main__":
    app.run(host="0.0.0.0", debug=True, port=5000)
