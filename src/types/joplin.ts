export interface JoplinNote {
  id: string;
  title: string;
  body: string;
  parent_id: string;
  created_time: number;
  updated_time: number;
  is_todo: number;
  todo_completed: number;
  todo_due: number;
  source_url?: string;
  author?: string;
  latitude?: number;
  longitude?: number;
  altitude?: number;
  user_created_time?: number;
  user_updated_time?: number;
}

export interface JoplinNotebook {
  id: string;
  title: string;
  parent_id: string | null;
  created_time: number;
  updated_time: number;
  user_created_time?: number;
  user_updated_time?: number;
  icon?: string;
}

export interface JoplinTag {
  id: string;
  title: string;
  created_time: number;
  updated_time: number;
  user_created_time?: number;
  user_updated_time?: number;
}

export interface JoplinResource {
  id: string;
  title: string;
  mime: string;
  filename: string;
  created_time: number;
  file_extension: string;
  size: number;
}

export interface JoplinRevision {
  id: string;
  parent_id: string;
  item_type: number;
  item_id: string;
  title: string;
  body: string;
  created_time: number;
  updated_time: number;
}

/**
 * Joplin API paginated response format
 */
export interface PaginatedResponse<T> {
  items: T[];
  has_more: boolean;
}
