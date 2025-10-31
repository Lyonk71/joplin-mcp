/**
 * Joplin API paginated response format
 */
export interface PaginatedResponse<T> {
  items: T[];
  has_more: boolean;
}
