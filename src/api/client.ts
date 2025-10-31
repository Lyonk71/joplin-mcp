import { discoverJoplinToken } from '../config/token-discovery.js';
import { HttpClient } from './http-client.js';
import { NotebooksApi } from './notebooks.js';
import { NotesApi } from './notes.js';
import { TagsApi } from './tags.js';
import { ResourcesApi } from './resources.js';
import { RevisionsApi } from './revisions.js';

/**
 * Main Joplin API client that aggregates all domain-specific APIs
 */
export class JoplinApiClient extends HttpClient {
  // Domain-specific API instances
  public readonly notebooks: NotebooksApi;
  public readonly notes: NotesApi;
  public readonly tags: TagsApi;
  public readonly resources: ResourcesApi;
  public readonly revisions: RevisionsApi;

  constructor() {
    // Initialize base URL and token
    const rawPort = process.env.JOPLIN_PORT;
    let port = '41184';
    if (rawPort) {
      const parsedPort = parseInt(rawPort, 10);
      if (!isNaN(parsedPort) && parsedPort > 0 && parsedPort <= 65535) {
        port = parsedPort.toString();
      } else {
        console.error(
          `[Warning] Invalid JOPLIN_PORT: "${rawPort}". Falling back to default port 41184.`,
        );
      }
    }
    const baseUrl = `http://localhost:${port}`;

    // Try to get token from: 1) env var, 2) auto-discovery
    const token = process.env.JOPLIN_TOKEN || discoverJoplinToken() || '';

    if (!token) {
      console.error('[Error] Could not find Joplin API token');
      console.error('[Info] Please ensure:');
      console.error('  1. Joplin desktop app is installed');
      console.error('  2. Web Clipper is enabled in Settings → Web Clipper');
      console.error(
        '[Info] Alternatively, set JOPLIN_TOKEN environment variable',
      );
    }

    // Initialize base HttpClient
    super(baseUrl, token);

    // Create domain-specific API instances
    this.notebooks = new NotebooksApi(baseUrl, token);
    this.notes = new NotesApi(baseUrl, token);
    this.tags = new TagsApi(baseUrl, token);
    this.resources = new ResourcesApi(baseUrl, token);
    this.revisions = new RevisionsApi(baseUrl, token);

    // Wire up cross-domain dependencies
    this.notes.setTagsApi(this.tags);
    this.tags.setNotesApi(this.notes);
  }

  // Delegate methods to maintain backwards compatibility with existing code

  // Notebook methods
  async listNotebooks(
    fields?: string,
    orderBy?: string,
    orderDir?: 'ASC' | 'DESC',
    limit?: number,
  ): Promise<unknown> {
    return this.notebooks.listNotebooks(fields, orderBy, orderDir, limit);
  }

  async getNotebook(notebookId: string, fields?: string): Promise<unknown> {
    return this.notebooks.getNotebook(notebookId, fields);
  }

  async createNotebook(title: string, parentId?: string): Promise<unknown> {
    return this.notebooks.createNotebook(title, parentId);
  }

  async getNotebookNotes(
    notebookId: string,
    fields?: string,
    orderBy?: string,
    orderDir?: 'ASC' | 'DESC',
    limit?: number,
  ): Promise<unknown> {
    return this.notebooks.getNotebookNotes(
      notebookId,
      fields,
      orderBy,
      orderDir,
      limit,
    );
  }

  async updateNotebook(
    notebookId: string,
    updates: { title?: string; parent_id?: string },
  ): Promise<unknown> {
    return this.notebooks.updateNotebook(notebookId, updates);
  }

  async renameNotebook(notebookId: string, newTitle: string): Promise<unknown> {
    return this.notebooks.renameNotebook(notebookId, newTitle);
  }

  async deleteNotebook(notebookId: string): Promise<unknown> {
    return this.notebooks.deleteNotebook(notebookId);
  }

  // Note methods
  async listAllNotes(
    fields?: string,
    includeDeleted = false,
    orderBy?: string,
    orderDir?: 'ASC' | 'DESC',
    limit?: number,
  ): Promise<unknown> {
    return this.notes.listAllNotes(
      fields,
      includeDeleted,
      orderBy,
      orderDir,
      limit,
    );
  }

  async searchNotes(query: string, type?: string): Promise<unknown> {
    return this.notes.searchNotes(query, type);
  }

  async getNote(noteId: string, fields?: string): Promise<unknown> {
    return this.notes.getNote(noteId, fields);
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
    return this.notes.createNote(
      title,
      body,
      notebookId,
      tags,
      isTodo,
      todoDue,
      todoCompleted,
    );
  }

  async updateNote(
    noteId: string,
    updates: Record<string, unknown>,
  ): Promise<unknown> {
    return this.notes.updateNote(noteId, updates);
  }

