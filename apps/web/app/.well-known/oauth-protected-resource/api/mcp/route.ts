import { createMcpUnavailableResponse, mcpConfig } from "@/lib/mcp/config"
import {
  buildProtectedResourceMetadata,
  metadataResponse,
} from "@/lib/mcp/oauth/metadata"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * RFC 9728 resource-specific location for the canonical resource
 * `<issuer>/api/mcp`. This is the URL advertised by the `WWW-Authenticate`
 * header on a 401 from the MCP endpoint.
 */
export async function GET() {
  if (!mcpConfig.enabled) {
    return createMcpUnavailableResponse()
  }

  return metadataResponse(buildProtectedResourceMetadata(mcpConfig))
}
