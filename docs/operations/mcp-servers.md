# MCP Servers: Agent tools


## Available servers

| Server | Package | Purpose | Key capabilities | Credentials |
|--------|---------|---------|-----------------|-------------|
| Context7 | `@upstash/context7-mcp@latest` (via `npx`, `.mcp.json`) | Documentation à jour des bibliothèques et outils | `resolve-library-id`, `query-docs` | Aucune |

## Workflow automation hints

> Combinations of MCP servers that enable useful automated workflows.
> Used by Kronn to suggest workflow templates for this project.

| MCP combination | Possible workflow | Target audience |
|-----------------|-------------------|-----------------|
| N/A: not used in this project | Un seul serveur MCP configuré ; Jira, GitHub et Graph sont lus par les crons à travers les connexions Kronn, pas par un MCP d'agent [src: file: README.md:35] | N/A |

## Per-MCP context files

Each MCP has a context file at `operations/mcp-servers/<slug>.md` with project-specific rules.
If a context file exists for an MCP, agents should read it before calling that MCP's tools.

## Files

| File | Committed | Purpose |
|------|-----------|---------|
| `.mcp.json` | No (gitignored) | Agent MCP config (managed by Kronn) |
