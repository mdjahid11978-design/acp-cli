import type { Command } from "commander";
import { formatUnits } from "viem";
import { isJson, outputResult, outputError, isTTY } from "../lib/output";
import { getWalletAddress, createProviderAdapter } from "../lib/agentFactory";
import { getClient } from "../lib/api/client";
import { getAgentId, getActiveWallet } from "../lib/config";
import { CHAIN_NETWORK_MAP } from "../lib/api/agent";
import { CliError } from "../lib/errors";
import { c } from "../lib/color";

export function registerWalletCommands(program: Command): void {
  const wallet = program
    .command("wallet")
    .description("Wallet commands");

  wallet
    .command("address")
    .description("Show the configured wallet address")
    .action((_opts, cmd) => {
      const json = isJson(cmd);
      try {
        const address = getWalletAddress();
        outputResult(json, { address });
      } catch (err) {
        outputError(json, err instanceof Error ? err : String(err));
      }
    });

  wallet
    .command("sign-message")
    .description("Sign a plaintext message with the active wallet")
    .requiredOption("--message <text>", "Message to sign")
    .requiredOption("--chain-id <id>", "Chain ID", "8453")
    .action(async (opts, cmd) => {
      const json = isJson(cmd);
      try {
        const provider = await createProviderAdapter();
        const signature = await provider.signMessage(
          Number(opts.chainId),
          opts.message
        );
        outputResult(json, { signature });
      } catch (err) {
        outputError(json, err instanceof Error ? err : String(err));
      }
    });

  wallet
    .command("sign-typed-data")
    .description("Sign EIP-712 typed data with the active wallet")
    .requiredOption("--data <json>", "EIP-712 typed data as JSON string")
    .requiredOption("--chain-id <id>", "Chain ID", "8453")
    .action(async (opts, cmd) => {
      const json = isJson(cmd);
      try {
        let typedData: unknown;
        try {
          typedData = JSON.parse(opts.data);
        } catch {
          throw new CliError(
            "Invalid JSON in --data",
            "VALIDATION_ERROR",
            "Provide a valid JSON string with domain, types, primaryType, and message fields."
          );
        }

        if (
          typeof typedData !== "object" ||
          typedData === null ||
          !("domain" in typedData) ||
          !("types" in typedData) ||
          !("primaryType" in typedData) ||
          !("message" in typedData)
        ) {
          throw new CliError(
            "Typed data must include domain, types, primaryType, and message fields.",
            "VALIDATION_ERROR",
            "See EIP-712 for the expected structure."
          );
        }

        const provider = await createProviderAdapter();
        const signature = await provider.signTypedData(
          Number(opts.chainId),
          typedData
        );
        outputResult(json, { signature });
      } catch (err) {
        outputError(json, err instanceof Error ? err : String(err));
      }
    });

  wallet
    .command("balance")
    .description("Show token balances for the active wallet")
    .requiredOption("--chain-id <id>", "Chain ID")
    .action(async (opts, cmd) => {
      const json = isJson(cmd);
      try {
        const chainId = Number(opts.chainId);
        const network = CHAIN_NETWORK_MAP[chainId];
        if (!network) {
          throw new CliError(
            `Unsupported chain ID: ${chainId}`,
            "VALIDATION_ERROR",
            `Supported chain IDs: ${Object.entries(CHAIN_NETWORK_MAP).map(([id, name]) => `${id} (${name})`).join(", ")}`
          );
        }

        const walletAddress = getWalletAddress();
        const activeWallet = getActiveWallet();
        const agentId = activeWallet ? getAgentId(activeWallet) : undefined;
        if (!agentId) {
          throw new CliError(
            "Agent ID not found for active wallet.",
            "NO_ACTIVE_AGENT",
            "Run `acp agent list` or `acp agent use` to set an active agent."
          );
        }

        const { agentApi } = await getClient();
        const assets = await agentApi.getAgentAssets(agentId, [network]);
        const tokens = assets.data.tokens;

        if (json) {
          outputResult(json, {
            chainId,
            network,
            address: walletAddress,
            tokens,
          });
          return;
        }

        if (isTTY()) {
          console.log(`\n${c.bold(`Wallet Balance on ${network} (${chainId})`)}\n`);
          console.log(`  ${c.bold("Address:")}  ${c.dim(walletAddress)}\n`);

          if (tokens.length === 0) {
            console.log("  No tokens found.\n");
          } else {
            const header = `  ${c.dim("TOKEN".padEnd(10))}${c.dim("NAME".padEnd(22))}${c.dim("BALANCE".padEnd(24))}${c.dim("USD")}`;
            console.log(header);
            for (const t of tokens) {
              const isNative = t.tokenAddress === null;
              const symbol = t.tokenMetadata.symbol ?? (isNative ? "ETH" : "???");
              const name = t.tokenMetadata.name ?? (isNative ? "Ether" : "");
              const decimals = t.tokenMetadata.decimals ?? 18;
              const balance = formatUnits(BigInt(t.tokenBalance), decimals);
              const bal = balance.length > 22 ? balance.slice(0, 22) : balance;
              const unitPrice = parseFloat(t.tokenPrices?.[0]?.value ?? "0");
              const value = unitPrice * parseFloat(balance);
              const price = `$${value.toFixed(2)}`;
              console.log(
                `  ${c.cyan(symbol.padEnd(10))}${name.padEnd(22)}${bal.padEnd(24)}${price}`
              );
            }
            console.log("");
          }
        } else {
          console.log("TOKEN\tNAME\tBALANCE\tUSD\tCONTRACT");
          for (const t of tokens) {
            const isNative = t.tokenAddress === null;
            const symbol = t.tokenMetadata.symbol ?? (isNative ? "ETH" : "???");
            const name = t.tokenMetadata.name ?? (isNative ? "Ether" : "");
            const decimals = t.tokenMetadata.decimals ?? 18;
            const balance = formatUnits(BigInt(t.tokenBalance), decimals);
            const unitPrice = parseFloat(t.tokenPrices?.[0]?.value ?? "0");
            const value = unitPrice * parseFloat(balance);
            console.log(
              `${symbol}\t${name}\t${balance}\t$${value.toFixed(2)}\t${t.tokenAddress ?? "native"}`
            );
          }
        }
      } catch (err) {
        outputError(json, err instanceof Error ? err : String(err));
      }
    });
}
