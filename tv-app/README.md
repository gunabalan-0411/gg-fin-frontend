# GG Finance - Android TV app

A thin app: one full-screen WebView on the website's `/tv` page, plus two bridges the page uses.
Everything you see (pairing, search, customer, payments) is the website - **deploying the website updates the TV; this app almost never changes.**

| Bridge | What it does |
|---|---|
| `window.GGTV.listen()` | the page's mic button; listens in Tamil with the TV's speech service, answers `window.__ggtvHeard(text)` |
| Back key | asks the page first (`window.__ggtvBack()`); the app only closes when the page is on its first screen |

## Build (no Android Studio)

GitHub > **Actions > "Build TV app (APK)" > Run workflow** (it also runs when `tv-app/` changes on `main`).
When it finishes, `GGFinance-TV.apk` is on the **Releases** page under **tv-latest** (and attached to the run).

The TV opens `https://gg-fin-frontend-dev.up.railway.app/tv`. To point it elsewhere, run the workflow with the `tv_url` box filled in
(or `gradle assembleRelease -PtvUrl=https://your-host/tv` locally).

## Install on the TV (once)

1. TV: *Settings > Device Preferences > Security & restrictions > Unknown sources* - allow the app you will install from (e.g. "Downloader").
2. Put the APK on the TV - either way:
   - **Downloader** app (free, Play Store): enter the release link of `GGFinance-TV.apk` and install; or
   - **USB stick**: copy `GGFinance-TV.apk`, plug it in, open it with a file manager app on the TV.
3. Open **GG Finance** from the TV's apps row. It shows a 6-digit code.
4. On your phone or laptop: **Settings > TV**, type the code, press **Pair this TV**. The TV opens by itself.

From then on the TV opens straight to the circle - no password. To cut a TV off: **Settings > TV > Remove**.

## Updating the APK

Needed only if this folder changes. Each build is signed with the standard debug key of that build machine, so **uninstall the old app first**
(TV: Settings > Apps > GG Finance > Uninstall), then install the new file. The TV stays paired only if you do not clear its data; otherwise pair again.

## Speech

Uses the Android speech service already on the TV (Google). Needs the *microphone* permission - allowed once, the first time you press the mic.
If a TV has no speech service the mic button says so and typing still works.
