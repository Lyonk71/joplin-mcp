import { HttpClient } from './http-client.js';

/**
 * Tag operations
 */
export class TagsApi extends HttpClient {
  // Reference to notes API for cross-domain operations (search)
  private notesApi?: {
    searchNotes: (query: string, type?: string) => Promise<unknown>;
  };

  setNotesApi(notesApi: {
    searchNotes: (query: string, type?: string) => Promise<unknown>;
  }) {
    this.notesApi = notesApi;
  }

  /**
   * Find an existing tag by name or create it if it doesn't exist
   * @returns Tag ID
   */
  private async findOrCreateTag(tagName: string): Promise<string> {
    if (!this.notesApi) {
      throw new Error('NotesApi not set');
    }

    // Search for existing tag by exact name
    const items = (await this.notesApi.searchNotes(tagName, 'tag')) as Array<{
      id: string;
      title: string;
    }>;
    const exactMatch = items.find(
      (t) => t.title.toLowerCase() === tagName.toLowerCase(),
    );

    if (exactMatch) {
      return exactMatch.id;
    }

    // Create new tag if not found
    const newTag = (await this.request('POST', '/tags', {
      title: tagName,
    })) as { id: string };
    return newTag.id;
  }

  /**
   * Add tags to a note (comma-separated tag names)
   * Tags will be created if they don't exist
   */
  async addTagsToNote(noteId: string, tagNames: string): Promise<void> {
    // Parse comma-separated tags
    const tags = tagNames
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t);

    // Get or create each tag, then associate with note
    for (const tagName of tags) {
      const tagId = await this.findOrCreateTag(tagName);
      await this.request('POST', `/tags/${tagId}/notes`, { id: noteId });
    }
  }

  /**
   * Remove tags from a note (comma-separated tag names)
   * Silently ignores tags that don't exist or aren't on the note
   */
  async removeTagsFromNote(noteId: string, tagNames: string): Promise<void> {
    if (!this.notesApi) {
      throw new Error('NotesApi not set');
    }

    // Parse comma-separated tags
    const tags = tagNames
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t);

    // For each tag name, find it and remove from note
    for (const tagName of tags) {
      const items = (await this.notesApi.searchNotes(tagName, 'tag')) as Array<{
        id: string;
        title: string;
      }>;
      const exactMatch = items.find(
        (t) => t.title.toLowerCase() === tagName.toLowerCase(),
      );

      if (exactMatch) {
        // Remove tag from note (ignore errors if tag isn't on note)
        try {
          await this.request(
            'DELETE',
            `/tags/${exactMatch.id}/notes/${noteId}`,
          );
        } catch {
          // Tag wasn't on note, that's fine
        }
      }
    }
  }

  /**
   * List all tags in Joplin
   */
  async listTags(
    fields?: string,
    orderBy?: string,
    orderDir?: 'ASC' | 'DESC',
    limit?: number,
  ): Promise<unknown> {
    const fieldsParam = fields || 'id,title,created_time,updated_time';
    let endpoint = `/tags?fields=${fieldsParam}`;
    if (orderBy) {
      endpoint += `&order_by=${orderBy}`;
    }
    if (orderDir) {
      endpoint += `&order_dir=${orderDir}`;
    }
    return this.paginatedRequest(endpoint, limit);
  }

  /**
   * Get a specific tag by ID
   */
  async getTag(tagId: string, fields?: string): Promise<unknown> {
    const fieldsParam = fields || 'id,title,created_time,updated_time';
    return this.request('GET', `/tags/${tagId}?fields=${fieldsParam}`);
  }

  /**
   * Rename a tag by ID
   */
  async renameTag(tagId: string, newName: string): Promise<unknown> {
    return this.request('PUT', `/tags/${tagId}`, { title: newName });
  }

  /**
   * Rename a tag by name (finds tag by old name, then renames it)
   */
  async renameTagByName(oldName: string, newName: string): Promise<unknown> {
    if (!this.notesApi) {
      throw new Error('NotesApi not set');
    }

    // Find tag by old name
    const tags = (await this.notesApi.searchNotes(oldName, 'tag')) as Array<{
      id: string;
      title: string;
    }>;

    const exactMatch = tags.find(
      (t) => t.title.toLowerCase() === oldName.toLowerCase(),
    );

    if (!exactMatch) {
      throw new Error(`Tag not found: ${oldName}`);
    }

    return this.renameTag(exactMatch.id, newName);
  }

  /**
   * Delete a tag by ID
   */
  async deleteTag(tagId: string): Promise<unknown> {
    return this.request('DELETE', `/tags/${tagId}`);
  }

  /**
   * Get all notes that have a specific tag
   */
  async getTagNotes(
    tagId: string,
    fields?: string,
    orderBy?: string,
    orderDir?: 'ASC' | 'DESC',
    limit?: number,
  ): Promise<unknown> {
    const fieldsParam =
      fields ||
      'id,title,body,parent_id,created_time,updated_time,user_created_time,user_updated_time,is_todo,todo_completed';

    let endpoint = `/tags/${tagId}/notes?fields=${fieldsParam}`;
    if (orderBy) {
      endpoint += `&order_by=${orderBy}`;
    }
    if (orderDir) {
      endpoint += `&order_dir=${orderDir}`;
    }
    return this.paginatedRequest(endpoint, limit);
  }

  /**
   * Get notes by tag name (finds tag by name, then gets notes)
   */
  async getNotesByTagName(
    tagName: string,
    fields?: string,
    orderBy?: string,
    orderDir?: 'ASC' | 'DESC',
    limit?: number,
  ): Promise<unknown> {
    if (!this.notesApi) {
      throw new Error('NotesApi not set');
    }

    // Search for tag by exact name
    const tags = (await this.notesApi.searchNotes(tagName, 'tag')) as Array<{
      id: string;
      title: string;
    }>;

    const exactMatch = tags.find(
      (t) => t.title.toLowerCase() === tagName.toLowerCase(),
    );

    if (!exactMatch) {
      throw new Error(`Tag not found: ${tagName}`);
    }

    return this.getTagNotes(exactMatch.id, fields, orderBy, orderDir, limit);
  }
}
