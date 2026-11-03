import { createMcpUnavailableResponse, mcpConfig } from "@/lib/mcp/config"
import {
  buildAuthorizationServerMetadata,
  metadataResponse,
} from "@/lib/mcp/oauth/metadata"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** RFC 8414 authorization server metadata. */
export async function GET() {
  if (!mcpConfig.enabled) {
    return createMcpUnavailableResponse()
  }

  return metadataResponse(buildAuthorizationServerMetadata(mcpConfig))
}
