import { HttpClient } from './http-client.js';
import type { JoplinNotebook, JoplinNote } from '../types/joplin.js';

/**
 * Notebook (Folder) operations
 */
export class NotebooksApi extends HttpClient {
  async listNotebooks(
    fields?: string,
    orderBy?: string,
    orderDir?: 'ASC' | 'DESC',
    limit?: number,
  ): Promise<JoplinNotebook[]> {
    const fieldsParam =
      fields ||
      'id,title,parent_id,created_time,updated_time,user_created_time,user_updated_time';
    let endpoint = `/folders?fields=${fieldsParam}`;
    if (orderBy) {
      endpoint += `&order_by=${orderBy}`;
    }
    if (orderDir) {
      endpoint += `&order_dir=${orderDir}`;
    }
    return this.paginatedRequest(endpoint, limit);
  }

  async getNotebook(
    notebookId: string,
    fields?: string,
  ): Promise<JoplinNotebook> {
    const fieldsParam =
      fields ||
      'id,title,parent_id,created_time,updated_time,user_created_time,user_updated_time';
    return this.request(
      'GET',
      `/folders/${notebookId}?fields=${fieldsParam}`,
    ) as Promise<JoplinNotebook>;
  }

  async createNotebook(
    title: string,
    parentId?: string,
  ): Promise<JoplinNotebook> {
    const body: Record<string, unknown> = { title };
    if (parentId) body.parent_id = parentId;
    return this.request('POST', '/folders', body) as Promise<JoplinNotebook>;
  }

  async getNotebookNotes(
    notebookId: string,
    fields?: string,
    orderBy?: string,
    orderDir?: 'ASC' | 'DESC',
    limit?: number,
  ): Promise<JoplinNote[]> {
    const fieldsParam =
      fields ||
      'id,title,body,parent_id,created_time,updated_time,user_created_time,user_updated_time,is_todo,todo_completed';
    let endpoint = `/folders/${notebookId}/notes?fields=${fieldsParam}`;
    if (orderBy) {
      endpoint += `&order_by=${orderBy}`;
    }
    if (orderDir) {
      endpoint += `&order_dir=${orderDir}`;
    }
    return this.paginatedRequest(endpoint, limit);
  }

  async updateNotebook(
    notebookId: string,
    updates: { title?: string; parent_id?: string },
  ): Promise<JoplinNotebook> {
    return this.request(
      'PUT',
      `/folders/${notebookId}`,
      updates,
    ) as Promise<JoplinNotebook>;
  }

  async renameNotebook(
    notebookId: string,
    newTitle: string,
  ): Promise<JoplinNotebook> {
    return this.updateNotebook(notebookId, { title: newTitle });
  }

  async deleteNotebook(notebookId: string): Promise<void> {
    await this.request('DELETE', `/folders/${notebookId}`);
  }
}
