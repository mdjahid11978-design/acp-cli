import { exec } from "child_process";
import type { Command } from "commander";
import { isJson, outputResult, outputError } from "../lib/output";
import { AuthApi } from "../lib/api/auth";
import { ApiClient } from "../lib/api/client";
import { setToken } from "../lib/config";

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

function openBrowser(url: string): void {
  const cmd =
    process.platform === "win32"
      ? `start "" "${url}"`
      : process.platform === "darwin"
      ? `open "${url}"`
      : `xdg-open "${url}"`;
  exec(cmd);
}


async function waitForToken(
  authApi: AuthApi,
  requestId: string
): Promise<string | null> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const token = await authApi.pollCliToken(requestId);
    if (token) return token;
  }
  return null;
}

export function registerConfigureCommand(program: Command): void {
  program
    .command("configure")
    .description("Authenticate the CLI with ACP")
    .action(async (_opts, cmd) => {
      const json = isJson(cmd);
      const apiUrl = process.env.ACP_API_URL;
      if (!apiUrl) {
        outputError(json, "ACP_API_URL is not set");
        return;
      }

      const authApi = new AuthApi(new ApiClient(apiUrl));

      let url: string;
      let requestId: string;
      try {
        ({ url, requestId } = await authApi.getCliUrl());
      } catch (err) {
        outputError(
          json,
          `Failed to get auth URL: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
        return;
      }

      if (json) {
        process.stdout.write(JSON.stringify({ url }) + "\n");
      } else {
        console.log(`\nOpen this URL to authenticate:\n\n  ${url}\n`);
      }
      openBrowser(url);

      if (!json) console.log("Waiting for authentication...");

      const token = await waitForToken(authApi, requestId);
      if (!token) {
        outputError(
          json,
          "Authentication timed out. Please run `acp configure` again."
        );
        return;
      }

      setToken(token);

      if (json) {
        outputResult(json, {
          message: "Successfully authenticated to ACP CLI",
        });
      } else {
        console.log("Successfully authenticated to ACP CLI");
      }
    });
}
