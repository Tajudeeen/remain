// Netlify's ignore command: exit 0 => skip, exit 1 => build.
// Netlify runs this before npm install with Node 18; use no dependencies.
// Compare to the last cached deployed commit, not the immediately prior
// source commit, so previously skipped app changes cannot disappear.
const { execFileSync }=require('node:child_process');
const sha=/^[0-9a-f]{40}$/i;
const cached=process.env.CACHED_COMMIT_REF||'';
const current=process.env.COMMIT_REF||'';
const affectsDeploy=(name)=>{
  const path=name.replace(/\\/g,'/');
  return path.startsWith('web/') || path.startsWith('src/') ||
    path.startsWith('netlify/') || path.startsWith('scripts/build-web.ts') ||
    path.startsWith('scripts/netlify-ignore-build.cjs') ||
    path==='package.json' || path==='package-lock.json' || path==='netlify.toml';
};
let build=true;
if(sha.test(cached)&&sha.test(current)&&cached!==current){
  try {
    const output=execFileSync('git',['diff','--name-only',cached,current,'--'],{
      encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:5000,maxBuffer:1048576
    });
    build=output.split(/\r?\n/).some(name=>name&&affectsDeploy(name));
  }catch {build=true;}
}
// If cached revision is unknown or identical to current, build to avoid
// a skip loop after a previous aborted/invalid deployment.
process.stdout.write(build?'REMAIN_NETLIFY_BUILD_REQUIRED\n':'REMAIN_NETLIFY_DOCS_ONLY_SKIPPED\n');
process.exit(build?1:0);
