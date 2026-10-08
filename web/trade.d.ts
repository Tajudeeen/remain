import type { CashPreview } from './preview.js';
import type { OrderReviewInput } from './order-review.js';
export type TradeSelection = Readonly<{ input: OrderReviewInput; floorRaw: string; balanceRaw: string; stockDecimals: number; stockSymbol: string }>;
export function executionCandidate(preview: CashPreview, now?: number): TradeSelection;
export function validateTradeOrder(value: unknown, selection: TradeSelection, now?: number, signing?: boolean): ReturnType<typeof import('../src/execution/engine.ts').projectOrder>;
export function validateWalletTransaction(value: unknown, order: ReturnType<typeof import('../src/execution/engine.ts').projectOrder>, invalidate?: boolean): { from: string; to: string; chainId: string; value: string; data: string };
