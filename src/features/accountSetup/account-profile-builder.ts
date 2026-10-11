// S11 (2026-10-12): buildAccountProfile moved here from the import preview layer
// (originally ImportPreviewModal.tsx:201–274, relocated by S4 into
// import/previewState.ts) so the persisted AccountProfile has ONE source of
// truth beside its schema. See recommendations.md S11.
//
// Move-only + one type tightening: the draft shape became a local interface
// (`MetricDraftInput`) structurally identical to the old `AdditionalMetricDraft`;
// the vtt `as never` cast was replaced with the schema's own element type.
// Zero behavior change — DEFAULT_ACCOUNT_PROFILE is still the seed and every
// default/inference below is unchanged (audit recorded in recommendations.md).
import type {
  AccountProfile,
  CustomerExperienceConfig,
  DataLocation,
  TargetStyle,
  VttConfig,
} from './account-profile-schema';
import { DEFAULT_ACCOUNT_PROFILE } from '../dashboard/config';

/** Which extra metric a matched column feeds into the profile. */
export type AdditionalMetricKey =
  | 'resolve2hr'
  | 'resolve3d'
  | 'phoneAdds'
  | 'dataLines'
  | 'fiber'
  | 'vhi'
  | 'hotspot'
  | 'handoffs'
  | 'dpc'
  | 'vtt'
  | 'credit';

/**
 * A resolved additional-metric answer from the import preview. Field names are
 * load-bearing: `buildAccountProfile` reads `.windowLabel`, `.targetStyle`,
 * `.calcStyle`, `.lowerIsBetter` and `.requiredMessages` directly.
 */
export interface MetricDraftInput {
  metric: AdditionalMetricKey;
  header: string;
  data: DataLocation;
  target: number;
  windowLabel?: string;
  targetStyle?: TargetStyle;
  calcStyle?: 'per-call-average' | 'total-amount' | 'frequency';
  lowerIsBetter?: boolean;
  requiredMessages?: string[];
}

export const buildAccountProfile = (
  accountName: string,
  customerExperience: CustomerExperienceConfig | null,
  drafts: MetricDraftInput[]
): AccountProfile => {
  const profile = JSON.parse(JSON.stringify(DEFAULT_ACCOUNT_PROFILE)) as AccountProfile;
  profile.accountName = accountName.trim() || DEFAULT_ACCOUNT_PROFILE.accountName;
  profile.createdAt = new Date().toISOString();

  if (customerExperience) profile.customerExperience = customerExperience;

  const first = (metric: AdditionalMetricKey): MetricDraftInput | undefined =>
    drafts.find((draft) => draft.metric === metric);
  const resolve2hr = first('resolve2hr');
  const resolve3d = first('resolve3d');
  const handoffs = first('handoffs');
  const dpc = first('dpc');
  const vtt = first('vtt');
  const credit = first('credit');

  if (resolve2hr) {
    profile.resolveRate.shortTerm = {
      tracked: true,
      windowLabel: resolve2hr.windowLabel || '2 hour',
      data: resolve2hr.data,
      target: resolve2hr.target,
    };
  }
  if (resolve3d) {
    profile.resolveRate.longTerm = {
      tracked: true,
      windowLabel: resolve3d.windowLabel || '3 day',
      data: resolve3d.data,
      target: resolve3d.target,
    };
  }
  if (handoffs) {
    profile.handoffs = { label: 'Hand-offs', data: handoffs.data, target: handoffs.target };
  }
  profile.dpc = dpc
    ? { tracked: true, data: dpc.data, target: dpc.target }
    : { tracked: false };
  profile.vtt = vtt
    ? {
        tracked: true,
        // Schema element type is `'view-together' | 'terms-and-conditions' |
        // 'broadband-facts' | string` — narrowing via the schema's own type
        // instead of the old `as never` cast. Same values, same behavior.
        requiredMessages: (vtt.requiredMessages || []) as VttConfig['requiredMessages'],
        data: vtt.data,
        target: vtt.target,
      }
    : { tracked: false, requiredMessages: [] };
  if (credit) {
    profile.credit = {
      calcStyle: credit.calcStyle || 'frequency',
      label: credit.calcStyle === 'per-call-average' ? 'Net OCC' : 'Credit',
      data: credit.data,
      target: credit.target,
      lowerIsBetter: credit.lowerIsBetter ?? true,
    };
  }

  profile.sales.mobile.smartphones = { tracked: false, label: 'Phone Lines', targetStyle: { kind: 'flat', value: 0 } };
  profile.sales.mobile.dataLines = { tracked: false, label: 'Data Lines', targetStyle: { kind: 'flat', value: 0 } };
  profile.sales.internet.fiber = { tracked: false, label: 'Fiber', targetStyle: { kind: 'flat', value: 0 } };
  profile.sales.internet.fixedWireless = { tracked: false, label: 'VHI', targetStyle: { kind: 'flat', value: 0 } };
  profile.sales.internet.hotspot = { tracked: false, label: 'Hotspot', targetStyle: { kind: 'flat', value: 0 } };

  for (const draft of drafts) {
    const targetStyle = draft.targetStyle || { kind: 'flat', value: draft.target };
    const line = { tracked: true, label: draft.header, matchedColumn: draft.header, targetStyle };
    if (draft.metric === 'phoneAdds') profile.sales.mobile.smartphones = line;
    if (draft.metric === 'dataLines') profile.sales.mobile.dataLines = line;
    if (draft.metric === 'fiber') profile.sales.internet.fiber = line;
    if (draft.metric === 'vhi') profile.sales.internet.fixedWireless = line;
    if (draft.metric === 'hotspot') profile.sales.internet.hotspot = line;
  }

  return profile;
};
