import type { BrowseAgent } from "../api/agent";
import type { ProtocolVersion } from "./types";

/**
 * Detects which protocol version an agent uses based on its chain registrations.
 * - If any chain has virtualAgentId set and acpV2AgentId is null → v1 (openclaw/acp-node)
 * - Otherwise → v2 (acp-node-v2)
 */
export function detectProtocolVersion(agent: BrowseAgent): ProtocolVersion {
  const hasV1Only = agent.chains.some(
    (c) => c.virtualAgentId != null && c.acpV2AgentId == null
  );
  return hasV1Only ? "v1" : "v2";
}
