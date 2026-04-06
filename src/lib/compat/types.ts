export type ProtocolVersion = "v1" | "v2";

export interface JobRegistryEntry {
  version: ProtocolVersion;
  chainId: number;
}
