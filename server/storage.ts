import {
  instructors,
  positions,
  techniqueCategories,
  tags,
  instructionals,
  instructionalTags,
  type Instructional,
  type InstructionalWithRelations,
  type Instructor,
  type Position,
  type TechniqueCategory,
  type Tag,
  type InsertInstructional,
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

const DB_PATH = process.env.DB_PATH || "./data/data.db";
// Ensure the directory exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, {
  schema: { instructors, positions, techniqueCategories, tags, instructionals, instructionalTags },
});

// Media directory (mounted volume in Docker)
export const MEDIA_DIR = process.env.MEDIA_DIR || path.resolve(process.cwd(), "media");

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
      file_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_size INTEGER,
      duration INTEGER,
      thumbnail TEXT,
      notes TEXT,
      rating INTEGER DEFAULT 0,
      watched INTEGER NOT NULL DEFAULT 0,
      progress INTEGER NOT NULL DEFAULT 0,
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
  `);
}
initDb();

// ---------- Helpers ----------
function now() {
  return Date.now();
}

function attachTags(rows: Instructional[]): InstructionalWithRelations[] {
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

function enrich(
  rows: Instructional[],
  instructorMap: Map<number, Instructor>,
  positionMap: Map<number, Position>,
  categoryMap: Map<number, TechniqueCategory>
): InstructionalWithRelations[] {
  return attachTags(rows).map((r) => ({
    ...r,
    instructor: r.instructorId ? instructorMap.get(r.instructorId) ?? null : null,
    position: r.positionId ? positionMap.get(r.positionId) ?? null : null,
    techniqueCategory: r.techniqueCategoryId
      ? categoryMap.get(r.techniqueCategoryId) ?? null
      : null,
  }));
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
          like(instructionals.fileName, term)
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

  createInstructional(data: InsertInstructional): InstructionalWithRelations {
    const ts = now();
    const row = db
      .insert(instructionals)
      .values({ ...data, createdAt: ts, updatedAt: ts })
      .returning()
      .get();
    return this.getInstructional(row.id)!;
  },

  updateInstructional(id: number, data: Partial<InsertInstructional>): InstructionalWithRelations | undefined {
    db.update(instructionals)
      .set({ ...data, updatedAt: now() })
      .where(eq(instructionals.id, id))
      .run();
    return this.getInstructional(id);
  },

  setInstructionalTags(id: number, tagIds: number[]) {
    db.delete(instructionalTags).where(eq(instructionalTags.instructionalId, id)).run();
    if (tagIds.length) {
      db.insert(instructionalTags)
        .values(tagIds.map((t) => ({ instructionalId: id, tagId: t })))
        .run();
    }
  },

  updateProgress(id: number, progress: number, watched: boolean) {
    db.update(instructionals)
      .set({ progress, watched, updatedAt: now() })
      .where(eq(instructionals.id, id))
      .run();
    return this.getInstructional(id);
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
  scanLibrary(): {
    scanned: number;
    added: number;
    updated: number;
    missing: number;
  } {
    const root = MEDIA_DIR;
    const found: { rel: string; name: string; size: number }[] = [];

    if (fs.existsSync(root)) {
      const walk = (dir: string) => {
        let entries: fs.Dirent[] = [];
        try {
          entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
          return;
        }
        for (const entry of entries) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(full);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (VIDEO_EXTENSIONS.includes(ext)) {
              const rel = path.relative(root, full);
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

    const existing = db.select().from(instructionals).all();
    const byPath = new Map(existing.map((e) => [e.filePath, e]));
    let added = 0;
    let updated = 0;
    const seenPaths = new Set<string>();

    for (const f of found) {
      seenPaths.add(f.rel);
      const ex = byPath.get(f.rel);
      if (ex) {
        if (!ex.available || ex.fileSize !== f.size) {
          db.update(instructionals)
            .set({ available: true, fileSize: f.size, updatedAt: now() })
            .where(eq(instructionals.id, ex.id))
            .run();
          updated++;
        }
      } else {
        const title = path.basename(f.name, path.extname(f.name));
        db.insert(instructionals)
          .values({
            title,
            filePath: f.rel,
            fileName: f.name,
            fileSize: f.size,
            available: true,
            createdAt: now(),
            updatedAt: now(),
          })
          .returning()
          .get();
        added++;
      }
    }

    // Mark missing files unavailable
    let missing = 0;
    for (const ex of existing) {
      if (!seenPaths.has(ex.filePath) && ex.available && !/^https?:\/\//i.test(ex.filePath)) {
        db.update(instructionals)
          .set({ available: false, updatedAt: now() })
          .where(eq(instructionals.id, ex.id))
          .run();
        missing++;
      }
    }

    return { scanned: found.length, added, updated, missing };
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
        url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
        tags: ["no-gi", "back attack"],
      },
      {
        title: "Enter the System: Leg Locks",
        description:
          "The complete leg-lock system — entries, control, and finishing ashi-garami and heel hooks.",
        instructorIdx: 1,
        position: "Open Guard",
        catSlug: "submission",
        url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
        tags: ["no-gi", "leglock"],
      },
      {
        title: "Pressure Passing Masterclass",
        description:
          "Toreando, knee cut, and over-under passing systems for shutting down open guard.",
        instructorIdx: 2,
        position: "Open Guard",
        catSlug: "passing",
        url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
        tags: ["no-gi", "competition"],
      },
      {
        title: "X-Guard & Guillotine Attacks",
        description:
          "Marcelo's signature x-guard entries and the high-elbow guillotine finish.",
        instructorIdx: 3,
        position: "Open Guard",
        catSlug: "guard",
        url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
        tags: ["gi", "competition"],
      },
      {
        title: "Mount Escapes & Retention",
        description:
          "Surviving mount: elbow-knee escape, bridge-and-roll, and defensive framing.",
        instructorIdx: 0,
        position: "Mount",
        catSlug: "escape",
        url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
        tags: ["gi"],
      },
    ];

    for (const s of samples) {
      const ins = db
        .insert(instructionals)
        .values({
          title: s.title,
          description: s.description,
          instructorId: instrIds[s.instructorIdx],
          positionId: posByName.get(s.position)?.id,
          techniqueCategoryId: catBySlug.get(s.catSlug)?.id,
          filePath: s.url,
          fileName: s.title,
          duration: 600,
          available: true,
          createdAt: ts,
          updatedAt: ts,
        })
        .returning()
        .get();
      const tagIds = allTags.filter((t) => s.tags.includes(t.name)).map((t) => t.id);
      if (tagIds.length) {
        db.insert(instructionalTags)
          .values(tagIds.map((t) => ({ instructionalId: ins.id, tagId: t })))
          .run();
      }
    }
  },
};
