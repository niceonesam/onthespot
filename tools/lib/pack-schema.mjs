import { z } from "zod";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const mediaSchema = z.object({
  type: z.enum(["image"]),
  url: z.string().url(),
  caption: z.string().min(1),
});

export const entryReviewStatusSchema = z.enum(["draft", "reviewed", "approved"]);
export const entryOriginSchema = z.enum(["manual", "generated"]);

export const entrySchema = z.object({
  title: z.string().min(1),
  id: z.string().min(1),

  date_start: z.union([dateString, z.null()]),
  date_end: z.union([dateString, z.null()]),

  category: z.string().min(1),

  description: z.string().min(1),
  significance: z.string().min(1),

  source_url: z.string().url(),

  confidence: z.number().int().min(1).max(5),

  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),

  area_note: z.union([z.string(), z.null()]),

  era: z.string().min(1),

  tags: z.array(z.string()),

  media: z.array(mediaSchema),

  review_status: entryReviewStatusSchema,
  origin: entryOriginSchema,
  visibility: z.enum(["public", "private"]),

  status: z.enum(["active", "inactive"]),
});

export const placeSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),

  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),

  radius_m: z.number().int().positive(),

  summary: z.string().min(1),

  country: z.string().min(1),
  region: z.string().min(1),

  hero_image_url: z.union([z.string().url(), z.null()]),
});

export const packSchema = z.object({
  place: placeSchema,

  entries: z.array(entrySchema),
  candidates: z.array(entrySchema).default([]),

  metadata: z.object({
    created_by: z.string().min(1),

    review_status: z.enum(["draft", "reviewed", "approved"]),

    source_mix: z.array(z.string()),

    notes: z.string(),
  }),
});