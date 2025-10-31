import { HttpClient } from './http-client.js';

/**
 * Revision operations
 */
export class RevisionsApi extends HttpClient {
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
