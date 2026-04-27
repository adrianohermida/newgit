import { CopilotConversationRoomV2 } from './copilot-room';

type Json = Record<string, unknown>;

type AiResponse = { response?: string } & Json;
type AiBinding = {
  run(model: string, payload: Json): Promise<AiResponse>;
};

type VectorizeVector = {
  id: string;
  values: number[];
  metadata?: Json;
};

type VectorizeQueryResult = {
  matches?: Array<{
    id: string;
    score: number;
    values?: number[];
    metadata?: Json;
  }>;
};

type VectorizeBinding = {
  insert(vectors: VectorizeVector[]): Promise<{ mutationId?: string } & Json>;
  query(vector: number[], options?: { topK?: number; returnValues?: boolean; returnMetadata?: boolean | "all" }): Promise<VectorizeQueryResult>;
};

type AnalyticsEngineBinding = {
  writeDataPoint(data: {
    indexes?: string[];
    blobs?: string[];
    doubles?: number[];
  }): void | Promise<unknown>;
};

type R2BucketBinding = {
  put(
    key: string,
    value: BodyInit | ReadableStream | ArrayBuffer | ArrayBufferView | string,
    options?: { httpMetadata?: { contentType?: string } }
  ): Promise<unknown>;
};

type KvNamespaceBinding = {
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  get(key: string, type?: "text"): Promise<string | null>;
  get<T = unknown>(key: string, type: "json"): Promise<T | null>;
};

export interface Env {
  AI: AiBinding;
  VECTORIZE: VectorizeBinding;
  COPILOT_CONVERSATIONS_DO_V2: DurableObjectNamespace<CopilotConversationRoomV2>;
  ANALYTICS_ENGINE?: AnalyticsEngineBinding;
  CLOUDFLARE_KV_NAMESPACE?: KvNamespaceBinding;
  hmadv_process_ai: D1Database;
  hmadv_process_ai_logs?: R2BucketBinding;
  CLOUDFLARE_WORKERS_AI_MODEL?: string;
  CLOUDFLARE_WORKERS_AI_EMBEDDING_MODEL?: string;
  AETHERLAB_LEGAL_MODEL?: string;
  CLOUDFLARE_R2_ACCOUNT_ID?: string;
  CLOUDFLARE_S3_API?: string;
  HMDAV_AI_SHARED_SECRET?: string;
  HMADV_AI_SHARED_SECRET?: string;
  LAWDESK_AI_SHARED_SECRET?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  FRESHSALES_API_BASE?: string;
  FRESHSALES_API_KEY?: string;
  FRESHSALES_OWNER_ID?: string;
  FRESHSALES_ACTIVITY_TYPE_NOTA_PROCESSUAL?: string;
  FRESHSALES_ACTIVITY_TYPE_AUDIENCIA?: string;
}
