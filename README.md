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

### Enable Joplin Web Clipper

1. Open Joplin desktop application
2. Go to **Tools → Options → Web Clipper**
3. Enable the Web Clipper service

After the Web Clipper is enabled, joplin-mcp will automatically discover the API token. If this doesn't work for you, add the `JOPLIN_TOKEN` environment variable to your `.bashrc` or shell configuration. You can find the token in **Tools → Options → Web Clipper** inside the Joplin desktop app.

## Installation

### For Claude Code

```bash
claude mcp add --transport stdio joplin -- npx -y @belsar-ai/joplin-mcp
```

### For Claude Desktop

Add this to your Claude Desktop config file (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS or `%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "joplin": {
      "command": "npx",
      "args": ["-y", "@belsar-ai/joplin-mcp"]
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
      "args": ["-y", "@belsar-ai/joplin-mcp"]
    }
  }
}
```

### For Other MCP Clients

Use the standard MCP configuration format with:

- **Command**: `npx`
- **Args**: `["-y", "@belsar-ai/joplin-mcp"]`

### Direct Usage

You can also install and run directly with Node.js:

```bash
npm install -g @belsar-ai/joplin-mcp
joplin-mcp
```

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
git clone https://github.com/belsar-ai/joplin-mcp.git
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

## Releasing

This project uses automated npm publishing via GitHub Actions with npm's Trusted Publishers (OIDC).

### One-Time Setup

Configure npm Trusted Publisher (maintainers only):

1. Go to https://www.npmjs.com/package/@belsar-ai/joplin-mcp/access
2. Click "Automated Publishing" → "Add Trusted Publisher"
3. Select "GitHub Actions"
4. Enter:
   - **Repository owner**: `belsar-ai`
   - **Repository name**: `joplin-mcp`
   - **Workflow file**: `publish.yaml`
   - **Environment**: (leave empty)

### Creating Releases

**For stable releases:**

```bash
make release-patch   # 0.2.2 → 0.2.3 (bug fixes)
make release-minor   # 0.2.0 → 0.3.0 (new features)
make release-major   # 0.2.0 → 1.0.0 (breaking changes)
git push origin main --tags
```

**For beta releases:**

```bash
make release-beta    # 0.2.2 → 0.2.3-beta.0
git push origin main --tags
```

**To promote a tested beta to stable:**

```bash
git checkout v0.3.0-beta.0   # Checkout tested beta
git tag v0.3.0               # Tag without -beta suffix
git push origin v0.3.0       # Publishes to latest
```

The GitHub Action automatically:

- Runs tests, typecheck, and linting
- Builds the project
- Publishes to npm (`latest` or `beta` channel based on version)
- Creates a GitHub release

## Troubleshooting

### Connection Issues

- Verify Joplin desktop app is running
- Confirm Web Clipper is enabled in Joplin settings
- Ensure Joplin is listening on port 41184 (default)
- If auto-discovery fails, set `JOPLIN_TOKEN` in your environment (add to `.bashrc` or shell config)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

Apache-2.0

## Links

- [GitHub Repository](https://github.com/belsar-ai/joplin-mcp)
- [Report Issues](https://github.com/belsar-ai/joplin-mcp/issues)
- [Joplin Website](https://joplinapp.org/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
