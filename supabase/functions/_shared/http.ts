import { createClient } from 'npm:@supabase/supabase-js@2';
export const supportedLocales = ['en','ar','es','fr','de','pt','it','nl','ru','tr','hi','ja','ko','zh','id','ur'];
export function headers(req:Request){
 const allowed=(Deno.env.get('ALLOWED_ORIGINS')||'').split(',').map(s=>s.trim()).filter(Boolean);
 const origin=req.headers.get('origin')||'';
 return {'Access-Control-Allow-Origin':allowed.length?(allowed.includes(origin)?origin:allowed[0]):'*','Access-Control-Allow-Headers':'authorization, apikey, x-client-info, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin','Content-Type':'application/json'};
}
export function json(req:Request,data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:headers(req)});}
export async function context(req:Request,opts?:{maxBytes?:number}){
 const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const token=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
 if(!token)throw Error('signIn');
 const {data,error}=await db.auth.getUser(token);
 if(error||!data.user)throw Error('signIn');
 if(Number(req.headers.get('content-length')||0)>(opts?.maxBytes??8192))throw Error('tooLarge');
 const body=await req.json();
 if(!body||typeof body!=='object'||Array.isArray(body))throw Error('error');
 return {db,user:data.user,body};
}
export function locale(value:unknown){return typeof value==='string'&&supportedLocales.includes(value)?value:'en';}
export function seed(){return crypto.getRandomValues(new Uint32Array(1))[0];}
export function errorResponse(req:Request,e:unknown){console.error(e);const message=e instanceof Error?e.message:'';if(message==='signIn')return json(req,{error:'signIn'},401);if(/OpenRouter|free routes|Daily AI/i.test(message))return json(req,{error:'aiUnavailable'},503);return json(req,{error:'error'},400);}
