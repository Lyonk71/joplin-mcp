# joplin-mcp

Model Context Protocol (MCP) server for the [Joplin](https://joplinapp.org/) note-taking app.

Designed by belsar.ai to be easy to install & enjoyable to use.

## Quick Start

1. Open Joplin & navigate to tools > web clipper > enable web clipper service
2. The Joplin app needs to remain running (minimized is fine)
3. Pick the install command for your platform:

```bash
claude mcp add --transport stdio joplin -- npx -y @belsar-ai/joplin-mcp
```

```bash
codex mcp add joplin-mcp -- npx -y @belsar-ai/joplin-mcp
```

```bash
gemini extensions install https://github.com/belsar-ai/joplin-mcp
```

4. That's it. Send a test request like "Find my notes about installing Fedora linux".

## Uninstall

To uninstall:

```bash
claude mcp remove joplin
```

```bash
codex mcp remove joplin-mcp
```

```bash
gemini extensions uninstall joplin-mcp
```

## Example Usage

```
Find my notes about installing Arch Linux.
```

```
Did you find any outdated info in my Arch Installation note?
```

```
Look for all notes whose last update time was before 2025. tag those as 'archived'.
```

```
Show me all notes in my Work Projects notebook.
```

```
Make a new note with a Mermaid diagram showing how a bill is passed on Capitol Hill.
```

## Available Operations

| Category    | Operations                                                                                                                                                                  |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Notebooks   | List notebooks<br>Create notebook<br>Get notebook notes<br>Update notebook<br>Delete notebook<br>Get notebook by ID<br>Move note to notebook                                |
| Notes       | List all notes<br>Search notes<br>Get note<br>Create note<br>Update note<br>Append to note<br>Prepend to note<br>Delete note                                                |
| Tags        | Add tags to note<br>Remove tags from note<br>List tags<br>Rename tag<br>Delete tag<br>Get tag by ID<br>Get notes by tag                                                     |
| Attachments | List all resources<br>Get resource metadata<br>Get note attachments<br>Get resource notes<br>Download attachment<br>Upload attachment<br>Update resource<br>Delete resource |
| Revisions   | List all revisions<br>Get revision                                                                                                                                          |

## Troubleshooting

- Verify Joplin desktop app is running
- Confirm Web Clipper is enabled in Joplin settings
- Ensure Joplin is listening on port 41184 (default)
- If auto-discovery fails, set `JOPLIN_TOKEN` in your environment (add to `.bashrc` or shell config)
- Go outside for a nice walk
