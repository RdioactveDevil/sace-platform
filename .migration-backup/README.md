# SACE IQ — Adaptive Chemistry Practice

## Deploy in 4 steps

### Step 1 — Supabase setup (10 min)
1. Go to supabase.com → New Project → name it `sace-platform`
2. Once created: SQL Editor → paste entire contents of `supabase_schema.sql` → Run
3. Go to Settings → API → copy:
   - Project URL  (looks like https://xxxx.supabase.co)
   - anon public key (long string starting with eyJ)
4. Paste both into `src/lib/supabase.js`

### Step 2 — GitHub (5 min)
1. Create a new repo on github.com (private is fine)
2. Push this folder:
   ```
   git init
   git add .
   git commit -m "initial"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/sace-platform.git
   git push -u origin main
   ```

### Step 3 — Vercel deploy (3 min)
1. Go to vercel.com → Add New Project → Import your GitHub repo
2. Framework: Create React App (auto-detected)
3. Click Deploy — done

### Step 4 — Share the link
Send the Vercel URL to your brother's group chat.

---

## Adding more questions
Run any SACE Chemistry past paper PDF through this Claude prompt:

> "Extract every question from this SACE Chemistry exam. 
> Format as a JSON array. Each object must have:
> id (string, e.g. chem_100), topic (string), subtopic (string),
> difficulty (integer 1-5), question (string), options (array of 4 strings),
> answer_index (integer 0-3), solution (string), tip (string), sace_code (string).
> Return only the JSON array, no other text."

Then insert the output into Supabase: Table Editor → questions → Insert rows (paste JSON).

---

## Project structure
```
src/
  lib/
    supabase.js   ← paste your keys here
    db.js         ← all database operations
    engine.js     ← adaptive algorithm, XP system
  components/
    AuthScreen.jsx
    HomeScreen.jsx
    QuizScreen.jsx
    LeaderboardScreen.jsx
    ProfileScreen.jsx
  App.jsx         ← routing and global state
  index.js
supabase_schema.sql  ← run this in Supabase SQL editor
```
