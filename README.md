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

### Adding instructionals

- **From your folder**: drop video files (`.mp4`, `.mkv`, `.webm`, `.mov`, …) into your mounted `/media` directory and hit **Scan library**. New files are added; moved/deleted files are marked missing.
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
| `GET` | `/api/stream/:id` | Stream the video (HTTP 206 range support; 302 redirect for remote URLs) |
| `GET/POST/PATCH/DELETE` | `/api/instructors` · `/api/positions` · `/api/categories` · `/api/tags` | Vocabularies |
| `GET` | `/api/stats` | Library stats |

## Notes

- **No transcoding yet** — files are streamed directly. Most modern browsers play `.mp4`/`.webm` natively; exotic codecs may need re-encoding. `ffmpeg` is included in the image for future thumbnail/duration extraction.
- **No auth** — designed for a trusted home network. Put it behind your reverse proxy + auth (e.g. Authelia, Nginx Proxy Manager) if exposed.
