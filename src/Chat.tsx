// Chat: the same project, talked to instead of edited.
//
// The agent proposes diffs and you approve them. This is the other half - you ask a
// question and it answers, in your language. It is not a language model and does not
// pretend to be one: a trained network picks which of a fixed set of answers you meant
// (src/ai/chat.ts), and every sentence it can say is either a fixed translation or a
// number and a path read out of the real code.
//
// So it will tell you when it does not know, and it will tell you when it has not read the
// file you are asking about. That is the trade for having no model server, no key and
// nothing to download: fewer things it can say, and none of them invented.
//
// Nothing here makes a request. The panel used to ask the bridge for the file tree and the
// edge function for its status, and both were removed: this page has to work on a phone
// with no server running, and a chat that cannot answer until a process on a laptop
// answers is a chat that answers differently depending on where it is opened. What it uses
// instead is already in the bundle - the list of paths the planner watches, compiled in -
// so it can tell a file it has heard of from one it has not, which is the only thing it
// needed the request for.
//
// History is held in this tab and gone on reload. Nothing about what was asked is written
// anywhere.
import React,{useEffect,useRef,useState} from 'react';
import {useApp} from './state';
import {reply, CHAT_MODEL, type ChatContext} from './ai/chat';
import {MODEL} from './ai/hint';
import {RECIPES} from './ai/recipes';
import {PLANNER_WATCHED} from './ai/planner';
import {Loader2,Send,Trash2,MessageCircle,Info,Sparkles} from 'lucide-react';

type Turn={id:number;from:'me'|'them';text:string};

export function Chat({owner}:{owner:boolean}) {
  const {t}=useApp();
  const [turns,setTurns]=useState<Turn[]>([]);
  const [draft,setDraft]=useState('');
  const [busy,setBusy]=useState(false);
  const log=useRef<HTMLDivElement|null>(null);
  const next=useRef(1);

  // What the chat knows without asking anything, built once: the paths this build watches
  // are in the JavaScript already, and the reader is behind the owner gate, so the agent
  // they can switch to is theirs to use.
  const ctx:ChatContext={files:[...PLANNER_WATCHED],canWrite:owner,isOwner:owner};

  // Keep the newest turn in view, the way a conversation is expected to behave, but only
  // when the reader is already at the bottom - yanking the view down while they are
  // reading an earlier message is worse than not following along.
  useEffect(()=>{
    const el=log.current;
    if(!el)return;
    const near=el.scrollHeight-el.scrollTop-el.clientHeight<160;
    if(near)el.scrollTop=el.scrollHeight;
  },[turns,busy]);

  const send=(text:string)=>{
    const said=text.trim();
    if(!said||busy)return;
    setBusy(true);
    setDraft('');
    setTurns(prev=>[...prev,{id:next.current++,from:'me',text:said}]);
    // The turn is the reply, the reply is a key, and rendering a key through t() is what
    // makes this a chat in sixteen languages rather than sixteen chats in English.
    setTimeout(()=>{
      let r:{key:string;vars?:Record<string,string|number>};
      try{
        r=reply(said,ctx,{parameters:MODEL.parameters,recipes:RECIPES.length,watched:[...PLANNER_WATCHED]});
      }catch{
        // A throw here would mean the weights and the feature layout disagree, which
        // chat.ts already checks at import. Answering is better than a blank panel.
        r={key:'chatUnknown'};
      }
      setTurns(prev=>[...prev,{id:next.current++,from:'them',text:t(r.key,r.vars)}]);
      setBusy(false);
    },420);
  };

  const suggestions=[t('chatSuggestCode'),t('chatSuggestWhat'),t('chatSuggestPrivacy')];

  return <div className="agent-page">
    <div className="agent-head">
      <span className="eyebrow">{t('agent')}</span>
      <h1>{t('chatTitle')}</h1>
      <p className="muted">{t('chatIntro')}</p>
    </div>

    <div className="chat-note">
      <Info/>
      <span>{t('chatNote',{n:CHAT_MODEL.parameters})}</span>
    </div>

    <div className="chat-log" ref={log} role="log" aria-live="polite" aria-label={t('chatTitle')}>
      {!turns.length&&!busy&&<p className="muted agent-empty-note">{t('chatEmpty')}</p>}
      {turns.map(m=><div className={'chat-turn '+m.from} key={m.id}>
        <span className="chat-who">{m.from==='me'?t('chatYou'):t('chatBot')}</span>
        <div className="chat-bubble">{m.text}</div>
      </div>)}
      {busy&&<div className="chat-turn them">
        <span className="chat-who">{t('chatBot')}</span>
        <div className="chat-bubble"><span className="chat-typing" aria-label={t('chatThinking')}><i/><i/><i/></span></div>
      </div>}
    </div>

    {!turns.length&&<div className="chat-suggest">
      {suggestions.map(s=><button key={s} onClick={()=>send(s)}><Sparkles size={12}/> {s}</button>)}
    </div>}

    <div className="agent-compose">
      <form className="chat-form" onSubmit={e=>{e.preventDefault();send(draft);}}>
        <textarea rows={2} maxLength={1000} value={draft} placeholder={t('chatPlaceholder')}
          aria-label={t('chatPlaceholder')} onChange={e=>setDraft(e.target.value)}
          onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send(draft);}}}/>
        <button className="button" type="submit" disabled={!draft.trim()||busy}>
          {busy?<Loader2 size={16} className="spin"/>:<Send size={16}/>}
          {t('chatSend')}
        </button>
      </form>
      {turns.length>0&&<div className="chat-model">
        <MessageCircle size={13}/>{t('chatModelInfo',{n:CHAT_MODEL.parameters})}
        <button className="text-button chat-clear" onClick={()=>{setTurns([]);setDraft('');}}>
          <Trash2 size={14}/>{t('chatClear')}
        </button>
      </div>}
    </div>
  </div>;
}
