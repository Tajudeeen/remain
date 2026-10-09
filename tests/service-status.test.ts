import test from 'node:test';
import assert from 'node:assert/strict';
import {serviceSnapshot} from '../web/service-status.js';
const market={kind:'REMAIN_INTEGRATION_READINESS',mode:'READ_ONLY_SETUP',inspectionAvailable:false,deployment:'NOT_CONFIGURED',executionEnabled:false,liveGate:'UNVERIFIED',signatureSemantics:'UNVERIFIED'};
const execution={kind:'REMAIN_EXECUTION_STATUS',available:false,profile:'COW_BSC_SELL_V1',userConfirmationRequired:true};
test('unconfigured product status cannot be labelled live',()=>{
  const result=serviceSnapshot(market,execution);
  assert.equal(result.market,'UNAVAILABLE');
  assert.equal(result.execution,'UNAVAILABLE');
});
test('configured backend is never described as verified settlement',()=>{
  const result=serviceSnapshot({...market,inspectionAvailable:true,deployment:'HOSTED_READ_ONLY'},{...execution,available:true});
  assert.equal(result.market,'CONFIGURED');assert.equal(result.execution,'CONFIGURED');
  assert.match(result.executionLabel,/configured/);
  assert.doesNotMatch(result.executionLabel,/settled|ready to trade|verified sale/i);
});
test('malformed readiness and forged backend responses are rejected',()=>{
  assert.throws(()=>serviceSnapshot({...market,executionEnabled:true},execution));
  assert.throws(()=>serviceSnapshot(market,{...execution,userConfirmationRequired:false}));
  assert.throws(()=>serviceSnapshot({...market,extra:'yes'},execution));
});
