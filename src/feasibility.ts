import { randomUUID } from 'node:crypto';
import { ReadOnlyBinanceClient, type CallResult } from './client.ts';
import { RemainError, safeError } from './errors.ts';
import { BSC_CHAIN, BSC_USDT, array, record, digest, readConfig, findStock, selectedMarket, walletBalance, pickRfq, inspectRfq } from './validation.ts';
import type { Query } from './signing.ts';

type Observation = {
  endpoint: string; startedAt: string; status: 'passed' | 'blocked';
  latencyMs?: number; responseHash?: string; error?: ReturnType<typeof safeError>;
};
export type SmokeReport = {
  runId: string; mode: 'LIVE_READ_ONLY' | 'TEST_FIXTURE'; startedAt: string;
  status: 'passed' | 'blocked'; executionEnabled: false;
  observations: Observation[]; checks: string[]; error?: ReturnType<typeof safeError>;
  notes: string[];
};
export type Reader = { get(endpoint: string, query?: Query): Promise<CallResult> };

export async function runFeasibility(env: Record<string, string | undefined>, reader?: Reader): Promise<SmokeReport> {
  const report: SmokeReport = {
    runId: randomUUID(), mode: reader ? 'TEST_FIXTURE' : 'LIVE_READ_ONLY', startedAt: new Date().toISOString(),
    status: 'blocked', executionEnabled: false, observations: [], checks: [],
    notes: [
      'This report proves read-only API feasibility only. It is not a trade, simulation or settlement receipt.',
      'No user signature, approval, order submission or transaction broadcast is performed.',
      'Typed-data structure was checked, not cryptographically hashed as an EIP-712 order or authorized for signing.',
      'RWA referencePrice is not independent TradFi price evidence.'
    ]
  };
  try {
    const config = readConfig(env);
    const client = reader ?? new ReadOnlyBinanceClient({ apiKey: config.apiKey, secretKey: config.secretKey });
    async function call(endpoint: string, query: Query): Promise<CallResult> {
      const observation: Observation = { endpoint, startedAt: new Date().toISOString(), status: 'blocked' };
      report.observations.push(observation);
      try {
        const result = await client.get(endpoint, query);
        observation.status = 'passed'; observation.latencyMs = result.latencyMs; observation.responseHash = result.responseHash;
        return result;
      } catch (error) { observation.error = safeError(error); throw error; }
    }
    const chains = await call('/api/v1/dex/aggregator/supported/chain', [['binanceChainId', BSC_CHAIN]]);
    if (!array(chains.data).some((v) => record(v).binanceChainId === BSC_CHAIN)) throw new RemainError('RFQ_UNAVAILABLE');
    report.checks.push('authenticated_bsc_aggregator');

    const tokens = await call('/api/v1/dex/market/rwa/tokens', [['binanceChainId', BSC_CHAIN]]);
    findStock(tokens.data, config.token);
    report.checks.push('supported_bsc_stock_identity');

    const market = await call('/api/v1/dex/market/rwa/underlying-market', [['binanceChainId', BSC_CHAIN], ['tokenContractAddress', config.token]]);
    selectedMarket(market.data, config.token);
    report.checks.push('market_status_read');

    let balance: string | undefined;
    // Wallet endpoint is paginated. Never mistake a missing first-page asset for a zero balance.
    for (let page = 1; page <= 10; page++) {
      const result = await call('/api/v1/dex/balance/all-token-balances-by-address', [
        ['address', config.wallet], ['chains', BSC_CHAIN], ['excludeRiskToken', 'true'], ['page', String(page)], ['pageSize', '100']
      ]);
      balance = walletBalance(result.data, config.wallet, config.token);
      if (balance !== undefined) break;
      const groups = array(result.data).map(record);
      if (groups.every((group) => array(group.tokenAssets).length < 100)) break;
    }
    if (balance === undefined || BigInt(balance) < BigInt(config.amount)) throw new RemainError('INSUFFICIENT_POSITION');
    report.checks.push('wallet_balance_covers_input');

    const query: Query = [
      ['binanceChainId', BSC_CHAIN], ['amount', config.amount],
      ['fromTokenAddress', config.token], ['toTokenAddress', BSC_USDT], ['userWalletAddress', config.wallet]
    ];
    const quoted = await call('/api/v1/dex/aggregator/quote', query);
    const route = pickRfq(quoted.data, config);
    report.checks.push('matching_stock_to_usdt_rfq');
    const age = Date.now() - quoted.timestamp;
    if (age < -5000 || age >= 20000) throw new RemainError('QUOTE_EXPIRED');

    const built = await call('/api/v1/dex/aggregator/swap', [
      ...query, ['quoteId', String(route.quoteId)], ['slippagePercent', '0.5'],
      ['autoSlippage', 'false'], ['approveTransaction', 'false'], ['priceImpactProtectionPercent', '0.5']
    ]);
    const inspection = inspectRfq(built.data);
    report.checks.push('inspectable_bsc_eip712_structure');
    // Only hashes leave the process. No wallet, balances, quoteId or raw payload.
    report.notes.push(`RFQ structure digest: ${inspection.typedDataHash}. Vendor digest: ${digest(inspection.vendor)}.`);
    report.status = 'passed';
  } catch (error) { report.error = safeError(error); }
  return report;
}
