import type { Command } from "commander";
import { isJson, outputError } from "../lib/output";
import { getClient } from "../lib/api/client";
import type { BrowseAgent } from "../lib/api/agent";

type Offering = BrowseAgent["offerings"][number];
type Resource = BrowseAgent["resources"][number];

function formatPrice(priceType: string, priceValue: string): string {
  if (priceType.toUpperCase() === "FIXED") {
    return `${parseFloat(priceValue)} USDC`;
  }
  if (priceType.toUpperCase() === "PERCENTAGE") {
    return `${parseFloat((parseFloat(priceValue) * 100).toFixed(2))}%`;
  }
  return `${priceValue} (${priceType})`;
}

function formatOneLiner(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function printOffering(o: Offering): void {
  console.log(`    - ${o.name}`);
  console.log(`      Description:   ${o.description}`);
  console.log(`      Requirements:  ${formatOneLiner(o.requirements)}`);
  console.log(`      Deliverable:   ${formatOneLiner(o.deliverable)}`);
  console.log(`      Price:         ${formatPrice(o.priceType, o.priceValue)}`);
}

function printResource(r: Resource): void {
  console.log(`    - ${r.name}`);
  console.log(`      Description:   ${r.description}`);
  console.log(`      Params:        ${formatOneLiner(r.params)}`);
  console.log(`      URL:           ${r.url}`);
}

export function registerBrowseCommand(program: Command): void {
  program
    .command("browse")
    .description("Browse available agents")
    .requiredOption("--query <query>", "Search query")
    .requiredOption(
      "--chain-ids <ids>",
      "Comma-separated chain IDs to filter by"
    )
    .action(async (opts, cmd) => {
      const { agentApi } = await getClient();
      const json = isJson(cmd);

      const chainIds = opts.chainIds
        ? opts.chainIds.split(",").map((id: string) => parseInt(id.trim(), 10))
        : undefined;

      try {
        const result = await agentApi.browse(opts.query, chainIds);

        const { data } = result;

        if (json) {
          process.stdout.write(JSON.stringify(result) + "\n");
          return;
        }

        if (data.length === 0) {
          console.log("No agents found.");
          return;
        }

        for (const a of data) {
          console.log(`  Name:           ${a.name}`);
          console.log(`  Description:    ${a.description}`);
          console.log(`  Wallet:         ${a.walletAddress}`);
          if (a.chains.length > 0) {
            console.log(
              `  Chains:         ${a.chains.map((c) => c.chainId).join(", ")}`
            );
          }
          if (a.offerings.length > 0) {
            console.log(`  Offerings:`);
            for (const o of a.offerings) {
              printOffering(o);
            }
          }
          if (a.resources.length > 0) {
            console.log(`  Resources:`);
            for (const r of a.resources) {
              printResource(r);
            }
          }
          console.log("");
        }

        console.log(`\n${data.length} agent(s) found.`);
      } catch (err) {
        outputError(
          json,
          `Failed to browse agents: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    });
}
