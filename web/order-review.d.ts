import type { CashPreview, PreviewInput, PreviewRoute } from './preview.js';
import type { RfqReview } from '../src/rfq/review.ts';
export type OrderReviewInput = Readonly<{ intent: PreviewInput; amountRaw: string; vendor: PreviewRoute['vendor']; expectedOutputRaw: string; cashDecimals: number }>;
export type CashOrderReview = Readonly<{ kind: 'REMAIN_UNSIGNED_CASH_REVIEW'; input: OrderReviewInput; preview: CashPreview; rfqReview: Readonly<RfqReview>; estimateChanged: boolean; executionEnabled: false }>;
export function orderReviewInput(value: unknown): OrderReviewInput;
export function candidateForReview(value: CashPreview, now?: number): OrderReviewInput;
export function validateOrderReview(value: unknown, submitted: OrderReviewInput, now?: number): CashOrderReview;
