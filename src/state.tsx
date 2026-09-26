import React,{createContext,useContext,useState,useEffect,useMemo,useCallback} from 'react';
import {createClient,type SupabaseClient,type Session} from '@supabase/supabase-js';
import {translate,isRTL} from './i18n';
export type Mode='solo'|'arena';
export type Progress=Record<string,{attempts:number;seconds:number;at:string}>;
type LocalState={locale:string;theme:'light'|'dark';sound:boolean;motion:boolean;coins:number;inventory:Record<string,number>;progress:Progress;names:Record<Mode,string>;numerals:Record<string,string>;config:{url:string;key:string}};
const initial:LocalState={locale:'en',theme:typeof matchMedia==='function'&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light',sound:false,motion:false,coins:0,inventory:{hint:2,digit:1},progress:{},names:{solo:'',arena:''},numerals:{},config:{url:'',key:''}};
function load(){try{const saved=JSON.parse(localStorage.getItem('exotic-v1')||'{}');return {...initial,...saved,config:{url:saved.config?.url||import.meta.env.VITE_SUPABASE_URL||'',key:saved.config?.key||import.meta.env.VITE_SUPABASE_ANON_KEY||''}};}catch{return {...initial,config:{url:import.meta.env.VITE_SUPABASE_URL||'',key:import.meta.env.VITE_SUPABASE_ANON_KEY||''}};}}
export const products=[{id:'hint',mode:'solo',price:30,title:'hintPack',description:'hintDesc'},{id:'digit',mode:'solo',price:70,title:'digitPack',description:'digitDesc'},{id:'moon',mode:'arena',price:100,title:'nightPack',description:'nightDesc'},{id:'crown',mode:'arena',price:250,title:'crownPack',description:'crownDesc'}] as const;
type Cloud={coins:number;inventory:Record<string,number>;progress:Progress;name:string;wins:number;emblem:string};
const emptyCloud:Cloud={coins:0,inventory:{},progress:{},name:'',wins:0,emblem:''};
type ContextType={state:LocalState;setState:React.Dispatch<React.SetStateAction<LocalState>>;t:(key:string)=>string;numerals:string;toast:(key:string)=>void;clients:Record<Mode,SupabaseClient|null>;sessions:Record<Mode,Session|null>;cloud:Record<Mode,Cloud>;refresh:(mode:Mode)=>Promise<void>;api:(mode:Mode,fn:string,data:unknown)=>Promise<any>;coins:(mode:Mode)=>number;inventory:(mode:Mode)=>Record<string,number>;progress:Progress;buy:(id:string)=>Promise<void>;tone:(win?:boolean)=>void};
const Context=createContext<ContextType>(null!);
export function Provider({children}:{children:React.ReactNode}){
 const [state,setState]=useState<LocalState>(load);const [notice,setNotice]=useState(''); const [sessions,setSessions]=useState<Record<Mode,Session|null>>({solo:null,arena:null});const [cloud,setCloud]=useState<Record<Mode,Cloud>>({solo:emptyCloud,arena:emptyCloud});
 // The numeral register is remembered per language, not globally: a reader who wants
 // Korean counting words and Chinese financial figures is picking two different
 // things, and neither choice should follow them to the next language. Chinese,
 // Japanese and Korean each have a second register; every other locale stores
 // nothing here, and its id is the bare language code.
 const register=state.numerals[state.locale]||'';
 const numerals=register?state.locale+'#'+register:state.locale;
 const t=useCallback((key:string)=>translate(state.locale,key,numerals),[state.locale,numerals]);
 const toast=useCallback((key:string)=>{setNotice(key);},[]);
 useEffect(()=>{if(!notice)return;const id=setTimeout(()=>setNotice(''),4200);return()=>clearTimeout(id);},[notice]);
 useEffect(()=>{localStorage.setItem('exotic-v1',JSON.stringify(state));document.documentElement.dataset.theme=state.theme;document.documentElement.lang=state.locale;document.documentElement.dir=isRTL(state.locale)?'rtl':'ltr';document.documentElement.dataset.numerals=register;document.documentElement.dataset.motion=state.motion?'reduced':'full';
  // The tab title and meta description are English in index.html, so they are
  // rewritten per locale. The title composes the translated brand with the
  // translated tagline instead of duplicating the brand across sixteen columns.
  const brandName=translate(state.locale,'brand',numerals);
  document.title=brandName+' — '+translate(state.locale,'docTitle',numerals);
  document.querySelector('meta[name=description]')?.setAttribute('content',translate(state.locale,'docDesc',numerals));},[state]);
 const clients=useMemo(()=>{if(!state.config.url||!state.config.key)return {solo:null,arena:null};try{return {solo:createClient(state.config.url,state.config.key,{auth:{storageKey:'exotic-solo-auth',detectSessionInUrl:false}}),arena:createClient(state.config.url,state.config.key,{auth:{storageKey:'exotic-arena-auth',detectSessionInUrl:false}})};}catch{return {solo:null,arena:null};}},[state.config.url,state.config.key]);
 useEffect(()=>{const cleanup:(()=>void)[]=[];(['solo','arena'] as Mode[]).forEach(mode=>{const client=clients[mode];if(!client){setSessions(s=>({...s,[mode]:null}));return;}client.auth.getSession().then(({data})=>setSessions(s=>({...s,[mode]:data.session})));const {data}=client.auth.onAuthStateChange((_event,session)=>setSessions(s=>({...s,[mode]:session})));cleanup.push(()=>data.subscription.unsubscribe());});return()=>cleanup.forEach(f=>f());},[clients]);
 const refresh=useCallback(async(mode:Mode)=>{const client=clients[mode],user=sessions[mode]?.user;if(!client||!user)return;
 const [profile,wallet,items,levels]=await Promise.all([client.from('profiles').select('*').eq('user_id',user.id).eq('mode',mode).maybeSingle(),client.from('wallets').select('balance').eq('user_id',user.id).eq('mode',mode).maybeSingle(),client.from('inventory').select('item_id,quantity').eq('user_id',user.id).eq('mode',mode),mode==='solo'?client.from('solo_progress').select('*').eq('user_id',user.id):Promise.resolve({data:[]})]);
 setCloud(s=>({...s,[mode]:{coins:wallet.data?.balance||0,name:profile.data?.display_name||'',emblem:profile.data?.emblem||'',wins:profile.data?.wins||0,inventory:Object.fromEntries((items.data||[]).map((v:any)=>[v.item_id,v.quantity])),progress:Object.fromEntries((levels.data||[]).map((v:any)=>[`${v.difficulty}-${v.level}`,{attempts:v.attempts,seconds:v.seconds,at:v.completed_at}]))}}));},[clients,sessions]);
 useEffect(()=>{const cleanup:(()=>void)[]=[];(['solo','arena'] as Mode[]).forEach(mode=>{const client=clients[mode],user=sessions[mode]?.user;if(!client||!user)return;client.rpc('ensure_profile',{p_mode:mode,p_name:state.names[mode]||t('guest')}).then(({error})=>{if(!error)refresh(mode);});const channel=client.channel('identity-'+mode+'-'+user.id).on('postgres_changes',{event:'*',schema:'public',table:'wallets',filter:`user_id=eq.${user.id}`},()=>refresh(mode)).on('postgres_changes',{event:'*',schema:'public',table:'inventory',filter:`user_id=eq.${user.id}`},()=>refresh(mode)).on('postgres_changes',{event:'*',schema:'public',table:'solo_progress',filter:`user_id=eq.${user.id}`},()=>refresh(mode)).on('postgres_changes',{event:'*',schema:'public',table:'profiles',filter:`user_id=eq.${user.id}`},()=>refresh(mode)).subscribe();cleanup.push(()=>{client.removeChannel(channel);});});return()=>cleanup.forEach(f=>f());},[clients,sessions,refresh]);
 // A failed edge call returns a non-2xx status AND a structured body such as
 // {"error":"aiUnavailable"}; supabase-js puts that in `error` and leaves `data`
 // null, so reading only `data` would mask every real reason behind the generic
 // "error" toast. Recover the body's code first, and only fall back when the
 // response carries nothing usable.
 const api=async(mode:Mode,fn:string,data:unknown)=>{const client=clients[mode];if(!client||!sessions[mode])throw new Error('signIn');const {data:result,error}=await client.functions.invoke(fn,{body:data as Record<string,unknown>});if(error){console.error(error);let code='';try{const ctx=(error as {context?:Response}).context;if(ctx&&typeof ctx.json==='function'){const body=await ctx.json();if(body&&typeof body.error==='string')code=body.error;}}catch{/* body consumed or not JSON */}throw new Error(code||'error');}if(result?.error)throw new Error(result.error);return result;};
 const coins=(mode:Mode)=>sessions[mode]?cloud[mode].coins:mode==='solo'?state.coins:0;
 const inventory=(mode:Mode)=>sessions[mode]?cloud[mode].inventory:mode==='solo'?state.inventory:{};
 const buy=async(id:string)=>{const product=products.find(p=>p.id===id);if(!product)return;const mode=product.mode;if(coins(mode)<product.price){toast('notEnough');return;}if(mode==='arena'&&inventory(mode)[id])return;try{if(sessions[mode]){await api(mode,mode==='solo'?'solo-action':'room-action',{action:'buy',item:id});await refresh(mode);}else if(mode==='solo')setState(s=>s.coins>=product.price?{...s,coins:s.coins-product.price,inventory:{...s.inventory,[id]:(s.inventory[id]||0)+1}}:s);else{toast('signIn');return;}toast('purchased');}catch{toast('error');}};
 const tone=(win=false)=>{if(!state.sound)return;try{const a=new AudioContext();[0,...(win?[.12,.24]:[])].forEach((d,i)=>{const o=a.createOscillator(),g=a.createGain();o.connect(g);g.connect(a.destination);o.frequency.value=win?[523,659,784][i]:220;g.gain.setValueAtTime(.06,a.currentTime+d);g.gain.exponentialRampToValueAtTime(.001,a.currentTime+d+.18);o.start(a.currentTime+d);o.stop(a.currentTime+d+.2);});setTimeout(()=>a.close(),900);}catch{}};
 return <Context.Provider value={{state,setState,t,numerals,toast,clients,sessions,cloud,refresh,api,coins,inventory,progress:sessions.solo?cloud.solo.progress:state.progress,buy,tone}}>{children}{notice&&<div className="toast" role="status"><span className="toast-dot"/>{t(notice)}</div>}</Context.Provider>;
}
export const useApp=()=>useContext(Context);
