// The in-game build agent.
//
// Describe a change in your own words. The agent reads the project's real files, works
// out the smallest set of edits that does what you asked, and shows you every one of
// them as a diff. Nothing is written until you tick the changes you want and press the
// button - and a delete has to be ticked separately, so approving a feature can never
// quietly take a file with it.
//
// It is an editor, not an autopilot. There is no background work and no memory between
// visits: every run starts from the instruction you type now, and nothing happens that
// you did not ask for and then confirm.
import React,{useEffect,useRef,useState} from 'react';
import {useApp} from './state';
import {num} from './i18n';
import {summarise} from './diff';
import {Check,Plus,Trash2,Pencil,ChevronDown,Loader2,ShieldCheck,TriangleAlert,ArrowRight,RefreshCw,FileCode2} from 'lucide-react';

type Op={op:'create'|'update'|'delete';path:string;content?:string;note?:string};
type Plan={summary:string;operations:Op[];dropped:Record<number,string>;model?:string;via?:string;consideredFiles?:string[];preview:{create:number;update:number;delete:number}};
type Status={canWrite:boolean;route:string;writeNote:string;capacity?:Capacity;boundaries:{writableRoots:string[];neverWritten:string[];blockedSegments:string[];secretsRefused:string[]}};

/**
 * What is left of the free AI allowance, per provider. Not decoration: the honest answer
 * to "why did the AI say it was resting" is a number per provider that goes down, and
 * the honest answer to "how do I get more" is the ceiling sitting right next to it,
 * unconfigured.
 */
type Capacity={
  configured:number;
  total:{requests:number;dailyRequests:number;spent:number;exhausted:boolean};
  providers:Array<{id:string;label:string;hasKey:boolean;model:string;limit:string;noCard:boolean;spent:number;dailyRequests:number;left:number;exhausted:boolean}>;
};

const BRIDGE=(import.meta.env.VITE_AGENT_BRIDGE||'http://127.0.0.1:8787').replace(/\/$/,'');

