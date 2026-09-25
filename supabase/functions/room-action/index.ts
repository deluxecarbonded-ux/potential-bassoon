import {context,json,errorResponse,locale,seed} from '../_shared/http.ts';
import {makePuzzle,categories,type Category} from '../_shared/puzzles.ts';
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return json(req,{});
 if(req.method!=='POST')return json(req,{error:'error'},405);
 try{
  const {db,user,body}=await context(req);
  if(!['create','join','start','answer','sync','leave','buy','equip','locale'].includes(body.action))throw Error('error');
  const data={...body,locale:locale(body.locale)};
  // Never accept client-supplied questions/answers for new rounds.
  delete data.questions;
  if(data.action==='create'){
   if(!['first','timeAttack'].includes(data.mode)||![1,3,5,7,10].includes(data.rounds)||!['random',...categories].includes(data.category))throw Error('error');
  }
  if(data.action==='start'){
   const {data:room,error}=await db.from('rooms').select('*').eq('code',String(body.code).toUpperCase()).single();
   if(error||!room||room.host_id!==user.id||room.status!=='waiting')throw Error('error');
   const {data:players,error:pe}=await db.from('room_players').select('locale').eq('room_id',room.id);
   if(pe||!players||players.length<2)throw Error('error');
   const languages=[...new Set(players.map(p=>p.locale))];
   const questions=[];
   const rotation=seed()%categories.length;
   for(let round=1;round<=room.total_rounds;round++){
    const category:Category=room.game_mode==='timeAttack'?categories[(rotation+round-1)%categories.length]:room.category==='random'?categories[seed()%categories.length]:room.category;
    const answers=new Set<string>();
    for(const language of languages){
     let puzzle=makePuzzle('medium',Math.min(30,round*2),language,seed(),category);
     let tries=0;
     while(answers.has(puzzle.answer)&&tries++<100)puzzle=makePuzzle('medium',Math.min(30,round*2),language,seed(),category);
     if(answers.has(puzzle.answer))throw Error('Cannot allocate distinct locale answers');
     answers.add(puzzle.answer);
     questions.push({...puzzle,round,locale:language});
    }
   }
   data.questions=questions;
  }
  const {data:result,error}=await db.rpc('room_action',{p_user:user.id,p_action:data.action,p_data:data});
  if(error)throw error;
  return json(req,result);
 }catch(e){return errorResponse(req,e);}
});