  async appendToNote(noteId: string, content: string): Promise<unknown> {
    return this.notes.appendToNote(noteId, content);
  }

  async prependToNote(noteId: string, content: string): Promise<unknown> {
    return this.notes.prependToNote(noteId, content);
  }

  async deleteNote(noteId: string, permanent = false): Promise<unknown> {
    return this.notes.deleteNote(noteId, permanent);
  }

  async moveNoteToNotebook(
    noteId: string,
    notebookId: string,
  ): Promise<unknown> {
    return this.notes.moveNoteToNotebook(noteId, notebookId);
  }

  // Tag methods
  async addTagsToNote(noteId: string, tagNames: string): Promise<void> {
    return this.tags.addTagsToNote(noteId, tagNames);
  }

  async removeTagsFromNote(noteId: string, tagNames: string): Promise<void> {
    return this.tags.removeTagsFromNote(noteId, tagNames);
  }

  async listTags(
    fields?: string,
    orderBy?: string,
    orderDir?: 'ASC' | 'DESC',
    limit?: number,
  ): Promise<unknown> {
    return this.tags.listTags(fields, orderBy, orderDir, limit);
  }

  async getTag(tagId: string, fields?: string): Promise<unknown> {
    return this.tags.getTag(tagId, fields);
  }

  async renameTag(tagId: string, newName: string): Promise<unknown> {
    return this.tags.renameTag(tagId, newName);
  }

  async renameTagByName(oldName: string, newName: string): Promise<unknown> {
    return this.tags.renameTagByName(oldName, newName);
  }

  async deleteTag(tagId: string): Promise<unknown> {
    return this.tags.deleteTag(tagId);
  }

  async getTagNotes(
    tagId: string,
    fields?: string,
    orderBy?: string,
    orderDir?: 'ASC' | 'DESC',
    limit?: number,
  ): Promise<unknown> {
    return this.tags.getTagNotes(tagId, fields, orderBy, orderDir, limit);
  }

  async getNotesByTagName(
    tagName: string,
    fields?: string,
    orderBy?: string,
    orderDir?: 'ASC' | 'DESC',
    limit?: number,
  ): Promise<unknown> {
    return this.tags.getNotesByTagName(
      tagName,
      fields,
      orderBy,
      orderDir,
      limit,
    );
  }

  // Resource methods
  async listAllResources(
    fields?: string,
    orderBy?: string,
    orderDir?: 'ASC' | 'DESC',
    limit?: number,
  ): Promise<unknown> {
    return this.resources.listAllResources(fields, orderBy, orderDir, limit);
  }

  async getResourceMetadata(
    resourceId: string,
    fields?: string,
  ): Promise<unknown> {
    return this.resources.getResourceMetadata(resourceId, fields);
  }

  async getNoteResources(
    noteId: string,
    fields?: string,
    orderBy?: string,
    orderDir?: 'ASC' | 'DESC',
    limit?: number,
  ): Promise<unknown> {
    return this.resources.getNoteResources(
      noteId,
      fields,
      orderBy,
      orderDir,
      limit,
    );
  }

  async getResourceNotes(
    resourceId: string,
    fields?: string,
    orderBy?: string,
    orderDir?: 'ASC' | 'DESC',
    limit?: number,
  ): Promise<unknown> {
    return this.resources.getResourceNotes(
      resourceId,
      fields,
      orderBy,
      orderDir,
      limit,
    );
  }

  async downloadResource(resourceId: string): Promise<Buffer> {
    return this.resources.downloadResource(resourceId);
  }

  async downloadResourceToFile(
    resourceId: string,
    outputPath: string,
  ): Promise<void> {
    return this.resources.downloadResourceToFile(resourceId, outputPath);
  }

  async uploadResource(
    filePath: string,
    title: string,
    mimeType: string,
  ): Promise<unknown> {
    return this.resources.uploadResource(filePath, title, mimeType);
  }

  async updateResourceWithFile(
    resourceId: string,
    filePath: string,
    updates: { title?: string; mime?: string },
  ): Promise<unknown> {
    return this.resources.updateResourceWithFile(resourceId, filePath, updates);
  }

  async updateResourceMetadata(
    resourceId: string,
    updates: { title?: string },
  ): Promise<unknown> {
    return this.resources.updateResourceMetadata(resourceId, updates);
  }

  async deleteResource(resourceId: string): Promise<void> {
    return this.resources.deleteResource(resourceId);
  }

  // Revision methods
  async listAllRevisions(
    fields?: string,
    orderBy?: string,
    orderDir?: 'ASC' | 'DESC',
    limit?: number,
  ): Promise<unknown> {
    return this.revisions.listAllRevisions(fields, orderBy, orderDir, limit);
  }

  async getRevision(revisionId: string, fields?: string): Promise<unknown> {
    return this.revisions.getRevision(revisionId, fields);
  }
}
