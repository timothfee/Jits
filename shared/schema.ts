import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ---------- Instructors ----------
export const instructors = sqliteTable("instructors", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  bio: text("bio"),
  academy: text("academy"),
  belt: text("belt"), // e.g. "black", "coral"
  createdAt: integer("created_at").notNull(),
});

// ---------- Positions (controlled vocabulary) ----------
export const positions = sqliteTable("positions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  group: text("group").notNull().default("Other"), // Guard, Control, Top, Bottom, Neutral, Submission
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});

// ---------- Technique Categories (controlled vocabulary) ----------
export const techniqueCategories = sqliteTable("technique_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  color: text("color").notNull().default("#64748b"), // hex used for badge tinting
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});

// ---------- Tags ----------
export const tags = sqliteTable("tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  createdAt: integer("created_at").notNull(),
});

// ---------- Instructionals (a single video / volume entry) ----------
export const instructionals = sqliteTable("instructionals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  description: text("description"),
  instructorId: integer("instructor_id"),
  positionId: integer("position_id"),
  techniqueCategoryId: integer("technique_category_id"),
  filePath: text("file_path").notNull(), // relative path within MEDIA_DIR, or an http(s) URL
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size"), // bytes
  duration: integer("duration"), // seconds
  thumbnail: text("thumbnail"), // relative path or URL
  notes: text("notes"),
  rating: integer("rating").default(0), // 0-5
  watched: integer("watched", { mode: "boolean" }).notNull().default(false),
  progress: integer("progress").notNull().default(0), // seconds watched
  available: integer("available", { mode: "boolean" }).notNull().default(true), // file still on disk
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// ---------- Join: instructionals <-> tags ----------
export const instructionalTags = sqliteTable("instructional_tags", {
  instructionalId: integer("instructional_id")
    .notNull()
    .references(() => instructionals.id, { onDelete: "cascade" }),
  tagId: integer("tag_id")
    .notNull()
    .references(() => tags.id, { onDelete: "cascade" }),
});

// ---------- Insert schemas ----------
export const insertInstructorSchema = createInsertSchema(instructors).omit({
  id: true,
  createdAt: true,
});
export const insertPositionSchema = createInsertSchema(positions).omit({
  id: true,
  createdAt: true,
});
export const insertTechniqueCategorySchema = createInsertSchema(
  techniqueCategories
).omit({ id: true, createdAt: true });
export const insertTagSchema = createInsertSchema(tags).omit({
  id: true,
  createdAt: true,
});
export const insertInstructionalSchema = createInsertSchema(instructionals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Custom update schema: everything optional except nothing required
export const updateInstructionalSchema = insertInstructionalSchema.partial();

// ---------- Types ----------
export type Instructor = typeof instructors.$inferSelect;
export type InsertInstructor = z.infer<typeof insertInstructorSchema>;

export type Position = typeof positions.$inferSelect;
export type InsertPosition = z.infer<typeof insertPositionSchema>;

export type TechniqueCategory = typeof techniqueCategories.$inferSelect;
export type InsertTechniqueCategory = z.infer<typeof insertTechniqueCategorySchema>;

export type Tag = typeof tags.$inferSelect;
export type InsertTag = z.infer<typeof insertTagSchema>;

export type Instructional = typeof instructionals.$inferSelect;
export type InsertInstructional = z.infer<typeof insertInstructionalSchema>;

export type InstructionalTag = typeof instructionalTags.$inferSelect;

// ---------- Rich types (instructional with relations) ----------
export type InstructionalWithRelations = Instructional & {
  instructor?: Instructor | null;
  position?: Position | null;
  techniqueCategory?: TechniqueCategory | null;
  tags: Tag[];
};

// Allowed video extensions
export const VIDEO_EXTENSIONS = [
  ".mp4",
  ".mkv",
  ".webm",
  ".mov",
  ".avi",
  ".m4v",
  ".wmv",
  ".flv",
  ".ts",
  ".mpg",
  ".mpeg",
];

export const BELT_COLORS = [
  "white",
  "blue",
  "purple",
  "brown",
  "black",
  "coral",
  "red",
];
