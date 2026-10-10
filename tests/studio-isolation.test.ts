import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const studio=readFileSync(new URL('../web/studio.html',import.meta.url),'utf8');

test('every Paper Studio navigation link stays within the studio document',()=>{
 const allLinks=[...studio.matchAll(/<a\b[^>]*\bhref="([^"]+)"[^>]*>/g)];
 assert.ok(allLinks.length>=8,'studio has useful in-page navigation');
 const ids=new Set([...studio.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]));
 for(const match of allLinks){
  const href=match[1]!;
  assert.match(href,/^#demo-[a-z-]+$/,'No demo anchor may open the live app, another origin or a new tab');
  assert.ok(ids.has(href.slice(1)),`Broken recording jump target: ${href}`);
  assert.doesNotMatch(match[0],/\btarget\s*=\s*["']_blank["']/i);
 }
 assert.ok(studio.includes('STANDALONE DEMO WORKSPACE'));
 assert.ok(studio.includes('STAY IN DEMO MODE'));
});
test('studio loads only its simulation controller, not the real wallet, trading or app controllers',()=>{
 const scripts=[...studio.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g)].map(match=>match[1]);
 assert.deepEqual(scripts,['/demo.js']);
 assert.match(studio,/SIMULATION ONLY/);
 assert.doesNotMatch(studio,/<a\b[^>]*\bhref="(?:\/|https?:)/i);
});
