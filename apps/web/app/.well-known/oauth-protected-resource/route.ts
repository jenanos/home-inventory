import { createMcpUnavailableResponse, mcpConfig } from "@/lib/mcp/config"
import {
  buildProtectedResourceMetadata,
  metadataResponse,
} from "@/lib/mcp/oauth/metadata"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** RFC 9728 root fallback for clients that do not use the path-suffixed form. */
export async function GET() {
  if (!mcpConfig.enabled) {
    return createMcpUnavailableResponse()
  }

  return metadataResponse(buildProtectedResourceMetadata(mcpConfig))
}
