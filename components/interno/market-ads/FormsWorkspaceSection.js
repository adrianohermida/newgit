import { Panel, Tag } from "./shared";
import AbTestPanel from "./AbTestPanel";
import AdFormPanel from "./AdFormPanel";
import CampaignFormPanel from "./CampaignFormPanel";
import CompliancePanel from "./CompliancePanel";
import GeneratorPanel from "./GeneratorPanel";

export default function FormsWorkspaceSection(props) {
  return (
    <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
      <div className="space-y-6">
        <Panel
          eyebrow="Operacao"
          title="Plano de campanha"
          helper="Use o bloco da esquerda para preparar a estrutura que vai para a rua: campanha, anuncios e historico de testes."
          contentClassName="mt-4"
        >
          <div className="flex flex-wrap gap-2">
            <Tag tone="accent">Cadastro local</Tag>
            <Tag tone="neutral">Edicao rapida</Tag>
            <Tag tone="neutral">Historico operacional</Tag>
          </div>
        </Panel>
        <CampaignFormPanel {...pickCampaignProps(props)} />
        <AdFormPanel {...pickAdProps(props)} />
        <AbTestPanel {...pickAbProps(props)} />
      </div>

      <div className="space-y-6">
        <Panel
          eyebrow="Criacao assistida"
          title="Geracao e compliance"
          helper="A coluna da direita concentra as alavancas de criacao: IA, validacao etica e adaptacao antes da publicacao."
          contentClassName="mt-4"
        >
          <div className="flex flex-wrap gap-2">
            <Tag tone="success">Filtro OAB</Tag>
            <Tag tone="accent">Preview criativo</Tag>
            <Tag tone="neutral">Rascunhos persistidos</Tag>
          </div>
        </Panel>
        <GeneratorPanel {...pickGeneratorProps(props)} />
        <CompliancePanel {...pickComplianceProps(props)} />
      </div>
    </div>
  );
}

function pickCampaignProps(props) {
  return {
    campaignForm: props.campaignForm,
    setCampaignForm: props.setCampaignForm,
    campaignState: props.campaignState,
    editingCampaignId: props.editingCampaignId,
    landingState: props.landingState,
    saveCampaign: props.saveCampaign,
    recommendLanding: props.recommendLanding,
    resetCampaignForm: props.resetCampaignForm,
    applyRecommendedLanding: props.applyRecommendedLanding,
  };
}

function pickAdProps(props) {
  return {
    adForm: props.adForm,
    setAdForm: props.setAdForm,
    campaigns: props.campaigns,
    adState: props.adState,
    editingAdId: props.editingAdId,
    saveAdItem: props.saveAdItem,
    resetAdForm: props.resetAdForm,
  };
}

function pickAbProps(props) {
  return {
    abForm: props.abForm,
    setAbForm: props.setAbForm,
    campaigns: props.campaigns,
    abState: props.abState,
    editingAbId: props.editingAbId,
    saveAbTest: props.saveAbTest,
    resetAbForm: props.resetAbForm,
  };
}

function pickGeneratorProps(props) {
  return {
    generator: props.generator,
    setGenerator: props.setGenerator,
    previewState: props.previewState,
    draftState: props.draftState,
    preview: props.preview,
    generatePreview: props.generatePreview,
    saveDraft: props.saveDraft,
    load: props.load,
  };
}

function pickComplianceProps(props) {
  return {
    complianceInput: props.complianceInput,
    setComplianceInput: props.setComplianceInput,
    complianceState: props.complianceState,
    complianceResult: props.complianceResult,
    validateCompliance: props.validateCompliance,
  };
}
