import os
import sys

# Crucial for Vercel: allow importing from the root directory folders
root_dir = os.path.join(os.path.dirname(__file__), '..')
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

from flask import Flask, jsonify, request
from flask_cors import CORS
from typing import List, Any

# Delay import to ensure sys.path is ready
try:
    from ytmusicapi import YTMusic
except ImportError:
    # Fallback if pip install is the only way
    from ytmusicapi import YTMusic

app = Flask(__name__)
CORS(app)

def limit_items(items, limit=12):
    if not isinstance(items, list): return []
    return items[:limit]

# Initialize YTMusic with better pathing for Vercel
headers_file = os.path.join(os.path.dirname(__file__), 'headers.json')
if not os.path.exists(headers_file):
    headers_file = os.path.join(root_dir, 'headers.json')

if os.path.exists(headers_file):
    yt = YTMusic(headers_file)
else:
    yt = YTMusic()

def safe_thumb(thumbs):
    if not thumbs: return "https://music.youtube.com/img/on_media_mc.png"
    return sorted(thumbs, key=lambda t: t.get("width", 0), reverse=True)[0].get("url", "")

def fmt_song(item):
    artist_data = item.get("artists", item.get("artist", []))
    artist_name = "Unknown Artist"
    if isinstance(artist_data, list) and len(artist_data) > 0:
        artist_name = artist_data[0].get("name", "Unknown Artist") if isinstance(artist_data[0], dict) else str(artist_data[0])
    elif isinstance(artist_data, dict):
        artist_name = artist_data.get("name", "Unknown Artist")
    
    album_data = item.get("album", {})
    album_name = album_data.get("name", "") if isinstance(album_data, dict) else str(album_data)

    return {
        "videoId": item.get("videoId", ""),
        "title": item.get("title", "Unknown"),
        "artist": artist_name,
        "album": album_name,
        "thumbnail": safe_thumb(item.get("thumbnails", [])),
        "duration": item.get("duration", ""),
        "type": "song"
    }

def fmt_artist(item):
    return {
        "browseId": item.get("browseId", ""),
        "name": item.get("artist", item.get("name", "Unknown")),
        "thumbnail": safe_thumb(item.get("thumbnails", [])),
        "type": "artist"
    }

def fmt_album(item):
    artist_data = item.get("artists", item.get("artist", []))
    artist_name = artist_data[0].get("name", "") if (isinstance(artist_data, list) and len(artist_data) > 0 and isinstance(artist_data[0], dict)) else ""
    return {
        "browseId": item.get("browseId", ""),
        "title": item.get("title", "Unknown"),
        "artist": artist_name,
        "thumbnail": safe_thumb(item.get("thumbnails", [])),
        "type": "album"
    }

def fmt_playlist(item):
    return {
        "playlistId": item.get("playlistId", item.get("browseId", "")),
        "title": item.get("title", "Unknown"),
        "thumbnail": safe_thumb(item.get("thumbnails", [])),
        "type": "playlist"
    }

@app.route("/api/home")
def home():
    sections = []
    # Primary: get_home
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
                    elif "playlistId" in item: t = "playlist"
                    elif "browseId" in item: t = "playlist" if "author" in item else "artist"
                    elif "subscribers" in item: t = "artist"
                
                if t in ("song", "video"): items.append(fmt_song(item))
                elif t == "artist": items.append(fmt_artist(item))
                elif t == "album": items.append(fmt_album(item))
                elif t == "playlist": items.append(fmt_playlist(item))
            if items: sections.append({"title": title, "items": items})
    except: pass

    # Secondary: get_charts
    if len(sections) < 2:
        try:
            charts = yt.get_charts(country="ZZ")
            if "songs" in charts:
                items = [fmt_song(s) for s in limit_items(charts["songs"].get("items", []), 12)]
                if items: sections.append({"title": "Global Top Songs", "items": items})
        except: pass

    # Tertiary: Search based hits
    if len(sections) < 3:
        try:
            res = yt.search("Trending Songs", limit=20)
            items = [fmt_song(i) for i in res if i.get("resultType") == "song"]
            if items: sections.append({"title": "Trending Music", "items": items[:12]})
        except: pass

    return jsonify({"sections": sections})

@app.route("/api/search")
def search():
    q = request.args.get("q", "")
    if not q: return jsonify({"results": []})
    try:
        results = yt.search(q, limit=20)
        formatted = []
        for item in results:
            t = item.get("resultType", "")
            if t == "song": formatted.append(fmt_song(item))
            elif t == "artist": formatted.append(fmt_artist(item))
            elif t == "album": formatted.append(fmt_album(item))
            elif t == "playlist": formatted.append(fmt_playlist(item))
        return jsonify({"results": formatted})
    except: return jsonify({"results": []})

@app.route("/api/ping")
def ping():
    return jsonify({"status": "ok", "provider": "ytmusicapi"})

@app.route("/api/artist/<browse_id>")
def artist(browse_id):
    try:
        data = yt.get_artist(browse_id)
        return jsonify({
            "name": data.get("name", "Unknown"),
            "thumbnail": safe_thumb(data.get("thumbnails", [])),
            "songs": [fmt_song(s) for s in limit_items(data.get("songs", {}).get("results", []), 12)],
            "albums": [fmt_album(a) for a in limit_items(data.get("albums", {}).get("results", []), 12)]
        })
    except: return jsonify({"error": "artist fetch failed"}), 500

@app.route("/api/album/<browse_id>")
def album(browse_id):
    try:
        data = yt.get_album(browse_id)
        return jsonify({
            "title": data.get("title", "Unknown"),
            "thumbnail": safe_thumb(data.get("thumbnails", [])),
            "tracks": [fmt_song(t) for t in data.get("tracks", [])]
        })
    except: return jsonify({"error": "album fetch failed"}), 500

@app.route("/api/playlist/<id>")
def playlist(id):
    try:
        data = yt.get_playlist(id, limit=100)
        return jsonify({
            "title": data.get("title", "Unknown"),
            "thumbnail": safe_thumb(data.get("thumbnails", [])),
            "tracks": [fmt_song(t) for t in data.get("tracks", [])]
        })
    except: return jsonify({"error": "playlist fetch failed"}), 500

@app.route("/api/explore/new_releases")
def new_releases():
    try:
        data = yt.get_new_releases()
        items = [fmt_album(a) for a in (data if isinstance(data, list) else data.get("albums", {}).get("results", []))]
        return jsonify({"albums": items})
    except: return jsonify({"albums": []})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
