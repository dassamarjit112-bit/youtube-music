# 🚀 Publishing MusicTube (Public Internet)

Follow these steps to host your app online so your friends can use it anywhere, without your PC being on.

## 1. Host the Backend (Flask) on Render
1.  Create a free account on [Render.com](https://render.com).
2.  Connect your GitHub repository.
3.  Choose **"Web Service"**.
4.  Configure:
    *   **Runtime**: `Python`
    *   **Build Command**: `pip install -r requirements.txt` (if your service root is `backend/`)
    *   **Start Command**: `gunicorn app:app`
5.  Wait for it to deploy. You will get a URL like `https://musictube-api.onrender.com`.

## 2. Host the Frontend (React) on Vercel
1.  Create a free account on [Vercel.com](https://vercel.com).
2.  Connect your GitHub repository.
3.  Set the **Root Directory** to `frontend`.
4.  Add **Environment Variables** (Crucial!):
    *   `VITE_SUPABASE_URL`: (Your Supabase URL)
    *   `VITE_SUPABASE_ANON_KEY`: (Your Supabase Key)
    *   `VITE_RAZORPAY_KEY_ID`: (Your Razorpay Key)
    *   `VITE_API_BASE_URL`: (The URL you got from Render in Step 1) + `/api` (e.g., `https://musictube-api.onrender.com/api`)
5.  Click **Deploy**.

## 3. Update the Flutter App
1.  In `frontend/src/api.ts`, ensure `VITE_API_BASE_URL` is correctly set in your Vercel/Netlify environment.
2.  Rebuild your APK. The APK will now point to the **Live Cloud URL** instead of your local PC.

---
### Important Notes:
*   **Supabase Redirects**: Go to your Supabase Auth settings and add your new Vercel URL to the **Redirect URLs** so your friends can log in via Google.
*   **CORS**: Ensure `app.py` has `CORS(app)` (which it already does).
