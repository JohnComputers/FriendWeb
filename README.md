# FriendWeb

A local-first, responsive 3D relationship mapper built with React, Vite, TypeScript, Tailwind, Three.js, react-force-graph-3d, Zustand, and IndexedDB. All graph storage and processing happen in your browser. There are no accounts, server APIs, API keys, ads, subscriptions, or mandatory paid services.

## Run locally

Use Node.js 22 or newer and npm:

```sh
npm ci
npm run dev
```

Open the URL printed by Vite. To verify and serve a production build:

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run preview
```

`dist/` is the complete static site. Production assets and the app shell are precached by a service worker. Visit the deployed app once online before using it offline. PWA installation requires HTTPS (or a browser's local development exception). The service worker is intentionally disabled during `npm run dev`.

## Deploy to GitHub Pages

1. Create a GitHub repository and push this folder to its `main` branch. Commit `package-lock.json` with the source.
2. In **Settings → Pages → Build and deployment**, choose **GitHub Actions** as the source.
3. In **Actions**, enable workflows if GitHub asks. The included `.github/workflows/pages.yml` runs lint, type checking, tests, and a production build before deploying. Pull requests run checks without deploying.
4. Find the published URL in the workflow's `github-pages` environment or in Settings → Pages.

For a new empty repository, the usual Git commands are:

```sh
git init
git add .
git commit -m "Build FriendWeb"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
git push -u origin main
```

Replace the username and repository name with your own. If you already have a Git checkout or remote, use its existing setup.

The build automatically chooses `/repository-name/` for a project repository and `/` for an `owner.github.io` repository, using `GITHUB_REPOSITORY`. No source edits are needed when renaming the repository. Local builds default to relative `./` assets. For a custom domain, set repository Actions variable `VITE_BASE_PATH` to `/`; for another subdirectory, use a leading and trailing slash, such as `/friendweb/`.

You can test a project path locally:

```sh
GITHUB_REPOSITORY=your-name/friendweb npm run build
```

GitHub Pages serves only static application files. Personal graph data is never committed or uploaded by the app. Hosting remains subject to GitHub's own free-plan limits and availability. This repository does not automatically create a GitHub repository or enable Pages for you.

## First steps

The initial fictional example web demonstrates groups, relationship types, and spatial positions. Create a new blank web to start your own map. Only a person's first name is required; optional attributes are entered explicitly and never inferred.

- **People:** create and edit profiles, upload local photos, add tags/groups/custom fields, favorite, duplicate, merge, hide, and delete. Same-name people are supported with duplicate warnings.
- **Connections:** select one source and multiple searchable targets, choose a type/style/comment once, then create the batch. Multiple relationship types and directed links are supported. Exact duplicates require confirmation.
- **Explore:** rotate, pan, zoom, select a person or connection, search, filter, inspect neighbors, find a shortest path, or switch to the directory table. Use the graph toolbar to fit/reset the camera.
- **Customize:** adjust appearance, labels, node/link styling, backgrounds, lighting, physics, camera, and motion settings. Settings and named presets belong to each web.
- **Save:** mutations autosave locally. Use undo/redo for changes to people, connections, settings, and web creation, renaming, duplication, or deletion. Switching webs clears the current undo history. Export JSON files as portable backups. Keep backups outside browser storage.

The application itself displays available shortcuts and control hints. Browser and operating-system shortcuts can take priority.

## Sharing and backups

The sharing dialog creates a view-only snapshot with selected private fields removed by default. Anyone who receives the link or file can read all included information. Review inclusion switches before sharing. Snapshots are independent copies and never live-sync; a recipient can copy a snapshot into their own editable local webs.

Shared URL data is compressed into the URL **fragment** (after `#share=`). The fragment is processed locally and is not included in the normal HTTP request to the static host. It can still be exposed to anyone with access to the complete URL, browser history, clipboard, screenshots, or the destination where you intentionally share it. Keep sensitive content out of share links. When a snapshot exceeds the link length budget, share the portable JSON file instead; individual apps and browsers may impose shorter URL limits.

To protect a shared snapshot, turn on **Password protection** in the sharing dialog, enter a password, and generate the protected link. Send the password to the recipient separately. The snapshot is encrypted in your browser with AES-GCM and a key derived from the password; the password is not included in the link. The recipient enters the password locally, views the snapshot, and can copy it to their own webs. A forgotten password cannot be recovered. If a protected link is too long, download the encrypted snapshot file and send that instead; the recipient can open it through **Export and import**. Password-protected snapshots, like other snapshots, do not live-sync. Use a strong, unique password.

Full JSON exports back up the current web and include private fields and local photos. Export each web separately if you have several. Shared JSON downloads honor the sharing dialog's inclusion options. Imports validate their format and references before use; unsupported versions and malformed files produce an error without replacing existing webs. CSV is intended for bulk people import; use JSON to preserve complete relationships, positions, photos, settings, and metadata.

### CSV template

Use [`public/people-template.csv`](public/people-template.csv) as an example. A `firstName` (or `name`) heading is required. Optional recognized headings include `lastName`, `nickname`, `pronouns`, `gender`, `birthday`, `age`, `description`, `notes`, `tags`, `groups`, and `color`. Separate multiple tags/groups with `|` or `;`. Color values use hexadecimal notation; birthday values can use `YYYY-MM-DD`. Unrecognized headings become custom fields. Quoted commas, quoted newlines, escaped double quotes, UTF-8 BOM, and CRLF line endings are supported. Empty optional fields stay empty; attributes are never guessed.

## Privacy, storage, and reliability

- No telemetry, remote analytics, external fonts, remote avatars, or automatic data transmission.
- Local photo uploads are resized and stored with the graph. No photo hosting service is used.
- IndexedDB is scoped to the browser profile and deployed origin. Other devices, private browsing profiles, or different origins have separate data.
- Browser storage can be removed by clearing site data, browser eviction, uninstall/reset behavior, or device loss. Export JSON backups for important data. Autosave does not replace a backup.
- Shared snapshots open read-only until explicitly copied to local webs. Import/export remains manual; there is no synchronization service.
- Graph rendering requires WebGL. Large graphs and photo-heavy maps use more device memory; the low quality preset and directory view help on constrained devices.

## Architecture

```text
src/
  components/       Graph canvas, dialogs, settings, sharing, and inspector UI
  lib/
    defaults.ts     Relationship and appearance defaults
    graph.ts        Search, filters, traversal, and factual statistics
    importExport.ts Validated portable formats and compressed sharing
    persistence.ts  IndexedDB storage and migration handling
    sample.ts       Fictional onboarding dataset and entity factories
    __tests__/      Graph algorithm tests
  store.ts          Centralized Zustand state and undo/redo
  types.ts          Typed normalized graph schemas
  App.tsx           Responsive application workspace
public/             Offline application icons
.github/workflows/  Quality checks and static GitHub Pages deployment
```

User text is rendered as text, never injected as HTML. Graph IDs identify entities independently of display names. Relationships reference person IDs, and graph rendering uses a separate set of simulation objects to avoid allowing Three.js/force-graph to mutate persisted application data.

## Development notes

`npm run build` runs TypeScript before bundling. `npm test` runs the Vitest suite, including graph traversal, filtering, duplicate detection, import validation, sharing privacy, and persistence/state behaviors where implemented. CI uses `npm ci` for reproducible installs. The free and open-source dependencies are listed in `package.json` and pinned in `package-lock.json`.

There is no production server process and no secret configuration. Do not add personal exports, photos, or credentials to the source repository.
