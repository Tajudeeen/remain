import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCatalog} from '../web/catalog.js';
const token='0x'+'2'.repeat(40);
test('live catalog accepts only fresh, supported BSC token identities',()=>{
  const valid={kind:'REMAIN_LIVE_CATALOG',mode:'LIVE_READ_ONLY',observedAtMs:100000,stocks:[{token,symbol:'AAPLx',ticker:'AAPL',issuer:'xstocks',decimals:18}]};
  assert.deepEqual(validateCatalog(valid,100000),valid);
  assert.throws(()=>validateCatalog({...valid,mode:'TEST_FIXTURE'},100000));
  assert.throws(()=>validateCatalog({...valid,stocks:[...valid.stocks,...valid.stocks]},100000));
  assert.throws(()=>validateCatalog({...valid,stocks:[{...valid.stocks[0],token:'javascript:alert(1)'}]},100000));
  assert.throws(()=>validateCatalog(valid,160001));
});
