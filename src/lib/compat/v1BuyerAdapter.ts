import AcpClientDefault, {
  AcpJob,
  AcpMemo,
  AcpContractConfig,
  baseSepoliaAcpConfigV2,
  baseAcpConfigV2,
  FareAmount,
  AcpJobPhases,
} from "@virtuals-protocol/acp-node";

// Handle CJS/ESM interop — default import may be double-wrapped
const AcpClient = (AcpClientDefault as any).default ?? AcpClientDefault;
import type { IEvmProviderAdapter } from "acp-node-v2";
import type { Address } from "viem";
import { V1ContractBridge } from "./v1ContractBridge";

export type V1JobEventHandler = (job: AcpJob, memoToSign?: AcpMemo) => void;

/**
 * Adapter that lets acp-cli buyers create and manage jobs with v1 (openclaw) sellers.
 * Wraps the old AcpClient internally using V1ContractBridge for blockchain operations.
 */
export class V1BuyerAdapter {
  private acpClient: AcpClientDefault;
  readonly chainId: number;

  private constructor(acpClient: AcpClientDefault, chainId: number) {
    this.acpClient = acpClient;
    this.chainId = chainId;
  }

  /**
   * Create a V1BuyerAdapter using the same wallet provider that acp-cli already uses.
   * Pass onNewTask to receive real-time socket events from the old backend.
   */
  static async create(
    provider: IEvmProviderAdapter,
    chainId?: number,
    options?: {
      onNewTask?: V1JobEventHandler;
    }
  ): Promise<V1BuyerAdapter> {
    const walletAddress = (await provider.getAddress()) as Address;

    // Pick the right old-SDK config based on chain
    const config = resolveV1Config(chainId);

    const bridge = new V1ContractBridge(walletAddress, config, provider);

    const connectSocket = !!options?.onNewTask;

    const acpClient = new AcpClient({
      acpContractClient: bridge as any,
      onNewTask: options?.onNewTask,
      skipSocketConnection: !connectSocket,
    });

    return new V1BuyerAdapter(acpClient, config.chain.id);
  }

  /**
   * Create a job targeting a v1 seller.
   * Returns the on-chain job ID.
   */
  async createJob(params: {
    providerAddress: string;
    requirement: string | Record<string, unknown>;
    amount: number;
    evaluatorAddress?: string;
    expiredAt?: Date;
    offeringName?: string;
    chainId?: number;
  }): Promise<number> {
    const config = resolveV1Config(params.chainId);
    const fareAmount = new FareAmount(params.amount, config.baseFare);

    // V1 sellers expect the first memo content to be JSON with shape:
    //   { name: "<offering name>", requirement: { ... } }
    // See openclaw-acp/src/seller/runtime/seller.ts resolveOfferingName/resolveServiceRequirements
    const serviceRequirement: Record<string, unknown> = {
      name: params.offeringName ?? "",
      requirement:
        typeof params.requirement === "string"
          ? params.requirement
          : params.requirement,
    };

    const jobId = await this.acpClient.initiateJob(
      params.providerAddress as Address,
      serviceRequirement,
      fareAmount,
      (params.evaluatorAddress as Address) || undefined,
      params.expiredAt || new Date(Date.now() + 1000 * 60 * 60 * 24), // 24h default
      params.offeringName
    );

    return jobId;
  }

  /**
   * Fund a v1 job by signing the seller's requirement memo.
   * Finds the pending memo and calls payAndAcceptRequirement.
   */
  async fundJob(jobId: number, reason?: string): Promise<void> {
    const job = await this.acpClient.getJobById(jobId);
    if (!job) {
      throw new Error(`V1 job ${jobId} not found`);
    }

    await job.payAndAcceptRequirement(reason);
  }

  /**
   * Complete (approve) a v1 job — releases escrowed funds to seller.
   */
  async completeJob(jobId: number, reason?: string): Promise<void> {
    const job = await this.acpClient.getJobById(jobId);
    if (!job) {
      throw new Error(`V1 job ${jobId} not found`);
    }

    await job.evaluate(true, reason);
  }

  /**
   * Reject a v1 job — returns escrowed funds to buyer.
   */
  async rejectJob(jobId: number, reason?: string): Promise<void> {
    const job = await this.acpClient.getJobById(jobId);
    if (!job) {
      throw new Error(`V1 job ${jobId} not found`);
    }

    await job.evaluate(false, reason);
  }

  /**
   * Get a v1 job by ID.
   */
  async getJob(jobId: number): Promise<AcpJob | null> {
    return this.acpClient.getJobById(jobId);
  }

  /**
   * Get all active v1 jobs for this wallet.
   */
  async getActiveJobs(): Promise<AcpJob[]> {
    return this.acpClient.getActiveJobs();
  }


  /**
   * Map a v1 job phase to v2-style status string.
   */
  static phaseToStatus(phase: AcpJobPhases): string {
    switch (phase) {
      case AcpJobPhases.REQUEST:
        return "open";
      case AcpJobPhases.NEGOTIATION:
        return "budget_set";
      case AcpJobPhases.TRANSACTION:
        return "funded";
      case AcpJobPhases.EVALUATION:
        return "submitted";
      case AcpJobPhases.COMPLETED:
        return "completed";
      case AcpJobPhases.REJECTED:
        return "rejected";
      case AcpJobPhases.EXPIRED:
        return "expired";
      default:
        return "unknown";
    }
  }
}

/**
 * Resolve the old SDK config for a given chain ID.
 * Defaults to Base Sepolia testnet.
 */
function resolveV1Config(chainId?: number): AcpContractConfig {
  if (chainId === 8453) {
    return baseAcpConfigV2;
  }
  // Default: Base Sepolia testnet
  return baseSepoliaAcpConfigV2;
}
