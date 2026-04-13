import { Tag } from "../shared";

export default function TemplateLibraryCard({
  data,
  templateState,
  saveTemplate,
  toggleTemplateFavorite,
  toggleTemplateVisibility,
  toggleTemplateEditScope,
  generateFromTemplate,
}) {
  const library = data.templateLibrary;
  const analytics = data.templateAnalytics;

  return (
    <div className="rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-semibold text-[#F7F2E8]">Biblioteca de templates</p>
        <Tag tone="accent">{library?.summary || "Sem templates ainda"}</Tag>
      </div>
      {templateState.error ? <p className="mt-3 text-sm text-[#F8C5C5]">{templateState.error}</p> : null}
      {templateState.result?.template?.id ? <p className="mt-3 text-sm text-[#B7F7C6]">Template atualizado na biblioteca persistida.</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Tag tone="neutral">uso total {library?.usage?.total || 0}</Tag>
        <Tag tone="accent">{analytics?.summary || "Sem analytics ainda"}</Tag>
      </div>
      <div className="mt-4 space-y-4">
        {(library?.groups || []).map((group) => (
          <div key={group.key} className="rounded-[16px] border border-[#1D2B27] px-3 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-[#F5F1E8]">{group.area}</p>
              <Tag tone="neutral">{group.objective}</Tag>
            </div>
            <div className="mt-3 space-y-3">
              {(group.items || []).slice(0, 3).map((item) => (
                <div key={item.id} className="rounded-[16px] border border-[#22342F] px-3 py-3 text-sm text-[#C7D0CA]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-[#F5F1E8]">{item.name}</p>
                    <div className="flex flex-wrap gap-2">
                      <Tag tone={item.source === "local" ? "success" : "accent"}>{item.source}</Tag>
                      <Tag tone="neutral">score {item.score}</Tag>
                      <Tag tone="neutral">uso {item.usageCount || 0}</Tag>
                    </div>
                  </div>
                  <p className="mt-2 text-[#8FA29B]">{item.headline}</p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <button type="button" onClick={() => generateFromTemplate(item)} className="rounded-full border border-[#22342F] px-4 py-2 text-xs text-[#D8DED9] transition hover:border-[#C5A059] hover:text-[#C5A059]">Aplicar template</button>
                    {item.id?.startsWith("tpl-") ? (
                      <button type="button" onClick={() => saveTemplate(item)} className="rounded-full border border-[#22342F] px-4 py-2 text-xs text-[#D8DED9] transition hover:border-[#C5A059] hover:text-[#C5A059]">Salvar na base</button>
                    ) : (
                      <>
                        <button type="button" onClick={() => toggleTemplateFavorite(item)} className="rounded-full border border-[#22342F] px-4 py-2 text-xs text-[#D8DED9] transition hover:border-[#C5A059] hover:text-[#C5A059]">{item.isFavorite ? "Desfavoritar" : "Favoritar"}</button>
                        <button type="button" onClick={() => toggleTemplateVisibility(item)} className="rounded-full border border-[#22342F] px-4 py-2 text-xs text-[#D8DED9] transition hover:border-[#C5A059] hover:text-[#C5A059]">{item.visibility === "publico" ? "Tornar privado" : "Tornar publico"}</button>
                        <button type="button" onClick={() => toggleTemplateEditScope(item)} className="rounded-full border border-[#22342F] px-4 py-2 text-xs text-[#D8DED9] transition hover:border-[#C5A059] hover:text-[#C5A059]">{item.editScope === "autor" ? "Liberar para admins" : "Restringir ao autor"}</button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
