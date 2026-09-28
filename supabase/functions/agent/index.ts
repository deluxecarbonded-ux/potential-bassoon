import {context,json,errorResponse} from '../_shared/http.ts';
import {boundaries,review,mayTouch} from '../_shared/guard.ts';
import {selectFiles} from '../_shared/plan.ts';

// The build agent's writer.
//
// Planning happens in the browser now, from src/ai/planner.ts, and it happens entirely on
// the reader's machine: there is no model behind this function and no provider key in this
// project. What is left here is the half that genuinely cannot be local - reaching a
// GitHub repository and committing to it - plus the guard, which is pure code and decides
// what may be written regardless of who or what proposed it.
//
// Three things it will not do, and they are the reason it is safe to point at a real
// repository:
//
//   It never acts on its own. There is no autonomous loop and no background work. A plan is
//   nothing until a person approves specific operations from it.
//   It never writes without a second, explicit confirmation, and a delete is confirmed
//   separately from a write, so approving a feature cannot quietly take a file with it.
//   It never writes a credential, a lockfile, a dependency, or anything outside the
//   source roots. The guard decides that, and every operation is re-checked here before it
//   is ever shown for approval, whatever produced it.
//
// How the files get here, and why the two halves live in different places:
//
//   A local bridge (npm run agent:serve) runs on the machine the dev server is on and
//   does the reading and the writing, because git there is already authenticated and
//   that needs no credential at all. The browser is the only process that can see both
//   that bridge and this function, so the browser carries the file contents in and
//   carries the approved operations back out.
//   With AGENT_GITHUB_TOKEN in the platform secrets this function reads and writes the
//   repository itself, which is what makes the agent work from the deployed app on any
//   machine, and commits each change so there is a history to undo.
//
// Nothing here tries to reach a loopback address. This function runs on someone else's
// infrastructure, and 127.0.0.1 there is not your laptop - which is the mistake the
// first version of this made, and the tests caught.
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return json(req,{});
 if(req.method!=='POST')return json(req,{error:'error'},405);
 try{
  // The agent carries whole file contents, so it needs a far larger body than a game
  // action does. The caller is still a signed-in player either way.
  const {db,user,body}=await context(req,{maxBytes:1572864});
  // ...and a signed-in player is not enough. The guard below decides what may be written;
  // this decides who may ask, and without it any account could reach the repository, read
  // it, and propose an edit to it. Ownership is matched on the account address or on the
  // profile username, because the address Supabase keys the account on is derived from the
  // username rather than typed, so one of the two is always something the caller holds.
  if(!await ownerOf(db,user))return json(req,{error:'forbidden'},403);
  const op=String(body?.op||'');
  if(op==='status')return json(req,{...status(),user:user.id});
  if(op==='files')return json(req,await files(body));
  if(op==='apply')return json(req,await apply(req,body));
  throw Error('error');
 }catch(e){return errorResponse(req,e);}
});

/* ------------------------------------------------------------------ reaching the files */

/**
 * Whether this caller is one of the accounts allowed to drive the agent.
 *
 * Asked of the database rather than answered here, so the browser's is_agent_owner() and
 * this cannot come to disagree about who the owner is. The underlying function is granted
 * to the service role alone, which is why the user is passed in rather than read from a
 * session: this function authenticates with the service role and has no session of its own.
 */
async function ownerOf(
 db:{rpc:(fn:string,args:Record<string,unknown>)=>Promise<{data:unknown;error:unknown}>},
 user:{id:string;email?:string},
){
 const {data,error}=await db.rpc('agent_owner_match',{p_user:user.id,p_email:user.email??null});
 // A failed lookup is a refusal, not a pass. Anything else turns a database outage into an
 // open door, which is the one direction this check is allowed to fail in.
 return !error&&data===true;
}

const repo=()=>(Deno.env.get('AGENT_REPO')||'deluxecarbonded-ux/potential-bassoon').trim();
const token=()=>(Deno.env.get('AGENT_GITHUB_TOKEN')||'').trim();
const branch=()=>Deno.env.get('AGENT_BRANCH')||'main';

async function gh(path:string,init:RequestInit={}):Promise<Response|null>{
 const t=token();
 if(!t)return null;
 const r=await fetch(`https://api.github.com/repos/${repo()}${path}`,{
  ...init,
  headers:{Authorization:`Bearer ${t}`,'X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json',...(init.headers||{})},
 });
 // A rejected token is treated as no token, so a stale secret degrades to "the browser
 // supplies the files" rather than producing a 403 from every call.
 return r.status===401||r.status===403?null:r;
}

