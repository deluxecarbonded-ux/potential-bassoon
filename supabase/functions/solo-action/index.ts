import {context,json,errorResponse,locale,seed} from '../_shared/http.ts';
import {makePuzzle,type Difficulty} from '../_shared/puzzles.ts';
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return json(req,{});
 if(req.method!=='POST')return json(req,{error:'error'},405);
 try{
  const {db,user,body}=await context(req);
  let result;
  if(body.action==='start'){
   if(!['easy','medium','hard'].includes(body.difficulty)||!Number.isInteger(body.level)||body.level<1||body.level>30)throw Error('error');
   const language=locale(body.locale);
   const puzzle=makePuzzle(body.difficulty as Difficulty,body.level,language,seed());
   result=await db.rpc('create_solo_challenge',{p_user:user.id,p_data:{...puzzle,level:body.level,difficulty:body.difficulty,locale:language}});
  }else{
   if(!['answer','use','buy'].includes(body.action))throw Error('error');
   result=await db.rpc('solo_action',{p_user:user.id,p_action:body.action,p_data:body});
  }
  if(result.error)throw result.error;
  return json(req,result.data);
 }catch(e){return errorResponse(req,e);}
});
