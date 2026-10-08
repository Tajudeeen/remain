import type { PositionRead } from './position.js';
export type PreviewInput = Readonly<{ wallet: string; token: string; cashTarget: string; retainBps: number; maxImpactBps: number; allowClosedMarket: boolean }>;
export type PreviewRoute = Readonly<{ vendor: 'PcsXRfq' | 'InchFusion' | 'CowSwap'; estimatedOutputRaw: string; impactPercent: string | null }>;
export type CashPreview = Readonly<{
  kind: 'REMAIN_CASH_PREVIEW'; mode: 'TEST_FIXTURE' | 'LIVE_READ_ONLY'; input: PreviewInput; position: PositionRead;
  market: Readonly<{ marketStatus: string; openState: boolean; reasonCode: string | null; observedAtMs: number }>;
  cashDecimals: number | null; cashTargetRaw: string | null; floorRaw: string; maxInputRaw: string;
  probes: readonly Readonly<{ inputRaw: string; observedAtMs: number; routes: readonly PreviewRoute[] }>[];
  candidate: Readonly<{ probeIndex: number; routeIndex: number }> | null;
  stopReason: 'SEARCH_LIMIT' | 'EXHAUSTED'; createdAtMs: number;
  executionEnabled: false; liveGate: 'UNVERIFIED'; minimumOutputBinding: 'UNVERIFIED'; fees: 'UNVERIFIED'; ownership: 'NOT_AUTHENTICATED';
}>;
export function previewInput(value: unknown): PreviewInput;
export function cashTargetRaw(value: string, decimals: number): string;
export function impactWithin(value: string | null, bps: number): boolean;
export function qualifiesPreview(route: PreviewRoute, input: PreviewInput, target: string): boolean;
export function validatePreview(value: unknown, submitted: PreviewInput, now?: number): CashPreview;
