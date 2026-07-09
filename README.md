# Jits Library

A self-hosted library for organizing Brazilian Jiu-Jitsu instructional videos — categorize each instructional by **instructor**, **technique type** (guard, passing, control, submission, escape, takedown, transition, concept), and **position**. Inspired by self-hosted media apps like Jellyfin and Stash.

Built with Express + React + Vite + Tailwind + Drizzle ORM (SQLite). Ships as a single Docker container.

## Features

- **Library scan** — point it at a folder of videos (recursively) and it indexes every file. Only paths + metadata are stored; your files stay where they are.
- **Categorization** — every instructional gets an instructor, a technique category (color-coded), a position, tags, a rating, and notes.
- **Controlled vocabularies** — technique categories and positions are managed in-app (Settings), pre-seeded with BJJ defaults.
- **Browse & filter** — Jellyfin/Stash-style grid with a filter rail (technique, position, instructor, tags, watched) plus full-text search and sorting.
- **Built-in player** — HTML5 video with HTTP range streaming, seek-to-resume, and automatic watch-progress tracking.
- **Dark + light mode**, fully responsive, runs on your own hardware.

## Quick start (Docker)

1. Clone and edit `docker-compose.yml`, then point the media volume at your instructionals folder:

   ```yaml
   volumes:
     - /path/to/your/instructionals:/media:ro
     - jits-data:/data
   ```

2. Build and run:

   ```bash
   docker compose up -d --build
   ```

3. Open `http://localhost:5000` and click **Scan library** in the sidebar.

Your database lives in the `jits-data` volume, so metadata survives container updates.

## Troubleshooting: "Scan finds nothing"

If **Scan library** runs but reports `0 scanned` / nothing appears, it's almost always one of these. Check the container logs first — the app now prints a startup line like:

```
[storage] MEDIA_DIR=/media | uid=1001 gid=1001 | readable   # good
[storage] MEDIA_DIR=/media | uid=1001 gid=1001 | MISSING    # wrong volume mapping
[storage] MEDIA_DIR=/media | uid=1001 gid=1001 | NOT READABLE (permission denied)  # permissions
```

The scan also surfaces the same problem as a red message in Settings and a destructive toast.

### 1. Wrong volume mapping

The container expects your instructionals at `/media`. In your NAS Docker UI, map:

- **Host path**: `/volume1/Media/Instructionals`
- **Container path**: `/media`

Verify the container can actually see your files — many NAS Docker UIs have a terminal/console into the container. Run:

```sh
ls -la /media
```

If `/media` is empty, the host path isn't reaching the container.

### 2. Permissions (most common on Synology / UGREEN / QNAP)

The container runs as a **non-root user `uid 1001 / gid 1001`** for safety. NAS shared folders are usually owned by `root` or another user, so `1001` can't read them — and a read-only (`:ro`) mount doesn't change that (read-only blocks writes, not reads). The scan then silently found nothing.

Fixes, easiest first:

- **Run the container as a user that can read the folder.** In `docker-compose.yml` add a `user:` line matching your NAS user, or temporarily `0:0` (root) to confirm the diagnosis, then tighten:

  ```yaml
  services:
    jits-library:
      user: "0:0"          # root — quick test
  ```

  > **Caveat:** if you test as root (`0:0`) and then switch back to the non-root
  > `uid 1001`, files root created in `/data` (DB, thumbnails) may no longer be
  > writable by `1001`. After confirming, either `chown -R 1001:1001` the `jits-data`
  > volume, or wipe it (`docker volume rm`) to start fresh.

  (When running as root, also drop the read-only `:ro` restriction only if you want writes — for media you generally keep `:ro`.)

- **Grant the container user read access** on the host folder so it can stay non-root:

  ```sh
  # on the NAS host
  chown -R 1001:1001 /volume1/Media/Instructionals   # make 1001 the owner
  # or, less invasive — grant group read+execute
  chgrp -R 1001 /volume1/Media/Instructionals && chmod -R g+rx /volume1/Media/Instructionals
  ```

- **Run as your NAS user's uid/gid.** Find them (`id` on the NAS as the media owner), then set `user: "<uid>:<gid>"`.

### 3. Folder layout

Scan groups files into one instructional per `<Instructor>/<Title>` folder (see below). Files must be at least 3 segments deep (`Instructor/Title/file.mkv`) to group. A flat folder of loose `.mkv` files still indexes — just as one instructional per file.

### Adding instructionals

- **From your folder**: drop video files (`.mp4`, `.mkv`, `.webm`, `.mov`, …) into your mounted `/media` directory and hit **Scan library**. New files are added; moved/deleted files are marked missing.
- **Auto instructor + title from folders**: organize your library as
  `<Instructor>/<Title>/<file>.mkv` and the scanner assigns the instructor and
  title automatically during a scan, creating the instructor if it doesn't exist yet.
  Shallower layouts degrade gracefully:

  | Folder layout | Instructor | Title |
  | --- | --- | --- |
  | `Gordon Ryan/Back Attacks/vol1.mkv` | Gordon Ryan | Back Attacks |
  | `Gordon Ryan/vol1.mkv` | Gordon Ryan | vol1 |
  | `vol1.mkv` | *(none)* | vol1 |

  Re-scanning also backfills a missing instructor on existing entries (it never
  overrides an instructor you've set manually).
- **Manually**: open any instructional's detail page → **Edit** → fill in the metadata and a file path (or a direct video URL).

## Local development

```bash
npm install
npm run dev          # http://localhost:5000
```

The SQLite DB is created at `./data/data.db` and the media folder defaults to `./media`. Override with `MEDIA_DIR` and `DB_PATH` env vars.

## Project structure

```
shared/schema.ts        # Drizzle schema (instructionals, instructors, positions, categories, tags)
server/
  storage.ts            # CRUD, library scan, seeding
  routes.ts             # REST API + video streaming with range support
client/src/
  pages/                # Library, InstructionalDetail, Instructors, Settings
  components/            # AppShell, InstructionalCard, edit dialog, badges
```

## API overview

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/instructionals` | List + filter (q, instructorId, techniqueCategoryId, positionId, tagId, watched, sort) |
| `GET` | `/api/instructionals/:id` | Single instructional with relations |
| `POST`/`PATCH`/`DELETE` | `/api/instructionals/:id` | Create / edit (incl. tags) / delete |
| `PATCH` | `/api/instructionals/:id/progress` | Update watch progress / watched flag |
| `POST` | `/api/instructionals/scan` | Scan the media folder |
| `GET` | `/api/videos/:videoId/stream` | Stream one video part (HTTP 206 range support; 302 redirect for remote URLs) |
| `GET/POST/PATCH/DELETE` | `/api/instructors` · `/api/positions` · `/api/categories` · `/api/tags` | Vocabularies |
| `GET` | `/api/stats` | Library stats |

## Notes

- **No transcoding yet** — files are streamed directly. Most modern browsers play `.mp4`/`.webm` natively; exotic codecs may need re-encoding. `ffmpeg` is included in the image for future thumbnail/duration extraction.
- **No auth** — designed for a trusted home network. Put it behind your reverse proxy + auth (e.g. Authelia, Nginx Proxy Manager) if exposed.
