import sys
import os

# Add ytmusicapi to path if folder exists in parent
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'ytmusicapi'))

from flask import Flask, jsonify, request
from flask_cors import CORS
from ytmusicapi import YTMusic
from typing import List, Any

app = Flask(__name__)
CORS(app)

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
# Using authenticated headers.json if it exists for better home feed results
headers_file = os.path.join(os.path.dirname(__file__), 'headers.json')
if os.path.exists(headers_file):
    yt = YTMusic(headers_file)
    print("YTMusic initialized with headers.json")
else:
    yt = YTMusic()
    print("YTMusic initialized without authentication")

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
    try:
        # get_home() works best with authentication
        results = yt.get_home(limit=8)
        sections = []
        for section in results:
            title = section.get("title", "")
            contents = section.get("contents", [])
            items = []
            for item in contents:
                # Guess resultType if missing
                t = item.get("resultType", "")
                if not t:
                    if "videoId" in item: t = "song"
                    elif "category" in item: continue # skip category labels
                    elif "subscribers" in item: t = "artist"
                    elif "year" in item: t = "album"
                    elif "playlistId" in item: t = "playlist"
                    elif "browseId" in item:
                        if "author" in item: t = "playlist"
                        elif "artists" in item: t = "album"
                        else: t = "artist"

                if t in ("song", "video"):
                    items.append(fmt_song(item))
                elif t == "artist":
                    items.append(fmt_artist(item))
                elif t == "album":
                    items.append(fmt_album(item))
                elif t == "playlist":
                    items.append(fmt_playlist(item))
            
            if items:
                sections.append({"title": title, "items": items})
        
        # If no sections, try to get charts as fallback
        if not sections:
            try:
                charts_data = yt.get_charts(country="ZZ")
                if "songs" in charts_data:
                    song_items = limit_items(charts_data["songs"].get("items", []), 12)
                    sections.append({
                        "title": "Top Songs",
                        "items": [fmt_song(s) for s in song_items]
                    })
                if "trending" in charts_data:
                    trending_items = limit_items(charts_data["trending"].get("items", []), 12)
                    sections.append({
                        "title": "Trending",
                        "items": [fmt_song(s) for s in trending_items]
                    })
            except: pass

        return jsonify({"sections": sections})
    except Exception as e:
        print(f"Home error: {e}")
        return jsonify({"error": str(e)}), 500

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
        song_data = data.get("songs", {})
        if isinstance(song_data, list):
            songs_raw = song_data
        else:
            # Try to get results or items, ensuring we get a list back
            res_data = song_data.get("results")
            if not isinstance(res_data, list):
                res_data = song_data.get("items", [])
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

# ─── WATCH ────────────────────────────────────────────────────────

@app.route("/api/watch/<video_id>")
def watch(video_id):
    try:
        data = yt.get_watch_playlist(videoId=video_id, limit=20)
        tracks = [fmt_song(t) for t in data.get("tracks", [])]
        return jsonify({"tracks": tracks})
    except Exception as e:
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
        # Handle cases where it's a list or dict
        if isinstance(data, list): albums_raw = data
        else: albums_raw = data.get("albums", {}).get("results", []) or data
        
        albums = [fmt_album(a) for a in albums_raw]
        return jsonify({"albums": albums})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True, port=5000)
