import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { discoverJoplinToken, JoplinApiClient } from './index.js';
import * as fs from 'fs';
import * as os from 'os';

// Mock the fs and os modules
vi.mock('fs');
vi.mock('os');

describe('discoverJoplinToken', () => {
  const originalPlatform = process.platform;
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    // Reset console.error spy
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore original values
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
    });
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('Platform-specific paths', () => {
    it('should use correct path for macOS', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      vi.mocked(os.homedir).mockReturnValue('/Users/testuser');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ 'api.token': 'test-token-macos' }),
      );

      const token = discoverJoplinToken();

      expect(fs.existsSync).toHaveBeenCalledWith(
        '/Users/testuser/Library/Application Support/joplin-desktop/settings.json',
      );
      expect(token).toBe('test-token-macos');
    });

    it('should use correct path for Linux', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      vi.mocked(os.homedir).mockReturnValue('/home/testuser');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ 'api.token': 'test-token-linux' }),
      );

      const token = discoverJoplinToken();

      expect(fs.existsSync).toHaveBeenCalledWith(
        '/home/testuser/.config/joplin-desktop/settings.json',
      );
      expect(token).toBe('test-token-linux');
    });

    it('should use correct path for Windows', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      process.env.APPDATA = 'C:\\Users\\testuser\\AppData\\Roaming';
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ 'api.token': 'test-token-windows' }),
      );

      const token = discoverJoplinToken();

      expect(fs.existsSync).toHaveBeenCalledWith(
        expect.stringContaining('joplin-desktop'),
      );
      expect(token).toBe('test-token-windows');
    });
  });

  describe('File existence checks', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      vi.mocked(os.homedir).mockReturnValue('/home/testuser');
    });

    it('should return null when settings file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const token = discoverJoplinToken();

      expect(token).toBeNull();
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Joplin settings not found'),
      );
    });

    it('should handle when settings file exists but is empty', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{}');

      const token = discoverJoplinToken();

      expect(token).toBeNull();
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('API token not found'),
      );
    });
  });

  describe('JSON parsing', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      vi.mocked(os.homedir).mockReturnValue('/home/testuser');
      vi.mocked(fs.existsSync).mockReturnValue(true);
    });

    it('should parse valid JSON and extract token', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          'api.token': 'valid-token-123',
          'other.setting': 'value',
        }),
      );

      const token = discoverJoplinToken();

      expect(token).toBe('valid-token-123');
    });

    it('should handle malformed JSON gracefully', () => {
      vi.mocked(fs.readFileSync).mockReturnValue('{ invalid json }');

      const token = discoverJoplinToken();

      expect(token).toBeNull();
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to auto-discover'),
        expect.any(String),
      );
    });

    it('should handle file read errors', () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const token = discoverJoplinToken();

      expect(token).toBeNull();
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to auto-discover'),
        expect.stringContaining('Permission denied'),
      );
    });
  });

  describe('Token validation', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      vi.mocked(os.homedir).mockReturnValue('/home/testuser');
      vi.mocked(fs.existsSync).mockReturnValue(true);
    });

    it('should return null when api.token is missing', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ 'some.other.key': 'value' }),
      );

      const token = discoverJoplinToken();

      expect(token).toBeNull();
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('API token not found'),
      );
    });

    it('should handle empty string token', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ 'api.token': '' }),
      );

      const token = discoverJoplinToken();

      // Empty string tokens are treated as missing
      expect(token).toBeNull();
    });

    it('should handle null token value', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ 'api.token': null }),
      );

      const token = discoverJoplinToken();

      expect(token).toBeNull();
    });
  });
});

