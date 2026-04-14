from __future__ import annotations

from dataclasses import replace

from adapters.obsidian_adapter import ObsidianMatch, ObsidianRagContext


def _match_key(match: ObsidianMatch) -> str:
    path = (match.path or '').strip().lower()
    if path:
        return path
    return '|'.join(
        [
            (match.id or '').strip().lower(),
            (match.title or '').strip().lower(),
            (match.excerpt or '').strip().lower()[:120],
        ]
    )


def merge_rag_contexts(*contexts: ObsidianRagContext, top_k: int = 5) -> ObsidianRagContext:
    valid_contexts = [context for context in contexts if context and (context.enabled or context.matches or context.error)]
    if not valid_contexts:
        return ObsidianRagContext(enabled=False, vault_path=None, memory_dir=None)

    fused: dict[str, dict[str, object]] = {}
    enabled = any(context.enabled for context in valid_contexts)
    vaults = [context.vault_path for context in valid_contexts if context.vault_path]
    memory_dirs = [context.memory_dir for context in valid_contexts if context.memory_dir]
    errors = [context.error for context in valid_contexts if context.error]

    for context_index, context in enumerate(valid_contexts):
        for match_index, match in enumerate(context.matches):
            key = _match_key(match)
            rrf_score = 1.0 / (match_index + 1 + (context_index * 2) + 4)
            source_name = str(match.metadata.get('source') or context.vector_backend or 'unknown')
            if key not in fused:
                fused[key] = {
                    'match': match,
                    'score': float(match.score) + rrf_score,
                    'sources': {source_name},
                }
                continue

            current = fused[key]
            current['score'] = float(current['score']) + float(match.score) + rrf_score
            current['sources'].add(source_name)
            if float(match.score) > float((current['match']).score):
                current['match'] = match

    merged_matches = []
    for item in fused.values():
        match = item['match']
        metadata = {
            **match.metadata,
            'source': '+'.join(sorted(item['sources'])),
            'fusion': 'reciprocal_rank_plus_score',
            'sources': sorted(item['sources']),
        }
        merged_matches.append(replace(match, score=round(float(item['score']), 6), metadata=metadata))

    merged_matches.sort(key=lambda item: (-item.score, item.title))
    return ObsidianRagContext(
        enabled=enabled,
        vault_path=' | '.join(dict.fromkeys(vaults)) or None,
        memory_dir=' | '.join(dict.fromkeys(memory_dirs)) or None,
        matches=tuple(merged_matches[: max(1, top_k)]),
        error=' | '.join(dict.fromkeys(errors)) or None,
        embedding_engine='hybrid_fusion',
        embedding_dimensions=max((context.embedding_dimensions for context in valid_contexts), default=128),
        vector_backend='supabase_pgvector+obsidian_hybrid_local_index',
        indexed_notes=sum(context.indexed_notes for context in valid_contexts),
        index_limit=sum(context.index_limit for context in valid_contexts),
    )
