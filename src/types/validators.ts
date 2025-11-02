import { z } from 'zod';
import type {
  JoplinNote,
  JoplinNotebook,
  JoplinTag,
  JoplinResource,
  JoplinRevision,
} from './joplin.js';

export const JoplinNoteSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  parent_id: z.string(),
  created_time: z.number(),
  updated_time: z.number(),
  is_todo: z.number(),
  todo_completed: z.number(),
  todo_due: z.number(),
  source_url: z.string().optional(),
  author: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  altitude: z.number().optional(),
  user_created_time: z.number().optional(),
  user_updated_time: z.number().optional(),
}) satisfies z.ZodType<JoplinNote>;

export const JoplinNotebookSchema = z.object({
  id: z.string(),
  title: z.string(),
  parent_id: z.string().nullable(),
  created_time: z.number(),
  updated_time: z.number(),
  user_created_time: z.number().optional(),
  user_updated_time: z.number().optional(),
  icon: z.string().optional(),
}) satisfies z.ZodType<JoplinNotebook>;

export const JoplinTagSchema = z.object({
  id: z.string(),
  title: z.string(),
  created_time: z.number(),
  updated_time: z.number(),
  user_created_time: z.number().optional(),
  user_updated_time: z.number().optional(),
}) satisfies z.ZodType<JoplinTag>;

export const JoplinResourceSchema = z.object({
  id: z.string(),
  title: z.string(),
  mime: z.string(),
  filename: z.string(),
  created_time: z.number(),
  file_extension: z.string(),
  size: z.number(),
}) satisfies z.ZodType<JoplinResource>;

export const JoplinRevisionSchema = z.object({
  id: z.string(),
  parent_id: z.string(),
  item_type: z.number(),
  item_id: z.string(),
  title: z.string(),
  body: z.string(),
  created_time: z.number(),
  updated_time: z.number(),
}) satisfies z.ZodType<JoplinRevision>;

export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(
  itemSchema: T,
) =>
  z.object({
    items: z.array(itemSchema),
    has_more: z.boolean(),
  });

// Validation helpers
export function validateNote(data: unknown): JoplinNote {
  return JoplinNoteSchema.parse(data);
}

export function validateNotebook(data: unknown): JoplinNotebook {
  return JoplinNotebookSchema.parse(data);
}

export function validateTag(data: unknown): JoplinTag {
  return JoplinTagSchema.parse(data);
}

export function validateResource(data: unknown): JoplinResource {
  return JoplinResourceSchema.parse(data);
}

export function validateRevision(data: unknown): JoplinRevision {
  return JoplinRevisionSchema.parse(data);
}