describe('JoplinApiClient', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('Port validation', () => {
    it('should use default port 41184 when JOPLIN_PORT is not set', () => {
      delete process.env.JOPLIN_PORT;
      process.env.JOPLIN_TOKEN = 'test-token';

      new JoplinApiClient();

      // Access the baseUrl through any public method call (will be tested via integration)
      expect(console.error).not.toHaveBeenCalledWith(
        expect.stringContaining('Invalid JOPLIN_PORT'),
      );
    });

    it('should use custom port when JOPLIN_PORT is valid', () => {
      process.env.JOPLIN_PORT = '12345';
      process.env.JOPLIN_TOKEN = 'test-token';

      new JoplinApiClient();

      expect(console.error).not.toHaveBeenCalledWith(
        expect.stringContaining('Invalid JOPLIN_PORT'),
      );
    });

    it('should reject negative port numbers', () => {
      process.env.JOPLIN_PORT = '-100';
      process.env.JOPLIN_TOKEN = 'test-token';

      new JoplinApiClient();

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Invalid JOPLIN_PORT: "-100"'),
      );
    });

    it('should reject port numbers above 65535', () => {
      process.env.JOPLIN_PORT = '99999';
      process.env.JOPLIN_TOKEN = 'test-token';

      new JoplinApiClient();

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Invalid JOPLIN_PORT: "99999"'),
      );
    });

    it('should reject non-numeric port values', () => {
      process.env.JOPLIN_PORT = 'not-a-number';
      process.env.JOPLIN_TOKEN = 'test-token';

      new JoplinApiClient();

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Invalid JOPLIN_PORT: "not-a-number"'),
      );
    });

    it('should reject port 0', () => {
      process.env.JOPLIN_PORT = '0';
      process.env.JOPLIN_TOKEN = 'test-token';

      new JoplinApiClient();

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Invalid JOPLIN_PORT: "0"'),
      );
    });

    it('should accept port 1 (minimum valid port)', () => {
      process.env.JOPLIN_PORT = '1';
      process.env.JOPLIN_TOKEN = 'test-token';

      new JoplinApiClient();

      expect(console.error).not.toHaveBeenCalledWith(
        expect.stringContaining('Invalid JOPLIN_PORT'),
      );
    });

    it('should accept port 65535 (maximum valid port)', () => {
      process.env.JOPLIN_PORT = '65535';
      process.env.JOPLIN_TOKEN = 'test-token';

      new JoplinApiClient();

      expect(console.error).not.toHaveBeenCalledWith(
        expect.stringContaining('Invalid JOPLIN_PORT'),
      );
    });
  });

  describe('Token discovery', () => {
    it('should use JOPLIN_TOKEN environment variable when available', () => {
      process.env.JOPLIN_TOKEN = 'env-token';
      vi.mocked(fs.existsSync).mockReturnValue(false);

      new JoplinApiClient();

      expect(console.error).not.toHaveBeenCalledWith(
        expect.stringContaining('Could not find Joplin API token'),
      );
    });

    it('should fall back to auto-discovery when JOPLIN_TOKEN is not set', () => {
      delete process.env.JOPLIN_TOKEN;
      Object.defineProperty(process, 'platform', { value: 'linux' });
      vi.mocked(os.homedir).mockReturnValue('/home/testuser');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ 'api.token': 'discovered-token' }),
      );

      new JoplinApiClient();

      expect(console.error).not.toHaveBeenCalledWith(
        expect.stringContaining('Could not find Joplin API token'),
      );
    });

    it('should warn when no token is found', () => {
      delete process.env.JOPLIN_TOKEN;
      vi.mocked(fs.existsSync).mockReturnValue(false);

      new JoplinApiClient();

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Could not find Joplin API token'),
      );
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Please ensure:'),
      );
    });
  });

  describe('API request error handling', () => {
    beforeEach(() => {
      process.env.JOPLIN_TOKEN = 'test-token';
      delete process.env.JOPLIN_PORT;
      // Reset fetch mock
      global.fetch = vi.fn();
    });

    it('should handle successful API responses', async () => {
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ result: 'success' })),
      };
      vi.mocked(global.fetch).mockResolvedValue(
        mockResponse as unknown as Response,
      );

      const client = new JoplinApiClient();
      const result = await client.ping();

      expect(result).toEqual({ result: 'success' });
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('http://localhost:41184/ping?token=test-token'),
        expect.any(Object),
      );
    });

    it('should handle empty API responses (like DELETE)', async () => {
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(''),
      };
      vi.mocked(global.fetch).mockResolvedValue(
        mockResponse as unknown as Response,
      );

      const client = new JoplinApiClient();
      const result = await client.deleteNote('test-note-id', false);

      expect(result).toBeNull();
    });

    it('should throw error on HTTP error status', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        text: vi.fn().mockResolvedValue('Not Found'),
      };
      vi.mocked(global.fetch).mockResolvedValue(
        mockResponse as unknown as Response,
      );

      const client = new JoplinApiClient();

      await expect(client.ping()).rejects.toThrow(
        'Failed to connect to Joplin: Joplin API error (404): Not Found',
      );
    });

    it('should handle network errors', async () => {
      vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'));

      const client = new JoplinApiClient();

      await expect(client.ping()).rejects.toThrow(
        'Failed to connect to Joplin: Network error',
      );
    });

    it('should handle connection refused', async () => {
      vi.mocked(global.fetch).mockRejectedValue(
        new Error('connect ECONNREFUSED 127.0.0.1:41184'),
      );

      const client = new JoplinApiClient();

      await expect(client.ping()).rejects.toThrow(
        'Failed to connect to Joplin: connect ECONNREFUSED',
      );
    });

    it('should properly encode query parameters in search', async () => {
      const mockResponse = {
        ok: true,
        text: vi
          .fn()
          .mockResolvedValue(JSON.stringify({ items: [], has_more: false })),
      };
      vi.mocked(global.fetch).mockResolvedValue(
        mockResponse as unknown as Response,
      );

      const client = new JoplinApiClient();
      await client.searchNotes('test query with spaces', 'note');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('query=test+query+with+spaces'),
        expect.any(Object),
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('type=note'),
        expect.any(Object),
      );
    });

    it('should send POST requests with JSON body', async () => {
      const mockResponse = {
        ok: true,
        text: vi
          .fn()
          .mockResolvedValue(JSON.stringify({ id: '123', title: 'New Note' })),
      };
      vi.mocked(global.fetch).mockResolvedValue(
        mockResponse as unknown as Response,
      );

      const client = new JoplinApiClient();
      await client.createNote('Test Note', 'Test body', 'notebook-id');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: 'Test Note',
            body: 'Test body',
            parent_id: 'notebook-id',
          }),
        }),
      );
    });

    it('should handle append to note correctly', async () => {
      const getNoteResponse = {
        ok: true,
        text: vi
          .fn()
          .mockResolvedValue(
            JSON.stringify({ id: '123', body: 'Original content' }),
          ),
      };
      const getTagsResponse = {
        ok: true,
        text: vi
          .fn()
          .mockResolvedValue(JSON.stringify({ items: [], has_more: false })),
      };
      const updateNoteResponse = {
        ok: true,
        text: vi
          .fn()
          .mockResolvedValue(
            JSON.stringify({ id: '123', body: 'Updated content' }),
          ),
      };

      vi.mocked(global.fetch)
        .mockResolvedValueOnce(getNoteResponse as unknown as Response)
        .mockResolvedValueOnce(getTagsResponse as unknown as Response)
        .mockResolvedValueOnce(updateNoteResponse as unknown as Response);

      const client = new JoplinApiClient();
      await client.appendToNote('123', 'New content');

      expect(global.fetch).toHaveBeenCalledTimes(3);
      // Third call should be PUT with combined content
      expect(global.fetch).toHaveBeenNthCalledWith(
        3,
        expect.any(String),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ body: 'Original content\n\nNew content' }),
        }),
      );
    });

    it('should handle prepend to note correctly', async () => {
      const getNoteResponse = {
        ok: true,
        text: vi
          .fn()
          .mockResolvedValue(
            JSON.stringify({ id: '123', body: 'Original content' }),
          ),
      };
      const getTagsResponse = {
        ok: true,
        text: vi
          .fn()
          .mockResolvedValue(JSON.stringify({ items: [], has_more: false })),
      };
      const updateNoteResponse = {
        ok: true,
        text: vi
          .fn()
          .mockResolvedValue(
            JSON.stringify({ id: '123', body: 'Updated content' }),
          ),
      };

      vi.mocked(global.fetch)
        .mockResolvedValueOnce(getNoteResponse as unknown as Response)
        .mockResolvedValueOnce(getTagsResponse as unknown as Response)
        .mockResolvedValueOnce(updateNoteResponse as unknown as Response);

      const client = new JoplinApiClient();
      await client.prependToNote('123', 'New content');

      expect(global.fetch).toHaveBeenCalledTimes(3);
      // Third call should be PUT with combined content
      expect(global.fetch).toHaveBeenNthCalledWith(
        3,
        expect.any(String),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ body: 'New content\n\nOriginal content' }),
        }),
      );
    });

    it('should use permanent delete flag when specified', async () => {
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(''),
      };
      vi.mocked(global.fetch).mockResolvedValue(
        mockResponse as unknown as Response,
      );

      const client = new JoplinApiClient();
      await client.deleteNote('test-note-id', true);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('permanent=1'),
        expect.any(Object),
      );
    });
  });

  describe('Tag operations', () => {
    beforeEach(() => {
      process.env.JOPLIN_TOKEN = 'test-token';
      delete process.env.JOPLIN_PORT;
      global.fetch = vi.fn();
    });

    it('should create note with tags using separate API calls', async () => {
      // Mock note creation
      const noteResponse = {
        ok: true,
        text: vi
          .fn()
          .mockResolvedValue(JSON.stringify({ id: '123', title: 'Test Note' })),
      };
      // Mock tag search (tag doesn't exist)
      const tagSearchResponse = {
        ok: true,
        text: vi
          .fn()
          .mockResolvedValue(JSON.stringify({ items: [], has_more: false })),
      };
      // Mock tag creation
      const tagCreateResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ id: 'tag-123' })),
      };
      // Mock tag association
      const tagAssociateResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(''),
      };

      vi.mocked(global.fetch)
        .mockResolvedValueOnce(noteResponse as unknown as Response) // POST /notes
        .mockResolvedValueOnce(tagSearchResponse as unknown as Response) // GET /search?query=work&type=tag
        .mockResolvedValueOnce(tagCreateResponse as unknown as Response) // POST /tags
        .mockResolvedValueOnce(tagAssociateResponse as unknown as Response); // POST /tags/tag-123/notes

      const client = new JoplinApiClient();
      await client.createNote('Test Note', 'Body', undefined, 'work');

      // Verify note was created without tags parameter
      expect(global.fetch).toHaveBeenNthCalledWith(
        1,
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ title: 'Test Note', body: 'Body' }),
        }),
      );

      // Verify tag was searched
      expect(global.fetch).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('/search?query=work&type=tag'),
        expect.any(Object),
      );

      // Verify tag was created
      expect(global.fetch).toHaveBeenNthCalledWith(
        3,
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ title: 'work' }),
        }),
      );

      // Verify tag was associated with note
      expect(global.fetch).toHaveBeenNthCalledWith(
        4,
        expect.stringContaining('/tags/tag-123/notes'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ id: '123' }),
        }),
      );
    });

    it('should add tags to existing note', async () => {
      // Mock tag search (tag doesn't exist)
      const tagSearchResponse = {
        ok: true,
        text: vi
          .fn()
          .mockResolvedValue(JSON.stringify({ items: [], has_more: false })),
      };
      // Mock tag creation
      const tagCreateResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ id: 'tag-urgent' })),
      };
      // Mock tag association
      const tagAssociateResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(''),
      };

      vi.mocked(global.fetch)
        .mockResolvedValueOnce(tagSearchResponse as unknown as Response)
        .mockResolvedValueOnce(tagCreateResponse as unknown as Response)
        .mockResolvedValueOnce(tagAssociateResponse as unknown as Response);

      const client = new JoplinApiClient();
      await client.addTagsToNote('note-123', 'urgent');

      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('should remove tags from note', async () => {
      // Mock tag search (tag exists)
      const tagSearchResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(
          JSON.stringify({
            items: [{ id: 'tag-draft', title: 'draft' }],
            has_more: false,
          }),
        ),
      };
      // Mock tag removal
      const tagRemoveResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(''),
      };

      vi.mocked(global.fetch)
        .mockResolvedValueOnce(tagSearchResponse as unknown as Response)
        .mockResolvedValueOnce(tagRemoveResponse as unknown as Response);

      const client = new JoplinApiClient();
      await client.removeTagsFromNote('note-123', 'draft');

      // Verify DELETE was called
      expect(global.fetch).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('/tags/tag-draft/notes/note-123'),
        expect.objectContaining({
          method: 'DELETE',
        }),
      );
    });

    it('should handle multiple comma-separated tags', async () => {
      const mockResponses = [
        // Search for 'work' tag
        {
          ok: true,
          text: vi
            .fn()
            .mockResolvedValue(JSON.stringify({ items: [], has_more: false })),
        },
        // Create 'work' tag
        {
          ok: true,
          text: vi.fn().mockResolvedValue(JSON.stringify({ id: 'tag-work' })),
        },
        // Associate 'work' tag
        { ok: true, text: vi.fn().mockResolvedValue('') },
        // Search for 'urgent' tag
        {
          ok: true,
          text: vi
            .fn()
            .mockResolvedValue(JSON.stringify({ items: [], has_more: false })),
        },
        // Create 'urgent' tag
        {
          ok: true,
          text: vi.fn().mockResolvedValue(JSON.stringify({ id: 'tag-urgent' })),
        },
        // Associate 'urgent' tag
        { ok: true, text: vi.fn().mockResolvedValue('') },
      ];

      mockResponses.forEach((response) => {
        vi.mocked(global.fetch).mockResolvedValueOnce(
          response as unknown as Response,
        );
      });

      const client = new JoplinApiClient();
      await client.addTagsToNote('note-123', 'work, urgent');

      expect(global.fetch).toHaveBeenCalledTimes(6);
    });

    it('should reuse existing tags instead of creating duplicates', async () => {
      // Mock tag search (tag exists)
      const tagSearchResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(
          JSON.stringify({
            items: [{ id: 'tag-existing', title: 'work' }],
            has_more: false,
          }),
        ),
      };
      // Mock tag association
      const tagAssociateResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(''),
      };

      vi.mocked(global.fetch)
        .mockResolvedValueOnce(tagSearchResponse as unknown as Response)
        .mockResolvedValueOnce(tagAssociateResponse as unknown as Response);

      const client = new JoplinApiClient();
      await client.addTagsToNote('note-123', 'work');

      // Should NOT call POST /tags (tag already exists)
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(global.fetch).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"title":"work"'),
        }),
      );
    });
  });

  describe('Pagination', () => {
    beforeEach(() => {
      process.env.JOPLIN_TOKEN = 'test-token';
      delete process.env.JOPLIN_PORT;
      global.fetch = vi.fn();
    });

    it('should handle single page response', async () => {
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(
          JSON.stringify({
            items: [
              { id: '1', title: 'Note 1' },
              { id: '2', title: 'Note 2' },
            ],
            has_more: false,
          }),
        ),
      };

      vi.mocked(global.fetch).mockResolvedValue(
        mockResponse as unknown as Response,
      );

      const client = new JoplinApiClient();
      const result = await client.searchNotes('test');

      expect(result).toEqual([
        { id: '1', title: 'Note 1' },
        { id: '2', title: 'Note 2' },
      ]);
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=100&page=1'),
        expect.any(Object),
      );
    });

    it('should handle multiple pages', async () => {
      const page1Response = {
        ok: true,
        text: vi.fn().mockResolvedValue(
          JSON.stringify({
            items: [
              { id: '1', title: 'Note 1' },
              { id: '2', title: 'Note 2' },
            ],
            has_more: true,
          }),
        ),
      };

      const page2Response = {
        ok: true,
        text: vi.fn().mockResolvedValue(
          JSON.stringify({
            items: [
              { id: '3', title: 'Note 3' },
              { id: '4', title: 'Note 4' },
            ],
            has_more: true,
          }),
        ),
      };

      const page3Response = {
        ok: true,
        text: vi.fn().mockResolvedValue(
          JSON.stringify({
            items: [{ id: '5', title: 'Note 5' }],
            has_more: false,
          }),
        ),
      };

      vi.mocked(global.fetch)
        .mockResolvedValueOnce(page1Response as unknown as Response)
        .mockResolvedValueOnce(page2Response as unknown as Response)
        .mockResolvedValueOnce(page3Response as unknown as Response);

      const client = new JoplinApiClient();
      const result = await client.searchNotes('test');

      expect(result).toEqual([
        { id: '1', title: 'Note 1' },
        { id: '2', title: 'Note 2' },
        { id: '3', title: 'Note 3' },
        { id: '4', title: 'Note 4' },
        { id: '5', title: 'Note 5' },
      ]);
      expect(global.fetch).toHaveBeenCalledTimes(3);
      expect(global.fetch).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('page=1'),
        expect.any(Object),
      );
      expect(global.fetch).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('page=2'),
        expect.any(Object),
      );
      expect(global.fetch).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining('page=3'),
        expect.any(Object),
      );
    });

    it('should handle empty results', async () => {
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(
          JSON.stringify({
            items: [],
            has_more: false,
          }),
        ),
      };

      vi.mocked(global.fetch).mockResolvedValue(
        mockResponse as unknown as Response,
      );

      const client = new JoplinApiClient();
      const result = await client.searchNotes('nonexistent');

      expect(result).toEqual([]);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should paginate listNotebooks', async () => {
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(
          JSON.stringify({
            items: [
              { id: 'folder-1', title: 'Folder 1' },
              { id: 'folder-2', title: 'Folder 2' },
            ],
            has_more: false,
          }),
        ),
      };

      vi.mocked(global.fetch).mockResolvedValue(
        mockResponse as unknown as Response,
      );

      const client = new JoplinApiClient();
      const result = await client.listNotebooks();

      expect(result).toEqual([
        { id: 'folder-1', title: 'Folder 1' },
        { id: 'folder-2', title: 'Folder 2' },
      ]);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/folders'),
        expect.any(Object),
      );
    });

    it('should paginate getNotebookNotes', async () => {
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(
          JSON.stringify({
            items: [
              { id: 'note-1', title: 'Note 1' },
              { id: 'note-2', title: 'Note 2' },
            ],
            has_more: false,
          }),
        ),
      };

      vi.mocked(global.fetch).mockResolvedValue(
        mockResponse as unknown as Response,
      );

      const client = new JoplinApiClient();
      const result = await client.getNotebookNotes('folder-123');

      expect(result).toEqual([
        { id: 'note-1', title: 'Note 1' },
        { id: 'note-2', title: 'Note 2' },
      ]);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/folders/folder-123/notes'),
        expect.any(Object),
      );
    });

    it('should paginate tags in getNote', async () => {
      const noteResponse = {
        ok: true,
        text: vi
          .fn()
          .mockResolvedValue(
            JSON.stringify({ id: '123', title: 'Test Note', body: 'Content' }),
          ),
      };
      const tagsResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(
          JSON.stringify({
            items: [
              { id: 'tag-1', title: 'work' },
              { id: 'tag-2', title: 'urgent' },
            ],
            has_more: false,
          }),
        ),
      };

      vi.mocked(global.fetch)
        .mockResolvedValueOnce(noteResponse as unknown as Response)
        .mockResolvedValueOnce(tagsResponse as unknown as Response);

      const client = new JoplinApiClient();
      const result = (await client.getNote('123')) as {
        tags: Array<{ id: string; title: string }>;
      };

      expect(result.tags).toEqual([
        { id: 'tag-1', title: 'work' },
        { id: 'tag-2', title: 'urgent' },
      ]);
    });

    it('should handle tag search with pagination in findOrCreateTag', async () => {
      const noteResponse = {
        ok: true,
        text: vi
          .fn()
          .mockResolvedValue(JSON.stringify({ id: '123', title: 'Test Note' })),
      };
      const tagSearchResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(
          JSON.stringify({
            items: [],
            has_more: false,
          }),
        ),
      };
      const tagCreateResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ id: 'tag-new' })),
      };
      const tagAssociateResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(''),
      };

      vi.mocked(global.fetch)
        .mockResolvedValueOnce(noteResponse as unknown as Response)
        .mockResolvedValueOnce(tagSearchResponse as unknown as Response)
        .mockResolvedValueOnce(tagCreateResponse as unknown as Response)
        .mockResolvedValueOnce(tagAssociateResponse as unknown as Response);

      const client = new JoplinApiClient();
      await client.createNote('Test Note', 'Body', undefined, 'newtag');

      // Should search for tag, not find it, create it, and associate it
      expect(global.fetch).toHaveBeenCalledTimes(4);
    });
  });
});
