import { HttpClient } from './http-client.js';
import type { JoplinResource, JoplinNote } from '../types/joplin.js';

/**
 * Resource (attachment) operations
 */
export class ResourcesApi extends HttpClient {
  /**
   * List all resources (file attachments) globally
   */
  async listAllResources(
    fields?: string,
    orderBy?: string,
    orderDir?: 'ASC' | 'DESC',
    limit?: number,
  ): Promise<JoplinResource[]> {
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
  ): Promise<JoplinResource> {
    const fieldsParam =
      fields ||
      'id,title,mime,filename,size,file_extension,created_time,updated_time,blob_updated_time,is_shared,share_id,ocr_text,ocr_status';

    return this.request(
      'GET',
      `/resources/${resourceId}?fields=${fieldsParam}`,
    ) as Promise<JoplinResource>;
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
  ): Promise<JoplinResource[]> {
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
  ): Promise<JoplinNote[]> {
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
  ): Promise<JoplinResource> {
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
  ): Promise<JoplinResource> {
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
  ): Promise<JoplinResource> {
    return this.request(
      'PUT',
      `/resources/${resourceId}`,
      updates,
    ) as Promise<JoplinResource>;
  }

  /**
   * Delete a resource
   */
  async deleteResource(resourceId: string): Promise<void> {
    await this.request('DELETE', `/resources/${resourceId}`);
  }
}
