// The /agent route: one page, two ways of working on the same project.
//
// The gate and the switch live here rather than inside either panel, for two reasons. The
// owner check is one question and it should be asked once, not once per mode - and it has
// to be asked here because both modes are behind it. And the switch has to outlive
// whichever panel is showing, or it would be unmounted and rebuilt on every change and
// the animation would restart from the wrong side each time.
import React,{useEffect,useState} from 'react';
import {useApp} from './state';
import {Agent} from './Agent';
import {Chat} from './Chat';
import {ModeSwitch} from './ModeSwitch';
import {FileCode2,MessageCircle} from 'lucide-react';

type Mode='agent'|'chat';

export function AgentHub(){
  const {t,clients,sessions}=useApp();
  const [mode,setMode]=useState<Mode>('agent');
  // null means the answer has not arrived, which is neither a yes nor a no and is not
  // shown as one. A failed lookup is a refusal: a database problem must not open a panel
  // that the edge function is going to refuse anyway.
  const [owner,setOwner]=useState<boolean|null>(null);

  useEffect(()=>{
    const client=clients.solo;
    if(!client||!sessions.solo){setOwner(null);return;}
    let live=true;
    client.rpc('is_agent_owner').then(({data,error})=>{if(live)setOwner(error?false:data===true);},()=>{if(live)setOwner(false);});
    return()=>{live=false;};
  },[clients,sessions]);

  if(!sessions.solo){
    return <div className="agent-page"><div className="agent-empty"><FileCode2 size={34}/><h1>{t('agent')}</h1><p className="muted">{t('agentSignIn')}</p></div></div>;
  }

  if(owner!==true){
    return <div className="agent-page"><div className="agent-empty"><FileCode2 size={34}/><h1>{t('agent')}</h1><p className="muted">{t('agentNotOwner')}</p></div></div>;
  }

  return <>
    <div className="agent-modes">
      <ModeSwitch id="agent-mode" value={mode} onChange={setMode} label={t('agentModeLabel')}
        options={[
          {value:'agent',label:t('agentMode'),icon:<FileCode2/>},
          {value:'chat',label:t('chatMode'),icon:<MessageCircle/>},
        ]}/>
    </div>
    {mode==='agent'?<Agent owner={owner}/>:<Chat owner={owner}/>}
  </>;
}
