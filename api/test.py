from flask import Flask, jsonify

app = Flask(__name__)

@app.route("/api/simple")
@app.route("/simple")
def simple():
    return jsonify({"status": "ok", "message": "Simple Vercel Backend is working!"})

if __name__ == "__main__":
    app.run(port=5002)
