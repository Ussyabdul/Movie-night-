# Movie Night — Backend (v2: accounts + YouTube search + history)

Still zero terminal required.

## What's new in this version
- Real sign up / sign in (passwords are scrambled/hashed, never stored as plain text)
- A search bar — type a movie name, get real YouTube results, no more copy-pasting links
- "Continue Watching" row that remembers what you've watched
- Cleaner icons + a fullscreen button

## Step 1 — Get a free YouTube API key (5 minutes)
1. Go to console.cloud.google.com and sign in with any Google account.
2. Click the project dropdown at the top → **New Project** → name it "Movie Night" → Create.
3. Once it's created and selected, go to **APIs & Services** → **Library**.
4. Search for **YouTube Data API v3** → click it → **Enable**.
5. Go to **APIs & Services** → **Credentials** → **Create Credentials** → **API key**.
6. Copy the key it gives you — you'll need it in Step 3. (This is free for normal use — no card required.)

## Step 2 — Put the code on GitHub (no terminal)
1. github.com → create a free account if you don't have one.
2. **+** → **New repository** → name it `movie-night` → Public → Create.
3. Click **uploading an existing file** and drag in everything from this folder
   (`server.js`, `package.json`, `README.md`, and the whole `public` folder).
4. **Commit changes**.

## Step 3 — Deploy on Render (free)
1. render.com → sign up with GitHub (one click).
2. **New +** → **Web Service** → connect your `movie-night` repo.
3. Leave Build Command as `npm install` and Start Command as `npm start`.
4. Before clicking Create, scroll to **Environment Variables** and add:
   - Key: `YOUTUBE_API_KEY` → Value: (the key from Step 1)
   - Key: `SESSION_SECRET` → Value: any random string, e.g. `banana-rocket-42`
5. Choose the **Free** plan → **Create Web Service**.
6. Wait a couple minutes. You'll get a link like `https://movie-night-xxxx.onrender.com` — that's your live site.

## Step 4 — Try it
1. Open the link, sign up with an email/username/password.
2. Search for a movie in the search bar, or paste a link.
3. Choose With Friends, copy the code, send it to someone.
4. They open the same link, sign up too, tap "Have an invite code?", paste it in.
5. Both press I'm ready — it starts for both of you together.

## Heads-up
Free Render servers "sleep" after 15 minutes with no visitors — first person back gets a ~30 second wake-up delay. Normal for free hosting.

## If anything breaks
Tell me exactly what you see (a screenshot helps) and I'll fix it.
