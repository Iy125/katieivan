# Ivan & Katie – Household Ledger

A two-person Splitwise-style expense ledger for Ivan and Katie: static front end on GitHub Pages, shared ledger in Firebase Firestore, real-time sync between both phones, and monthly recurring items (rent, utilities, …) posted automatically.

Files:

- `index.html` – the whole app (UI + logic). Edit the `FIREBASE_CONFIG` block near the bottom.
- `firestore.rules` – Firestore security rules. Paste into the Firebase console.
- `manifest.webmanifest`, `icon.svg`, `icon-180.png`, `icon-192.png`, `icon-512.png` – home-screen app metadata and icons (iOS requires the PNG apple-touch-icon).
- `sw.js` – service worker. Caches the app shell and the Firebase SDK so launches after the first are near-instant and the app opens offline. `index.html` is fetched network-first, so edits to it appear on the next launch without any bump; **bump `VERSION` in `sw.js` when you change the icons, manifest, or the Firebase SDK version** (those are cached until the version changes).

## How it works

- Money is stored as integer pence; split shares always sum exactly to the amount.
- `expenses/*` – each entry: `amount`, `paidBy` (0 or 1), `split` (`equal` | `exact` | `percent` | `full`), `shares [a,b]`, `date`, `category`. Settlements are entries where the payer bears 0% and the other person 100%.
- Balance = Σ over entries of (amount paid by person 0 − person 0's share). Positive → person 1 owes person 0.
- `recurring/*` – template entries with `day`, `startMonth`, optional `endMonth`, `lastPosted`. On every app open (and when the tab becomes visible), each recurring item is checked; months that are due and not yet posted are written inside a Firestore transaction with deterministic ids (`rec_<recurringId>_<YYYY-MM>`), so two phones opening at once cannot double-post. Posted entries are ordinary ledger entries and can be edited or deleted individually.
- Sign-in is a shared passphrase. `SHA-256(passphrase)` is the ledger id in Firestore; each phone authenticates with Firebase anonymous auth. Nothing is recoverable if the passphrase is forgotten, and anyone who knows the passphrase has full access, so use four or five random words.

## Setup (≈15 minutes, one-off)

### 1. Firebase project

1. Go to https://console.firebase.google.com → **Add project**. Name it anything. Google Analytics can be off.
2. **Build → Firestore Database → Create database.** Choose a region near you (e.g. `europe-west2` London). Start in **production mode**.
3. **Build → Authentication → Get started → Sign-in method → Anonymous → Enable.**
4. **Project settings (gear icon) → Your apps → Web (`</>`).** Register the app (no Firebase Hosting needed). Copy the `firebaseConfig` object shown.
5. Paste `apiKey`, `authDomain`, `projectId`, `appId` into the `FIREBASE_CONFIG` block in `index.html`.
6. **Firestore Database → Rules.** Replace the contents with `firestore.rules` from this repo and **Publish**.
7. **Authentication → Settings → Authorized domains → Add domain:** `<your-github-username>.github.io`. (Anonymous sign-in does not strictly need this, but it is harmless and required if you ever add Google sign-in.)
8. **Authentication → Sign-in method → Anonymous → enable "Automatic clean-up"** of anonymous accounts (each cleared browser creates a new one).
9. Optional hardening, recommended: in Google Cloud Console → APIs & Services → Credentials, restrict the browser API key to HTTP referrer `https://<your-github-username>.github.io/*`.

### 2. GitHub Pages

1. Create a repository (public or private – private repos can serve Pages on paid GitHub plans; the site itself is always publicly reachable, which is fine because the ledger is protected by the passphrase, not by the URL).
2. Commit every file in this folder to the default branch.
3. **Settings → Pages → Source: Deploy from a branch → `main` / `(root)` → Save.** The site appears at `https://<username>.github.io/<repo>/` after a minute or two.

### 3. First run

1. Open the site in Safari on your iPhone. Enter a passphrase (≥ 12 characters; four random words is ideal), tap **Ivan**, then **Continue**. Because no ledger exists yet, the app asks you to confirm **Create a new ledger** – tap it.
2. On Katie's phone, open the same URL, enter the same passphrase, tap **Katie**, **Continue**. It opens straight into the shared ledger. If it instead says "No ledger exists for this passphrase", the passphrase was mistyped – do not create a second ledger.
3. After both phones are in: **pin the ledger** in the rules (see the comment at the top of `firestore.rules`) so nobody can create other ledgers in your project. This is a one-line change in the Firebase console.
4. On each phone: Safari share button → **Add to Home Screen**. Launch from the home-screen icon from then on – it runs full-screen without the Safari chrome, respecting the Dynamic Island and home indicator. (The passphrase is stored per browser profile, so the home-screen app asks for it once more on first launch.)
5. **Recurring** tab → add rent, utilities, etc. with the day of month they are paid and who pays. They post automatically from the first month you set.

## Daily use

- **Add** (the + button): amount, description, category, payer, split. Default is half each; alternatives are "one owes all", exact amounts, or percentages. A live line shows the effect on the balance before saving. Tap any ledger row for details, edit, or delete (delete has a 6-second Undo).
- The home card always shows who owes whom from the perspective of the phone's owner (set under ⚙ Settings). **Settle up** records a payment, prefilled with the outstanding balance.
- **Recurring** items can be paused with the switch; the row shows the next posting date. Paused months are skipped on resume (the current month still posts if its day has passed). Moving an item's first month backwards after it has posted does not back-fill.
- **Settle up** records a payment between you (prefilled with the full balance so one tap clears the tally to zero; edit the amount for a partial payment). The sheet states the balance that will remain. Settlements show in the ledger as transfers and are excluded from spending totals.
- **Insights** shows per-month spend, paid vs fair share for each of you, and a category breakdown.
- Works offline: entries made without signal are queued and sync when connectivity returns. Recurring posting requires connectivity (it uses a transaction).

## Performance design

- Writes are optimistic: Firestore applies them to the local cache instantly and syncs in the background, so saving never waits on the network. Failures surface as a toast.
- Rendering is coalesced to one frame per data change and only the visible tab is redrawn; monthly summaries are computed once per change and cached.
- The activity list paints the latest 80 entries and loads earlier ones on demand; click handling is delegated, so there is one listener regardless of list length.
- Recurring items due are posted in a single transaction (one round trip) with deterministic ids, so simultaneous opens on both phones cannot double-post.
- The Firebase SDK is pre-connected and module-preloaded in the page head, and cached by the service worker after first load.

## Limits and caveats

- Free Firestore tier (Spark): 50k reads, 20k writes per day – orders of magnitude more than two people need. Set a budget alert in Google Cloud anyway if you ever upgrade to Blaze.
- Until you pin the ledger id in the rules (step 3.3), anyone who knows your Firebase project id can create *their own* ledgers in your project (not read yours – listing is denied and ids are 256-bit hashes). Pinning closes this. A stricter upgrade path is Google sign-in with a UID allow-list.
- Use the home-screen app, not a Safari tab: Safari deletes site storage after 7 days without use (passphrase, offline cache, any unsynced entries). Home-screen apps are exempt.
- Delete has a single Undo slot: deleting two entries quickly and tapping Undo restores only the second.
- The passphrase is stored in the browser as its hash (`localStorage`), not in plain text. Clearing site data on the phone means re-entering it (⚙ Settings → "Sign out of this phone" does the same).
- Recurring items post when an app is opened, not at midnight. If neither of you opens the app for a month, the missing months post at the next open, dated correctly.
