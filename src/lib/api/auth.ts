import { ApiClient } from "./client.js";

interface CliUrlResponse {
  data: { url: string; requestId: string };
}

interface CliTokenResponse {
  data: { token: string };
}

export class AuthApi {
  private client: ApiClient;

  constructor(baseUrl: string) {
    this.client = new ApiClient(baseUrl);
  }

  async getCliUrl(): Promise<{ url: string; requestId: string }> {
    const res = await this.client.get<CliUrlResponse>("/auth/cli/url");
    return res.data;
  }

  async pollCliToken(requestId: string): Promise<string | null> {
    try {
      const res = await this.client.get<CliTokenResponse>("/auth/cli/token", { requestId });
      return res.data.token ?? null;
    } catch {
      return null;
    }
  }
}
