import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const CONFIG_PATH = resolve(process.cwd(), "config.json");

interface AgentConfig {
  publicKey: string;
}

interface Config {
  acp_token?: string;
  agents?: Record<string, AgentConfig>;
}

function loadConfig(): Config {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as Config;
  } catch {
    return {};
  }
}

function saveConfig(config: Config): void {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
}

export function getToken(): string | undefined {
  return loadConfig().acp_token;
}

export function setupEnv(): void {
  const token = getToken();
  if (token) process.env.ACP_TOKEN = token;
}

export function setToken(token: string): void {
  const config = loadConfig();
  config.acp_token = token;
  saveConfig(config);
}

export function getPublicKey(agentAddress: string): string | undefined {
  return loadConfig().agents?.[agentAddress]?.publicKey;
}

export function setPublicKey(agentAddress: string, publicKey: string): void {
  const config = loadConfig();
  config.agents ??= {};
  config.agents[agentAddress] ??= { publicKey: "" };
  config.agents[agentAddress].publicKey = publicKey;
  saveConfig(config);
}
