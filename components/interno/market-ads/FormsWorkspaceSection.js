import AbTestPanel from "./AbTestPanel";
import AdFormPanel from "./AdFormPanel";
import CampaignFormPanel from "./CampaignFormPanel";
import CompliancePanel from "./CompliancePanel";
import GeneratorPanel from "./GeneratorPanel";

export default function FormsWorkspaceSection(props) {
  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <CampaignFormPanel
        campaignForm={props.campaignForm}
        setCampaignForm={props.setCampaignForm}
        campaignState={props.campaignState}
        editingCampaignId={props.editingCampaignId}
        landingState={props.landingState}
        saveCampaign={props.saveCampaign}
        recommendLanding={props.recommendLanding}
        resetCampaignForm={props.resetCampaignForm}
        applyRecommendedLanding={props.applyRecommendedLanding}
      />
      <AdFormPanel
        adForm={props.adForm}
        setAdForm={props.setAdForm}
        campaigns={props.campaigns}
        adState={props.adState}
        editingAdId={props.editingAdId}
        saveAdItem={props.saveAdItem}
        resetAdForm={props.resetAdForm}
      />
      <AbTestPanel
        abForm={props.abForm}
        setAbForm={props.setAbForm}
        campaigns={props.campaigns}
        abState={props.abState}
        editingAbId={props.editingAbId}
        saveAbTest={props.saveAbTest}
        resetAbForm={props.resetAbForm}
      />
      <GeneratorPanel
        generator={props.generator}
        setGenerator={props.setGenerator}
        previewState={props.previewState}
        draftState={props.draftState}
        preview={props.preview}
        generatePreview={props.generatePreview}
        saveDraft={props.saveDraft}
        load={props.load}
      />
      <CompliancePanel
        complianceInput={props.complianceInput}
        setComplianceInput={props.setComplianceInput}
        complianceState={props.complianceState}
        complianceResult={props.complianceResult}
        validateCompliance={props.validateCompliance}
      />
    </div>
  );
}
