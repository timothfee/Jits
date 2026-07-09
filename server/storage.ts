import {
  instructors,
  positions,
  techniqueCategories,
  tags,
  instructionals,
  instructionalTags,
  instructionalVideos,
  type Instructional,
  type InstructionalWithRelations,
  type Instructor,
  type Position,
  type TechniqueCategory,
  type Tag,
  type InstructionalVideo,
  type InsertInstructional,
  type InsertInstructionalVideo,
  type InsertInstructor,
  type InsertPosition,
  type InsertTechniqueCategory,
  type InsertTag,
  VIDEO_EXTENSIONS,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, and, like, or, inArray, desc, asc, sql } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DB_PATH = process.env.DB_PATH || "./data/data.db";
// Ensure the directory exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, {
  schema: { instructors, positions, techniqueCategories, tags, instructionals, instructionalTags, instructionalVideos },
});

// Media directory (mounted volume in Docker)
export const MEDIA_DIR = process.env.MEDIA_DIR || path.resolve(process.cwd(), "media");

// Thumbnails live in the writable data volume (NOT read-only /media) so they
// persist across container restarts. Controlled by THUMBNAIL_DIR, defaulting to
// a `thumbnails` folder next to the SQLite database.
export const THUMBNAIL_DIR =
  process.env.THUMBNAIL_DIR || path.join(path.dirname(path.resolve(DB_PATH)), "thumbnails");
fs.mkdirSync(THUMBNAIL_DIR, { recursive: true });

// Whether ffmpeg/ffprobe are available. If not, thumbnail generation is a no-op
// (the gradient fallback is used) instead of an error.
let ffmpegAvailable: boolean | null = null;
async function checkFfmpeg(): Promise<boolean> {
  if (ffmpegAvailable !== null) return ffmpegAvailable;
  try {
    await execFileAsync("ffmpeg", ["-version"]);
    await execFileAsync("ffprobe", ["-version"]);
    ffmpegAvailable = true;
  } catch {
    ffmpegAvailable = false;
    console.warn("ffmpeg/ffprobe not found — thumbnail generation disabled.");
  }
  return ffmpegAvailable;
}

