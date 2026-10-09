import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync, execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

test('Netlify ignore builds: skipped documentation cannot mask app changes',t=>{
  const dir=mkdtempSync(join(tmpdir(),'remain-netlify-ignore-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const cmd=(args:string[])=>execFileSync('git',args,{cwd:dir,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  const commit=()=>cmd(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','fixture']);
  cmd(['init','-q']);
  mkdirSync(join(dir,'web'));mkdirSync(join(dir,'docs'));
  writeFileSync(join(dir,'web','app.js'),'export const a=1;\n');
  writeFileSync(join(dir,'docs','readme.md'),'initial\n');
  cmd(['add','.']);commit();const initial=cmd(['rev-parse','HEAD']);
  writeFileSync(join(dir,'docs','readme.md'),'docs-only\n');
  cmd(['add','.']);commit();const docsOnly=cmd(['rev-parse','HEAD']);
  writeFileSync(join(dir,'web','app.js'),'export const a=2;\n');
  cmd(['add','.']);commit();const app=cmd(['rev-parse','HEAD']);
  const file=resolve(fileURLToPath(new URL('../scripts/netlify-ignore-build.cjs',import.meta.url)));
  const status=(cached:string,current:string)=>{
    const p=spawnSync(process.execPath,[file],{cwd:dir,env:{...process.env,CACHED_COMMIT_REF:cached,COMMIT_REF:current},encoding:'utf8',timeout:5000});
    assert.equal(p.error,undefined);return {code:p.status,output:p.stdout.trim()};
  };
  assert.deepEqual(status(initial,docsOnly),{code:0,output:'REMAIN_NETLIFY_DOCS_ONLY_SKIPPED'});
  assert.deepEqual(status(docsOnly,app),{code:1,output:'REMAIN_NETLIFY_BUILD_REQUIRED'});
  assert.deepEqual(status(initial,app),{code:1,output:'REMAIN_NETLIFY_BUILD_REQUIRED'});
  assert.equal(status('invalid',app).code,1,'unknown cached source fails open');
  assert.equal(status(app,app).code,1,'retry the same head instead of skipping forever');
  assert.equal(status('f'.repeat(40),app).code,1,'missing git history fails open');
});
