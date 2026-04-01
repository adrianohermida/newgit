import { defaultAdapter } from './defaultAdapter.ts';
import { tjsp1grauAdapter, tjsp2grauAdapter, tjspGenericAdapter } from './tjspAdapter.ts';
import { trf4EprocAdapter } from './trf4EprocAdapter.ts';
import type { CanonicalProcesso, DataJudAdapterInput } from './types.ts';

const ADAPTERS = [
  tjsp1grauAdapter,
  tjsp2grauAdapter,
  trf4EprocAdapter,
  tjspGenericAdapter,
  defaultAdapter,
];

export function resolverAdapter(meta: {
  tribunal?: string | null;
  grau?: string | number | null;
  sistema?: string | null;
  payload: unknown;
}) {
  return ADAPTERS.find((adapter) => adapter.match(meta)) ?? defaultAdapter;
}

export function parseDataJudPayload(input: DataJudAdapterInput): CanonicalProcesso {
  const adapter = resolverAdapter({
    tribunal: input.tribunal,
    grau: input.grau,
    sistema: input.sistema,
    payload: input.payload,
  });
  const canonical = adapter.parse(input);
  return {
    ...canonical,
    parser_tribunal_schema: canonical.parser_tribunal_schema ?? adapter.key,
  };
}
