# Google Drive Sync Plan

## Goal

Prepare a safe, local-first synchronization layer for Notes without adding a custom backend. The app stays a static frontend hosted on GitHub Pages and keeps IndexedDB as the local source of truth during normal use.

## A. Assumptions

- the app remains a static frontend deployed on GitHub Pages,
- we do not build or host our own backend,
- IndexedDB stays the local database for all reads and writes,
- Google Drive becomes an external sync layer, not the primary runtime database,
- preferred remote storage is `appDataFolder` or an equivalent private app-owned Drive file,
- sync payload format is JSON,
- local export/import JSON remains as a manual backup and recovery path.

## B. Target flow

1. App starts.
2. App reads local notes from IndexedDB immediately.
3. User can continue working offline without waiting for cloud access.
4. User optionally signs in with Google.
5. App requests Drive access only when sync is needed.
6. App loads or creates the remote sync file in Drive.
7. App compares local and remote note revisions.
8. App merges both datasets.
9. App writes merged data back to IndexedDB.
10. App uploads the merged dataset to Google Drive.
11. Future local note changes mark notes as pending sync.
12. Sync can later run manually first, then automatically after edits and reconnects.

## C. Recommended sync data model

Current app model is already close, but the sync-oriented recommendation is:

- `id`
- `title`
- `body`
- `color`
- `labels`
- `pinned`
- `archived`
- `deleted`
- `createdAt`
- `updatedAt`
- `deletedAt`
- `deviceId`
- `version`
- `dirty`
- `syncStatus`
- `lastSyncedAt`

Notes:

- `deviceId` should identify the browser installation or app instance that last edited the note,
- `version` should be incremented on each local logical write,
- `dirty` should mean the local version has changes not yet confirmed in Drive,
- `syncStatus` should describe local sync state for UI feedback,
- `lastSyncedAt` should be stored per note after a successful remote confirmation.

Recommendation:

- do not change the live data model yet,
- add only the missing fields during the real sync implementation, together with a safe IndexedDB migration.

## D. Conflict strategy

Safe conflict handling matters more than aggressive auto-merge.

Recommended strategy:

1. If a note exists only locally, upload it.
2. If a note exists only remotely, import it locally.
3. If the same note exists on both sides and one side is clearly newer with no concurrent local pending edit, the newer version wins.
4. If the same note appears edited on two devices, do not overwrite silently.
5. Create a conflict copy, for example:
   - `Tytul - konflikt z telefonu`
   - `Tytul - konflikt z laptopa`
6. Keep both note bodies so no text is lost.
7. Mark the affected notes with a conflict sync status for later manual cleanup.

Rule:

- no note body should ever be discarded silently during sync.

## E. Planned sync status in UI

Recommended user-facing statuses:

- `Lokalnie zapisano`
- `Synchronizowanie`
- `Zsynchronizowano`
- `Offline`
- `Blad synchronizacji`
- `Konflikt synchronizacji`
- `Niezalogowany do Google`

Implementation note:

- current UI only needs a lightweight status label at first,
- no large sync dashboard is necessary for the first sync milestone.

## F. Google configuration required later

The app will later need:

- a Google Cloud project,
- Google Drive API enabled,
- OAuth Client ID for a web application,
- allowed JavaScript origins including:
  - local development origin,
  - GitHub Pages origin,
- a Drive scope limited to what the app actually needs,
- no client secret embedded in frontend code.

Important:

- browser-only frontend sync should use Google Identity Services for obtaining access tokens,
- client secrets must never be committed to this repository or shipped to GitHub Pages.

## G. Delivery stages for sync

1. Add Google auth scaffold.
2. Add a manual `Zaloguj z Google` button.
3. Add a manual `Synchronizuj teraz` button.
4. Load or create the remote sync file.
5. Upload the current local dataset manually.
6. Implement merge logic for local and remote notes.
7. Implement conflict copy creation and conflict statuses.
8. Add automatic sync after local edits and reconnects.
9. Expose sync status in the UI.
10. Add dedicated sync tests.

## syncService.js role

`src/syncService.js` is a good place for the future orchestration layer because it is already imported by the app and currently does not interfere with local note behavior.

Recommended future responsibilities:

- track sync status,
- queue or debounce sync requests,
- coordinate auth state with Drive operations,
- call merge helpers,
- report safe UI statuses back to the app.

Recommended non-responsibilities:

- it should not become the IndexedDB implementation,
- it should not directly own note rendering,
- it should not contain secrets or hardcoded OAuth credentials.
