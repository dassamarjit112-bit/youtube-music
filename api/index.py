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
    if not isinstance(items, list):
        return []
    res = []
    max_idx = min(limit, len(items))
    for i in range(max_idx):
        res.append(items[i])
    return res

# Initialize YTMusic
# Using authenticated headers.json if it exists (in root or api folder)
headers_file = os.path.join(os.path.dirname(__file__), 'headers.json')
if not os.path.exists(headers_file):
    headers_file = os.path.join(os.path.dirname(__file__), '..', 'headers.json')

if os.path.exists(headers_file):
    yt = YTMusic(headers_file)
    print("YTMusic initialized with headers.json")
else:
    yt = YTMusic()
    print("YTMusic initialized without authentication")

def safe_thumb(thumbs):
    if not thumbs:
        return "https://music.youtube.com/img/on_media_mc.png"
    sorted_thumbs = sorted(thumbs, key=lambda t: t.get("width", 0), reverse=True)
    return sorted_thumbs[0].get("url", "")

def fmt_song(item):
    artist_data = item.get("artists", item.get("artist"))
    artist_name = "Unknown Artist"
    if isinstance(artist_data, list) and len(artist_data) > 0:
        artist_name = artist_data[0].get("name", "Unknown Artist") if isinstance(artist_data[0], dict) else str(artist_data[0])
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

@app.route("/api/search")
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
    except:
        return jsonify({"results": []})

@app.route("/api/home")
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
                    elif "browseId" in item: t = "playlist" if "author" in item else "artist"

                if t in ("song", "video"): items.append(fmt_song(item))
                elif t == "artist": items.append(fmt_artist(item))
                elif t == "album": items.append(fmt_album(item))
                elif t == "playlist": items.append(fmt_playlist(item))
            
            if items:
                sections.append({"title": title, "items": items})
    except: pass

    if len(sections) < 3:
        try:
            charts_data = yt.get_charts(country="ZZ")
            if "songs" in charts_data:
                song_items = limit_items(charts_data["songs"].get("items", []), 12)
                sections.append({"title": "Global Top Songs", "items": [fmt_song(s) for s in song_items]})
        except: pass

    if len(sections) < 4:
        try:
            res = yt.search("Popular Music", limit=20)
            items = [fmt_song(i) for i in res if i.get("resultType") == "song"]
            if items: sections.append({"title": "Popular Hits", "items": items[:12]})
        except: pass

    return jsonify({"sections": sections})

@app.route("/api/charts")
def charts():
    try:
        data = yt.get_charts(country=request.args.get("country", "ZZ"))
        return jsonify({
            "songs": [fmt_song(s) for s in data.get("songs", {}).get("items", [])[:20]],
            "trending": [fmt_song(s) for s in data.get("trending", {}).get("items", [])[:20]]
        })
    except:
        return jsonify({"songs": [], "trending": []})

@app.route("/api/artist/<browse_id>")
def artist(browse_id):
    try:
        data = yt.get_artist(browse_id)
        # Simplified for Vercel timeout protection
        songs = [fmt_song(s) for s in limit_items(data.get("songs", {}).get("results", []), 10)]
        albums = [fmt_album(a) for a in limit_items(data.get("albums", {}).get("results", []), 10)]
        return jsonify({
            "name": data.get("name", "Unknown"),
            "thumbnail": safe_thumb(data.get("thumbnails", [])),
            "songs": songs,
            "albums": albums,
        })
    except: return jsonify({"error": "Failed to fetch artist"}), 500

@app.route("/api/album/<browse_id>")
def album(browse_id):
    try:
        data = yt.get_album(browse_id)
        return jsonify({
            "title": data.get("title", "Unknown"),
            "artist": data.get("artists", [{}])[0].get("name", ""),
            "thumbnail": safe_thumb(data.get("thumbnails", [])),
            "tracks": [fmt_song(t) for t in data.get("tracks", [])]
        })
    except: return jsonify({"error": "Failed to fetch album"}), 500

@app.route("/api/playlist/<playlist_id>")
def playlist(playlist_id):
    try:
        data = yt.get_playlist(playlist_id, limit=50)
        return jsonify({
            "title": data.get("title", "Unknown"),
            "thumbnail": safe_thumb(data.get("thumbnails", [])),
            "tracks": [fmt_song(t) for t in data.get("tracks", [])]
        })
    except: return jsonify({"error": "Failed to fetch playlist"}), 500

@app.route("/api/watch/<video_id>")
def watch(video_id):
    try:
        data = yt.get_watch_playlist(videoId=video_id, limit=20)
        return jsonify({"tracks": [fmt_song(t) for t in data.get("tracks", [])]})
    except: return jsonify({"tracks": []})

@app.route("/api/explore/moods")
def moods():
    try:
        data = yt.get_mood_categories()
        cats = []
        for t, items in data.items():
            cats.append({"title": t, "items": [{"title": i.get("title", ""), "params": i.get("params", ""), "thumbnail": safe_thumb(i.get("thumbnails", []))} for i in items]})
        return jsonify({"categories": cats})
    except: return jsonify({"categories": []})

@app.route("/api/explore/mood")
def mood_playlists():
    params = request.args.get("params", "")
    try:
        data = yt.get_mood_playlists(params)
        return jsonify({"playlists": [fmt_playlist(p) for p in data]})
    except: return jsonify({"playlists": []})

@app.route("/api/explore/new_releases")
def new_releases():
    try:
        data = yt.get_new_releases()
        items = [fmt_album(a) for a in (data if isinstance(data, list) else data.get("albums", {}).get("results", []))]
        return jsonify({"albums": items})
    except: return jsonify({"albums": []})

# Important for Vercel: the app object must be exposed
if __name__ == "__main__":
    app.run(host="0.0.0.0", debug=True, port=5000)
