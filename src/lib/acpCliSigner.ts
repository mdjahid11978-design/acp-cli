import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { join, dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BINARY = join(__dirname, "../../bin/acp-cli-signer");

interface GenerateResult {
  publicKey: string;
}

interface SignResult {
  signature: string;
}

interface ErrorResult {
  error: string;
}

function runBinary(args: string[], stdin?: string): unknown {
  const output = execFileSync(BINARY, args, { encoding: "utf8", input: stdin });
  return JSON.parse(output.trim());
}

/**
 * Generates a P256 key pair. The private key is stored securely in the OS
 * keychain. Returns only the base64-encoded uncompressed public key.
 */
export function generateKeyPair(): string {
  const res = runBinary(["generate"]) as GenerateResult | ErrorResult;
  if ("error" in res) throw new Error(`acp-cli-signer:${res.error}`);
  return res.publicKey;
}

/**
 * Signs `payload` using the P256 private key stored in the OS keychain for
 * the given base64 public key. Returns a base64-encoded 64-byte R||S
 * signature (IEEE P1363 / WebCrypto compatible).
 */
export function signPayload(publicKeyB64: string, payload: string): string {
  const res = runBinary([
    "sign",
    "--public-key",
    publicKeyB64,
    "--payload",
    payload,
  ]) as SignResult | ErrorResult;
  if ("error" in res) throw new Error(`acp-cli-signer:${res.error}`);
  return res.signature;
}

/**
 * Builds, canonicalizes, and signs a Privy authorization payload in the Go
 * binary, following https://docs.privy.io exactly (RFC 8785 + ECDSA P-256).
 * The private key is looked up in the OS keychain via its base64 public key —
 * Node.js never handles the key material.
 */
export function signPrivyAuthorization(
  method: string,
  url: string,
  body: unknown,
  appId: string,
  publicKeyB64: string,
): string {
  const res = runBinary([
    "sign-privy-auth",
    "--method", method,
    "--url", url,
    "--body", JSON.stringify(body),
    "--app-id", appId,
    "--public-key", publicKeyB64,
  ]) as SignResult | ErrorResult;
  if ("error" in res) throw new Error(`acp-cli-signer:${res.error}`);
  return res.signature;
}
