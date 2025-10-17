# joplin-mcp

Model Context Protocol (MCP) server for the [Joplin](https://joplinapp.org/) note-taking application.

This MCP server enables AI assistants to interact with your Joplin notes through a standardized protocol. It provides tools for searching, creating, updating, and managing notes, notebooks, tags, and resources.

## Features

- **Search notes** by title, content, tags, or notebooks
- **Create and update notes** with full markdown support
- **Manage notebooks** - create, list, and organize
- **Tag management** - add, remove, and search by tags
- **Attach resources** - add images and files to notes
- **Revision history** - access and restore previous note versions

## Prerequisites

- Node.js 18.0.0 or higher
- [Joplin desktop app](https://joplinapp.org/) with Web Clipper service enabled
- Joplin API authorization token

### Enable Joplin Web Clipper

1. Open Joplin desktop application
2. Go to **Tools → Options → Web Clipper**
3. Enable the Web Clipper service
4. Note the authorization token shown

## Installation

### For Claude Desktop

Add this to your Claude Desktop config file (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS or `%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "joplin": {
      "command": "npx",
      "args": ["-y", "joplin-mcp"],
      "env": {
        "JOPLIN_TOKEN": "your_joplin_api_token_here"
      }
    }
  }
}
```

### For Cline (VS Code Extension)

Add this to your Cline MCP settings:

```json
{
  "mcpServers": {
    "joplin": {
      "command": "npx",
      "args": ["-y", "joplin-mcp"],
      "env": {
        "JOPLIN_TOKEN": "your_joplin_api_token_here"
      }
    }
  }
}
```

### For Other MCP Clients

Use the standard MCP configuration format with:

- **Command**: `npx`
- **Args**: `["-y", "joplin-mcp"]`
- **Environment**: `JOPLIN_TOKEN=your_token_here`

### Direct Usage

You can also install and run directly with Node.js:

```bash
npm install -g joplin-mcp
JOPLIN_TOKEN=your_token_here joplin-mcp
```

## API Token Setup

To get your Joplin API token:

1. Open Joplin
2. Navigate to **Tools → Options → Web Clipper**
3. Make sure "Enable Web Clipper Service" is checked
4. Copy the authorization token displayed
5. Use this token in the `JOPLIN_TOKEN` environment variable

## Available Tools

The MCP server exposes these tool endpoints:

- **Notebooks** `list_notebooks`, `create_notebook`, `get_notebook_notes`, `update_notebook`, `delete_notebook`, `get_notebook_by_id`, `move_note_to_notebook`
- **Notes** `list_all_notes`, `search_notes`, `get_note`, `create_note`, `update_note`, `append_to_note`, `prepend_to_note`, `delete_note`
- **Tags** `add_tags_to_note`, `remove_tags_from_note`, `list_tags`, `rename_tag`, `delete_tag`, `get_tag_by_id`, `get_notes_by_tag`
- **Resources** `list_all_resources`, `get_resource_metadata`, `get_note_attachments`, `get_resource_notes`, `download_attachment`, `upload_attachment`, `update_resource`, `delete_resource`
- **Revisions** `list_all_revisions`, `get_revision`

## Development

### Setup

```bash
git clone https://github.com/Lyonk71/joplin-mcp.git
cd joplin-mcp
npm install
```

### Build

```bash
npm run build
```

### Test

```bash
npm test
```

### Development Mode (watch mode)

```bash
npm run dev
```

### Linting and Formatting

```bash
npm run format
npm run lint
```

## Troubleshooting

### Connection Issues

- Verify Joplin desktop app is running
- Confirm Web Clipper is enabled in Joplin settings
- Check that your API token is correct
- Ensure Joplin is listening on port 41184 (default)

### Permission Errors

Make sure the JOPLIN_TOKEN environment variable is set correctly with a valid authorization token.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

Apache-2.0

## Links

- [GitHub Repository](https://github.com/Lyonk71/joplin-mcp)
- [Report Issues](https://github.com/Lyonk71/joplin-mcp/issues)
- [Joplin Website](https://joplinapp.org/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
