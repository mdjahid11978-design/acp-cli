import { ApiClient } from "./client";

export interface AddSignerResponse {
  message: string;
  data: {
    id: string;
    address: string;
    signers: string[];
  };
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  userId: string;
  walletAddress: string;
  solWalletAddress: string | null;
  role: string;
  tags: string[] | null;
  createdAt: string;
  updatedAt: string;
  offerings: unknown[];
  walletProviders: {
    provider: string;
    metadata: {
      walletId: string;
    };
  }[];
}

interface AgentListResponse {
  data: Agent[];
  meta: {
    pagination: {
      total: number;
      page: number;
      pageSize: number;
      pageCount: number;
    };
  };
}

interface AgentCreateResponse {
  message: string;
  data: Agent;
}

interface AddQuorumResponse {
  message: string;
  data: string; // keyQuorumId
}

export interface BrowseAgent {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  userId: string;
  walletAddress: string;
  solWalletAddress: string | null;
  role: string;
  cluster: string | null;
  tag: string | null;
  createdAt: string;
  updatedAt: string;
  lastActiveAt: string | null;
  rating: number | null;
  isHidden: boolean;
  chains: {
    id: string;
    agentId: string;
    chainId: number;
    tokenAddress: string;
    virtualAgentId: string | null;
    acpV2AgentId: number | null;
    symbol: string;
    active: boolean;
    erc8004AgentId: number | null;
  }[];
  offerings: {
    id: string;
    agentId: string;
    name: string;
    description: string;
    requirements: unknown;
    deliverable: unknown;
    slaMinutes: number;
    priceType: string;
    priceValue: string;
    requiredFunds: boolean;
    isHidden: boolean;
    isPrivate: boolean;
    createdAt: string;
    updatedAt: string;
  }[];
  resources: {
    id: string;
    name: string;
    description: string;
    params: unknown;
    url: string;
  }[];
}

interface AgentBrowseResponse {
  data: BrowseAgent[];
}

export class AgentApi {
  private client: ApiClient;

  constructor(client: ApiClient) {
    this.client = client;
  }

  async list(page?: number, pageSize?: number): Promise<AgentListResponse> {
    const params: Record<string, string> = {};
    if (page !== undefined) params.page = String(page);
    if (pageSize !== undefined) params.pageSize = String(pageSize);
    return this.client.get<AgentListResponse>("/agents", params);
  }

  async create(name: string, description: string): Promise<Agent> {
    const res = await this.client.post<AgentCreateResponse>("/agents", {
      name,
      description,
      role: "HYBRID",
    });
    return res.data;
  }

  async addQuorum(
    agentId: string,
    publicKey: string
  ): Promise<AddQuorumResponse> {
    return this.client.post<AddQuorumResponse>(`/agents/${agentId}/quorum`, {
      publicKey,
    });
  }

  async browse(
    query?: string,
    chainIds?: number[]
  ): Promise<AgentBrowseResponse> {
    const params: Record<string, string> = {};
    if (query) params.query = query;
    if (chainIds && chainIds.length > 0) params.chainIds = chainIds.join(",");
    return this.client.get<AgentBrowseResponse>("/agents/search", params);
  }

  async addSigner(
    agentId: string,
    walletId: string,
    keyQuorumId: string
  ): Promise<AddSignerResponse> {
    return this.client.post(`/agents/${agentId}/signer`, {
      walletId,
      keyQuorumId,
    });
  }
}