function status(){
 const remote=!!token();
 return {
  canWrite:remote,
  route:remote?'github':'browser',
  repo:repo(),
  branch:branch(),
  // Said plainly rather than discovered by failing, because the difference between
  // "this will not write" and "this wrote and broke something" is worth a sentence.
  writeNote:remote
   ?'Changes are committed to your repository through the GitHub API. Edge functions are not redeployed, so a change under supabase/functions still needs: supabase functions deploy <name>'
   :'With the local bridge running (npm run agent:serve) the agent reads and writes your working tree, and your dev server picks changes up at once. Nothing is committed - commit them yourself when you are happy. Without the bridge it still plans and shows you exactly what it would change, and writes nothing. To commit through GitHub from any machine, set AGENT_GITHUB_TOKEN in the platform secrets.',
  boundaries:boundaries(),
 };
}

/* ------------------------------------------------------------------ reading */

type TreeFile={path:string;sha?:string;size:number;readable:boolean};

async function treeFromGitHub():Promise<TreeFile[]>{
 const r=await gh(`/git/trees/${encodeURIComponent(branch())}?recursive=1`);
 if(!r)return [];
 if(!r.ok){
  // A branch the API has not seen yet, or a tree too large for one call, still has to
  // work, so fall back to the top level rather than giving up.
  const top=await gh(`/contents?ref=${encodeURIComponent(branch())}`);
  if(!top||!top.ok)return [];
  const list=await top.json() as Array<{path:string;type:string;sha:string;size:number}>;
  return list.filter((e)=>e.type==='file').map((e)=>({path:e.path,sha:e.sha,size:e.size||0,readable:(e.size||0)<=262144}));
 }
 const d=await r.json() as {tree?:Array<{path:string;type:string;sha:string;size:number}>};
 return (d.tree||[]).filter((e)=>e.type==='blob')
  .map((e)=>({path:e.path,sha:e.sha,size:e.size||0,readable:(e.size||0)<=262144}));
}

async function readFromGitHub(paths:string[]):Promise<Array<{path:string;content:string}>>{
 const out:Array<{path:string;content:string}>=[];
 for(const p of paths){
  if(!mayTouch(p).ok)continue;
  const r=await gh(`/contents/${p.split('/').map(encodeURIComponent).join('/')}`);
  if(!r||!r.ok)continue;
  const d=await r.json() as {content?:string};
  if(typeof d.content!=='string')continue;
  try{out.push({path:p,content:decodeBase64(d.content.replace(/\n/g,''))});}catch{/* not text */}
 }
 return out;
}

function decodeBase64(b64:string):string{
 const bin=atob(b64);
 const bytes=new Uint8Array(bin.length);
 for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
 return new TextDecoder('utf-8').decode(bytes);
}

// The contents API wants standard base64 of the raw bytes, and a JavaScript string is
// UTF-8. Going through btoa directly mangles everything above U+00FF, which is most of
// this project's translation table, so it is encoded properly.
function encodeBase64(text:string):string{
 const bytes=new TextEncoder().encode(text);
 let bin='';
 const chunk=0x8000;
 for(let i=0;i<bytes.length;i+=chunk)bin+=String.fromCharCode(...bytes.subarray(i,i+chunk));
 return btoa(bin);
}

/* ------------------------------------------------------------------ reading the files */

/**
 * Hands the browser the project files it needs in order to plan, and nothing else.
 *
 * This used to be the first half of a plan op that then called a model. Planning is local
 * now, so the only reason a request still leaves the machine is that reaching GitHub does.
 * The selection is unchanged: the same shortlist, by the same relevance score, capped at
 * the same twelve files - a plan is only as good as the code it could see, and this is
 * still the part that decides what that is.
 *
 * Files the browser supplies win, because that is the local bridge's reading of the working
 * tree, which is newer than any commit.
 */
async function files(body:Record<string,unknown>){
 const text=String(body?.instruction||'').trim();
 if(!text||text.length>4000)throw Error('error');

 const supplied=suppliedFiles(body);
 if(supplied.length)return {files:supplied,via:'browser'};

 const tree=await treeFromGitHub();
 if(!tree.length)throw Error('noFiles');
 const picked=selectFiles(tree,text).slice(0,12);
 const contents=await readFromGitHub(picked.map((f)=>f.path));
 if(!contents.length)throw Error('noFiles');
 return {files:contents,via:'github'};
}

