# Ivan & Katie – Household Ledger

A two-person Splitwise-style expense ledger for Ivan and Katie: static front end on Firebase Hosting, shared ledger in Firebase Firestore, Google sign-in restricted to two accounts, real-time sync between both phones, and monthly recurring items (rent, utilities, …) posted automatically.

Files:

- `index.html` – the whole app (UI + logic). Edit the `FIREBASE_CONFIG` block near the bottom.
- `firestore.rules` – Firestore security rules (contains the two allowed Gmail addresses). Paste into the Firebase console.
- `manifest.webmanifest`, `icon.svg`, `icon-180.png`, `icon-192.png`, `icon-512.png` – home-screen app metadata and icons (iOS requires the PNG apple-touch-icon).
- `sw.js` – service worker. Caches the app shell and the Firebase SDK so launches after the first are near-instant and the app opens offline. `index.html` is fetched network-first, so edits to it appear on the next launch without any bump; **bump `VERSION` in `sw.js` when you change the icons, manifest, or the Firebase SDK version** (those are cached until the version changes).

## How it works

- Money is stored as integer pence; split shares always sum exactly to the amount.
- `expenses/*` – each entry: `amount`, `paidBy` (0 or 1), `split` (`equal` | `exact` | `percent` | `full`), `shares [a,b]`, `date`, `category`. Settlements are entries where the payer bears 0% and the other person 100%.
- Balance = Σ over entries of (amount paid by person 0 − person 0's share). Positive → person 1 owes person 0.
- `recurring/*` – template entries with `day`, `startMonth`, optional `endMonth`, `lastPosted`. On every app open (and when the tab becomes visible), each recurring item is checked; months that are due and not yet posted are written inside a Firestore transaction with deterministic ids (`rec_<recurringId>_<YYYY-MM>`), so two phones opening at once cannot double-post. Posted entries are ordinary ledger entries and can be edited or deleted individually.
- Sign-in is Google. The two allowed addresses are listed in `ACCOUNTS` in `index.html` (which person each one is) and in `allowedUser()` in `firestore.rules` (what the database enforces). Anyone else is denied by the database regardless of the page. The ledger is the single document `households/main`.

## Setup (one-off)

### 1. Firebase project (project `splitwise-ebf16`)

1. **Build → Firestore Database → Create database** (if not done): region `europe-west2 (London)`, **production mode**, default database id `(default)`.
2. **Firestore Database → Rules tab**: replace everything with the contents of `firestore.rules` → **Publish**. The two Gmail addresses are already in the file; edit `allowedUser()` if either changes.
3. **Build → Authentication → Sign-in method → Google → Enable.** Pick a support email, Save. Anonymous sign-in is no longer needed; leave it off or disable it.
4. **Authentication → Settings → Authorized domains**: `splitwise-ebf16.web.app` and `splitwise-ebf16.firebaseapp.com` are there by default. If you later add a custom domain, add it here too.
5. Optional hardening: Google Cloud Console → APIs & Services → Credentials → the browser key → Application restrictions → Websites → add `https://splitwise-ebf16.web.app/*` and `https://splitwise-ebf16.firebaseapp.com/*`.

### 2. Deploy to Firebase Hosting

From the folder containing these files, with the Firebase CLI installed and logged in:

```
firebase deploy --only hosting
```

(`firebase.json` should point `public` at this folder, or copy the files into the folder it points at.) The site is at `https://splitwise-ebf16.web.app`.

Sign-in uses the hosting domain as its auth domain (set automatically in `index.html` when served from `*.web.app` / `*.firebaseapp.com`), which keeps the Google sign-in flow same-origin — this is what makes it reliable on iPhone.

### 3. First run

1. Open `https://splitwise-ebf16.web.app` in Safari on your iPhone → **Continue with Google** → choose `ivan.yang94@gmail.com`. The ledger is created automatically on first sign-in.
2. Katie opens the same URL → **Continue with Google** → `katiekwong96@gmail.com`. Any other Google account sees "not registered for this ledger".
3. On each phone: Safari share button → **Add to Home Screen**. Launch from the home-screen icon from then on – it runs full-screen and stays signed in. (The home-screen app has its own storage, so it asks you to sign in once more on first launch.)
4. **Recurring** tab → add rent, utilities, etc. with the day of month they are paid and who pays. They post automatically from the first month you set.

## Daily use

- **Add** (the + button): amount, description, category, payer, split. Default is half each; alternatives are "one owes all", exact amounts, or percentages. A live line shows the effect on the balance before saving. Tap any ledger row for details, edit, or delete (delete has a 6-second Undo).
- The home card always shows who owes whom from the perspective of the signed-in person. **Settle up** records a payment, prefilled with the outstanding balance.
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
- Use the home-screen app, not a Safari tab: Safari deletes site storage after 7 days without use (sign-in session, offline cache, any unsynced entries). Home-screen apps are exempt.
- Delete has a single Undo slot: deleting two entries quickly and tapping Undo restores only the second.
- ⚙ Settings shows which account is signed in and has **Sign out**.
- Recurring items post when an app is opened, not at midnight. If neither of you opens the app for a month, the missing months post at the next open, dated correctly.
