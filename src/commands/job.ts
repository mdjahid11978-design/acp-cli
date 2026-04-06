import type { Command } from "commander";
import { isJson, outputResult, outputError } from "../lib/output";
import { getWalletAddress, createV1BuyerAdapter } from "../lib/agentFactory";
import { getClient } from "../lib/api/client";
import { formatUnits } from "viem";
import { getJobRegistryEntry, getV1Jobs } from "../lib/config";
import { V1BuyerAdapter } from "../lib/compat/v1BuyerAdapter";

export function registerJobCommands(program: Command): void {
  const job = program.command("job").description("Job queries (history, list)");

  job
    .command("list")
    .description("List active jobs (REST, no socket connection needed)")
    .action(async (_opts, cmd) => {
      const json = isJson(cmd);
      try {
        const wallet = getWalletAddress();

        const { jobApi } = await getClient(wallet);
        const v2Jobs = await jobApi.getActiveJobs();

        // Tag v2 jobs
        const taggedV2 = v2Jobs.map((j: any) => ({ ...j, protocol: "v2" }));

        // Also fetch v1 jobs if any exist in registry
        let taggedV1: any[] = [];
        const v1Registry = getV1Jobs();
        if (Object.keys(v1Registry).length > 0) {
          try {
            const adapter = await createV1BuyerAdapter();
            const v1Jobs = await adapter.getActiveJobs();
            taggedV1 = v1Jobs.map((j) => ({
              onChainJobId: String(j.id),
              chainId: j.config.chain.id,
              clientAddress: j.clientAddress,
              providerAddress: j.providerAddress,
              evaluatorAddress: j.evaluatorAddress,
              budget: String(j.price),
              jobStatus: V1BuyerAdapter.phaseToStatus(j.phase),
              expiredAt: "",
              protocol: "v1",
            }));
          } catch {
            // V1 fetch failed — continue with v2 only
          }
        }

        const allJobs = [...taggedV2, ...taggedV1];

        if (json) {
          outputResult(true, { jobs: allJobs });
        } else {
          if (allJobs.length === 0) {
            console.log("No active jobs.");
          } else {
            console.log(`Active jobs (${allJobs.length}):\n`);
            for (const j of allJobs) {
              console.log(
                `  Job ID:           ${j.onChainJobId} [${j.protocol}]`
              );
              console.log(`  Chain ID:         ${j.chainId}`);
              console.log(`  Client:           ${j.clientAddress}`);
              console.log(`  Provider:         ${j.providerAddress}`);
              console.log(`  Evaluator:        ${j.evaluatorAddress}`);
              if (j.protocol === "v2") {
                console.log(
                  `  Budget:           ${formatUnits(
                    BigInt(j.budget),
                    6
                  )} USDC`
                );
              } else {
                console.log(`  Budget:           ${j.budget} USDC`);
              }
              console.log(`  Status:           ${j.jobStatus}`);
              if (j.expiredAt) {
                console.log(`  Expires At:       ${j.expiredAt}`);
              }
              console.log();
            }
          }
        }
      } catch (err) {
        outputError(json, err instanceof Error ? err.message : String(err));
      }
    });

  job
    .command("history")
    .description(
      "Get full job history including status and all messages (REST, no socket connection needed)"
    )
    .requiredOption("--job-id <id>", "On-chain job ID")
    .requiredOption("--chain-id <id>", "Chain ID", "84532")
    .action(async (opts, cmd) => {
      const json = isJson(cmd);
      try {
        const entry = getJobRegistryEntry(opts.jobId);

        if (entry?.version === "v1") {
          // V1 job history — fetch from old backend
          const adapter = await createV1BuyerAdapter(entry.chainId);
          const v1Job = await adapter.getJob(Number(opts.jobId));
          if (!v1Job) {
            throw new Error(`V1 job ${opts.jobId} not found`);
          }

          const status = V1BuyerAdapter.phaseToStatus(v1Job.phase);
          const memoEntries = v1Job.memos.map((m: any) => ({
            kind: "message" as const,
            from: m.senderAddress,
            content: m.content,
            contentType: "text",
            timestamp: Date.now(),
          }));

          if (json) {
            outputResult(true, {
              jobId: opts.jobId,
              chainId: entry.chainId,
              protocol: "v1",
              status,
              entryCount: memoEntries.length,
              entries: memoEntries,
            });
          } else {
            console.log(`Job ${opts.jobId} (chain ${entry.chainId}) [v1]`);
            console.log(`Status: ${status}`);
            console.log(`Memos: ${memoEntries.length}\n`);
            for (const e of memoEntries) {
              console.log(`  [${e.from}] ${e.content}`);
            }
          }
          return;
        }

        // Default: v2 flow
        const wallet = getWalletAddress();

        const { jobApi } = await getClient(wallet);
        const entries = await jobApi.getChatHistory(
          Number(opts.chainId),
          opts.jobId
        );

        const status = deriveStatus(entries);

        if (json) {
          outputResult(true, {
            jobId: opts.jobId,
            chainId: Number(opts.chainId),
            protocol: "v2",
            status,
            entryCount: entries.length,
            entries,
          });
        } else {
          console.log(`Job ${opts.jobId} (chain ${opts.chainId}) [v2]`);
          console.log(`Status: ${status}`);
          console.log(`Entries: ${entries.length}\n`);
          for (const e of entries) {
            if (e.kind === "system") {
              console.log(`  [system] ${e.event.type}`);
            } else {
              console.log(`  [${e.from}] ${e.content}`);
            }
          }
        }
      } catch (err) {
        outputError(json, err instanceof Error ? err.message : String(err));
      }
    });
}

type JobStatus =
  | "open"
  | "budget_set"
  | "funded"
  | "submitted"
  | "completed"
  | "rejected"
  | "expired";

const EVENT_TO_STATUS: Record<string, JobStatus> = {
  "job.created": "open",
  "budget.set": "budget_set",
  "job.funded": "funded",
  "job.submitted": "submitted",
  "job.completed": "completed",
  "job.rejected": "rejected",
  "job.expired": "expired",
};

function deriveStatus(
  entries: Array<{ kind: string; event?: { type: string } }>
): JobStatus {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i]!;
    if (entry.kind === "system" && entry.event) {
      const mapped = EVENT_TO_STATUS[entry.event.type];
      if (mapped) return mapped;
    }
  }
  return "open";
}
