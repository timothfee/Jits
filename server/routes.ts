import type { Express } from "express";
import type { Server } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { storage, MEDIA_DIR } from "./storage";
import {
  insertInstructionalSchema,
  insertInstructorSchema,
  insertPositionSchema,
  insertTechniqueCategorySchema,
  insertTagSchema,
  updateInstructionalSchema,
} from "@shared/schema";

function resolveFilePath(filePath: string): string {
  // Absolute http(s) URLs are passed through (redirect at stream time)
  if (/^https?:\/\//i.test(filePath)) return filePath;
  // Treat as relative to media dir. Prevent path traversal.
  const resolved = path.resolve(MEDIA_DIR, filePath);
  const rel = path.relative(MEDIA_DIR, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Invalid file path");
  }
  return resolved;
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // Seed on boot
  try {
    storage.seedDefaults();
  } catch (err) {
    console.error("Seed failed:", err);
  }

  // ===== Stats =====
  app.get("/api/stats", (_req, res) => {
    res.json(storage.stats());
  });

  // ===== Instructionals =====
  app.get("/api/instructionals", (req, res) => {
    const {
      q,
      instructorId,
      techniqueCategoryId,
      positionId,
      tagId,
      watched,
      sort,
    } = req.query;
    const filter: any = {};
    if (q) filter.q = String(q);
    if (instructorId) filter.instructorId = Number(instructorId);
    if (techniqueCategoryId) filter.techniqueCategoryId = Number(techniqueCategoryId);
    if (positionId) filter.positionId = Number(positionId);
    if (tagId) filter.tagId = Number(tagId);
    if (watched !== undefined) filter.watched = watched === "true";
    if (sort) filter.sort = String(sort) as any;
    res.json(storage.listInstructionals(filter));
  });

  app.get("/api/instructionals/:id", (req, res) => {
    const item = storage.getInstructional(Number(req.params.id));
    if (!item) return res.status(404).json({ message: "Not found" });
    res.json(item);
  });

  app.post("/api/instructionals", (req, res) => {
    const parsed = insertInstructionalSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: "Invalid", errors: parsed.error.flatten() });
    const created = storage.createInstructional(parsed.data);
    if (Array.isArray(req.body.tagIds)) {
      storage.setInstructionalTags(created.id, req.body.tagIds.map(Number));
    }
    res.json(storage.getInstructional(created.id));
  });

  app.patch("/api/instructionals/:id", (req, res) => {
    const id = Number(req.params.id);
    const parsed = updateInstructionalSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: "Invalid", errors: parsed.error.flatten() });
    const updated = storage.updateInstructional(id, parsed.data);
    if (!updated) return res.status(404).json({ message: "Not found" });
    if (Array.isArray(req.body.tagIds)) {
      storage.setInstructionalTags(id, req.body.tagIds.map(Number));
    }
    res.json(storage.getInstructional(id));
  });

  app.delete("/api/instructionals/:id", (req, res) => {
    storage.deleteInstructional(Number(req.params.id));
    res.json({ ok: true });
  });

  app.patch("/api/instructionals/:id/progress", (req, res) => {
    const id = Number(req.params.id);
    const progress = Number(req.body.progress) || 0;
    const watched = Boolean(req.body.watched);
    const updated = storage.updateProgress(id, progress, watched);
    res.json(updated);
  });

  app.post("/api/instructionals/scan", (_req, res) => {
    try {
      const result = storage.scanLibrary();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ===== Thumbnails =====
  // Serve a generated thumbnail for an instructional.
  app.get("/api/thumb/:id", (req, res) => {
    const id = Number(req.params.id);
    const item = storage.getInstructional(id);
    if (!item) return res.status(404).json({ message: "Not found" });

    // Remote thumbnail URL → let the browser fetch it directly.
    if (item.thumbnail && /^https?:\/\//i.test(item.thumbnail)) {
      return res.redirect(item.thumbnail);
    }

    const file = storage.resolveThumbnail(item.thumbnail);
    if (!file) return res.status(404).json({ message: "No thumbnail" });

    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=604800, immutable");
    fs.createReadStream(file).pipe(res);
  });

  // (Re)generate a thumbnail for a single instructional.
  app.post("/api/instructionals/:id/thumbnail", async (req, res) => {
    const id = Number(req.params.id);
    if (!storage.getInstructional(id))
      return res.status(404).json({ message: "Not found" });
    try {
      const ok = await storage.generateThumbnail(id);
      if (!ok) return res.status(422).json({ message: "Could not generate thumbnail" });
      res.json(storage.getInstructional(id));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Bulk-generate thumbnails for all instructionals missing one (or all, with ?force=true).
  app.post("/api/instructionals/thumbnails", async (req, res) => {
    try {
      const force = req.query.force === "true";
      const result = await storage.generateMissingThumbnails(force);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ===== Video streaming (range support) =====
  app.get("/api/stream/:id", (req, res) => {
    const id = Number(req.params.id);
    const item = storage.getInstructional(id);
    if (!item) return res.status(404).json({ message: "Not found" });

    // Remote URL → redirect, browser video element follows and streams directly
    if (/^https?:\/\//i.test(item.filePath)) {
      return res.redirect(item.filePath);
    }

    let resolved: string;
    try {
      resolved = resolveFilePath(item.filePath);
    } catch {
      return res.status(400).json({ message: "Invalid path" });
    }
    if (!fs.existsSync(resolved)) {
      return res.status(404).json({ message: "File missing on disk" });
    }

    const stat = fs.statSync(resolved);
    const fileSize = stat.size;
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;
      const stream = fs.createReadStream(resolved, { start, end });
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        "Content-Type": "video/mp4",
      });
      stream.pipe(res);
    } else {
      res.writeHead(200, {
        "Content-Length": fileSize,
        "Content-Type": "video/mp4",
        "Accept-Ranges": "bytes",
      });
      fs.createReadStream(resolved).pipe(res);
    }
  });

  // ===== Instructors =====
  app.get("/api/instructors", (_req, res) => res.json(storage.listInstructors()));

  app.post("/api/instructors", (req, res) => {
    const parsed = insertInstructorSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: "Invalid", errors: parsed.error.flatten() });
    res.json(storage.createInstructor(parsed.data));
  });

  app.patch("/api/instructors/:id", (req, res) => {
    const parsed = insertInstructorSchema.partial().safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: "Invalid", errors: parsed.error.flatten() });
    const updated = storage.updateInstructor(Number(req.params.id), parsed.data);
    if (!updated) return res.status(404).json({ message: "Not found" });
    res.json(updated);
  });

  app.delete("/api/instructors/:id", (req, res) => {
    storage.deleteInstructor(Number(req.params.id));
    res.json({ ok: true });
  });

  // ===== Positions =====
  app.get("/api/positions", (_req, res) => res.json(storage.listPositions()));

  app.post("/api/positions", (req, res) => {
    const parsed = insertPositionSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: "Invalid", errors: parsed.error.flatten() });
    res.json(storage.createPosition(parsed.data));
  });

  app.delete("/api/positions/:id", (req, res) => {
    storage.deletePosition(Number(req.params.id));
    res.json({ ok: true });
  });

  // ===== Technique Categories =====
  app.get("/api/categories", (_req, res) => res.json(storage.listCategories()));

  app.post("/api/categories", (req, res) => {
    const parsed = insertTechniqueCategorySchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: "Invalid", errors: parsed.error.flatten() });
    res.json(storage.createCategory(parsed.data));
  });

  app.patch("/api/categories/:id", (req, res) => {
    const parsed = insertTechniqueCategorySchema.partial().safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: "Invalid", errors: parsed.error.flatten() });
    const updated = storage.updateCategory(Number(req.params.id), parsed.data);
    if (!updated) return res.status(404).json({ message: "Not found" });
    res.json(updated);
  });

  app.delete("/api/categories/:id", (req, res) => {
    storage.deleteCategory(Number(req.params.id));
    res.json({ ok: true });
  });

  // ===== Tags =====
  app.get("/api/tags", (_req, res) => res.json(storage.listTags()));

  app.post("/api/tags", (req, res) => {
    const name = String(req.body.name || "").trim();
    if (!name) return res.status(400).json({ message: "Name required" });
    res.json(storage.createTag(name));
  });

  app.delete("/api/tags/:id", (req, res) => {
    storage.deleteTag(Number(req.params.id));
    res.json({ ok: true });
  });

  return httpServer;
}
