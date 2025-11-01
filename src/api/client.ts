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
}
