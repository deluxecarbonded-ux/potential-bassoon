import React,{createContext,useContext,useState,useEffect,useMemo,useCallback} from 'react';
import {createClient,type SupabaseClient,type Session} from '@supabase/supabase-js';
import {translate,isRTL} from './i18n';
export type Mode='solo'|'arena';
export type Progress=Record<string,{attempts:number;seconds:number;at:string}>;
/**
 * A username, and the address it becomes.
 *
 * Supabase has no username sign-in: an account is keyed on an address and nothing
 * else. Rather than keep a username beside the address and then keep the two in
 * step, the address is derived from the username, so it comes out the same on
 * every device and needs no table of its own. Nothing is ever delivered to it -
 * users.invalid is the RFC 2606 reserved TLD, which by definition cannot resolve -
 * and config.toml leaves email confirmation off, so signing up returns a session
 * straight away and no confirmation mail is ever expected.
 *
 * The mode is folded into the local part for the reason it always was: single
 * player and multiplayer are separate registrations, not one identity with two
 * profiles. One username used in both routes still yields two distinct rows in
 * auth.users - separate passwords, separate progress, no way to hold both at once.
 *
 * The local part has to stay a legal one, because it carries the username verbatim.
 * So a dot may not lead, trail or double up, and the character set stops short of
 * the characters that would change the shape of the address around it.
 */
const USERNAME_DOMAIN='users.invalid';
export const USERNAME_MIN=3;
export const USERNAME_MAX=24;
const USERNAME_RE=/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;
/**
 * The form a username takes when it has to be an address, or be compared to one.
 *
 * Lowercased on purpose, and this is NOT the form the name is displayed in. Folding the
 * address from the lowercased name is what keeps sign-in case-insensitive and stops
 * "Exotic" and "exotic" becoming two accounts that look identical on a scoreboard. The
 * name shown to people is the one as it was typed; see the Auth component.
 */
export function normalizeUsername(username:string):string{return (username||'').trim().toLowerCase();}
export function validUsername(username:string):boolean{const name=normalizeUsername(username);return name.length>=USERNAME_MIN&&name.length<=USERNAME_MAX&&USERNAME_RE.test(name)&&!name.includes('..');}
export function accountAddress(mode:Mode,username:string):string{return normalizeUsername(username)+'+'+mode+'@'+USERNAME_DOMAIN;}
/**
 * The address given at signup, and deliberately loose. It is not the key anything signs
 * in with - that is derived from the username - so the only job here is to catch
 * "alex" typed into a field labelled Email. Which addresses are genuinely deliverable
 * is not this function's business.
 */