// Resolve the on-disk absolute path for an instructional's source video.
// Returns null for remote URLs (handled separately) or invalid/traversing paths.
function resolveLocalSource(filePath: string): string | null {
  if (/^https?:\/\//i.test(filePath)) return null;
  const resolved = path.resolve(MEDIA_DIR, filePath);
  const rel = path.relative(MEDIA_DIR, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return resolved;
}

// Probe a video's duration (seconds) with ffprobe. Returns null on failure.
async function probeDuration(source: string): Promise<number | null> {
  const isRemote = /^https?:\/\//i.test(source);
  try {
    const inputArgs = isRemote
      ? ["-user_agent", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36", "-timeout", "15000000", "-i", source]
      : ["-i", source];
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error",
      ...inputArgs,
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
    ], { timeout: 15000 });
    const d = parseFloat(stdout.trim());
    return Number.isFinite(d) && d > 0 ? d : null;
  } catch {
    return null;
  }
}

// Generate a single thumbnail for an instructional. Resolves the source
// (local file or remote URL), seeks ~10% in (clamped), and writes a JPEG into
// THUMBNAIL_DIR. Stores the relative filename in the `thumbnail` column and
// updates `duration` if missing. Returns the stored filename or null on failure.
async function generateThumbnail(id: number): Promise<string | null> {
  if (!(await checkFfmpeg())) return null;
  const item = db.select().from(instructionals).where(eq(instructionals.id, id)).get();
  if (!item) return null;

  // Use the first AVAILABLE video part as the source frame (skip parts whose
  // file is missing on disk).
  const part = db
    .select()
    .from(instructionalVideos)
    .where(and(eq(instructionalVideos.instructionalId, id), eq(instructionalVideos.available, true)))
    .orderBy(asc(instructionalVideos.sortOrder), asc(instructionalVideos.id))
    .get();
  if (!part) return null;

  // Remote URL or local path — both are valid ffmpeg inputs.
  const local = resolveLocalSource(part.filePath);
  const isRemote = /^https?:\/\//i.test(part.filePath);
  // Only fetch arbitrary remote URLs for thumbnailing when explicitly allowed
  // (demo preview) — avoids server-side fetching of user-entered URLs in
  // normal Docker installs.
  const allowRemote =
    process.env.DEMO_SEED === "true" || process.env.ALLOW_REMOTE_THUMBNAILS === "true";
  if (isRemote && !allowRemote) return null;
  const source = local ?? (isRemote ? part.filePath : null);
  if (!source) return null;

  // Probe this part's duration if missing, then keep the instructional's
  // denormalized duration in sync.
  let partDuration = part.duration ?? null;
  if (!partDuration) {
    partDuration = await probeDuration(source);
    if (partDuration) {
      db.update(instructionalVideos)
        .set({ duration: Math.round(partDuration), updatedAt: now() })
        .where(eq(instructionalVideos.id, part.id))
        .run();
    }
  }
  syncInstructionalRollup(id);

  // Seek ~10% in, clamped to [1, 30]s so short clips and long films both land sensibly.
  const seek = partDuration ? Math.max(1, Math.min(partDuration * 0.1, 30)) : 5;
  const outName = `instructional-${id}.jpg`;
  const outPath = path.join(THUMBNAIL_DIR, outName);

  try {
    // `-ss` before `-i` is a fast seek. For remote URLs send a browser-like
    // User-Agent (some hosts 403 ffmpeg's default) and cap socket read time so a
    // dead host can't hang generation.
    const inputArgs = /^https?:\/\//i.test(source)
      ? ["-user_agent", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36", "-timeout", "15000000", "-i", source]
      : ["-i", source];
    await execFileAsync("ffmpeg", [
      "-y",
      "-ss", String(Math.floor(seek)),
      ...inputArgs,
      "-frames:v", "1",
      "-vf", "scale=640:-2",
      "-q:v", "4",
      "-update", "1",
      outPath,
    ], { timeout: 30000 });
    if (!fs.existsSync(outPath) || fs.statSync(outPath).size === 0) return null;
  } catch (err) {
    // Clean up a partial/empty file if ffmpeg left one.
    try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch {}
    return null;
  }

  db.update(instructionals)
    .set({ thumbnail: outName, updatedAt: now() })
    .where(eq(instructionals.id, id))
    .run();
  syncInstructionalRollup(id);
  return outName;
}

// ---------- Schema bootstrap (fresh installs / new Docker volumes) ----------
// Creates tables if they don't exist so the app works without drizzle-kit in the
// runtime image. Keep these in sync with shared/schema.ts.
function initDb() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS instructors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      bio TEXT,
      academy TEXT,
      belt TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      "group" TEXT NOT NULL DEFAULT 'Other',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS technique_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL DEFAULT '#64748b',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS instructionals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      instructor_id INTEGER,
      position_id INTEGER,
      technique_category_id INTEGER,
      folder_path TEXT,
      duration INTEGER,
      thumbnail TEXT,
      notes TEXT,
      rating INTEGER DEFAULT 0,
      watched INTEGER NOT NULL DEFAULT 0,
      progress INTEGER NOT NULL DEFAULT 0,
      progress_video_id INTEGER,
      available INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (instructor_id) REFERENCES instructors(id) ON DELETE CASCADE,
      FOREIGN KEY (position_id) REFERENCES positions(id) ON DELETE SET NULL,
      FOREIGN KEY (technique_category_id) REFERENCES technique_categories(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS instructional_tags (
      instructional_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (instructional_id, tag_id),
      FOREIGN KEY (instructional_id) REFERENCES instructionals(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS instructional_videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      instructional_id INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_size INTEGER,
      duration INTEGER,
      sort_order INTEGER NOT NULL DEFAULT 0,
      available INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (instructional_id) REFERENCES instructionals(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_instructional_videos_instr ON instructional_videos(instructional_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_instructional_videos_path ON instructional_videos(file_path);
  `);
}

// ---------- Migration for existing volumes (pre-folder-schema) ----------
// Older installs stored one row per file on `instructionals` (file_path/file_name/
// file_size columns). This migrates them to the folder+part model: each old row
// becomes one instructional with a single video part. SQLite keeps the now-unused
// columns around harmlessly. Safe to run repeatedly (idempotent).
function hasColumn(table: string, col: string): boolean {
  const rows = sqlite.prepare(`PRAGMA table_info(${table})`).all() as any[];
  return rows.some((r) => r.name === col);
}
function migrate() {
  // Ensure new instructionals columns exist on older databases.
  if (!hasColumn("instructionals", "folder_path")) {
    sqlite.exec(`ALTER TABLE instructionals ADD COLUMN folder_path TEXT;`);
  }
  if (!hasColumn("instructionals", "progress_video_id")) {
    sqlite.exec(`ALTER TABLE instructionals ADD COLUMN progress_video_id INTEGER;`);
  }
  // instructional_videos is created by initDb(); confirm it exists here too.
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS instructional_videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      instructional_id INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_size INTEGER,
      duration INTEGER,
      sort_order INTEGER NOT NULL DEFAULT 0,
      available INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (instructional_id) REFERENCES instructionals(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_instructional_videos_instr ON instructional_videos(instructional_id);
  `);
  // Only attempt the file_path → part migration if the legacy column is present.
  if (hasColumn("instructionals", "file_path")) {
    const legacy = sqlite.prepare(
      `SELECT id, file_path, file_name, file_size, duration FROM instructionals WHERE file_path IS NOT NULL`
    ).all() as { id: number; file_path: string; file_name: string; file_size: number | null; duration: number | null }[];
    const ts = now();
    const ins = sqlite.prepare(`INSERT OR IGNORE INTO instructional_videos
      (instructional_id, file_path, file_name, file_size, duration, sort_order, available, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, 1, ?, ?)`);
    const setFolder = sqlite.prepare(`UPDATE instructionals SET folder_path = ? WHERE id = ? AND folder_path IS NULL`);
    for (const row of legacy) {
      ins.run(row.id, row.file_path, row.file_name, row.file_size, row.duration, ts, ts);
      // Derive a folder_path from the legacy file path so re-scans match this row.
      const norm = row.file_path.replace(/\\/g, "/");
      const segs = norm.split("/").filter(Boolean);
      let folder: string | null = null;
      if (segs.length >= 3) folder = `${segs[0]}/${segs[1]}`;
      else if (segs.length === 2) folder = segs[0];
      else folder = norm;
      if (folder) setFolder.run(folder, row.id);
    }
  }
}
initDb();
migrate();
normalizeLibrary();

// Startup diagnostics for the media directory: log the resolved path, whether
// it exists and is readable, and the uid/gid the container is running as. This
// makes bind-mount / permission problems (very common on NAS setups) visible
// in the container logs immediately, instead of as a silent empty scan.
(() => {
  const dir = MEDIA_DIR;
  const uid = typeof process.getuid === "function" ? process.getuid() : "?";
  const gid = typeof process.getgid === "function" ? process.getgid() : "?";
  const exists = fs.existsSync(dir);
  let readable = false;
  if (exists) {
    try {
      fs.accessSync(dir, fs.constants.R_OK | fs.constants.X_OK);
      readable = true;
    } catch {
      readable = false;
    }
  }
  const status = !exists ? "MISSING" : readable ? "readable" : "NOT READABLE (permission denied)";
  console.log(`[storage] MEDIA_DIR=${dir} | uid=${uid} gid=${gid} | ${status}`);
  if (!exists) {
    console.log(`[storage] Bind-mount your instructionals folder to /media, e.g. /volume1/Media/Instructionals:/media`);
  } else if (!readable) {
    console.log(`[storage] Grant read+execute on the host folder to uid ${uid}/gid ${gid}, or run the container as a user that can read it.`);
  }
})();

// ---------- Helpers ----------
function now() {
  return Date.now();
}

// One-time startup normalization (also re-run at the top of scanLibrary):
// merge any duplicate instructionals sharing a folderPath into the canonical
// (lowest-id) one — reparent their video parts, then delete the empties — and
// recompute denormalized rollup fields for anything with parts. This keeps the
// homepage correct on upgrade even before the user clicks Scan.
function normalizeLibrary() {
  const existing = db.select().from(instructionals).all();
  const seen = new Map<string, Instructional>();
  for (const e of existing) {
    if (!e.folderPath) continue;
    const prior = seen.get(e.folderPath);
    if (!prior || e.id < prior.id) seen.set(e.folderPath, e);
  }
  for (const e of existing) {
    if (!e.folderPath) continue;
    const canon = seen.get(e.folderPath);
    if (canon && e.id !== canon.id) {
      db.update(instructionalVideos)
        .set({ instructionalId: canon.id, updatedAt: now() })
        .where(eq(instructionalVideos.instructionalId, e.id))
        .run();
      db.delete(instructionals).where(eq(instructionals.id, e.id)).run();
    }
  }
  // Re-rollup anything that has parts so duration/availability are correct after
  // a legacy migration or part reparenting.
  const withParts = db
    .select({ id: instructionalVideos.instructionalId })
    .from(instructionalVideos)
    .groupBy(instructionalVideos.instructionalId)
    .all();
  for (const r of withParts) syncInstructionalRollup(r.id);
}

function attachTags(rows: Instructional[]): (Instructional & { tags: Tag[] })[] {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const tagRows = db
    .select({
      instructionalId: instructionalTags.instructionalId,
      id: tags.id,
      name: tags.name,
    })
    .from(instructionalTags)
    .innerJoin(tags, eq(tags.id, instructionalTags.tagId))
    .where(inArray(instructionalTags.instructionalId, ids))
    .all();
  const byInst = new Map<number, Tag[]>();
  for (const t of tagRows) {
    const arr = byInst.get(t.instructionalId) || [];
    arr.push({ id: t.id, name: t.name, createdAt: 0 });
    byInst.set(t.instructionalId, arr);
  }
  return rows.map((r) => ({
    ...r,
    tags: byInst.get(r.id) || [],
  }));
}

function attachVideos(rows: Instructional[]): Map<number, InstructionalVideo[]> {
  const map = new Map<number, InstructionalVideo[]>();
  if (rows.length === 0) return map;
  const ids = rows.map((r) => r.id);
  const vids = db
    .select()
    .from(instructionalVideos)
    .where(inArray(instructionalVideos.instructionalId, ids))
    .orderBy(asc(instructionalVideos.sortOrder), asc(instructionalVideos.id))
    .all();
  for (const v of vids) {
    const arr = map.get(v.instructionalId) || [];
    arr.push(v);
    map.set(v.instructionalId, arr);
  }
  return map;
}

function enrich(
  rows: Instructional[],
  instructorMap: Map<number, Instructor>,
  positionMap: Map<number, Position>,
  categoryMap: Map<number, TechniqueCategory>
): InstructionalWithRelations[] {
  const videoMap = attachVideos(rows);
  return attachTags(rows).map((r) => ({
    ...r,
    instructor: r.instructorId ? instructorMap.get(r.instructorId) ?? null : null,
    position: r.positionId ? positionMap.get(r.positionId) ?? null : null,
    techniqueCategory: r.techniqueCategoryId
      ? categoryMap.get(r.techniqueCategoryId) ?? null
      : null,
    videos: videoMap.get(r.id) || [],
  }));
}

// Recompute denormalized rollup fields on an instructional from its parts:
//   duration = sum of part durations
//   available = any part available
// (thumbnail is managed by generateThumbnail; this leaves it untouched.)
function syncInstructionalRollup(id: number) {
  const parts = db
    .select()
    .from(instructionalVideos)
    .where(eq(instructionalVideos.instructionalId, id))
    .all();
  const duration = parts.reduce((sum, p) => sum + (p.duration ?? 0), 0);
  const available = parts.some((p) => p.available);
  db.update(instructionals)
    .set({ duration: duration || null, available, updatedAt: now() })
    .where(eq(instructionals.id, id))
    .run();
}

function loadLookups() {
  const instructorMap = new Map<number, Instructor>();
  for (const i of db.select().from(instructors).all()) instructorMap.set(i.id, i);
  const positionMap = new Map<number, Position>();
  for (const p of db.select().from(positions).all()) positionMap.set(p.id, p);
  const categoryMap = new Map<number, TechniqueCategory>();
  for (const c of db.select().from(techniqueCategories).all()) categoryMap.set(c.id, c);
  return { instructorMap, positionMap, categoryMap };
}

// Derive the folder grouping key, instructor, and title from a video's path
// relative to MEDIA_DIR.
//   <Instructor>/<Title>/<file>.mkv (and deeper) -> folderPath = Instructor/Title,
//     instructor = Instructor, title = Title
//   Shallower layouts (<=2 segments) don't group: folderPath = the file path
//   itself (unique per file), title = filename, instructor = first segment if any.
function deriveFolderFromPath(rel: string): {
  folderPath: string;
  instructor: string | null;
  title: string;
} {
  const norm = rel.replace(/\\/g, "/"); // tolerate Windows-style separators
  const parts = norm.split("/").filter(Boolean);
  const file = parts[parts.length - 1] || rel;
  const titleFromFile = path.basename(file, path.extname(file));
  if (parts.length >= 3) {
    return { folderPath: `${parts[0]}/${parts[1]}`, instructor: parts[0], title: parts[1] };
  }
  // 1-2 segments: per-file instructional (no folder grouping).
  return {
    folderPath: norm,
    instructor: parts.length === 2 ? parts[0] : null,
    title: titleFromFile,
  };
}

// Find an instructor by exact name, creating one if it doesn't exist yet.
function getOrCreateInstructor(name: string): Instructor {
  const existing = db.select().from(instructors).where(eq(instructors.name, name)).get();
  if (existing) return existing;
  return db.insert(instructors).values({ name, createdAt: now() }).returning().get();
}

// A video part as supplied by the API/frontend (no instructionalId — the
// storage layer injects it from the parent instructional). Used by create/update.
export type VideoPartInput = Omit<InsertInstructionalVideo, "instructionalId">;

// ---------- Filters ----------
export interface InstructionalFilter {
  q?: string;
  instructorId?: number;
  techniqueCategoryId?: number;
  positionId?: number;
  tagId?: number;
  watched?: boolean;
  sort?: "recent" | "title" | "rating" | "progress";
}

// ---------- Storage ----------
export const storage = {
  // ===== Instructionals =====
  listInstructionals(filter: InstructionalFilter = {}): InstructionalWithRelations[] {
    const conditions = [];
    if (filter.q) {
      const term = `%${filter.q}%`;
      conditions.push(
          or(
            like(instructionals.title, term),
            like(instructionals.description, term),
            like(instructionals.folderPath, term)
          )!
        );
    }
    if (filter.instructorId) conditions.push(eq(instructionals.instructorId, filter.instructorId));
    if (filter.techniqueCategoryId)
      conditions.push(eq(instructionals.techniqueCategoryId, filter.techniqueCategoryId));
    if (filter.positionId) conditions.push(eq(instructionals.positionId, filter.positionId));

    // Tag filter: resolve matching instructional IDs first, then constrain the flat query.
    if (filter.tagId) {
      const matching = db
        .select({ id: instructionalTags.instructionalId })
        .from(instructionalTags)
        .where(eq(instructionalTags.tagId, filter.tagId))
        .all();
      const ids = matching.map((m) => m.id);
      if (ids.length === 0) return [];
      conditions.push(inArray(instructionals.id, ids));
    }

    let query: any = db.select().from(instructionals);
    if (conditions.length) query = query.where(and(...conditions));

    switch (filter.sort) {
      case "title":
        query = query.orderBy(asc(instructionals.title));
        break;
      case "rating":
        query = query.orderBy(desc(instructionals.rating));
        break;
      case "progress":
        query = query.orderBy(desc(instructionals.progress));
        break;
      default:
        query = query.orderBy(desc(instructionals.createdAt));
    }

    const rows = query.all() as Instructional[];
    const { instructorMap, positionMap, categoryMap } = loadLookups();
    let result = enrich(rows, instructorMap, positionMap, categoryMap);
    if (typeof filter.watched === "boolean") {
      result = result.filter((r) => r.watched === filter.watched);
    }
    return result;
  },

  getInstructional(id: number): InstructionalWithRelations | undefined {
    const row = db.select().from(instructionals).where(eq(instructionals.id, id)).get();
    if (!row) return undefined;
    const { instructorMap, positionMap, categoryMap } = loadLookups();
    return enrich([row], instructorMap, positionMap, categoryMap)[0];
  },

  createInstructional(
    data: InsertInstructional,
    videos?: VideoPartInput[]
  ): InstructionalWithRelations {
    const ts = now();
    const { videos: _omit, ...rest } = data as any;
    const row = db
      .insert(instructionals)
      .values({ ...rest, createdAt: ts, updatedAt: ts })
      .returning()
      .get();
    // Compatibility: a legacy client may still send `filePath` instead of a
    // videos[] array — fold it into a single video part.
    const legacyPath = (data as any).filePath;
    const parts: VideoPartInput[] = videos ?? (legacyPath ? [{ filePath: String(legacyPath), fileName: String((data as any).fileName ?? legacyPath), fileSize: (data as any).fileSize ?? null, duration: data.duration ?? null, sortOrder: 0, available: true }] : []);
    if (parts.length) this.replaceVideos(row.id, parts);
    syncInstructionalRollup(row.id);
    return this.getInstructional(row.id)!;
  },

  updateInstructional(
    id: number,
    data: Partial<InsertInstructional> & { videos?: VideoPartInput[] }
  ): InstructionalWithRelations | undefined {
    const { videos, ...rest } = data as any;
    db.update(instructionals)
      .set({ ...rest, updatedAt: now() })
      .where(eq(instructionals.id, id))
      .run();
    // Only touch parts when `videos` is explicitly present (array). Omitted =
    // preserve; empty array = clear all parts.
    if (Array.isArray(videos)) {
      this.replaceVideos(id, videos);
      syncInstructionalRollup(id);
    }
    return this.getInstructional(id);
  },

  // Replace all video parts for an instructional. Used by create/update when a
  // videos[] array is supplied. Preserves sortOrder from the supplied array
  // (or defaults to the array index).
  replaceVideos(id: number, videos: VideoPartInput[]) {
    db.delete(instructionalVideos).where(eq(instructionalVideos.instructionalId, id)).run();
    if (!videos.length) return;
    const ts = now();
    db.insert(instructionalVideos)
      .values(
        videos.map((v, i) => ({
          instructionalId: id,
          filePath: v.filePath,
          fileName: v.fileName,
          fileSize: v.fileSize ?? null,
          duration: v.duration ?? null,
          sortOrder: v.sortOrder ?? i,
          available: v.available ?? true,
          createdAt: ts,
          updatedAt: ts,
        }))
      )
      .run();
  },

  setInstructionalTags(id: number, tagIds: number[]) {
    db.delete(instructionalTags).where(eq(instructionalTags.instructionalId, id)).run();
    if (tagIds.length) {
      db.insert(instructionalTags)
        .values(tagIds.map((t) => ({ instructionalId: id, tagId: t })))
        .run();
    }
  },

  updateProgress(
    id: number,
    progress: number,
    watched: boolean,
    progressVideoId?: number | null
  ) {
    db.update(instructionals)
      .set({ progress, watched, progressVideoId: progressVideoId ?? undefined, updatedAt: now() })
      .where(eq(instructionals.id, id))
      .run();
    return this.getInstructional(id);
  },

  // Fetch a single video part by id (used by the stream route). Returns the part
  // together with its parent instructional id so the route can validate access.
  getVideo(videoId: number): InstructionalVideo | undefined {
    return db.select().from(instructionalVideos).where(eq(instructionalVideos.id, videoId)).get();
  },

  deleteInstructional(id: number) {
    db.delete(instructionals).where(eq(instructionals.id, id)).run();
  },

  // ===== Instructors =====
  listInstructors(): (Instructor & { count: number })[] {
    const rows = db
      .select({
        id: instructors.id,
        name: instructors.name,
        bio: instructors.bio,
        academy: instructors.academy,
        belt: instructors.belt,
        createdAt: instructors.createdAt,
        count: sql<number>`count(${instructionals.id})`.as("count"),
      })
      .from(instructors)
      .leftJoin(instructionals, eq(instructionals.instructorId, instructors.id))
      .groupBy(instructors.id)
      .orderBy(asc(instructors.name))
      .all();
    return rows as any;
  },

  getInstructor(id: number): Instructor | undefined {
    return db.select().from(instructors).where(eq(instructors.id, id)).get();
  },

  createInstructor(data: InsertInstructor): Instructor {
    return db.insert(instructors).values({ ...data, createdAt: now() }).returning().get();
  },

  updateInstructor(id: number, data: Partial<InsertInstructor>): Instructor | undefined {
    return db.update(instructors).set(data).where(eq(instructors.id, id)).returning().get();
  },

  deleteInstructor(id: number) {
    db.delete(instructors).where(eq(instructors.id, id)).run();
  },

  // ===== Positions =====
  listPositions(): Position[] {
    return db.select().from(positions).orderBy(asc(positions.sortOrder), asc(positions.name)).all();
  },

  createPosition(data: InsertPosition): Position {
    return db.insert(positions).values({ ...data, createdAt: now() }).returning().get();
  },

  deletePosition(id: number) {
    db.delete(positions).where(eq(positions.id, id)).run();
  },

  // ===== Technique Categories =====
  listCategories(): TechniqueCategory[] {
    return db
      .select()
      .from(techniqueCategories)
      .orderBy(asc(techniqueCategories.sortOrder), asc(techniqueCategories.name))
      .all();
  },

  createCategory(data: InsertTechniqueCategory): TechniqueCategory {
    return db
      .insert(techniqueCategories)
      .values({ ...data, createdAt: now() })
      .returning()
      .get();
  },

  updateCategory(id: number, data: Partial<InsertTechniqueCategory>): TechniqueCategory | undefined {
    return db
      .update(techniqueCategories)
      .set(data)
      .where(eq(techniqueCategories.id, id))
      .returning()
      .get();
  },

  deleteCategory(id: number) {
    db.delete(techniqueCategories).where(eq(techniqueCategories.id, id)).run();
  },

  // ===== Tags =====
  listTags(): (Tag & { count: number })[] {
    const rows = db
      .select({
        id: tags.id,
        name: tags.name,
        createdAt: tags.createdAt,
        count: sql<number>`count(${instructionalTags.instructionalId})`.as("count"),
      })
      .from(tags)
      .leftJoin(instructionalTags, eq(instructionalTags.tagId, tags.id))
      .groupBy(tags.id)
      .orderBy(asc(tags.name))
      .all();
    return rows as any;
  },

  createTag(name: string): Tag {
    const existing = db.select().from(tags).where(eq(tags.name, name)).get();
    if (existing) return existing;
    return db.insert(tags).values({ name, createdAt: now() }).returning().get();
  },

  deleteTag(id: number) {
    db.delete(tags).where(eq(tags.id, id)).run();
  },

  // ===== Stats =====
  stats() {
    const total = db
      .select({ c: sql<number>`count(*)` })
      .from(instructionals)
      .get() as any;
    const watched = db
      .select({ c: sql<number>`count(*)` })
      .from(instructionals)
      .where(eq(instructionals.watched, true))
      .get() as any;
    const instructorCount = db
      .select({ c: sql<number>`count(*)` })
      .from(instructors)
      .get() as any;
    const totalDuration = db
      .select({ c: sql<number>`coalesce(sum(${instructionals.duration}), 0)` })
      .from(instructionals)
      .get() as any;
    return {
      total: Number(total?.c || 0),
      watched: Number(watched?.c || 0),
      instructors: Number(instructorCount?.c || 0),
      totalDuration: Number(totalDuration?.c || 0),
    };
  },

  // ===== Library scan =====
  // Walks MEDIA_DIR for video files, groups them into folder-based
  // instructionals (one row per title folder), and upserts the individual
  // files as video parts. Returns counters for the UI. Idempotent: re-running
  // on an unchanged library changes nothing.
  scanLibrary(): {
    scanned: number;
    added: number;
    updated: number;
    missing: number;
    inferred: number;
    error?: string;
    warnings?: string[];
    mediaDir?: string;
  } {
    const root = MEDIA_DIR;
    const found: { rel: string; name: string; size: number }[] = [];
    const warnings: string[] = [];

    // Preflight: a missing or unreadable MEDIA_DIR is the most common reason a
    // scan finds nothing (wrong volume mapping, or the non-root container user
    // can't read the bind-mounted folder). Surface it explicitly instead of
    // silently returning 0.
    if (!fs.existsSync(root)) {
      return {
        scanned: 0, added: 0, updated: 0, missing: 0, inferred: 0,
        mediaDir: root,
        error: `Media directory not found: ${root}. In Docker, bind-mount your instructionals folder to /media (e.g. /volume1/Media/Instructionals:/media). Check the container's volume mapping.`,
      };
    }
    try {
      fs.accessSync(root, fs.constants.R_OK | fs.constants.X_OK);
    } catch {
      const uid = typeof process.getuid === "function" ? process.getuid() : "?";
      const gid = typeof process.getgid === "function" ? process.getgid() : "?";
      return {
        scanned: 0, added: 0, updated: 0, missing: 0, inferred: 0,
        mediaDir: root,
        error: `Permission denied reading ${root}. The container is running as uid ${uid} / gid ${gid}, which cannot read this folder. Either grant read+execute permission on the host folder to that uid/gid, or run the container as a user that can read it (e.g. add user: "0:0" to docker-compose for a root test).`,
      };
    }

    if (fs.existsSync(root)) {
      const walk = (dir: string) => {
        let entries: fs.Dirent[] = [];
        try {
          entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch (err: any) {
          // Don't silently swallow — record unreadable subdirectories so the
          // user knows part of their library was skipped. Only the root is a
          // hard failure (handled by the preflight above).
          warnings.push(`Could not read ${path.relative(root, dir) || "."}: ${err?.code || err?.message || "error"}`);
          return;
        }
        for (const entry of entries) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(full);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (VIDEO_EXTENSIONS.includes(ext)) {
              const rel = path.relative(root, full).replace(/\\/g, "/");
              let size = 0;
              try {
                size = fs.statSync(full).size;
              } catch {}
              found.push({ rel, name: entry.name, size });
            }
          }
        }
      };
      walk(root);
    }

    // Group found files by their derived folder key (Instructor/Title for
    // 3+ segment paths, otherwise the file path itself — per-file instructionals).
    const groups = new Map<
      string,
      { files: { rel: string; name: string; size: number }[] }
    >();
    for (const f of found) {
      const { folderPath } = deriveFolderFromPath(f.rel);
      const g = groups.get(folderPath) || { files: [] };
      g.files.push(f);
      groups.set(folderPath, g);
    }

    // Existing instructionals — normalize first (merge duplicate folders,
    // reparent stray parts) so each folder maps to exactly one row.
    normalizeLibrary();
    const existing = db.select().from(instructionals).all();
    const folderToId = new Map<string, number>();
    for (const e of existing) {
      if (e.folderPath) folderToId.set(e.folderPath, e.id);
    }
    const byId = new Map(existing.map((e) => [e.id, e]));

    // Existing video parts keyed by filePath, for upsert detection.
    const existingParts = db.select().from(instructionalVideos).all();
    const partByPath = new Map(existingParts.map((p) => [p.filePath, p]));

    let added = 0;
    let updated = 0;
    let inferred = 0;
    const seenPartPaths = new Set<string>();
    const ts = now();

    for (const [folderPath, group] of groups) {
      // Sort files within a folder by name so part order is stable.
      group.files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

      let instructionalId = folderToId.get(folderPath);
      const isNew = !instructionalId;
      if (isNew) {
        const sample = group.files[0].rel;
        const { instructor, title } = deriveFolderFromPath(sample);
        const instructorId = instructor ? getOrCreateInstructor(instructor).id : undefined;
        if (instructor) inferred++;
        const row = db
          .insert(instructionals)
          .values({
            title,
            instructorId,
            folderPath,
            available: true,
            createdAt: ts,
            updatedAt: ts,
          })
          .returning()
          .get();
        instructionalId = row.id;
        added++;
      } else {
        // Backfill a missing instructor from the folder layout (non-destructive:
        // never overrides one the user already set).
        const ex = byId.get(instructionalId!);
        if (ex && !ex.instructorId) {
          const { instructor } = deriveFolderFromPath(group.files[0].rel);
          if (instructor) {
            const ins = getOrCreateInstructor(instructor);
            db.update(instructionals)
              .set({ instructorId: ins.id, updatedAt: ts })
              .where(eq(instructionals.id, ex.id))
              .run();
            inferred++;
          }
        }
      }

      // Upsert each file as a video part. sortOrder = position within folder.
      for (let i = 0; i < group.files.length; i++) {
        const f = group.files[i];
        seenPartPaths.add(f.rel);
        const exPart = partByPath.get(f.rel);
        if (exPart) {
          // Reparent if it landed on a (now-deleted) duplicate, refresh size /
          // availability / sort order. If the file size changed (file replaced),
          // clear the cached duration so ffprobe re-probes it next time.
          const sizeChanged = exPart.fileSize !== f.size;
          const changed =
            exPart.instructionalId !== instructionalId ||
            sizeChanged ||
            !exPart.available ||
            exPart.sortOrder !== i;
          if (changed) {
            db.update(instructionalVideos)
              .set({
                instructionalId: instructionalId!,
                fileSize: f.size,
                available: true,
                sortOrder: i,
                duration: sizeChanged ? null : exPart.duration,
                updatedAt: ts,
              })
              .where(eq(instructionalVideos.id, exPart.id))
              .run();
            updated++;
          }
        } else {
          db.insert(instructionalVideos)
            .values({
              instructionalId: instructionalId!,
              filePath: f.rel,
              fileName: f.name,
              fileSize: f.size,
              sortOrder: i,
              available: true,
              createdAt: ts,
              updatedAt: ts,
            })
            .run();
          if (!isNew) updated++;
        }
      }

      syncInstructionalRollup(instructionalId!);
    }

    // Mark missing parts unavailable (file deleted from disk), then roll up so
    // a folder with no remaining parts becomes unavailable too.
    let missing = 0;
    for (const p of existingParts) {
      if (/^https?:\/\//i.test(p.filePath)) continue; // remote parts are never "missing"
      if (!seenPartPaths.has(p.filePath) && p.available) {
        db.update(instructionalVideos)
          .set({ available: false, updatedAt: ts })
          .where(eq(instructionalVideos.id, p.id))
          .run();
        missing++;
        if (p.instructionalId) syncInstructionalRollup(p.instructionalId);
      }
    }

    return { scanned: found.length, added, updated, missing, inferred, warnings, mediaDir: root };
  },

  // ===== Thumbnails =====
  // Resolve a stored thumbnail value to an on-disk absolute path under
  // THUMBNAIL_DIR (with traversal protection), or null if there is none / it's
  // a remote URL (handled by the route via redirect).
  resolveThumbnail(thumbnail: string | null | undefined): string | null {
    if (!thumbnail) return null;
    if (/^https?:\/\//i.test(thumbnail)) return null; // remote — route redirects
    const resolved = path.resolve(THUMBNAIL_DIR, thumbnail);
    const rel = path.relative(THUMBNAIL_DIR, resolved);
    if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
    return fs.existsSync(resolved) ? resolved : null;
  },

  // (Re)generate a thumbnail for one instructional. Returns true on success.
  async generateThumbnail(id: number): Promise<boolean> {
    return (await generateThumbnail(id)) !== null;
  },

  // Generate thumbnails for all instructionals that don't have one yet.
  // Force-regenerates when `force` is true. Runs synchronously; for very large
  // libraries this should be triggered deliberately (Settings button), not
  // automatically on every scan.
  async generateMissingThumbnails(force = false): Promise<{ generated: number; failed: number; skipped: number }> {
    const rows = db.select().from(instructionals).all();
    let generated = 0;
    let failed = 0;
    let skipped = 0;
    for (const r of rows) {
      if (!force && r.thumbnail && this.resolveThumbnail(r.thumbnail)) {
        skipped++;
        continue;
      }
      const ok = await generateThumbnail(r.id);
      if (ok) generated++;
      else failed++;
    }
    return { generated, failed, skipped };
  },

  // ===== Seed defaults =====
  async seedDefaults() {
    // Always seed vocabularies (categories + positions) on first run.
    const catCount = db.select({ c: sql<number>`count(*)` }).from(techniqueCategories).get() as any;
    const vocabSeeded = Number(catCount?.c || 0) > 0;
    if (!vocabSeeded) {
      const cats: { name: string; slug: string; color: string; sortOrder: number }[] = [
        { name: "Guard", slug: "guard", color: "#3b82f6", sortOrder: 1 },
        { name: "Passing", slug: "passing", color: "#f59e0b", sortOrder: 2 },
        { name: "Control", slug: "control", color: "#a855f7", sortOrder: 3 },
        { name: "Submission", slug: "submission", color: "#ef4444", sortOrder: 4 },
        { name: "Escape", slug: "escape", color: "#22c55e", sortOrder: 5 },
        { name: "Takedown", slug: "takedown", color: "#a16207", sortOrder: 6 },
        { name: "Transition", slug: "transition", color: "#06b6d4", sortOrder: 7 },
        { name: "Concept / Drill", slug: "concept", color: "#64748b", sortOrder: 8 },
      ];
      const ts = now();
      for (const c of cats) {
        db.insert(techniqueCategories).values({ ...c, createdAt: ts }).run();
      }

      const posList: { name: string; group: string; sortOrder: number }[] = [
        { name: "Standing", group: "Neutral", sortOrder: 1 },
        { name: "Closed Guard", group: "Guard", sortOrder: 2 },
        { name: "Open Guard", group: "Guard", sortOrder: 3 },
        { name: "Half Guard", group: "Guard", sortOrder: 4 },
        { name: "Butterfly Guard", group: "Guard", sortOrder: 5 },
        { name: "Spider Guard", group: "Guard", sortOrder: 6 },
        { name: "De La Riva", group: "Guard", sortOrder: 7 },
        { name: "Side Control", group: "Control", sortOrder: 8 },
        { name: "Mount", group: "Control", sortOrder: 9 },
        { name: "Knee on Belly", group: "Control", sortOrder: 10 },
        { name: "North South", group: "Control", sortOrder: 11 },
        { name: "Back Control", group: "Control", sortOrder: 12 },
        { name: "Turtle", group: "Control", sortOrder: 13 },
        { name: "Knee Cut", group: "Transition", sortOrder: 14 },
      ];
      for (const p of posList) {
        db.insert(positions).values({ ...p, createdAt: ts }).run();
      }
    }

    // Demo instructionals (sample instructors + sample videos) only when
    // DEMO_SEED=true — used for the hosted preview. Real Docker installs
    // start with an empty library and scan their own media.
    if (process.env.DEMO_SEED !== "true") return;
    const instrCount = db.select({ c: sql<number>`count(*)` }).from(instructors).get() as any;
    if (Number(instrCount?.c || 0) > 0) return;

    const ts = now();
    // Sample instructors
    const instr: { name: string; academy?: string; belt: string; bio?: string }[] = [
      { name: "Gordon Ryan", academy: "Danaher Death Squad", belt: "black", bio: "Multiple-time ADCC champion, no-gi specialist." },
      { name: "John Danaher", academy: "Danaher Death Squad", belt: "black", bio: "Systematic, leg-lock pioneer." },
      { name: "Craig Jones", academy: "Jones", belt: "black", bio: "ADCC veteran, pressure-passing and leg entries." },
      { name: "Marcelo Garcia", academy: "MG Academy", belt: "black", bio: "Guillotine and x-guard legend." },
    ];
    const instrIds: number[] = [];
    for (const i of instr) {
      const r = db.insert(instructors).values({ ...i, createdAt: ts }).returning().get();
      instrIds.push(r.id);
    }

    // Sample tags
    const tagNames = ["gi", "no-gi", "leglock", "back attack", "no-gi world", "competition"];
    for (const t of tagNames) db.insert(tags).values({ name: t, createdAt: ts }).run();
    const allTags = db.select().from(tags).all();

    // Sample instructionals pointing at public sample videos so playback works out of the box
    const positionsAll = db.select().from(positions).all();
    const catsAll = db.select().from(techniqueCategories).all();
    const posByName = new Map(positionsAll.map((p) => [p.name, p]));
    const catBySlug = new Map(catsAll.map((c) => [c.slug, c]));

    const samples: {
      title: string;
      description: string;
      instructorIdx: number;
      position: string;
      catSlug: string;
      url: string;
      tags: string[];
    }[] = [
      {
        title: "Systematically Attacking the Back — Volume 1",
        description:
          "A systematic approach to taking the back and finishing with the rear naked choke. Breaking down grips, establishing control, and the choke mechanics.",
        instructorIdx: 0,
        position: "Back Control",
        catSlug: "submission",
        url: "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4",
        tags: ["no-gi", "back attack"],
      },
      {
        title: "Enter the System: Leg Locks",
        description:
          "The complete leg-lock system — entries, control, and finishing ashi-garami and heel hooks.",
        instructorIdx: 1,
        position: "Open Guard",
        catSlug: "submission",
        url: "https://test-videos.co.uk/vids/sintel/mp4/h264/720/Sintel_720_10s_1MB.mp4",
        tags: ["no-gi", "leglock"],
      },
      {
        title: "Pressure Passing Masterclass",
        description:
          "Toreando, knee cut, and over-under passing systems for shutting down open guard.",
        instructorIdx: 2,
        position: "Open Guard",
        catSlug: "passing",
        url: "https://test-videos.co.uk/vids/jellyfish/mp4/h264/720/Jellyfish_720_10s_1MB.mp4",
        tags: ["no-gi", "competition"],
      },
      {
        title: "X-Guard & Guillotine Attacks",
        description:
          "Marcelo's signature x-guard entries and the high-elbow guillotine finish.",
        instructorIdx: 3,
        position: "Open Guard",
        catSlug: "guard",
        url: "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4",
        tags: ["gi", "competition"],
      },
      {
        title: "Mount Escapes & Retention",
        description:
          "Surviving mount: elbow-knee escape, bridge-and-roll, and defensive framing.",
        instructorIdx: 0,
        position: "Mount",
        catSlug: "escape",
        url: "https://test-videos.co.uk/vids/sintel/mp4/h264/360/Sintel_360_10s_1MB.mp4",
        tags: ["gi"],
      },
    ];

    for (const s of samples) {
      // Synthetic, stable folder paths keep the demo entries grouped like a real
      // library (Instructor/Title). The single sample video URL becomes one part.
      const folderPath = `demo/${instr[s.instructorIdx].name}/${s.title}`;
      const ins = db
        .insert(instructionals)
        .values({
          title: s.title,
          description: s.description,
          instructorId: instrIds[s.instructorIdx],
          positionId: posByName.get(s.position)?.id,
          techniqueCategoryId: catBySlug.get(s.catSlug)?.id,
          folderPath,
          // duration intentionally left unset — ffprobe fills it during
          // thumbnail generation.
          available: true,
          createdAt: ts,
          updatedAt: ts,
        })
        .returning()
        .get();
      db.insert(instructionalVideos)
        .values({
          instructionalId: ins.id,
          filePath: s.url,
          fileName: s.title,
          sortOrder: 0,
          available: true,
          createdAt: ts,
          updatedAt: ts,
        })
        .run();
      const tagIds = allTags.filter((t) => s.tags.includes(t.name)).map((t) => t.id);
      if (tagIds.length) {
        db.insert(instructionalTags)
          .values(tagIds.map((t) => ({ instructionalId: ins.id, tagId: t })))
          .run();
      }
    }
  },
};
