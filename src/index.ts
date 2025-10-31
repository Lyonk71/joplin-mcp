#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { resolve } from 'path';
import { realpathSync } from 'fs';
import { fileURLToPath } from 'url';
import { program } from 'commander';
import { getVersion } from './version.js';
import { JoplinApiClient } from './api/client.js';

// Re-export for backwards compatibility with tests
export { discoverJoplinToken } from './config/token-discovery.js';
export { JoplinApiClient } from './api/client.js';

export class JoplinServer {
  private server: Server;
  private apiClient: JoplinApiClient;

  constructor() {
    this.server = new Server(
      {
        name: 'joplin-server',
        version: getVersion(),
        description: `MCP server for Joplin note-taking application.

GENERAL WORKFLOW PATTERNS:
Most operations follow a 2-step pattern:
1. Discovery: Find IDs using list_* or search_* tools
2. Action: Use the ID with get_*/update_*/delete_* tools

SEARCH STRATEGY (CRITICAL):
For natural language queries ("do you have notes about X?"), DO NOT search the user's exact phrase.
Instead, use OR logic with synonyms: "any:1 keyword synonym1 synonym2 related-term"
Example: "do you have docker notes?" → search "any:1 docker container containerization kubernetes orchestration"

TOOL CATEGORIES:
- Discovery: list_notebooks, list_all_notes, list_tags, list_all_resources, list_all_revisions
- Search: search_notes (primary tool for "do you have notes about X?" queries)
- Retrieval: get_note, get_notebook_by_id, get_tag_by_id, get_resource_metadata, get_revision
- Filtered retrieval: get_notebook_notes, get_notes_by_tag, get_note_attachments, get_resource_notes
- Creation: create_note, create_notebook, upload_attachment
- Modification: update_note, update_notebook, update_resource, append_to_note, prepend_to_note, add_tags_to_note, remove_tags_from_note, rename_tag, move_note_to_notebook
- Deletion: delete_note, delete_notebook, delete_tag, delete_resource (always check dependencies first)

PARAMETER PREFERENCES:
- Prefer name parameters over ID parameters when available (tag_name vs tag_id, current_name vs tag_id)
- IDs are needed for precision; names are more intuitive for users

DESTRUCTIVE OPERATIONS:
- delete_notebook: Must be empty first (check with get_notebook_notes)
- delete_tag: Removes tag from ALL notes (check impact with get_notes_by_tag)
- delete_resource: Breaks note references (check with get_resource_notes)
- update_note body: Overwrites all content (use append_to_note/prepend_to_note to preserve)`,
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

  /**
   * Get the complete tools definitions array
   * This is used both for the MCP ListTools handler and for TOML generation
   */
  private getToolsDefinitions() {
    return [
      // Notebook Management
      {
        name: 'list_notebooks',
        description: `List all notebooks (folders) in Joplin.

STRATEGIC GUIDANCE: This is often the first tool to call when a user wants to create a note in a specific notebook or browse their notebook structure. The returned IDs are needed for create_note, move_note_to_notebook, and other notebook operations. Use the parent_id field to understand the notebook hierarchy.

Returns notebook ID, title, parent_id (for nested notebooks), and timestamps. Supports optional sorting.`,
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
              description: 'Optional: ID of the parent notebook for nesting',
            },
          },
          required: ['title'],
        },
      },
      {
        name: 'get_notebook_notes',
        description: `Get all notes within a specific notebook (folder).

WHEN TO USE:
- User asks to see notes in a specific notebook/folder
- Browsing contents of a known notebook
- Filtering notes by organizational location
- User says "show me notes in my Work folder"

WHEN NOT TO USE:
- Searching across all notebooks for a topic → Use search_notes with notebook: filter if needed
- User asks "do you have notes about X?" → Use search_notes
- Getting a single specific note → Use get_note (requires note_id)

WORKFLOW:
1. Get notebook_id from list_notebooks or user already provided it
2. Call this tool with the notebook_id
3. Results include note IDs, titles, content, and metadata
4. Use get_note for full details of specific notes if needed

RETURNS: Array of notes with IDs, titles, body content, parent_id, timestamps, and todo status. Supports custom sorting and field selection.`,
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
        description: `Update a notebook's properties (rename or change nesting).

WHAT YOU CAN UPDATE:
- title: Rename the notebook
- parent_id: Move notebook under a different parent (nesting) or set to empty string to un-nest

WHEN TO USE:
- User wants to rename a notebook
- Reorganizing notebook hierarchy by changing parent relationships
- Un-nesting a notebook (set parent_id to empty string)

WORKFLOW FOR RENAMING:
1. Get notebook_id from list_notebooks if needed
2. Call update_notebook with notebook_id + new title

WORKFLOW FOR NESTING:
1. Get target parent notebook_id from list_notebooks
2. Call update_notebook with notebook_id + parent_id of the parent notebook
3. The notebook will appear nested under the parent

RETURNS: Updated notebook object with new title and/or parent_id.`,
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
        description: `Delete a notebook from Joplin.

IMPORTANT REQUIREMENT: The notebook must be empty before deletion. Joplin will reject deletion attempts on notebooks that contain notes.

RECOMMENDED WORKFLOW:
1. Call get_notebook_notes to check if the notebook has any notes
2. If notes exist, either move them (move_note_to_notebook) or delete them (delete_note)
3. Only then call delete_notebook

WHEN NOT TO USE: If the notebook contains notes and you haven't emptied it first, this operation will fail with an error.

Use this for cleaning up empty organizational structures or removing notebooks that have been fully migrated elsewhere.`,
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
        description: `Get details for a specific notebook by its ID.

WHEN TO USE:
- You have a notebook_id from list_notebooks or a note's parent_id field
- Need to verify notebook name or check its organizational structure
- Checking if a notebook is nested (has parent_id)
- Getting metadata about a specific notebook

WHEN NOT TO USE:
- If you don't know the notebook_id yet → Use list_notebooks to find it by name
- Listing all notebooks → Use list_notebooks
- Getting notes within the notebook → Use get_notebook_notes

RETURNS: Notebook metadata including id, title, parent_id (for nested notebooks), and timestamps. The parent_id field indicates if this notebook is nested under another.`,
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
        description: `Move a note from its current notebook to a different notebook.

WHEN TO USE:
- User wants to reorganize notes between notebooks
- Moving note to better organizational location
- Consolidating notes from multiple notebooks

WORKFLOW:
1. Get the note_id (from search_notes, list_all_notes, or get_notebook_notes)
2. Get the destination notebook_id (from list_notebooks)
3. Call this tool with both IDs

ALTERNATIVE: You can also use update_note with notebook_id parameter - both methods work identically.

RETURNS: Confirmation that the note has been moved. The note's parent_id field will now point to the new notebook.`,
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
        description: `List all notes across all notebooks in Joplin.

WHEN TO USE:
- User asks for "all notes" or wants a global view
- Need to browse notes chronologically (use order_by for sorting)
- Looking for recently updated/created notes across all notebooks
- Generating statistics or reports across entire note collection

WHEN NOT TO USE (use specialized tools instead):
- Searching for specific topics/keywords → Use search_notes
- Filtering by specific notebook → Use get_notebook_notes
- Filtering by specific tag → Use get_notes_by_tag
- User asks "do you have notes about X?" → Use search_notes with OR logic

RETURNS: Note IDs, titles, body content, parent notebook ID (parent_id), timestamps, and todo status if applicable. Supports sorting and field customization.

NOTE: This returns ALL notes, which can be a large dataset. Consider using more targeted tools when the user has specific criteria.`,
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
        description: `Search for notes using Joplin's query syntax.

CRITICAL SEARCH STRATEGY - READ THIS FIRST:
When users ask questions like "do you have notes about X?", DO NOT search for their exact phrase. Instead, construct intelligent queries using these strategies:

1. BROAD QUERIES (Default Approach):
   - Use any:1 with multiple synonyms and related terms
   - Example: User asks "linux installation steps" → Search: "any:1 linux install installation setup guide tutorial steps configure"
   - Example: User asks "project documentation" → Search: "any:1 project initiative plan documentation docs readme guide"
   - Rationale: A search returning 10 results you can filter is better than returning 0 results

2. PRECISE QUERIES (When Specific):
   - Use field filters when user specifies criteria
   - Example: "recent work notes" → Search: "tag:work updated:month-1"
   - Example: "notes with images" → Search: "resource:image/*"

3. NEVER DO THIS:
   - ❌ Don't search exact user phrases: "do you have notes about docker" (will fail)
   - ❌ Don't give up after one failed search
   - ✅ Always try variations, wildcards, and broader OR queries

WHEN TO USE search_notes:
- User asks "do you have notes about X?"
- User provides keywords or topics to search
- Looking for content based on concepts (not just titles)

WHEN NOT TO USE search_notes:
- For "all notes" or chronological lists → Use list_all_notes
- User specifies a notebook/folder → Use get_notebook_notes
- User specifies a single exact tag → Use get_notes_by_tag

WORKFLOW:
1. Construct a smart query (use OR logic + synonyms for concepts)
2. Examine results (returns note IDs and titles)
3. Use get_note to fetch full content of relevant results
4. If zero results, try wildcards or broader terms

QUERY SYNTAX REFERENCE:

Basic:
- Words: "linux kernel" (AND logic - both required)
- Phrases: "shopping list" (exact phrase)
- Wildcards: "swim*" (prefix match)
- Exclusion: "-spam" (exclude term)
- OR logic: "any:1 arch ubuntu fedora" (match any term)

Field filters:
- title:TERM - Search titles only
- body:TERM - Search body text only
- tag:TAG - Filter by tag (wildcards ok: tag:proj*)
- notebook:NAME - Filter by notebook name
- resource:MIME - Has attachment type (resource:image/*, resource:application/pdf)

Date filters (formats: YYYYMMDD, YYYYMM, YYYY, day-7, month-1, year-0):
- created:DATE - Creation date
- updated:DATE - Last modified date
- due:DATE - Todo due date

Type filters:
- type:note|todo - Item type
- iscompleted:0|1 - Todo completion status

Query examples:
- Broad concept search: "any:1 kubernetes k8s docker container orchestration"
- Title search: "title:linux tag:tutorial"
- Recent work: "tag:work updated:month-1"
- With images: "resource:image/*"
- Exclude archived: "project -tag:archived"
- Wildcard: "swim*" (finds swimming, swimmer, etc.)`,
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
        description: `Get the complete content and metadata of a specific note.

WHEN TO USE:
- You have a note_id from search results, list operations, or user input
- Need to read the full body content of a note
- Checking what tags are on a note
- Getting detailed note information including timestamps

TYPICAL WORKFLOW:
1. Find notes using search_notes, list_all_notes, get_notebook_notes, or get_notes_by_tag
2. Those tools return note IDs and titles (sometimes with body excerpts)
3. Call get_note with the note_id to get full content
4. Examine the complete body field and tags array

RETURNS: Complete note object including:
- id, title - Note identification
- body - Full markdown content
- parent_id - Notebook ID (use get_notebook_by_id to get notebook name)
- tags - Array of tag objects with id and title
- created_time, updated_time - Timestamps
- is_todo, todo_completed, todo_due - Todo-related fields if applicable`,
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
        description: `Create a new note in Joplin with title and body content.

WORKFLOW FOR SPECIFIC NOTEBOOK PLACEMENT:
1. If user specifies a notebook/folder name, call list_notebooks first
2. Find the notebook_id from the results
3. Call create_note with the notebook_id parameter
4. If no notebook specified, omit notebook_id (uses default notebook)

TAG CONVENIENCE: Tags specified in the tags parameter are created automatically if they don't exist. No need to call list_tags or verify tag existence first. Just provide comma-separated tag names (e.g., "work,urgent,project-alpha").

CONTENT FORMATTING: The body field supports full Markdown syntax. Use it for:
- Headers (# ## ###)
- Lists (- or 1. 2. 3.)
- Links, bold, italic, code blocks
- Embedded attachments: ![image](:/resource_id) or [file](:/resource_id)

CREATING TODOS: Set is_todo=1 to create a todo item instead of a regular note. Optionally add todo_due timestamp for due dates.

WHEN TO USE:
- User asks to create/make/add a new note
- Capturing information provided by user
- Converting user input into stored notes

RETURNS: Created note object with id and title. Save the id if you need to reference the note in follow-up operations.`,
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
        description: `Update an existing note's properties.

WHAT YOU CAN UPDATE:
- title: Change the note's title
- body: Replace entire content (WARNING: this overwrites existing content)
- notebook_id: Move note to different notebook (same as move_note_to_notebook)
- is_todo: Convert between regular note (0) and todo item (1)
- todo_due: Set/update due date for todos (Unix timestamp in milliseconds)
- todo_completed: Mark todo complete/incomplete (timestamp or 0)

WHAT YOU CANNOT UPDATE HERE:
- Tags: Use add_tags_to_note or remove_tags_from_note instead
- For appending/prepending content: Use append_to_note or prepend_to_note to avoid overwriting

WORKFLOW EXAMPLES:
1. Rename note: update_note with note_id + new title
2. Move to notebook: update_note with note_id + notebook_id (or use move_note_to_notebook)
3. Convert to todo: update_note with note_id + is_todo=1 + optional todo_due timestamp
4. Mark todo complete: update_note with note_id + todo_completed=[current_timestamp]
5. Full rewrite: update_note with note_id + new body (replaces all content)

CAUTION: Updating the body replaces ALL existing content. To add content while preserving existing text, use append_to_note or prepend_to_note instead.`,
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
        description: `Add content to the end of an existing note while preserving existing content.

WHEN TO USE:
- Adding new information to an existing note
- Logging updates or entries to a journal-style note
- Appending meeting notes, ideas, or follow-ups
- User says "add this to my note" or "append to note"

WHEN NOT TO USE:
- Replacing entire note content → Use update_note with body parameter
- Adding content at the beginning → Use prepend_to_note

BEHAVIOR: Adds two newlines (\\n\\n) then your content to the end of the note's current body. This preserves the existing content and creates a visual separation.

WORKFLOW:
1. Get note_id (from search_notes or other list operations)
2. Call append_to_note with the note_id and new content
3. The tool automatically fetches current content, appends yours, and updates

EXAMPLE: If note body is "# Meeting\\nAttendees: Alice, Bob" and you append "## Action Items\\n- Review proposal", the result is "# Meeting\\nAttendees: Alice, Bob\\n\\n## Action Items\\n- Review proposal"`,
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
        description: `Add content to the beginning of an existing note while preserving existing content.

WHEN TO USE:
- Adding high-priority information that should appear first
- Inserting summary or overview before existing details
- Adding timestamps or metadata at the top
- User says "add this to the top of my note"

WHEN NOT TO USE:
- Replacing entire note content → Use update_note with body parameter
- Adding content at the end → Use append_to_note

BEHAVIOR: Adds your content, then two newlines (\\n\\n), then the existing note body. This preserves existing content and creates visual separation.

WORKFLOW:
1. Get note_id (from search_notes or other list operations)
2. Call prepend_to_note with the note_id and new content
3. The tool automatically fetches current content, prepends yours, and updates

EXAMPLE: If note body is "## Details\\nContent here" and you prepend "# Summary\\nQuick overview", the result is "# Summary\\nQuick overview\\n\\n## Details\\nContent here"`,
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
        description: `Delete a note by moving it to the trash.

IMPORTANT BEHAVIOR: By default, this moves the note to Joplin's trash (soft delete). The note can be recovered from the trash in the Joplin UI. This tool does NOT perform permanent deletion.

WHEN TO USE:
- User explicitly requests note deletion
- Cleaning up duplicate or obsolete notes
- Removing test notes or temporary content

BEFORE DELETION (recommended):
- Confirm with user if unsure
- For important notes, consider using get_note to review content first
- Check if note contains critical information

WORKFLOW:
1. Get note_id (from search_notes or list operations)
2. Optionally call get_note to review content
3. Call delete_note with the note_id
4. Note moves to trash but is recoverable

ALTERNATIVE OPERATIONS:
- Moving to different notebook → Use move_note_to_notebook instead
- Archiving with tags → Use add_tags_to_note to add "archived" tag instead`,
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
        description: `Add one or more tags to an existing note.

STRATEGIC GUIDANCE: Tags are created automatically if they don't exist, so you don't need to check tag existence before adding them. This makes bulk tagging operations safe and convenient. Tags are added to any existing tags (not replaced), so it's safe to call this multiple times. Use comma-separated format for multiple tags (e.g., "work,urgent,project-alpha").

Useful for organizing notes, marking priorities, or categorizing content.`,
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
        description: `Remove one or more tags from a note.

BEHAVIOR: Silently ignores tags that don't exist or aren't currently on the note, so this operation is safe to call without checking tag existence first.

WHEN TO USE:
- User wants to remove specific tags from a note
- Cleaning up note organization
- Removing outdated or incorrect tags
- Un-categorizing notes

WORKFLOW:
1. Get note_id (from search_notes or other operations)
2. Call this tool with note_id + comma-separated tag names
3. Only the specified tags are removed; other tags remain

FORMAT: Provide tags as comma-separated names (e.g., "work,urgent" to remove both tags).

NOTE: This only removes tag associations from the specific note. The tags themselves remain in Joplin and can still be used on other notes. To delete a tag entirely, use delete_tag.`,
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
        description: `List all tags in Joplin.

STRATEGIC GUIDANCE: Use this to discover what organizational tags the user has available before filtering notes by tag or suggesting tag-based organization. The returned tag IDs and names can be used with get_notes_by_tag, add_tags_to_note, and other tag operations.

Returns tag IDs, names (titles), and timestamps. Supports optional sorting.`,
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
        description: `Rename a tag across all notes that use it.

PARAMETER PREFERENCE: Prefer using current_name when you know the tag name from the user's request (e.g., "rename my 'work' tag to 'job'"). This is more intuitive. Only use tag_id if you already have the ID from a previous operation like list_tags.

BEHAVIOR: All notes with this tag will automatically display the new name. This is a global rename operation that updates the tag everywhere it's used.

WHEN TO USE:
- User wants to fix tag naming (typos, better names, standardization)
- Consolidating similar tags by renaming before deletion
- Improving tag organization and clarity

WORKFLOW:
- Provide either current_name OR tag_id (not both)
- Always provide new_name with the desired tag name
- The change is immediate and affects all notes

NOTE: This is safer than delete_tag + re-tagging because it preserves all tag associations.`,
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
        description: `Delete a tag from Joplin permanently.

⚠️ WARNING: This removes the tag from ALL notes that use it. This operation affects every note tagged with this tag across your entire Joplin database.

RECOMMENDED WORKFLOW (before deletion):
1. Call get_notes_by_tag to see which notes will be affected
2. Confirm the impact with the user if many notes use this tag
3. Consider rename_tag instead if the tag name just needs updating
4. Only then proceed with delete_tag

WHEN TO USE:
- Cleaning up unused or obsolete tags
- Removing duplicate or misspelled tags (after migrating notes)
- User explicitly requests tag deletion and understands the scope

ALTERNATIVE: If you just need to change the tag name, use rename_tag instead to preserve tag associations.`,
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
        description: `Get details for a specific tag by its ID.

WHEN TO USE:
- You have a tag_id from list_tags or a note's tags array
- Need to verify tag name or get metadata
- Checking tag timestamps

WHEN NOT TO USE:
- If you don't know the tag_id yet → Use list_tags to find it by name
- Getting notes with a tag → Use get_notes_by_tag (accepts tag_name directly)
- Listing all tags → Use list_tags

RETURNS: Tag metadata including id, title (tag name), created_time, and updated_time.

NOTE: This is rarely needed since most tag operations (get_notes_by_tag, rename_tag, etc.) accept tag names directly. Primarily useful for inspecting metadata when you already have the ID.`,
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
        description: `Get all notes that have a specific tag.

PARAMETER PREFERENCE: Prefer using tag_name when you know the tag name from the user's request. This is more convenient and readable. Only use tag_id if you already have it from a previous operation.

WHEN TO USE:
- User asks for notes with a specific tag (e.g., "show me my work notes")
- Filtering notes by a single known tag name
- User specifies exact tag in their request

WHEN NOT TO USE:
- User asks "do you have notes about X?" without specifying it's a tag → Use search_notes instead
- Need to discover what tags exist first → Call list_tags first
- Searching across multiple tags or concepts → Use search_notes with tag: filters

WORKFLOW:
1. If using tag_name: Simply call this tool with the tag name
2. If tag doesn't exist, you'll get an error - tags must exist to query them
3. Results include note IDs, titles, content, and metadata

RETURNS: All notes tagged with the specified tag, sorted by update time by default. Supports custom sorting and field selection.`,
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
        description: `List all file attachments (resources) across your entire Joplin database.

WHEN TO USE:
- Getting an overview of all attachments in Joplin
- Finding large files by sorting by size
- Searching for attachments by file type or name
- Auditing storage usage or finding unused attachments

RETURNS: Array of resources with metadata:
- id, title, filename - Identification
- mime, file_extension - File type information
- size - File size in bytes
- ocr_text, ocr_status - OCR-extracted text from images (if available)
- created_time, updated_time - Timestamps

FILTERING TECHNIQUES:
- After retrieval, filter by mime type to find specific file types
- Sort by size (order_by=size, order_dir=DESC) to find large files
- Check ocr_text field to search text within images

WHEN NOT TO USE:
- Getting attachments for specific note → Use get_note_attachments
- Checking which notes use a specific attachment → Use get_resource_notes

NOTE: This returns ALL resources globally, which can be a large dataset for users with many attachments.`,
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
        description: `Get detailed metadata for a specific attachment/resource.

WHEN TO USE:
- You have a resource_id and need detailed information
- Checking file size, MIME type, or file extension
- Accessing OCR-extracted text from images
- Checking if resource is shared or getting share information

RETURNS: Comprehensive resource metadata including:
- id, title, filename - Identification
- mime, file_extension - File type
- size - File size in bytes
- ocr_text, ocr_status - Extracted text from images (if Joplin's OCR processed it)
- is_shared, share_id - Sharing information
- created_time, updated_time, blob_updated_time - Timestamps

WHEN NOT TO USE:
- Downloading the actual file → Use download_attachment
- Getting all resources → Use list_all_resources
- Getting attachments for a note → Use get_note_attachments

OCR FEATURE: Joplin can extract text from images via OCR. Check ocr_status to see if processing completed, and ocr_text for extracted content.`,
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
        description: `List all file attachments embedded in a specific note.

WHEN TO USE:
- Checking what files are attached to a note
- Finding images, PDFs, or other files within a note
- Getting resource IDs for files in a note
- Auditing note attachments

WORKFLOW:
1. Get note_id (from search_notes or other operations)
2. Call this tool with the note_id
3. Receive array of resources used in that note

RETURNS: Array of resource metadata including:
- id - Resource ID (used in markdown as :/resource_id)
- title, filename - File identification
- mime, file_extension - File type
- size - File size in bytes
- created_time, updated_time - Timestamps

USE CASE EXAMPLE: After getting attachments, use download_attachment with resource_id to save files locally, or use update_resource to modify attachment metadata.

WHEN NOT TO USE:
- Listing all resources globally → Use list_all_resources
- Finding which notes use a specific resource → Use get_resource_notes`,
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
        description: `Find all notes that reference or embed a specific attachment.

⚠️ CRITICAL USE CASE: Always call this BEFORE deleting a resource to check which notes will be affected.

WHEN TO USE:
- Before deleting a resource (to see impact)
- Finding where an attachment is used
- Understanding resource dependencies
- Cleaning up or reorganizing attachments

WORKFLOW FOR SAFE DELETION:
1. Call get_resource_notes with resource_id
2. Review which notes use this resource
3. Update those notes if needed (remove markdown references)
4. Only then call delete_resource

RETURNS: Array of notes that reference this resource, including:
- id, title - Note identification
- parent_id - Notebook ID
- created_time, updated_time - Timestamps

BEHAVIOR: Resources are embedded in notes using markdown syntax like ![image](:/resource_id) or [file](:/resource_id). This tool finds all notes containing such references.

NOTE: Even if a resource is uploaded, it might not be referenced in any note yet (orphaned resource).`,
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
        description: `Download a file attachment from Joplin to local filesystem.

WHEN TO USE:
- User wants to save an attachment locally
- Extracting files from notes for external processing
- Backing up attachments
- Sharing files from Joplin with external tools

WORKFLOW:
1. Get resource_id from get_note_attachments, list_all_resources, or note content
2. Specify output_path (local file path where file should be saved)
3. Call this tool to download and save the file

PARAMETERS:
- resource_id: The attachment's ID from Joplin
- output_path: Full local path including filename (e.g., "/home/user/downloads/image.png")

RETURNS: Confirmation message with the save location.

TIP: Use get_resource_metadata first to check the file extension and size if you need to construct an appropriate output path.`,
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
        description: `Upload a file attachment (image, PDF, document, etc.) to Joplin.

RETURNS: A resource object with an 'id' field. This ID is critical for the next step.

TYPICAL WORKFLOW (2 steps):
1. Upload the file using this tool → Get back resource_id
2. Embed in a note using markdown:
   - For images: ![alt text](:/RESOURCE_ID)
   - For files: [Link text](:/RESOURCE_ID)
   Example: After upload returns {id: "abc123"}, add to note body: "![Screenshot](:/abc123)"

WHEN TO USE:
- User wants to attach files to notes
- Adding images, PDFs, documents to enhance notes
- Creating visual documentation with embedded screenshots

EMBEDDING SYNTAX:
- Images: ![description](:/resource_id) - displays inline
- PDFs/files: [filename](:/resource_id) - creates download link
- You MUST use the :/ prefix before the resource ID

MIME TYPE EXAMPLES:
- image/png, image/jpeg - Images
- application/pdf - PDF documents
- application/zip - Archives
- text/plain - Text files`,
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
        description: `Update an existing attachment's file content and/or metadata.

WHAT YOU CAN UPDATE:
- file_path: Replace the attachment with a new file
- title: Change the display name (doesn't affect markdown references)
- mime_type: Update MIME type (only when updating file_path)

WHEN TO USE:
- Replacing an outdated attachment with newer version
- Fixing incorrect file uploads
- Renaming resources for better organization
- Updating corrupted or wrong files

WORKFLOW OPTIONS:

Option 1 - Update file content:
1. Get resource_id from get_note_attachments or list_all_resources
2. Call update_resource with resource_id + file_path (+ optional title/mime_type)
3. The file content is replaced while keeping the same resource_id

Option 2 - Update metadata only:
1. Get resource_id
2. Call update_resource with resource_id + title
3. Only the title changes, file content unchanged

IMPORTANT: Updating the file content does NOT break markdown references in notes since the resource_id stays the same. This is useful for updating images or documents without editing notes.

RETURNS: Updated resource object with id and title.`,
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
        description: `Delete an attachment/resource from Joplin permanently.

⚠️ CRITICAL WARNING: This breaks all markdown references in notes that embed this resource. Images will show as broken, file links won't work.

REQUIRED WORKFLOW (safety check):
1. First call get_resource_notes to find affected notes
2. Review the impact - see how many notes reference this resource
3. If needed, edit notes to remove markdown references (![](:/resource_id) or [](:/resource_id))
4. Only then call delete_resource

AUTOMATIC BEHAVIOR: This tool includes a built-in safety check. If the resource is used in any notes, it will WARN you with details instead of deleting. You'll see which notes are affected.

WHEN TO USE:
- Cleaning up orphaned/unused resources
- Removing large files to free storage
- After confirming resource isn't needed (via get_resource_notes)

WHEN NOT TO USE:
- If resource is still referenced in notes (breaks those notes)
- If unsure about impact (check get_resource_notes first)

ALTERNATIVE: Instead of deletion, consider updating the resource with update_resource if you just need to replace the file content.`,
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
        description: `List all revisions (version history snapshots) across all notes in Joplin.

WHEN TO USE:
- Exploring note change history globally
- Finding when specific notes were modified (check item_id field)
- Auditing note revisions across the database
- Finding revision IDs to examine specific changes

IMPORTANT LIMITATION: Joplin's API returns ALL revisions globally. To find revisions for a specific note, you must filter the results by item_id (which contains the note ID) after retrieval.

WORKFLOW TO FIND NOTE REVISIONS:
1. Call list_all_revisions
2. Filter results where item_id matches your target note_id
3. Use get_revision to examine specific revision details
4. Review title_diff, body_diff to see what changed

RETURNS: Array of revision metadata including:
- id - Revision ID (use with get_revision)
- item_id - The note ID this revision belongs to
- item_type - Usually "note"
- item_updated_time - When the note was updated
- parent_id - Parent revision ID (for revision chains)
- created_time, updated_time - Revision timestamps

SORTING: Sort by created_time (default DESC) to see most recent revisions first, or by item_updated_time to sort by when notes were actually changed.

USE CASE: Version history viewing, recovering lost content, auditing note changes over time.`,
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
        description: `Get detailed information about a specific revision, including diffs showing what changed.

WHEN TO USE:
- Examining exactly what changed in a note at a specific point
- Viewing previous versions of note content
- Understanding note edit history
- Recovering lost or deleted content from history

WORKFLOW:
1. Call list_all_revisions to get revision IDs
2. Filter by item_id to find revisions for your target note
3. Call get_revision with the specific revision_id
4. Examine the diff fields to see changes

RETURNS: Detailed revision information including:
- id, parent_id - Revision identification and chain
- item_id - The note ID this revision belongs to
- item_type - Usually "note"
- item_updated_time - When the note was modified
- title_diff - Changes to note title (diff format)
- body_diff - Changes to note content (diff format)
- metadata_diff - Changes to note metadata (diff format)
- encryption_applied, encryption_cipher_text - Encryption info if applicable
- created_time, updated_time - Revision timestamps

DIFF FORMAT: The *_diff fields contain diff-style changes showing what was added/removed between versions. This allows you to see exactly what changed without storing full note copies.

USE CASE: Recovering accidentally deleted content, understanding who changed what (when combined with timestamps), viewing note evolution over time.`,
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
    ];
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: this.getToolsDefinitions(),
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

  /**
   * Generate Gemini CLI-compatible TOML configuration
   */
  generateToml(): string {
    // Get the tools list by manually extracting from the schema
    // This is the same list we return from ListToolsRequestSchema
    const tools = this.getToolsList();

    let toml = 'description = "Interact with the Joplin note-taking app."\n';
    toml += 'prompt = """\n';
    toml += 'You are a command parser for the Joplin extension.\n';
    toml += '\n';
    toml += 'User input: {{args}}\n';
    toml += '\n';
    toml += "Parse the user's input and call the appropriate Joplin tool.\n";
    toml += '"""\n';
    toml += '\n';
    toml += '[tools]\n';

    for (const tool of tools) {
      // Get first line of description for TOML (strip strategic guidance for brevity)
      const firstLine =
        tool.description
          .split('\n')
          .filter(
            (line) => line.trim() && !line.includes('STRATEGIC GUIDANCE'),
          )[0]
          ?.trim() ||
        tool.description.split('\n')[0]?.trim() ||
        'No description';

      toml += `${tool.name} = {\n`;
      toml += `  description = "${this.escapeTomlString(firstLine)}",\n`;
      toml += `  args = {\n`;

      const properties = tool.inputSchema?.properties || {};
      const propertyEntries = Object.entries(properties);

      for (let i = 0; i < propertyEntries.length; i++) {
        const [key, schema] = propertyEntries[i];
        const description =
          (schema as { description?: string }).description || '';
        const isLast = i === propertyEntries.length - 1;
        toml += `    ${key} = "${this.escapeTomlString(description)}"${isLast ? '' : ','}\n`;
      }

      toml += `  }\n`;
      toml += `}\n`;
      toml += '\n';
    }

    return toml;
  }

  /**
   * Escape special characters for TOML strings
   */
  private escapeTomlString(str: string): string {
    return str
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, ' ')
      .replace(/\r/g, '')
      .replace(/\t/g, ' ');
  }

  /**
   * Get the tools list (same as what ListToolsRequestSchema returns)
   */
  private getToolsList() {
    return this.getToolsDefinitions();
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

// Only run CLI logic if this is the main module (not imported for tests)
// Check if we're being run directly by comparing the URL to the actual resolved path
// Use realpathSync to resolve symlinks for both paths
const scriptPath = process.argv[1]
  ? realpathSync(resolve(process.argv[1]))
  : '';
const modulePath = realpathSync(fileURLToPath(import.meta.url));
const isMainModule = scriptPath && modulePath === scriptPath;

if (isMainModule) {
  // Parse command line arguments
  program
    .option(
      '--generate-toml',
      'Generate Gemini CLI TOML configuration and exit',
    )
    .parse(process.argv);

  const options = program.opts();

  if (options.generateToml) {
    // Generate TOML and exit
    // Suppress stderr output during TOML generation
    const originalStderrWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (() => true) as typeof process.stderr.write;

    const server = new JoplinServer();

    // Restore stderr
    process.stderr.write = originalStderrWrite;

    console.log(server.generateToml());
    process.exit(0);
  } else {
    // Start MCP server normally
    const server = new JoplinServer();
    server.run().catch(() => {
      process.exit(1);
    });
  }
}