export function Agent(){
  const {t,api,sessions,numerals}=useApp();
  const [instruction,setInstruction]=useState('');
  const [status,setStatus]=useState<Status|null>(null);
  const [bridge,setBridge]=useState<boolean|null>(null);
  const [plan,setPlan]=useState<Plan|null>(null);
  const [picked,setPicked]=useState<Record<number,boolean>>({});
  const [before,setBefore]=useState<Record<string,string>>({});
  const [open,setOpen]=useState<Record<number,boolean>>({});
  const [busy,setBusy]=useState('');
  const [result,setResult]=useState<{written:number;failed:number;results:Array<{path:string;ok:boolean;detail?:string}>}|null>(null);
  const [problem,setProblem]=useState('');
  const abort=useRef<AbortController|null>(null);

  // The bridge is on this machine and the function is in the cloud, so the two are
  // checked separately and reported separately. "Neither" is a normal state, not an
  // error, and the panel says which is which.
  useEffect(()=>{
    let live=true;
    fetch(`${BRIDGE}/health`).then(r=>r.ok).then(ok=>{if(live)setBridge(ok);}).catch(()=>{if(live)setBridge(false);});
    if(sessions.solo)api('solo','agent',{op:'status'}).then((s:Status)=>{if(live)setStatus(s);}).catch(()=>{if(live)setStatus(null);});
    return()=>{live=false;};
  },[sessions.solo]);

  const canWrite=bridge===true||status?.canWrite===true;

  const guard=async()=>{
    setProblem('');
    if(!instruction.trim()||instruction.trim().length<4){setProblem(t('agentSayMore'));return;}
    if(!sessions.solo){setProblem(t('signIn'));return;}
    setBusy('plan');setPlan(null);setResult(null);
    abort.current?.abort();abort.current=new AbortController();
    try{
      // Read the project's real files through the bridge, so the model is reasoning
      // about the code that is actually here rather than about a description of it.
      const files:Array<{path:string;content:string}>=[];
      if(bridge){
        const tree=await (await fetch(`${BRIDGE}/tree`)).json() as {files:Array<{path:string;size:number}>};
        // The same shortlist the function would make, so the request stays small enough
        // for a free model. Keyword matches first, then the files everything touches.
        const words=instruction.toLowerCase().split(/[^a-z0-9]+/).filter(w=>w.length>2);
        const score=(p:string)=>{const l=p.toLowerCase();let s=0;for(const w of words)if(l.includes(w))s+=3;if(/^src\/(app|state|main)\./.test(l))s+=4;if(l==='src/i18n.ts')s+=3;if(l==='src/styles.css')s+=2;return s;};
        const shortlist=tree.files.map(f=>({...f,s:score(f.path)})).filter(f=>f.s>0&&f.size<=262144)
          .sort((a,b)=>b.s-a.s).slice(0,10);
        for(const f of shortlist){
          const r=await fetch(`${BRIDGE}/file?path=${encodeURIComponent(f.path)}`,{signal:abort.current.signal});
          if(!r.ok)continue;
          const d=await r.json() as {content:string};
          files.push({path:f.path,content:d.content});
        }
      }
      const res=await api('solo','agent',{op:'plan',instruction:instruction.trim(),files},abort.current.signal);
      const next=res as Plan;
      setPlan(next);
      // Everything starts ticked except deletes. A delete is a thing you asked for on
      // purpose, so it takes a deliberate act to include one.
      setPicked(Object.fromEntries(next.operations.map((o,i)=>[i,o.op!=='delete'])));
      // Remember the current content of anything being changed, so the diff has a
      // before to compare against.
      const prior:Record<string,string>={};
      for(const o of next.operations){
        if(o.op==='create'){prior[o.path]='';continue;}
        if(bridge){
          const r=await fetch(`${BRIDGE}/file?path=${encodeURIComponent(o.path)}`,{signal:abort.current.signal});
          prior[o.path]=r.ok?((await r.json() as {content:string}).content):'';
        }
      }
      setBefore(prior);
    }catch(e){
      // aiUnavailable is what the function returns when the free models are spent, which
      // is a different thing from a failure and needs a different sentence: the work is
      // fine, the provider's daily allowance is gone.
      const code=e instanceof Error?e.message:'';
      setProblem(/aiUnavailable|quota|free route|429/i.test(code)?t('agentBusy'):t('error'));
    }finally{setBusy('');}
  };

  const chosen=plan?plan.operations.map((o,i)=>({o,i})).filter(({o,i})=>picked[i]):[];
  const deletes=chosen.filter(({o})=>o.op==='delete');

  const apply=async()=>{
    if(!chosen.length||!plan)return;
    setBusy('apply');setProblem('');
    const ops=chosen.map(({o})=>({op:o.op,path:o.path,content:o.content,note:o.note}));
    try{
      if(bridge){
        // Written through the bridge, which runs the same guard the function does.
        const r=await fetch(`${BRIDGE}/write`,{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({operations:ops,confirm:true,destroyConfirmed:deletes.length>0})});
        if(!r.ok&&r.status!==409)throw new Error(String(r.status));
        setResult(await r.json() as {written:number;failed:number;results:Array<{path:string;ok:boolean;detail?:string}>});
      }else{
        setResult(await api('solo','agent',{op:'apply',operations:ops,confirm:true,destroyConfirmed:deletes.length>0}) as never);
      }
      setPlan(null);setPicked({});setInstruction('');
    }catch{setProblem(t('error'));}
    finally{setBusy('');}
  };

  if(!sessions.solo){
    return <div className="agent-page"><div className="agent-empty"><FileCode2 size={34}/><h1>{t('agent')}</h1><p className="muted">{t('agentSignIn')}</p></div></div>;
  }

  const opLabel=(o:string)=>o==='create'?t('agentCreated'):o==='update'?t('agentChanged'):t('agentDeleted');

  return <div className="agent-page">
    <div className="agent-head">
      <span className="eyebrow">{t('agent')}</span>
      <h1>{t('agentTitle')}</h1>
      <p className="muted">{t('agentIntro')}</p>
    </div>

    <div className={cn2('agent-route',bridge?'live':status?.canWrite?'live':'dead')}>
      {bridge?<ShieldCheck size={17}/>:<TriangleAlert size={17}/>}
      <div>
        <strong>{bridge?t('agentBridgeLive'):status?.canWrite?t('agentGithubLive'):t('agentNoRoute')}</strong>
        <p>{bridge?t('agentBridgeNote'):status?.writeNote||t('agentNoRoute')}</p>
      </div>
    </div>

    <div className="agent-compose">
      <label>{t('agentInstruction')}
        <textarea rows={3} maxLength={4000} value={instruction} placeholder={t('agentPlaceholder')}
          onChange={e=>setInstruction(e.target.value)}/>
      </label>
      <div className="agent-compose-actions">
        <Button2 onClick={guard} loading={busy==='plan'} disabled={busy!==''}>
          {busy==='plan'?<Loader2 size={16} className="spin"/>:<ArrowRight size={16}/>}
          {t('agentPlan')}
        </Button2>
        {plan&&<button className="text-button" onClick={()=>{setPlan(null);setPicked({});}}><RefreshCw size={15}/>{t('agentDiscard')}</button>}
      </div>
      {problem&&<p className="agent-problem" role="alert"><TriangleAlert size={15}/>{problem}</p>}
    </div>

    {plan&&<div className="agent-plan">
      <div className="agent-plan-head">
        <div>
          <h2>{plan.summary||t('agentPlanReady')}</h2>
          <p className="muted">{t('agentCounts',{create:plan.preview.create,update:plan.preview.update,remove:plan.preview.delete})}</p>
        </div>
        {plan.consideredFiles?.length?<span className="subtle-tag">{t('agentRead',{n:plan.consideredFiles.length})}</span>:null}
      </div>

      {Object.keys(plan.dropped||{}).length>0&&<div className="agent-dropped">
        <ShieldCheck size={16}/><span>{t('agentDropped',{n:Object.keys(plan.dropped).length})}</span>
      </div>}

      <div className="agent-ops">
        {plan.operations.map((o,i)=>{
          const isDel=o.op==='delete';
          const stat=isDel?{added:0,removed:0}:summarise(before[o.path]??'',o.content??'').stats;
          return <div className={cn2('agent-op',picked[i]&&'on',isDel&&'danger')} key={o.path+i}>
            <label className="agent-op-head">
              <input type="checkbox" checked={!!picked[i]} onChange={e=>setPicked(p=>({...p,[i]:e.target.checked}))}/>
              <span className={cn2('agent-op-badge',o.op)}>{o.op==='create'?<Plus size={12}/>:o.op==='delete'?<Trash2 size={12}/>:<Pencil size={12}/>}{opLabel(o.op)}</span>
              <code>{o.path}</code>
              {!isDel&&<span className="agent-op-stat"><b>+{stat.added}</b> <i>-{stat.removed}</i></span>}
              <button className="agent-op-toggle" onClick={()=>setOpen(s=>({...s,[i]:!s[i]}))}>
                {open[i]?<ChevronDown size={15}/>:<ChevronDown size={15} className="flip"/>}
              </button>
            </label>
            {o.note&&<p className="agent-op-note">{o.note}</p>}
            {isDel&&picked[i]&&<p className="agent-op-warn"><TriangleAlert size={14}/>{t('agentDeleteWarn',{path:o.path})}</p>}
            {open[i]&&!isDel&&<pre className="agent-diff">
              {summarise(before[o.path]??'',o.content??'').lines.map((l,k)=>
                <span className={'dl '+l.kind} key={k}>
                  <span className="dl-mark">{l.kind==='add'?'+':l.kind==='del'?'-':' '}</span>{l.text}
                </span>)}
            </pre>}
          </div>;
        })}
      </div>

      {plan.operations.length===0&&<p className="muted agent-empty-note">{t('agentNoChanges')}</p>}

      {deletes.length>0&&<div className="agent-danger">
        <TriangleAlert size={17}/><span>{t('agentDeleteConfirm',{n:deletes.length})}</span>
      </div>}

      <div className="agent-apply">
        <Button2 onClick={apply} loading={busy==='apply'} disabled={!chosen.length||busy!==''}>
          <Check size={16}/>{t('agentApply',{n:chosen.length})}
        </Button2>
        <span className="muted">{canWrite?t('agentApplyNote'):t('agentNoRoute')}</span>
      </div>
    </div>}

    {result&&<div className={cn2('agent-result',result.failed?'partial':'good')}>
      <h2>{t('agentWrote',{n:result.written})}</h2>
      <ul>{result.results.map((r,i)=><li key={i} className={r.ok?'ok':'no'}>
        {r.ok?<Check size={13}/>:<TriangleAlert size={13}/>}<code>{r.path}</code>{r.detail&&<span>{r.detail}</span>}
      </li>)}</ul>
      <p className="muted">{bridge?t('agentAfterWrite'):t('agentAfterCommit')}</p>
    </div>}

    {status?.capacity&&<details className="agent-cap">
      <summary>{t('agentCapacity',{
        left:status.capacity.total.requests,
        of:status.capacity.total.dailyRequests,
        n:status.capacity.configured,
      })}</summary>
      <div className="agent-cap-body">
        {status.capacity.providers.map(p=>(
          <div className={'agent-cap-row'+(p.hasKey?'':' off')} key={p.id}>
            <div className="agent-cap-name">
              {p.hasKey
                ? <b>{p.label}</b>
                : <><b>{p.label}</b><span className="agent-cap-add">+{num(p.dailyRequests,numerals)}</span></>}
              <small>{p.limit}</small>
            </div>
            {p.hasKey
              ? <div className="agent-cap-meter">
                  <span style={{width:Math.min(100,Math.max(3,(p.spent/p.dailyRequests)*100))+'%'}} className={p.exhausted?'gone':''}/>
                </div>
              : <span className="agent-cap-key">{t('agentNoKey')}</span>}
            {p.hasKey&&<span className={'agent-cap-left'+(p.exhausted?' gone':'')}>
              {p.exhausted?t('agentSpent'):t('agentLeft',{n:p.left})}
            </span>}
          </div>
        ))}
        <p className="muted agent-cap-note">{t('agentCapacityNote')}</p>
      </div>
    </details>}

    {status?.boundaries&&<details className="agent-boundaries">
      <summary>{t('agentBoundaries')}</summary>
      <div className="agent-boundaries-body">
        <p><strong>{t('agentRoots')}</strong> {status.boundaries.writableRoots.join(', ')}</p>
        <p><strong>{t('agentNever')}</strong> {status.boundaries.neverWritten.join(', ')}</p>
        <p><strong>{t('agentSecrets')}</strong> {status.boundaries.secretsRefused.join(', ')}</p>
      </div>
    </details>}
  </div>;
}

// Local copies rather than importing the app's Button, so this panel can be read on its
// own and so its two states - default and busy - are stated here where they are used.
function Button2({children,onClick,loading,disabled}:{children:React.ReactNode;onClick:()=>void;loading?:boolean;disabled?:boolean}){
  return <button className="button" onClick={onClick} disabled={disabled||loading}>{children}</button>;
}
const cn2=(...v:(string|false|undefined)[])=>v.filter(Boolean).join(' ');
