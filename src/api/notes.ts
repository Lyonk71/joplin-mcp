import { HttpClient } from './http-client.js';

/**
 * Note operations
 */
export class NotesApi extends HttpClient {
  // Reference to tags API for cross-domain operations
  private tagsApi?: {
    addTagsToNote: (noteId: string, tagNames: string) => Promise<void>;
  };

  setTagsApi(tagsApi: {
    addTagsToNote: (noteId: string, tagNames: string) => Promise<void>;
  }) {
    this.tagsApi = tagsApi;
  }

  async listAllNotes(
    fields?: string,
    includeDeleted = false,
    orderBy?: string,
    orderDir?: 'ASC' | 'DESC',
    limit?: number,
  ): Promise<unknown> {
    const fieldsParam =
      fields ||
      'id,title,body,parent_id,created_time,updated_time,user_created_time,user_updated_time,is_todo,todo_completed';

    let endpoint = `/notes?fields=${fieldsParam}`;
    if (includeDeleted) {
      endpoint += '&include_deleted=1';
    }
    if (orderBy) {
      endpoint += `&order_by=${orderBy}`;
    }
    if (orderDir) {
      endpoint += `&order_dir=${orderDir}`;
    }

    return this.paginatedRequest(endpoint, limit);
  }

  async searchNotes(query: string, type?: string): Promise<unknown> {
    let url = `/search?query=${encodeURIComponent(query)}`;
    if (type) url += `&type=${type}`;
    return this.paginatedRequest(url);
  }

  async getNote(noteId: string, fields?: string): Promise<unknown> {
    const fieldsParam =
      fields ||
      'id,title,body,parent_id,created_time,updated_time,user_created_time,user_updated_time,is_todo,todo_completed';
    const [note, tags] = await Promise.all([
      this.request('GET', `/notes/${noteId}?fields=${fieldsParam}`),
      this.paginatedRequest(`/notes/${noteId}/tags`), // Fetch tags with pagination
    ]);

    // Combine the results
    return { ...(note as Record<string, unknown>), tags };
  }

  async createNote(
    title: string,
    body: string,
    notebookId?: string,
    tags?: string,
    isTodo?: number,
    todoDue?: number,
    todoCompleted?: number,
  ): Promise<unknown> {
    const noteData: Record<string, unknown> = { title, body };
    if (notebookId) noteData.parent_id = notebookId;
    if (isTodo !== undefined) noteData.is_todo = isTodo;
    if (todoDue !== undefined) noteData.todo_due = todoDue;
    if (todoCompleted !== undefined) noteData.todo_completed = todoCompleted;

    // Create note first (API doesn't accept tags parameter)
    const note = (await this.request('POST', '/notes', noteData)) as {
      id: string;
    };

    // Then add tags if provided
    if (tags && this.tagsApi) {
      await this.tagsApi.addTagsToNote(note.id, tags);
    }

    return note;
  }

  async updateNote(
    noteId: string,
    updates: Record<string, unknown>,
  ): Promise<unknown> {
    return this.request('PUT', `/notes/${noteId}`, updates);
  }

  async appendToNote(noteId: string, content: string): Promise<unknown> {
    const note = (await this.getNote(noteId, 'id,body')) as { body: string };
    const updatedBody = note.body + '\n\n' + content;
    return this.updateNote(noteId, { body: updatedBody });
  }

  async prependToNote(noteId: string, content: string): Promise<unknown> {
    const note = (await this.getNote(noteId, 'id,body')) as { body: string };
    const updatedBody = content + '\n\n' + note.body;
    return this.updateNote(noteId, { body: updatedBody });
  }

  async deleteNote(noteId: string, permanent = false): Promise<unknown> {
    const url = permanent ? `/notes/${noteId}?permanent=1` : `/notes/${noteId}`;
    return this.request('DELETE', url);
  }

  async moveNoteToNotebook(
    noteId: string,
    notebookId: string,
  ): Promise<unknown> {
    return this.updateNote(noteId, { parent_id: notebookId });
  }
}