const EMAIL_RE=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function validEmail(email:string):boolean{return EMAIL_RE.test((email||'').trim());}
type LocalState={locale:string;theme:'light'|'dark';sound:boolean;motion:boolean;localAi:boolean;coins:number;inventory:Record<string,number>;progress:Progress;names:Record<Mode,string>;usernames:Record<Mode,string>;emails:Record<Mode,string>;numerals:Record<string,string>;config:{url:string;key:string}};
// localAi is off by default and that is a cost decision rather than a technical one: the
// weights are about a gigabyte, and nobody should spend that on a feature they never
// switched on. Turned on, it is remembered, so the download is paid once.
const initial:LocalState={locale:'en',theme:typeof matchMedia==='function'&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light',sound:false,motion:false,localAi:false,coins:0,inventory:{hint:2,digit:1},progress:{},names:{solo:'',arena:''},usernames:{solo:'',arena:''},emails:{solo:'',arena:''},numerals:{},config:{url:'',key:''}};
function load(){try{const saved=JSON.parse(localStorage.getItem('exotic-v1')||'{}');return {...initial,...saved,config:{url:saved.config?.url||import.meta.env.VITE_SUPABASE_URL||'',key:saved.config?.key||import.meta.env.VITE_SUPABASE_ANON_KEY||''}};}catch{return {...initial,config:{url:import.meta.env.VITE_SUPABASE_URL||'',key:import.meta.env.VITE_SUPABASE_ANON_KEY||''}};}}
export const products=[{id:'hint',mode:'solo',price:30,title:'hintPack',description:'hintDesc'},{id:'digit',mode:'solo',price:70,title:'digitPack',description:'digitDesc'},{id:'moon',mode:'arena',price:100,title:'nightPack',description:'nightDesc'},{id:'crown',mode:'arena',price:250,title:'crownPack',description:'crownDesc'}] as const;
type Cloud={coins:number;inventory:Record<string,number>;progress:Progress;name:string;wins:number;emblem:string};
const emptyCloud:Cloud={coins:0,inventory:{},progress:{},name:'',wins:0,emblem:''};
type ContextType={state:LocalState;setState:React.Dispatch<React.SetStateAction<LocalState>>;t:(key:string,vars?:Record<string,string|number>)=>string;numerals:string;toast:(key:string)=>void;clients:Record<Mode,SupabaseClient|null>;sessions:Record<Mode,Session|null>;cloud:Record<Mode,Cloud>;refresh:(mode:Mode)=>Promise<void>;api:(mode:Mode,fn:string,data:unknown,signal?:AbortSignal)=>Promise<any>;coins:(mode:Mode)=>number;inventory:(mode:Mode)=>Record<string,number>;progress:Progress;buy:(id:string)=>Promise<void>;tone:(win?:boolean)=>void};
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
 // vars fills {name} placeholders in a translated sentence. See translate(): a sentence
 // that has to name a count cannot be built by gluing translated fragments together,
 // because where the number goes differs per language.
 const t=useCallback((key:string,vars?:Record<string,string|number>)=>translate(state.locale,key,numerals,vars),[state.locale,numerals]);
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
 // The signup address is deliberately not among these columns. Nothing anywhere in the
 // interface renders it, and a field the interface never shows has no business crossing
 // to the browser on every refresh. It stays in the row, written once at signup, and is
 // read by SQL alone.
 const [profile,wallet,items,levels]=await Promise.all([client.from('profiles').select('display_name,emblem,wins').eq('user_id',user.id).eq('mode',mode).maybeSingle(),client.from('wallets').select('balance').eq('user_id',user.id).eq('mode',mode).maybeSingle(),client.from('inventory').select('item_id,quantity').eq('user_id',user.id).eq('mode',mode),mode==='solo'?client.from('solo_progress').select('*').eq('user_id',user.id):Promise.resolve({data:[]})]);
 setCloud(s=>({...s,[mode]:{coins:wallet.data?.balance||0,name:profile.data?.display_name||'',emblem:profile.data?.emblem||'',wins:profile.data?.wins||0,inventory:Object.fromEntries((items.data||[]).map((v:any)=>[v.item_id,v.quantity])),progress:Object.fromEntries((levels.data||[]).map((v:any)=>[`${v.difficulty}-${v.level}`,{attempts:v.attempts,seconds:v.seconds,at:v.completed_at}]))}}));},[clients,sessions]);
 // The profile row is where every other screen reads the player's name from, so it is
 // seeded from the username they signed up with rather than from a name typed
 // afterwards. This runs in its own effect, keyed on the stored username, because the
 // subscription effect below does not re-run when that changes: a signup whose session
 // resolved before the username was committed would otherwise create the row as
 // "Local player" and never correct it, since ensure_profile leaves an existing row be.
 useEffect(()=>{(['solo','arena'] as Mode[]).forEach(mode=>{const client=clients[mode],user=sessions[mode]?.user;if(!client||!user)return;
 const p_name=state.usernames[mode]||state.names[mode]||t('guest'),p_email=(state.emails[mode]||'').trim();
 // ensure_profile_with_email is the one that carries the signup address. A project that
 // has not run the migration adding it answers with a missing function rather than a bad
 // argument, so fall back to the plain call: the profile is still created there and the
 // account works, only the address is dropped until the migration is applied.
 client.rpc('ensure_profile_with_email',{p_mode:mode,p_name,p_email}).then(({error})=>{
  if(error&&/could not find the function/i.test(error.message))return client.rpc('ensure_profile',{p_mode:mode,p_name}).then(fallback=>{if(!fallback.error)refresh(mode);});
  if(!error)refresh(mode);
 });});},[clients,sessions,state.usernames,state.emails,refresh]);
 useEffect(()=>{const cleanup:(()=>void)[]=[];(['solo','arena'] as Mode[]).forEach(mode=>{const client=clients[mode],user=sessions[mode]?.user;if(!client||!user)return;const channel=client.channel('identity-'+mode+'-'+user.id).on('postgres_changes',{event:'*',schema:'public',table:'wallets',filter:`user_id=eq.${user.id}`},()=>refresh(mode)).on('postgres_changes',{event:'*',schema:'public',table:'inventory',filter:`user_id=eq.${user.id}`},()=>refresh(mode)).on('postgres_changes',{event:'*',schema:'public',table:'solo_progress',filter:`user_id=eq.${user.id}`},()=>refresh(mode)).on('postgres_changes',{event:'*',schema:'public',table:'profiles',filter:`user_id=eq.${user.id}`},()=>refresh(mode)).subscribe();cleanup.push(()=>{client.removeChannel(channel);});});return()=>cleanup.forEach(f=>f());},[clients,sessions,refresh]);
 // A failed edge call returns a non-2xx status AND a structured body such as
 // {"error":"aiUnavailable"}; supabase-js puts that in `error` and leaves `data`
 // null, so reading only `data` would mask every real reason behind the generic
 // "error" toast. Recover the body's code first, and only fall back when the
 // response carries nothing usable.
 const api=async(mode:Mode,fn:string,data:unknown,signal?:AbortSignal)=>{const client=clients[mode];if(!client||!sessions[mode])throw new Error('signIn');const {data:result,error}=await client.functions.invoke(fn,{body:data as Record<string,unknown>,...(signal?{signal}:{})});if(error){console.error(error);let code='';try{const ctx=(error as {context?:Response}).context;if(ctx&&typeof ctx.json==='function'){const body=await ctx.json();if(body&&typeof body.error==='string')code=body.error;}}catch{/* body consumed or not JSON */}throw new Error(code||'error');}if(result?.error)throw new Error(result.error);return result;};
 const coins=(mode:Mode)=>sessions[mode]?cloud[mode].coins:mode==='solo'?state.coins:0;
 const inventory=(mode:Mode)=>sessions[mode]?cloud[mode].inventory:mode==='solo'?state.inventory:{};
 const buy=async(id:string)=>{const product=products.find(p=>p.id===id);if(!product)return;const mode=product.mode;if(coins(mode)<product.price){toast('notEnough');return;}if(mode==='arena'&&inventory(mode)[id])return;try{if(sessions[mode]){await api(mode,mode==='solo'?'solo-action':'room-action',{action:'buy',item:id});await refresh(mode);}else if(mode==='solo')setState(s=>s.coins>=product.price?{...s,coins:s.coins-product.price,inventory:{...s.inventory,[id]:(s.inventory[id]||0)+1}}:s);else{toast('signIn');return;}toast('purchased');}catch{toast('error');}};
 const tone=(win=false)=>{if(!state.sound)return;try{const a=new AudioContext();[0,...(win?[.12,.24]:[])].forEach((d,i)=>{const o=a.createOscillator(),g=a.createGain();o.connect(g);g.connect(a.destination);o.frequency.value=win?[523,659,784][i]:220;g.gain.setValueAtTime(.06,a.currentTime+d);g.gain.exponentialRampToValueAtTime(.001,a.currentTime+d+.18);o.start(a.currentTime+d);o.stop(a.currentTime+d+.2);});setTimeout(()=>a.close(),900);}catch{}};
 return <Context.Provider value={{state,setState,t,numerals,toast,clients,sessions,cloud,refresh,api,coins,inventory,progress:sessions.solo?cloud.solo.progress:state.progress,buy,tone}}>{children}{notice&&<div className="toast" role="status"><span className="toast-dot"/>{t(notice)}</div>}</Context.Provider>;
}
export const useApp=()=>useContext(Context);
