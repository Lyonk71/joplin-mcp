#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { homedir } from 'os';
import { join } from 'path';
import { existsSync, readFileSync } from 'fs';

/**
 * Joplin API paginated response format
 */
interface PaginatedResponse<T> {
  items: T[];
  has_more: boolean;
}

/**
 * Auto-discover Joplin API token from settings.json
 */
export function discoverJoplinToken(): string | null {
  try {
    // Determine settings path based on OS
    let settingsPath: string;
    const platform = process.platform;

    if (platform === 'darwin') {
      // macOS
      settingsPath = join(
        homedir(),
        'Library',
        'Application Support',
        'joplin-desktop',
        'settings.json',
      );
    } else if (platform === 'win32') {
      // Windows
      settingsPath = join(
        process.env.APPDATA || '',
        'joplin-desktop',
        'settings.json',
      );
    } else {
      // Linux and others
      settingsPath = join(
        homedir(),
        '.config',
        'joplin-desktop',
        'settings.json',
      );
    }

    // Check if settings file exists
    if (!existsSync(settingsPath)) {
      console.error(`[Info] Joplin settings not found at: ${settingsPath}`);
      return null;
    }

    // Read and parse settings.json
    const settingsContent = readFileSync(settingsPath, 'utf-8');
    const settings = JSON.parse(settingsContent);

    if (!settings['api.token']) {
      console.error('[Info] API token not found in Joplin settings');
      console.error(
        '[Info] Make sure Web Clipper is enabled in Joplin settings',
      );
      return null;
    }

    const token = settings['api.token'];
    console.error('[Info] Successfully auto-discovered Joplin API token');
    return token;
  } catch (error) {
    console.error(
      '[Warning] Failed to auto-discover Joplin token:',
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/**
 * HTTP client for Joplin Data API
 */
export class JoplinApiClient {
  private baseUrl: string;
  private token: string;

  constructor() {
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
    this.baseUrl = `http://localhost:${port}`;

    // Try to get token from: 1) env var, 2) auto-discovery
    this.token = process.env.JOPLIN_TOKEN || discoverJoplinToken() || '';

    if (!this.token) {
      console.error('[Error] Could not find Joplin API token');
      console.error('[Info] Please ensure:');
      console.error('  1. Joplin desktop app is installed');
      console.error('  2. Web Clipper is enabled in Settings → Web Clipper');
      console.error(
        '[Info] Alternatively, set JOPLIN_TOKEN environment variable',
      );
    }
  }

  private async request(
    method: string,
    endpoint: string,
    body?: Record<string, unknown>,
  ): Promise<unknown> {
    const url = new URL(endpoint, this.baseUrl);
    url.searchParams.append('token', this.token);

    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url.toString(), options);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Joplin API error (${response.status}): ${errorText}`);
      }

      // Handle empty responses (like DELETE)
      const text = await response.text();
      return text ? JSON.parse(text) : null;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to connect to Joplin: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Helper method to handle paginated API requests
   * Automatically fetches all pages and aggregates results
   */
  private async paginatedRequest<T>(
    endpoint: string,
    limit = 100,
  ): Promise<T[]> {
    const allItems: T[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      // Add pagination parameters to endpoint
      const separator = endpoint.includes('?') ? '&' : '?';
      const paginatedEndpoint = `${endpoint}${separator}limit=${limit}&page=${page}`;

      const response = (await this.request(
        'GET',
        paginatedEndpoint,
      )) as PaginatedResponse<T>;

      if (!response) {
        throw new Error(
          `Unexpected empty response from paginated endpoint: ${paginatedEndpoint}`,
        );
      }

      // Aggregate items from this page
      if (response.items && Array.isArray(response.items)) {
        allItems.push(...response.items);
      }

      // Check if there are more pages
      hasMore = response.has_more === true;
      page++;
    }

    return allItems;
  }

  // Test connection
  async ping(): Promise<string> {
    return this.request('GET', '/ping') as Promise<string>;
  }

  // Notebook (Folder) operations
  async listNotebooks(
    fields?: string,
    orderBy?: string,
    orderDir?: 'ASC' | 'DESC',
    limit?: number,
  ): Promise<unknown> {
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

  async getNotebook(notebookId: string, fields?: string): Promise<unknown> {
    const fieldsParam =
      fields ||
      'id,title,parent_id,created_time,updated_time,user_created_time,user_updated_time';
    return this.request('GET', `/folders/${notebookId}?fields=${fieldsParam}`);
  }

  async createNotebook(title: string, parentId?: string): Promise<unknown> {
    const body: Record<string, unknown> = { title };
    if (parentId) body.parent_id = parentId;
    return this.request('POST', '/folders', body);
  }

  async getNotebookNotes(
    notebookId: string,
    fields?: string,
    orderBy?: string,
    orderDir?: 'ASC' | 'DESC',
    limit?: number,
  ): Promise<unknown> {
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
  ): Promise<unknown> {
    return this.request('PUT', `/folders/${notebookId}`, updates);
  }

  async renameNotebook(notebookId: string, newTitle: string): Promise<unknown> {
    return this.updateNotebook(notebookId, { title: newTitle });
  }

  async deleteNotebook(notebookId: string): Promise<unknown> {
    return this.request('DELETE', `/folders/${notebookId}`);
  }

  // Note operations
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
    if (tags) {
      await this.addTagsToNote(note.id, tags);
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

  // Tag operations

  /**
   * Find an existing tag by name or create it if it doesn't exist
   * @returns Tag ID
   */
  private async findOrCreateTag(tagName: string): Promise<string> {
    // Search for existing tag by exact name (searchNotes now returns items array directly)
    const items = (await this.searchNotes(tagName, 'tag')) as Array<{
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
    // Parse comma-separated tags
    const tags = tagNames
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t);

    // For each tag name, find it and remove from note
    for (const tagName of tags) {
      // searchNotes now returns items array directly
      const items = (await this.searchNotes(tagName, 'tag')) as Array<{
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
    // Find tag by old name
    const tags = (await this.searchNotes(oldName, 'tag')) as Array<{
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
    // Search for tag by exact name
    const tags = (await this.searchNotes(tagName, 'tag')) as Array<{
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

  // Resource operations
  /**
   * List all resources (file attachments) globally
   */
  async listAllResources(
    fields?: string,
    orderBy?: string,
    orderDir?: 'ASC' | 'DESC',
    limit?: number,
  ): Promise<unknown> {
    const fieldsParam =
      fields ||
      'id,title,mime,filename,size,created_time,updated_time,file_extension,ocr_text,ocr_status';

    let endpoint = `/resources?fields=${fieldsParam}`;
    if (orderBy) {
      endpoint += `&order_by=${orderBy}`;
    }
    if (orderDir) {
      endpoint += `&order_dir=${orderDir}`;
    }

    return this.paginatedRequest(endpoint, limit);
  }

  /**
   * Get metadata for a specific resource
   */
  async getResourceMetadata(
    resourceId: string,
    fields?: string,
  ): Promise<unknown> {
    const fieldsParam =
      fields ||
      'id,title,mime,filename,size,file_extension,created_time,updated_time,blob_updated_time,is_shared,share_id,ocr_text,ocr_status';

    return this.request(
      'GET',
      `/resources/${resourceId}?fields=${fieldsParam}`,
    );
  }

  /**
   * Get all resources (attachments) for a specific note
   */
  async getNoteResources(
    noteId: string,
    fields?: string,
    orderBy?: string,
    orderDir?: 'ASC' | 'DESC',
    limit?: number,
  ): Promise<unknown> {
    const fieldsParam =
      fields ||
      'id,title,mime,filename,size,file_extension,created_time,updated_time';

    let endpoint = `/notes/${noteId}/resources?fields=${fieldsParam}`;
    if (orderBy) {
      endpoint += `&order_by=${orderBy}`;
    }
    if (orderDir) {
      endpoint += `&order_dir=${orderDir}`;
    }
    return this.paginatedRequest(endpoint, limit);
  }

  /**
   * Get all notes that use a specific resource (reverse lookup)
   */
  async getResourceNotes(
    resourceId: string,
    fields?: string,
    orderBy?: string,
    orderDir?: 'ASC' | 'DESC',
    limit?: number,
  ): Promise<unknown> {
    const fieldsParam =
      fields || 'id,title,parent_id,created_time,updated_time';

    let endpoint = `/resources/${resourceId}/notes?fields=${fieldsParam}`;
    if (orderBy) {
      endpoint += `&order_by=${orderBy}`;
    }
    if (orderDir) {
      endpoint += `&order_dir=${orderDir}`;
    }
    return this.paginatedRequest(endpoint, limit);
  }

  /**
   * Download a resource file
   */
  async downloadResource(resourceId: string): Promise<Buffer> {
    const url = new URL(`/resources/${resourceId}/file`, this.baseUrl);
    url.searchParams.append('token', this.token);

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(`Failed to download resource: ${response.statusText}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }

  /**
   * Download a resource to a file
   */
  async downloadResourceToFile(
    resourceId: string,
    outputPath: string,
  ): Promise<void> {
    const fs = await import('fs');
    const buffer = await this.downloadResource(resourceId);
    fs.writeFileSync(outputPath, buffer);
  }

  /**
   * Upload a new resource
   */
  async uploadResource(
    filePath: string,
    title: string,
    mimeType: string,
  ): Promise<unknown> {
    const fs = await import('fs');
    const FormData = (await import('form-data')).default;

    const formData = new FormData();

    // Add props as JSON
    formData.append('props', JSON.stringify({ title, mime: mimeType }));

    // Add file data
    const fileStream = fs.createReadStream(filePath);
    formData.append('data', fileStream);

    // Make request with FormData
    const url = new URL('/resources', this.baseUrl);
    url.searchParams.append('token', this.token);

    const response = await fetch(url.toString(), {
      method: 'POST',
      body: formData as unknown as BodyInit,
      headers: formData.getHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to upload resource: ${errorText}`);
    }

    return response.json();
  }

  /**
   * Update a resource with new file content
   */
  async updateResourceWithFile(
    resourceId: string,
    filePath: string,
    updates: { title?: string; mime?: string },
  ): Promise<unknown> {
    const fs = await import('fs');
    const FormData = (await import('form-data')).default;

    const formData = new FormData();

    // Add props if provided
    if (updates && Object.keys(updates).length > 0) {
      formData.append('props', JSON.stringify(updates));
    }

    // Add file data
    const fileStream = fs.createReadStream(filePath);
    formData.append('data', fileStream);

    const url = new URL(`/resources/${resourceId}`, this.baseUrl);
    url.searchParams.append('token', this.token);

    const response = await fetch(url.toString(), {
      method: 'PUT',
      body: formData as unknown as BodyInit,
      headers: formData.getHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to update resource: ${errorText}`);
    }

    return response.json();
  }

  /**
   * Update resource metadata only (without file)
   */
  async updateResourceMetadata(
    resourceId: string,
    updates: { title?: string },
  ): Promise<unknown> {
    return this.request('PUT', `/resources/${resourceId}`, updates);
  }

  /**
   * Delete a resource
   */
  async deleteResource(resourceId: string): Promise<void> {
    await this.request('DELETE', `/resources/${resourceId}`);
  }

  // Revision operations
  /**
   * List all revisions (across all notes)
   */
  async listAllRevisions(
    fields?: string,
    orderBy?: string,
    orderDir?: 'ASC' | 'DESC',
    limit?: number,
  ): Promise<unknown> {
    const fieldsParam =
      fields ||
      'id,parent_id,item_type,item_id,item_updated_time,created_time,updated_time';
    let endpoint = `/revisions?fields=${fieldsParam}`;
    if (orderBy) {
      endpoint += `&order_by=${orderBy}`;
    }
    if (orderDir) {
      endpoint += `&order_dir=${orderDir}`;
    }
    return this.paginatedRequest(endpoint, limit);
  }

  /**
   * Get a specific revision by ID
   */
  async getRevision(revisionId: string, fields?: string): Promise<unknown> {
    const fieldsParam =
      fields ||
      'id,parent_id,item_type,item_id,item_updated_time,title_diff,body_diff,metadata_diff,encryption_applied,encryption_cipher_text,created_time,updated_time';
    return this.request(
      'GET',
      `/revisions/${revisionId}?fields=${fieldsParam}`,
    );
  }
}

export class JoplinServer {
  private server: Server;
  private apiClient: JoplinApiClient;

  constructor() {
    this.server = new Server(
      {
        name: 'joplin-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.apiClient = new JoplinApiClient();
    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          // Notebook Management
          {
            name: 'list_notebooks',
            description:
              'List all notebooks (folders) in Joplin. Returns notebook ID, title, parent ID, and timestamps. Optionally sort results.',
            inputSchema: {
              type: 'object',
              properties: {
                fields: {
                  type: 'string',
                  description:
                    'Optional: Comma-separated list of fields to return (e.g., "id,title,updated_time"). Default: id,title,parent_id,created_time,updated_time,user_created_time,user_updated_time',
                },
                order_by: {
                  type: 'string',
                  description:
                    'Field to sort by: title, updated_time, created_time, user_updated_time, user_created_time (default: updated_time)',
                },
                order_dir: {
                  type: 'string',
                  enum: ['ASC', 'DESC'],
                  description:
                    'Sort direction: ASC (ascending) or DESC (descending). Default: DESC. Example: order_by=title, order_dir=ASC for alphabetical',
                },
                limit: {
                  type: 'number',
                  description:
                    'Optional: Maximum number of items to return (default: 100)',
                },
              },
            },
          },
          {
            name: 'create_notebook',
            description:
              'Create a new notebook in Joplin. Optionally nest it under a parent notebook.',
            inputSchema: {
              type: 'object',
              properties: {
                title: {
                  type: 'string',
                  description: 'The title of the new notebook',
                },
                parent_id: {
                  type: 'string',
                  description:
                    'Optional: ID of the parent notebook for nesting',
                },
              },
              required: ['title'],
            },
          },
          {
            name: 'get_notebook_notes',
            description:
              'Get all notes from a specific notebook. Returns note titles, IDs, and metadata. Optionally sort results.',
            inputSchema: {
              type: 'object',
              properties: {
                notebook_id: {
                  type: 'string',
                  description: 'The ID of the notebook',
                },
                fields: {
                  type: 'string',
                  description:
                    'Optional: Comma-separated list of fields to return (e.g., "id,title,updated_time"). Default: id,title,body,parent_id,created_time,updated_time,user_created_time,user_updated_time,is_todo,todo_completed',
                },
                order_by: {
                  type: 'string',
                  description:
                    'Field to sort by: title, updated_time, created_time, user_updated_time, user_created_time (default: updated_time)',
                },
                order_dir: {
                  type: 'string',
                  enum: ['ASC', 'DESC'],
                  description:
                    'Sort direction: ASC (ascending) or DESC (descending). Default: DESC',
                },
                limit: {
                  type: 'number',
                  description:
                    'Optional: Maximum number of items to return (default: 100)',
                },
              },
              required: ['notebook_id'],
            },
          },
          {
            name: 'update_notebook',
            description:
              'Update notebook properties (rename or move to different parent).',
            inputSchema: {
              type: 'object',
              properties: {
                notebook_id: {
                  type: 'string',
                  description: 'The ID of the notebook to update',
                },
                title: {
                  type: 'string',
                  description: 'Optional: New title for the notebook',
                },
                parent_id: {
                  type: 'string',
                  description: 'Optional: New parent notebook ID (for nesting)',
                },
              },
              required: ['notebook_id'],
            },
          },
          {
            name: 'delete_notebook',
            description: 'Delete a notebook. The notebook must be empty.',
            inputSchema: {
              type: 'object',
              properties: {
                notebook_id: {
                  type: 'string',
                  description: 'The ID of the notebook to delete',
                },
              },
              required: ['notebook_id'],
            },
          },
          {
            name: 'get_notebook_by_id',
            description:
              'Get a specific notebook by ID. Returns notebook title, parent_id, and timestamps.',
            inputSchema: {
              type: 'object',
              properties: {
                notebook_id: {
                  type: 'string',
                  description: 'The ID of the notebook',
                },
                fields: {
                  type: 'string',
                  description:
                    'Optional: Comma-separated list of fields to return (e.g., "id,title,updated_time"). Default: id,title,parent_id,created_time,updated_time,user_created_time,user_updated_time',
                },
              },
              required: ['notebook_id'],
            },
          },
          {
            name: 'move_note_to_notebook',
            description: 'Move a note to a different notebook.',
            inputSchema: {
              type: 'object',
              properties: {
                note_id: {
                  type: 'string',
                  description: 'The ID of the note to move',
                },
                notebook_id: {
                  type: 'string',
                  description: 'The ID of the destination notebook',
                },
              },
              required: ['note_id', 'notebook_id'],
            },
          },

          // Note Operations
          {
            name: 'list_all_notes',
            description:
              'List all notes across all notebooks. Returns note titles, IDs, content, and metadata. Optionally include deleted notes, customize fields, and sort results.',
            inputSchema: {
              type: 'object',
              properties: {
                fields: {
                  type: 'string',
                  description:
                    'Optional: Comma-separated list of fields to return (e.g., "id,title,updated_time"). Default: id,title,body,parent_id,created_time,updated_time,user_created_time,user_updated_time,is_todo,todo_completed',
                },
                include_deleted: {
                  type: 'boolean',
                  description: 'Include deleted notes (default: false)',
                },
                order_by: {
                  type: 'string',
                  description:
                    'Field to sort by: title, updated_time, created_time, user_updated_time, user_created_time (default: updated_time)',
                },
                order_dir: {
                  type: 'string',
                  enum: ['ASC', 'DESC'],
                  description:
                    'Sort direction: ASC (ascending) or DESC (descending). Default: DESC. Example: order_by=updated_time, order_dir=DESC for most recent first',
                },
                limit: {
                  type: 'number',
                  description:
                    'Optional: Maximum number of items to return (default: 100)',
                },
              },
            },
          },
          {
            name: 'search_notes',
            description: `Search for notes using Joplin's powerful query syntax.

Basic syntax:
- Single/multiple words: "linux kernel" (AND logic by default)
- Phrases: "shopping list" (exact match)
- Wildcards: "swim*" (prefix matching)
- Exclusion: "-spam" (exclude term)

Field-specific filters:
- title:TERM - Search in title only
- body:TERM - Search in body only
- tag:TAG - Filter by tag (supports wildcards: tag:proj*)
- notebook:NAME - Filter by notebook name
- resource:MIME - Filter by attachment type (resource:image/*, resource:application/pdf)

Date filters (formats: YYYYMMDD, YYYYMM, YYYY, or relative like day-7, month-1, year-0):
- created:DATE - Filter by creation date
- updated:DATE - Filter by update date
- due:DATE - Filter by todo due date

Type filters:
- type:note|todo - Filter by item type
- iscompleted:0|1 - Filter completed/incomplete todos

Boolean logic:
- any:1 - Use OR instead of AND (example: "any:1 arch ubuntu" finds either)

Examples:
- Find Linux tutorials: "title:linux tag:tutorial"
- Recent work notes: "tag:work updated:month-1"
- Notes with images: "resource:image/*"
- Exclude archived: "project -tag:archived"
- Either/or search: "any:1 kubernetes docker"`,
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query (supports wildcards with *)',
                },
                type: {
                  type: 'string',
                  description: 'Optional: Filter by type (note, folder, tag)',
                },
              },
              required: ['query'],
            },
          },
          {
            name: 'get_note',
            description:
              'Get the full content of a specific note by ID. Returns title, body (content), notebook, timestamps, and tags.',
            inputSchema: {
              type: 'object',
              properties: {
                note_id: {
                  type: 'string',
                  description: 'The ID of the note',
                },
              },
              required: ['note_id'],
            },
          },
          {
            name: 'create_note',
            description:
              'Create a new note with title and body content. Can create regular notes or todos with due dates. Optionally specify notebook and tags.',
            inputSchema: {
              type: 'object',
              properties: {
                title: {
                  type: 'string',
                  description: 'The title of the note',
                },
                body: {
                  type: 'string',
                  description: 'The content of the note (Markdown format)',
                },
                notebook_id: {
                  type: 'string',
                  description:
                    'Optional: ID of the notebook to place the note in (defaults to default notebook)',
                },
                tags: {
                  type: 'string',
                  description: 'Optional: Comma-separated list of tag names',
                },
                is_todo: {
                  type: 'number',
                  description:
                    'Optional: Set to 1 to create a todo item, 0 for regular note (default: 0)',
                },
                todo_due: {
                  type: 'number',
                  description:
                    'Optional: Unix timestamp (in milliseconds) for when the todo is due. Only applicable when is_todo=1',
                },
                todo_completed: {
                  type: 'number',
                  description:
                    'Optional: Unix timestamp (in milliseconds) for when the todo was completed. Only applicable when is_todo=1. Set to 0 for incomplete',
                },
              },
              required: ['title', 'body'],
            },
          },
          {
            name: 'update_note',
            description:
              'Update an existing note. Can update title, body, notebook, or convert to/from todo. Use add_tags_to_note or remove_tags_from_note to modify tags.',
            inputSchema: {
              type: 'object',
              properties: {
                note_id: {
                  type: 'string',
                  description: 'The ID of the note to update',
                },
                title: {
                  type: 'string',
                  description: 'Optional: New title for the note',
                },
                body: {
                  type: 'string',
                  description:
                    'Optional: New body content (replaces existing content)',
                },
                notebook_id: {
                  type: 'string',
                  description: 'Optional: Move note to a different notebook',
                },
                is_todo: {
                  type: 'number',
                  description:
                    'Optional: Set to 1 to convert to todo, 0 to convert to regular note',
                },
                todo_due: {
                  type: 'number',
                  description:
                    'Optional: Unix timestamp (in milliseconds) for when the todo is due. Only applicable when is_todo=1',
                },
                todo_completed: {
                  type: 'number',
                  description:
                    'Optional: Unix timestamp (in milliseconds) for when the todo was completed. Set to 0 to mark incomplete, or a timestamp to mark complete. Only applicable when is_todo=1',
                },
              },
              required: ['note_id'],
            },
          },
          {
            name: 'append_to_note',
            description: 'Append content to the end of an existing note.',
            inputSchema: {
              type: 'object',
              properties: {
                note_id: {
                  type: 'string',
                  description: 'The ID of the note',
                },
                content: {
                  type: 'string',
                  description: 'Content to append',
                },
              },
              required: ['note_id', 'content'],
            },
          },
          {
            name: 'prepend_to_note',
            description:
              'Prepend content to the beginning of an existing note.',
            inputSchema: {
              type: 'object',
              properties: {
                note_id: {
                  type: 'string',
                  description: 'The ID of the note',
                },
                content: {
                  type: 'string',
                  description: 'Content to prepend',
                },
              },
              required: ['note_id', 'content'],
            },
          },
          {
            name: 'delete_note',
            description: 'Delete a note (moves it to the trash).',
            inputSchema: {
              type: 'object',
              properties: {
                note_id: {
                  type: 'string',
                  description: 'The ID of the note to delete',
                },
              },
              required: ['note_id'],
            },
          },

          // Tag Management
          {
            name: 'add_tags_to_note',
            description:
              "Add tags to an existing note. Tags will be created if they don't exist. Tags are added to any existing tags (not replaced).",
            inputSchema: {
              type: 'object',
              properties: {
                note_id: {
                  type: 'string',
                  description: 'The ID of the note',
                },
                tags: {
                  type: 'string',
                  description: 'Comma-separated list of tag names to add',
                },
              },
              required: ['note_id', 'tags'],
            },
          },
          {
            name: 'remove_tags_from_note',
            description:
              "Remove specific tags from a note. Silently ignores tags that don't exist or aren't on the note.",
            inputSchema: {
              type: 'object',
              properties: {
                note_id: {
                  type: 'string',
                  description: 'The ID of the note',
                },
                tags: {
                  type: 'string',
                  description: 'Comma-separated list of tag names to remove',
                },
              },
              required: ['note_id', 'tags'],
            },
          },
          {
            name: 'list_tags',
            description:
              'List all tags in Joplin. Returns tag IDs, names, and timestamps. Optionally sort results.',
            inputSchema: {
              type: 'object',
              properties: {
                fields: {
                  type: 'string',
                  description:
                    'Optional: Comma-separated list of fields to return (e.g., "id,title,updated_time"). Default: id,title,created_time,updated_time',
                },
                order_by: {
                  type: 'string',
                  description:
                    'Field to sort by: title, updated_time, created_time (default: updated_time)',
                },
                order_dir: {
                  type: 'string',
                  enum: ['ASC', 'DESC'],
                  description:
                    'Sort direction: ASC (ascending) or DESC (descending). Default: DESC. Example: order_by=title, order_dir=ASC for alphabetical',
                },
                limit: {
                  type: 'number',
                  description:
                    'Optional: Maximum number of items to return (default: 100)',
                },
              },
            },
          },
          {
            name: 'rename_tag',
            description:
              'Rename a tag. All notes with this tag will show the new name. Provide either tag_id or current_name.',
            inputSchema: {
              type: 'object',
              properties: {
                tag_id: {
                  type: 'string',
                  description:
                    'The ID of the tag to rename (use this OR current_name)',
                },
                current_name: {
                  type: 'string',
                  description: 'Current name of the tag (use this OR tag_id)',
                },
                new_name: {
                  type: 'string',
                  description: 'New name for the tag',
                },
              },
              required: ['new_name'],
            },
          },
          {
            name: 'delete_tag',
            description:
              'Delete a tag from Joplin. All notes will no longer have this tag.',
            inputSchema: {
              type: 'object',
              properties: {
                tag_id: {
                  type: 'string',
                  description: 'The ID of the tag to delete',
                },
              },
              required: ['tag_id'],
            },
          },
          {
            name: 'get_tag_by_id',
            description:
              'Get a specific tag by ID. Returns tag title and timestamps.',
            inputSchema: {
              type: 'object',
              properties: {
                tag_id: {
                  type: 'string',
                  description: 'The ID of the tag',
                },
                fields: {
                  type: 'string',
                  description:
                    'Optional: Comma-separated list of fields to return (e.g., "id,title,updated_time"). Default: id,title,created_time,updated_time',
                },
              },
              required: ['tag_id'],
            },
          },
          {
            name: 'get_notes_by_tag',
            description:
              'Get all notes that have a specific tag. Provide either tag_id or tag_name. Optionally sort results.',
            inputSchema: {
              type: 'object',
              properties: {
                tag_id: {
                  type: 'string',
                  description: 'The ID of the tag (use this OR tag_name)',
                },
                tag_name: {
                  type: 'string',
                  description: 'The name of the tag (use this OR tag_id)',
                },
                fields: {
                  type: 'string',
                  description:
                    'Optional: Comma-separated list of fields to return (e.g., "id,title,updated_time"). Default: id,title,body,parent_id,created_time,updated_time,user_created_time,user_updated_time,is_todo,todo_completed',
                },
                order_by: {
                  type: 'string',
                  description:
                    'Field to sort by: title, updated_time, created_time, user_updated_time, user_created_time (default: updated_time)',
                },
                order_dir: {
                  type: 'string',
                  enum: ['ASC', 'DESC'],
                  description:
                    'Sort direction: ASC (ascending) or DESC (descending). Default: DESC',
                },
                limit: {
                  type: 'number',
                  description:
                    'Optional: Maximum number of items to return (default: 100)',
                },
              },
            },
          },

          // Resource Operations
          {
            name: 'list_all_resources',
            description:
              'List all file attachments (images, PDFs, etc.) across all notes. Returns metadata including OCR text if available. Optionally sort results.',
            inputSchema: {
              type: 'object',
              properties: {
                fields: {
                  type: 'string',
                  description:
                    'Optional: Comma-separated list of fields to return (e.g., "id,title,updated_time"). Default: id,title,mime,filename,size,created_time,updated_time,file_extension,ocr_text,ocr_status',
                },
                order_by: {
                  type: 'string',
                  description:
                    'Field to sort by: title, updated_time, created_time, size (default: updated_time)',
                },
                order_dir: {
                  type: 'string',
                  enum: ['ASC', 'DESC'],
                  description:
                    'Sort direction: ASC (ascending) or DESC (descending). Default: DESC. Example: order_by=size, order_dir=DESC for largest first',
                },
                limit: {
                  type: 'number',
                  description:
                    'Optional: Maximum number of items to return (default: 100)',
                },
              },
            },
          },
          {
            name: 'get_resource_metadata',
            description:
              'Get metadata for a specific resource/attachment including size, MIME type, OCR text, and timestamps.',
            inputSchema: {
              type: 'object',
              properties: {
                resource_id: {
                  type: 'string',
                  description: 'The ID of the resource',
                },
              },
              required: ['resource_id'],
            },
          },
          {
            name: 'get_note_attachments',
            description:
              'List all file attachments in a specific note. Optionally sort results.',
            inputSchema: {
              type: 'object',
              properties: {
                note_id: {
                  type: 'string',
                  description: 'The ID of the note',
                },
                fields: {
                  type: 'string',
                  description:
                    'Optional: Comma-separated list of fields to return (e.g., "id,title,updated_time"). Default: id,title,mime,filename,size,file_extension,created_time,updated_time',
                },
                order_by: {
                  type: 'string',
                  description:
                    'Field to sort by: title, updated_time, created_time, size (default: updated_time)',
                },
                order_dir: {
                  type: 'string',
                  enum: ['ASC', 'DESC'],
                  description:
                    'Sort direction: ASC (ascending) or DESC (descending). Default: DESC',
                },
                limit: {
                  type: 'number',
                  description:
                    'Optional: Maximum number of items to return (default: 100)',
                },
              },
              required: ['note_id'],
            },
          },
          {
            name: 'get_resource_notes',
            description:
              'Find all notes that reference/use a specific resource/attachment. Essential before deleting a resource. Optionally sort results.',
            inputSchema: {
              type: 'object',
              properties: {
                resource_id: {
                  type: 'string',
                  description: 'The ID of the resource',
                },
                fields: {
                  type: 'string',
                  description:
                    'Optional: Comma-separated list of fields to return (e.g., "id,title,updated_time"). Default: id,title,parent_id,created_time,updated_time',
                },
                order_by: {
                  type: 'string',
                  description:
                    'Field to sort by: title, updated_time, created_time (default: updated_time)',
                },
                order_dir: {
                  type: 'string',
                  enum: ['ASC', 'DESC'],
                  description:
                    'Sort direction: ASC (ascending) or DESC (descending). Default: DESC',
                },
                limit: {
                  type: 'number',
                  description:
                    'Optional: Maximum number of items to return (default: 100)',
                },
              },
              required: ['resource_id'],
            },
          },
          {
            name: 'download_attachment',
            description:
              'Download a file attachment from Joplin by resource ID. Saves to specified path.',
            inputSchema: {
              type: 'object',
              properties: {
                resource_id: {
                  type: 'string',
                  description: 'The ID of the resource to download',
                },
                output_path: {
                  type: 'string',
                  description: 'Local file path to save the downloaded file',
                },
              },
              required: ['resource_id', 'output_path'],
            },
          },
          {
            name: 'upload_attachment',
            description:
              'Upload a file attachment (image, PDF, etc.) to Joplin. Returns resource ID that can be referenced in notes.',
            inputSchema: {
              type: 'object',
              properties: {
                file_path: {
                  type: 'string',
                  description: 'Local file path to upload',
                },
                title: {
                  type: 'string',
                  description: 'Filename to use in Joplin',
                },
                mime_type: {
                  type: 'string',
                  description: 'MIME type (e.g., image/png, application/pdf)',
                },
              },
              required: ['file_path', 'title', 'mime_type'],
            },
          },
          {
            name: 'update_resource',
            description:
              'Update a resource/attachment. Can update file content, metadata (title), or both.',
            inputSchema: {
              type: 'object',
              properties: {
                resource_id: {
                  type: 'string',
                  description: 'The ID of the resource to update',
                },
                file_path: {
                  type: 'string',
                  description: 'Optional: New file to replace existing content',
                },
                title: {
                  type: 'string',
                  description: 'Optional: New title for the resource',
                },
                mime_type: {
                  type: 'string',
                  description: 'Optional: New MIME type (only with file_path)',
                },
              },
              required: ['resource_id'],
            },
          },
          {
            name: 'delete_resource',
            description:
              'Delete a resource/attachment from Joplin. WARNING: This will break references in notes that use this resource. Use get_resource_notes first to check usage.',
            inputSchema: {
              type: 'object',
              properties: {
                resource_id: {
                  type: 'string',
                  description: 'The ID of the resource to delete',
                },
              },
              required: ['resource_id'],
            },
          },

          // Revision Operations
          {
            name: 'list_all_revisions',
            description:
              'List all revisions (version history) across all notes. Returns revision IDs, item_id (note ID), timestamps, and change metadata. Filter by item_id after retrieval to find revisions for a specific note. Optionally sort results.',
            inputSchema: {
              type: 'object',
              properties: {
                fields: {
                  type: 'string',
                  description:
                    'Optional: Comma-separated list of fields to return. Default: id,parent_id,item_type,item_id,item_updated_time,created_time,updated_time',
                },
                order_by: {
                  type: 'string',
                  description:
                    'Field to sort by: created_time, item_updated_time (default: created_time)',
                },
                order_dir: {
                  type: 'string',
                  enum: ['ASC', 'DESC'],
                  description:
                    'Sort direction: ASC (oldest first) or DESC (newest first). Default: DESC',
                },
                limit: {
                  type: 'number',
                  description:
                    'Optional: Maximum number of items to return (default: 100)',
                },
              },
            },
          },
          {
            name: 'get_revision',
            description:
              'Get details of a specific revision by ID. Returns the diff showing what changed (title_diff, body_diff, metadata_diff) and timestamps. Useful for viewing or restoring previous versions. Note: To find revision IDs for a note, first use list_all_revisions and filter by item_id.',
            inputSchema: {
              type: 'object',
              properties: {
                revision_id: {
                  type: 'string',
                  description: 'The ID of the revision',
                },
                fields: {
                  type: 'string',
                  description:
                    'Optional: Comma-separated list of fields to return. Default: id,parent_id,item_type,item_id,item_updated_time,title_diff,body_diff,metadata_diff,encryption_applied,encryption_cipher_text,created_time,updated_time',
                },
              },
              required: ['revision_id'],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (!args) {
        throw new Error('Missing arguments');
      }

      try {
        switch (name) {
          // Notebook Management
          case 'list_notebooks': {
            const result = await this.apiClient.listNotebooks(
              args.fields as string | undefined,
              args.order_by as string | undefined,
              args.order_dir as 'ASC' | 'DESC' | undefined,
              args.limit as number | undefined,
            );
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'create_notebook': {
            const result = (await this.apiClient.createNotebook(
              args.title as string,
              args.parent_id as string | undefined,
            )) as { title: string; id: string };
            return {
              content: [
                {
                  type: 'text',
                  text: `Created notebook: ${result.title} (ID: ${result.id})`,
                },
              ],
            };
          }

          case 'get_notebook_notes': {
            const result = await this.apiClient.getNotebookNotes(
              args.notebook_id as string,
              args.fields as string | undefined,
              args.order_by as string | undefined,
              args.order_dir as 'ASC' | 'DESC' | undefined,
              args.limit as number | undefined,
            );
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'update_notebook': {
            const updates: { title?: string; parent_id?: string } = {};
            if (args.title) updates.title = args.title as string;
            if (args.parent_id) updates.parent_id = args.parent_id as string;

            const result = (await this.apiClient.updateNotebook(
              args.notebook_id as string,
              updates,
            )) as { title: string; id: string };

            return {
              content: [
                {
                  type: 'text',
                  text: `Updated notebook: ${result.title} (ID: ${result.id})`,
                },
              ],
            };
          }

          case 'delete_notebook': {
            await this.apiClient.deleteNotebook(args.notebook_id as string);
            return {
              content: [
                {
                  type: 'text',
                  text: `Deleted notebook ${args.notebook_id}`,
                },
              ],
            };
          }

          case 'get_notebook_by_id': {
            const result = await this.apiClient.getNotebook(
              args.notebook_id as string,
              args.fields as string | undefined,
            );
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'move_note_to_notebook': {
            await this.apiClient.moveNoteToNotebook(
              args.note_id as string,
              args.notebook_id as string,
            );
            return {
              content: [
                {
                  type: 'text',
                  text: `Moved note ${args.note_id} to notebook ${args.notebook_id}`,
                },
              ],
            };
          }

          // Note Operations
          case 'list_all_notes': {
            const result = await this.apiClient.listAllNotes(
              args.fields as string | undefined,
              args.include_deleted as boolean | undefined,
              args.order_by as string | undefined,
              args.order_dir as 'ASC' | 'DESC' | undefined,
              args.limit as number | undefined,
            );
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'search_notes': {
            const result = await this.apiClient.searchNotes(
              args.query as string,
              args.type as string | undefined,
            );
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'get_note': {
            const result = await this.apiClient.getNote(args.note_id as string);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'create_note': {
            const result = (await this.apiClient.createNote(
              args.title as string,
              args.body as string,
              args.notebook_id as string | undefined,
              args.tags as string | undefined,
              args.is_todo as number | undefined,
              args.todo_due as number | undefined,
              args.todo_completed as number | undefined,
            )) as { title: string; id: string };
            return {
              content: [
                {
                  type: 'text',
                  text: `Created note: ${result.title} (ID: ${result.id})`,
                },
              ],
            };
          }

          case 'update_note': {
            const updates: Record<string, unknown> = {};
            if (args.title) updates.title = args.title;
            if (args.body) updates.body = args.body;
            if (args.notebook_id) updates.parent_id = args.notebook_id;
            if (args.is_todo !== undefined) updates.is_todo = args.is_todo;
            if (args.todo_due !== undefined) updates.todo_due = args.todo_due;
            if (args.todo_completed !== undefined)
              updates.todo_completed = args.todo_completed;

            const result = (await this.apiClient.updateNote(
              args.note_id as string,
              updates,
            )) as { title: string; id: string };
            return {
              content: [
                {
                  type: 'text',
                  text: `Updated note: ${result.title} (ID: ${result.id})`,
                },
              ],
            };
          }

          case 'append_to_note': {
            await this.apiClient.appendToNote(
              args.note_id as string,
              args.content as string,
            );
            return {
              content: [
                {
                  type: 'text',
                  text: `Appended content to note ${args.note_id}`,
                },
              ],
            };
          }

          case 'prepend_to_note': {
            await this.apiClient.prependToNote(
              args.note_id as string,
              args.content as string,
            );
            return {
              content: [
                {
                  type: 'text',
                  text: `Prepended content to note ${args.note_id}`,
                },
              ],
            };
          }

          case 'delete_note': {
            await this.apiClient.deleteNote(args.note_id as string, false);
            return {
              content: [
                {
                  type: 'text',
                  text: `Moved note to trash: ${args.note_id}`,
                },
              ],
            };
          }

          // Tag Management
          case 'add_tags_to_note': {
            await this.apiClient.addTagsToNote(
              args.note_id as string,
              args.tags as string,
            );
            return {
              content: [
                {
                  type: 'text',
                  text: `Added tags to note ${args.note_id}: ${args.tags}`,
                },
              ],
            };
          }

          case 'remove_tags_from_note': {
            await this.apiClient.removeTagsFromNote(
              args.note_id as string,
              args.tags as string,
            );
            return {
              content: [
                {
                  type: 'text',
                  text: `Removed tags from note ${args.note_id}: ${args.tags}`,
                },
              ],
            };
          }

          case 'list_tags': {
            const result = await this.apiClient.listTags(
              args.fields as string | undefined,
              args.order_by as string | undefined,
              args.order_dir as 'ASC' | 'DESC' | undefined,
              args.limit as number | undefined,
            );
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'rename_tag': {
            if (args.tag_id) {
              await this.apiClient.renameTag(
                args.tag_id as string,
                args.new_name as string,
              );
            } else if (args.current_name) {
              await this.apiClient.renameTagByName(
                args.current_name as string,
                args.new_name as string,
              );
            } else {
              throw new Error('Must provide either tag_id or current_name');
            }

            return {
              content: [
                {
                  type: 'text',
                  text: `Renamed tag to: ${args.new_name}`,
                },
              ],
            };
          }

          case 'delete_tag': {
            await this.apiClient.deleteTag(args.tag_id as string);
            return {
              content: [
                {
                  type: 'text',
                  text: `Deleted tag ${args.tag_id}`,
                },
              ],
            };
          }

          case 'get_tag_by_id': {
            const result = await this.apiClient.getTag(
              args.tag_id as string,
              args.fields as string | undefined,
            );
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'get_notes_by_tag': {
            let result;
            if (args.tag_id) {
              result = await this.apiClient.getTagNotes(
                args.tag_id as string,
                args.fields as string | undefined,
                args.order_by as string | undefined,
                args.order_dir as 'ASC' | 'DESC' | undefined,
                args.limit as number | undefined,
              );
            } else if (args.tag_name) {
              result = await this.apiClient.getNotesByTagName(
                args.tag_name as string,
                args.fields as string | undefined,
                args.order_by as string | undefined,
                args.order_dir as 'ASC' | 'DESC' | undefined,
                args.limit as number | undefined,
              );
            } else {
              throw new Error('Must provide either tag_id or tag_name');
            }

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          // Resource Operations
          case 'list_all_resources': {
            const result = await this.apiClient.listAllResources(
              args.fields as string | undefined,
              args.order_by as string | undefined,
              args.order_dir as 'ASC' | 'DESC' | undefined,
              args.limit as number | undefined,
            );
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'get_resource_metadata': {
            const result = await this.apiClient.getResourceMetadata(
              args.resource_id as string,
            );
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'get_note_attachments': {
            const result = await this.apiClient.getNoteResources(
              args.note_id as string,
              args.fields as string | undefined,
              args.order_by as string | undefined,
              args.order_dir as 'ASC' | 'DESC' | undefined,
              args.limit as number | undefined,
            );
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'get_resource_notes': {
            const result = await this.apiClient.getResourceNotes(
              args.resource_id as string,
              args.fields as string | undefined,
              args.order_by as string | undefined,
              args.order_dir as 'ASC' | 'DESC' | undefined,
              args.limit as number | undefined,
            );
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'download_attachment': {
            await this.apiClient.downloadResourceToFile(
              args.resource_id as string,
              args.output_path as string,
            );
            return {
              content: [
                {
                  type: 'text',
                  text: `Downloaded resource to: ${args.output_path}`,
                },
              ],
            };
          }

          case 'upload_attachment': {
            const result = (await this.apiClient.uploadResource(
              args.file_path as string,
              args.title as string,
              args.mime_type as string,
            )) as { id: string; title: string };

            return {
              content: [
                {
                  type: 'text',
                  text: `Uploaded resource: ${result.title} (ID: ${result.id})`,
                },
              ],
            };
          }

          case 'update_resource': {
            let result;

            if (args.file_path) {
              // Update with new file
              const updates: { title?: string; mime?: string } = {};
              if (args.title) updates.title = args.title as string;
              if (args.mime_type) updates.mime = args.mime_type as string;

              result = (await this.apiClient.updateResourceWithFile(
                args.resource_id as string,
                args.file_path as string,
                updates,
              )) as { title: string; id: string };
            } else if (args.title) {
              // Update metadata only
              result = (await this.apiClient.updateResourceMetadata(
                args.resource_id as string,
                { title: args.title as string },
              )) as { title: string; id: string };
            } else {
              throw new Error(
                'Must provide either file_path or title to update',
              );
            }

            return {
              content: [
                {
                  type: 'text',
                  text: `Updated resource: ${result.title} (ID: ${result.id})`,
                },
              ],
            };
          }

          case 'delete_resource': {
            // Optional: Check for note references first
            const notes = (await this.apiClient.getResourceNotes(
              args.resource_id as string,
            )) as { items: unknown[] } | unknown[];

            const items = Array.isArray(notes)
              ? notes
              : (notes as { items: unknown[] }).items;

            if (items && items.length > 0) {
              return {
                content: [
                  {
                    type: 'text',
                    text: `Warning: This resource is used in ${items.length} note(s). Deleting it will break those references.\n\n${JSON.stringify(notes, null, 2)}`,
                  },
                ],
              };
            }

            await this.apiClient.deleteResource(args.resource_id as string);

            return {
              content: [
                {
                  type: 'text',
                  text: `Deleted resource: ${args.resource_id}`,
                },
              ],
            };
          }

          // Revision Operations
          case 'list_all_revisions': {
            const result = await this.apiClient.listAllRevisions(
              args.fields as string | undefined,
              args.order_by as string | undefined,
              args.order_dir as 'ASC' | 'DESC' | undefined,
              args.limit as number | undefined,
            );
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'get_revision': {
            const result = await this.apiClient.getRevision(
              args.revision_id as string,
              args.fields as string | undefined,
            );
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  private setupErrorHandling() {
    this.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Joplin MCP server running on stdio');

    // Test connection to Joplin
    try {
      await this.apiClient.ping();
      console.error('Successfully connected to Joplin');
    } catch {
      console.error('[Warning] Could not connect to Joplin. Please ensure:');
      console.error('  1. The Joplin desktop application is running.');
      console.error(
        '  2. The Web Clipper service is enabled in Joplin (Settings → Web Clipper).',
      );
      console.error(
        'If auto-discovery of the API token fails, you may also need to set the JOPLIN_TOKEN environment variable manually.',
      );
    }
  }
}

const server = new JoplinServer();
server.run().catch(() => {
  process.exit(1);
});
