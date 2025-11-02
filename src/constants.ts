export const DEFAULT_NOTE_FIELDS = [
  'id',
  'title',
  'body',
  'parent_id',
  'created_time',
  'updated_time',
  'is_todo',
  'todo_completed',
  'todo_due',
  'source_url',
  'author',
] as const;

export const DEFAULT_NOTEBOOK_FIELDS = [
  'id',
  'title',
  'parent_id',
  'created_time',
  'updated_time',
  'icon',
] as const;

export const DEFAULT_TAG_FIELDS = [
  'id',
  'title',
  'created_time',
  'updated_time',
] as const;

export const DEFAULT_RESOURCE_FIELDS = [
  'id',
  'title',
  'mime',
  'filename',
  'created_time',
  'file_extension',
  'size',
] as const;

export const DEFAULT_PAGINATION_LIMIT = 100;
