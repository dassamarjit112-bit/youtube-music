from flask import Flask, jsonify

app = Flask(__name__)

@app.route("/api/health")
@app.route("/health")
def health():
    return jsonify({"status": "ok", "message": "Backend is working!"})

# This is for local testing, Vercel uses 'app' directly
if __name__ == "__main__":
    app.run(port=5001)
