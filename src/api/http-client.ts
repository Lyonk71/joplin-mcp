import { PaginatedResponse } from '../types/joplin.js';

/**
 * Base HTTP client for Joplin Data API
 */
export class HttpClient {
  protected baseUrl: string;
  protected token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  protected async request(
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
  protected async paginatedRequest<T>(
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
}
