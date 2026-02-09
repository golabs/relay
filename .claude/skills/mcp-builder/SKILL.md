# MCP Builder Skill

Generate production-ready Model Context Protocol (MCP) server boilerplate in Python or TypeScript.

## When to Use

Use this skill when:
- Building a custom MCP integration for an API or service
- Creating a new MCP server for Claude Desktop, Claude Code, or VS Code
- Needing boilerplate for OAuth, tools, resources, or prompts

## How to Invoke

```
/mcp-builder [service-name] --lang [python|typescript]
```

## Process

### Step 1: Gather Requirements

Ask the user:
1. What service/API are you connecting to?
2. What operations should be available as tools?
3. Does it need OAuth authentication?
4. Python or TypeScript?

### Step 2: Generate Server Structure

**For Python (using FastMCP):**

```
my-mcp-server/
├── pyproject.toml
├── README.md
├── src/
│   └── my_mcp_server/
│       ├── __init__.py
│       ├── server.py      # Main MCP server
│       ├── tools.py       # Tool definitions
│       ├── resources.py   # Resource handlers
│       └── auth.py        # OAuth if needed
└── tests/
    └── test_server.py
```

**For TypeScript:**

```
my-mcp-server/
├── package.json
├── tsconfig.json
├── README.md
├── src/
│   ├── index.ts          # Main entry
│   ├── server.ts         # MCP server setup
│   ├── tools/            # Tool implementations
│   └── resources/        # Resource handlers
└── tests/
```

### Step 3: Generate Code

**Python FastMCP Example:**

```python
from fastmcp import FastMCP

mcp = FastMCP("my-service")

@mcp.tool()
def my_tool(param: str) -> str:
    """Description of what this tool does."""
    # Implementation
    return result

@mcp.resource("my-resource://{id}")
def get_resource(id: str) -> str:
    """Fetch a resource by ID."""
    return content

if __name__ == "__main__":
    mcp.run()
```

**TypeScript Example:**

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new Server({
  name: "my-service",
  version: "1.0.0",
});

server.setRequestHandler("tools/call", async (request) => {
  // Handle tool calls
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

### Step 4: Generate Configuration

**For Claude Desktop (claude_desktop_config.json):**

```json
{
  "mcpServers": {
    "my-service": {
      "command": "python",
      "args": ["-m", "my_mcp_server"]
    }
  }
}
```

**For Claude Code (mcp_servers.json):**

```json
{
  "mcpServers": {
    "my-service": {
      "command": "npx",
      "args": ["-y", "my-mcp-server"]
    }
  }
}
```

### Step 5: Add OAuth (if needed)

For services requiring OAuth:

```python
from fastmcp.oauth import OAuth2Provider

oauth = OAuth2Provider(
    client_id=os.getenv("CLIENT_ID"),
    client_secret=os.getenv("CLIENT_SECRET"),
    authorize_url="https://service.com/oauth/authorize",
    token_url="https://service.com/oauth/token",
)

@mcp.tool()
@oauth.required
def authenticated_tool(token: str, param: str):
    # Use token to call API
    pass
```

## Output

Generate:
1. Complete directory structure
2. All source files with implementations
3. Configuration for Claude Desktop/Code
4. README with setup instructions
5. Basic tests

## References

- [MCP Specification](https://modelcontextprotocol.io)
- [FastMCP](https://github.com/jlowin/fastmcp)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
