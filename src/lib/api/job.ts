import type { JobRoomEntry } from "acp-node-v2";
import { ApiClient } from "./client";

interface ActiveJob {
  chainId: number;
  onChainJobId: string;
  clientAddress: string;
  providerAddress: string;
  evaluatorAddress: string;
  budget: string;
  jobStatus: string;
  expiredAt: number;
}

interface ActiveJobsResponse {
  jobs: ActiveJob[];
}

interface JobHistoryResponse {
  entries: JobRoomEntry[];
}

interface JobResponse {
  intents: {
    tokenAddress: string;
    recipeintAddress: string;
    amount: string;
    isSigned: boolean;
  }[];
  hookAddress?: string;
}

export class JobApi {
  constructor(
    private readonly client: ApiClient,
    private readonly walletAddress: string
  ) {}

  async getActiveJobs(): Promise<ActiveJob[]> {
    const res = await this.client.get<ActiveJobsResponse>("/jobs", {
      wallet: this.walletAddress,
    });
    return res.jobs ?? [];
  }

  async getChatHistory(
    chainId: number,
    jobId: string
  ): Promise<JobRoomEntry[]> {
    const res = await this.client.get<JobHistoryResponse>(
      `/chats/${chainId}/${jobId}/history`,
      { wallet: this.walletAddress }
    );
    return res.entries ?? [];
  }

  async getJob(chainId: number, jobId: string): Promise<JobResponse> {
    const res = await this.client.get<{ data: JobResponse }>(
      `/jobs/${chainId}/${jobId}`,
      { wallet: this.walletAddress }
    );
    if (!res) {
      throw new Error(`Failed to fetch job`);
    }
    return res.data;
  }
}
