import type { Command } from "commander";
import { Erc20Token } from "acp-node-v2";
import { createAgentFromEnv } from "../lib/agentFactory";
import { isJson, outputResult, outputError } from "../lib/output";
import { getClient } from "../lib/api/client";

export function registerBuyerCommands(program: Command): void {
  const buyer = program
    .command("buyer")
    .description("Buyer-side commands (create jobs, fund, complete, reject)");

  buyer
    .command("create-job")
    .description("Create a new job on-chain")
    .requiredOption("--provider <address>", "Provider (seller) wallet address")
    .option(
      "--evaluator <address>",
      "Evaluator wallet address (defaults to your own)"
    )
    .requiredOption("--description <text>", "Job description")
    .requiredOption("--chain-id <id>", "Chain ID", "8453")
    .option("--expired-in <seconds>", "Seconds until expiry", "3600")
    .option("--hook <address>", "Hook address")
    .action(async (opts, cmd) => {
      const json = isJson(cmd);
      try {
        const agent = await createAgentFromEnv();
        await agent.start();
        try {
          const buyerAddress = await agent.getAddress();
          const evaluator = opts.evaluator ?? buyerAddress;
          const expiredAt =
            Math.floor(Date.now() / 1000) + Number(opts.expiredIn);

          const jobId = await agent.createJob({
            providerAddress: opts.provider,
            evaluatorAddress: evaluator,
            expiredAt,
            description: opts.description,
            hookAddress: opts.hook,
          });

          outputResult(json, {
            success: true,
            action: "create-job",
            jobId: jobId.toString(),
            provider: opts.provider,
            evaluator,
            description: opts.description,
            hookAddress: opts.hook ?? "N/A",
          });
        } finally {
          await agent.stop();
        }
      } catch (err) {
        outputError(json, err instanceof Error ? err.message : String(err));
      }
    });

  buyer
    .command("fund")
    .description("Fund a job with the agreed budget (USDC)")
    .requiredOption("--job-id <id>", "On-chain job ID")
    .requiredOption("--amount <usdc>", "USDC amount to fund")
    .requiredOption("--chain-id <id>", "Chain ID", "8453")
    .action(async (opts, cmd) => {
      const json = isJson(cmd);
      try {
        const chainId = Number(opts.chainId);
        const agent = await createAgentFromEnv();
        await agent.start();
        try {
          const session = agent.getSession(opts.jobId, chainId);
          if (!session) {
            throw new Error(
              `No session found for job ${opts.jobId}. The job may not exist or you may not be a participant.`
            );
          }

          const { jobApi } = await getClient(await agent.getAddress());
          const job = await jobApi.getJob(chainId, opts.jobId);

          const payableIntent = job.intents.find(
            (intent) => intent.isSigned === false && BigInt(intent.amount) > 0
          );

          if (payableIntent && job.hookAddress) {
            await session.approveAllowance(
              payableIntent.tokenAddress,
              job.hookAddress,
              BigInt(payableIntent.amount)
            );
          }

          await session.fund(Erc20Token.usdc(Number(opts.amount)));
          outputResult(json, {
            success: true,
            action: "fund",
            jobId: opts.jobId,
            amount: opts.amount,
          });
        } finally {
          await agent.stop();
        }
      } catch (err) {
        outputError(json, err instanceof Error ? err.message : String(err));
      }
    });

  buyer
    .command("complete")
    .description("Approve and complete a job (as evaluator)")
    .requiredOption("--job-id <id>", "On-chain job ID")
    .requiredOption("--chain-id <id>", "Chain ID", "8453")
    .option("--reason <text>", "Reason for completion", "Approved")
    .action(async (opts, cmd) => {
      const json = isJson(cmd);
      try {
        const agent = await createAgentFromEnv();
        await agent.start();
        try {
          const session = agent.getSession(opts.jobId, Number(opts.chainId));
          if (!session) {
            throw new Error(`No session found for job ${opts.jobId}.`);
          }
          await session.complete(opts.reason);
          outputResult(json, {
            success: true,
            action: "complete",
            jobId: opts.jobId,
            reason: opts.reason,
          });
        } finally {
          await agent.stop();
        }
      } catch (err) {
        outputError(json, err instanceof Error ? err.message : String(err));
      }
    });

  buyer
    .command("reject")
    .description("Reject a job or deliverable (as evaluator)")
    .requiredOption("--job-id <id>", "On-chain job ID")
    .requiredOption("--chain-id <id>", "Chain ID", "8453")
    .option("--reason <text>", "Reason for rejection", "Rejected")
    .action(async (opts, cmd) => {
      const json = isJson(cmd);
      try {
        const agent = await createAgentFromEnv();
        await agent.start();
        try {
          const session = agent.getSession(opts.jobId, Number(opts.chainId));
          if (!session) {
            throw new Error(`No session found for job ${opts.jobId}.`);
          }
          await session.reject(opts.reason);
          outputResult(json, {
            success: true,
            action: "reject",
            jobId: opts.jobId,
            reason: opts.reason,
          });
        } finally {
          await agent.stop();
        }
      } catch (err) {
        outputError(json, err instanceof Error ? err.message : String(err));
      }
    });
}
