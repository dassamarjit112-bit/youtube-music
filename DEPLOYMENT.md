# 🚀 Publishing MusicTube (Public Internet)

Follow these steps to host your app online so you can use it anywhere, without your PC being perfectly turned on or running localhost!

The project has been configured as a **Monorepo on Vercel**. This means ONE single deployment will host BOTH your React/Vite frontend and your Python/Flask backend!

## Host on Vercel (Free 24/7 Hosting)

1. Create a free account on [Vercel.com](https://vercel.com) if you haven't already.
2. Sign in with GitHub and grant Vercel access to your repositories.
3. On the Vercel dashboard, click **Add New...** -> **Project**.
4. Import your `youtube-music` repository from GitHub.
5. In the **Configure Project** section:
   - **Framework Preset**: Vercel should auto-detect "Vite". Keep it.
   - **Root Directory**: Leave it as `./` (Root). The `vercel.json` file handles everything!
   - **Build Command**: Set to `npm run build` (This runs the build script in `package.json`).
   - **Output Directory**: Vercel should pull this from `vercel.json`, but you can verify it says `frontend/dist`.
6. Add your Environment Variables:
   - `VITE_SUPABASE_URL`: (Your Supabase URL)
   - `VITE_SUPABASE_ANON_KEY`: (Your Supabase Anon Key)
   - `VITE_RAZORPAY_KEY_ID`: (Your Razorpay Key if active)
7. Click **Deploy**!

Vercel will build the frontend and set up the Python backend serverless functions automatically. You will receive a live URL (e.g., `https://youtube-music-clone.vercel.app`).

## Android / Capacitor Note
If you are building the Android app using Capacitor, you need to tell your mobile app to point to your new live server instead of localhost.
1. Create a `.env.production` file in your `frontend` folder (or just update your `.env` temporarily)
2. Add: `VITE_API_URL=https://your-vercel-deployment-url.vercel.app/api`
3. Run `npm run sync` to rebuild your Android apk so it connects to the cloud!

---
### Important Notes:
*   **Supabase Redirects**: Go to your Supabase Auth settings and add your new Vercel URL to the **Redirect URLs** so you can log in via Google.
*   **Backend Routing**: In Vercel, requests to `/api/*` are perfectly routed to your `api/index.py` Flask backend automatically. Localhost proxying still works seamlessly during development.