/**
 * Takes the files the browser supplied, refusing anything it should not be sending and
 * anything a person could not have read in the first place. A caller that forges a
 * "file" gets it refused here rather than quietly shown to a model and written back.
 */
function suppliedFiles(body:Record<string,unknown>):Array<{path:string;content:string}>{
 const list=Array.isArray(body?.files)?body.files:[];
 const out:Array<{path:string;content:string}>=[];
 for(const item of list){
  if(!item||typeof item!=='object')continue;
  const f=item as {path?:unknown;content?:unknown};
  const path=typeof f.path==='string'?f.path:'';
  if(!mayTouch(path).ok)continue;
  if(typeof f.content!=='string'||!f.content.trim())continue;
  if(f.content.length>262144)continue;
  out.push({path,content:f.content});
  if(out.length>=14)break;
 }
 return out;
}

/* ------------------------------------------------------------------ applying */

// One operation at a time. Several writes in one call would either half-apply or need a
// rollback, and a commit per file is easier to undo by hand than one commit that touched
// nine things.
//
// Only the GitHub route writes from here. When the browser is driving through the local
// bridge it writes there instead, and the bridge runs the identical review() - the same
// module, so the two routes cannot drift apart.
async function apply(req:Request,body:Record<string,unknown>){
 const checked=review(body?.operations,{
  confirm:body?.confirm===true,
  destroyConfirmed:body?.destroyConfirmed===true,
 });
 if(!checked.ok){
  return json(req,{error:'needsConfirmation',summary:checked.summary,problems:checked.problems,destroys:checked.destroys},409);
 }
 if(!token()){
  return json(req,{error:'noRoute',summary:checked.summary},409);
 }

 const results:Array<{path:string;ok:boolean;op:string;detail?:string}>=[];
 for(const op of checked.safe){
  if(op.op==='delete'){
   const r=await gh(`/contents/${op.path.split('/').map(encodeURIComponent).join('/')}`,{method:'DELETE'});
   results.push({path:op.path,ok:!!r&&r.ok,op:'delete',detail:r&&r.ok?undefined:await safeDetail(r)});
   continue;
  }
  const p=op.path.split('/').map(encodeURIComponent).join('/');
  let sha:string|undefined;
  const existing=await gh(`/contents/${p}`);
  if(existing&&existing.ok){
   const d=await existing.json() as {sha?:string};
   sha=d.sha;
  }else if(existing&&existing.status!==404){
   results.push({path:op.path,ok:false,op:op.op,detail:await safeDetail(existing)});
   continue;
  }
  const r=await gh(`/contents/${p}`,{
   method:'PUT',
   body:JSON.stringify({
    message:agentMessage(op),
    content:encodeBase64(op.content||''),
    branch:branch(),
    ...(sha?{sha}:{}),
   }),
  });
  results.push({path:op.path,ok:!!r&&r.ok,op:op.op,detail:r&&r.ok?undefined:await safeDetail(r)});
 }

 const written=results.filter((r)=>r.ok).length;
 return {
  written,
  failed:results.length-written,
  results,
  via:'github',
  summary:checked.summary,
  // Named so the person can see afterwards exactly what ran, rather than having to
  // trust that it did what the preview said.
  commitMessage:written===1?agentMessage(checked.safe[0]):`agent: ${checked.summary}`,
  deployNote:'Edge function changes are committed but not deployed. Run: supabase functions deploy <name>.',
 };
}

// Commit messages that say what the change is for, because "agent: update" in a history
// is worth nothing six weeks later.
function agentMessage(op:{op:string;path:string;note?:string}):string{
 const verb=op.op==='create'?'add':op.op==='delete'?'remove':'update';
 const what=(op.note||op.path).replace(/\s+/g,' ').trim().slice(0,80);
 return `agent: ${verb} ${op.path} - ${what}`;
}

// A provider error body can carry a token in a URL or a header echo, so only the status
// and the provider's own message are ever returned.
async function safeDetail(r:Response):Promise<string>{
 try{
  const b=await r.json() as {message?:string};
  return `${r.status} ${String(b?.message||'request failed').slice(0,120)}`;
 }catch{ return `${r.status}`; }
}
