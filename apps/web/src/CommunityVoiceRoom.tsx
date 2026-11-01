import { useCallback, useEffect, useRef, useState } from 'react';
import { Headphones, Mic, MicOff, PhoneOff, Volume2, VolumeX, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UserAvatar } from './UserProfiles';
import { useUorquiPreferences } from './UorquiPreferences';
import { VoiceActivityMonitor } from './VoiceActivityMonitor';
import { playVoiceRoomCue, unlockVoiceRoomAudio } from './communityVoiceSounds';

export type CommunityVoiceParticipant={sessionId:string;handle:string;displayName:string;avatarUrl:string|null;muted:boolean;deafened:boolean;isSelf:boolean;speaking?:boolean};
type VoicePeer=CommunityVoiceParticipant & {joinedAt:string};
type VoiceSignal={id:string;senderSessionId:string;kind:'offer'|'answer'|'candidate';payload:RTCSessionDescriptionInit|RTCIceCandidateInit};
type VoiceJoin={sessionId:string;peers:VoicePeer[];rtc:{iceServers:RTCIceServer[];relayAvailable:boolean};maxParticipants:number};
type VoiceState={peers:VoicePeer[];signals:VoiceSignal[];cursor:string};

async function req<T>(url:string,init?:RequestInit):Promise<T>{
  const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...init});
  if(!r.ok){const error=await r.json().catch(()=>null) as {error?:string}|null;throw Error(error?.error??'HTTP_'+r.status);}
  return r.status===204?undefined as T:r.json() as Promise<T>;
}
const json=(value:unknown):RequestInit=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});

/** A small P2P mesh: audio is end-to-end encrypted by DTLS/SRTP, never stored by the app. */
export default function CommunityVoiceRoom({communityId,channelId,onParticipantsChange}:{communityId:string;channelId:string;onParticipantsChange?:(participants:CommunityVoiceParticipant[])=>void}){
  const {locale}=useUorquiPreferences();const pt=locale==='pt-BR';
  const [phase,setPhase]=useState<'idle'|'joining'|'joined'>('idle');
  const [peers,setPeers]=useState<VoicePeer[]>([]);
  const [muted,setMuted]=useState(false);
  const [deafened,setDeafened]=useState(false);
  const [connections,setConnections]=useState<Record<string,RTCPeerConnectionState>>({});
  const [speaking,setSpeaking]=useState<Set<string>>(()=>new Set());
  const [error,setError]=useState('');
  const [audioBlocked,setAudioBlocked]=useState(false);
  const running=useRef(false);
  const disposed=useRef(false);
  const joining=useRef(false);
  const selfSession=useRef<string|null>(null);
  const local=useRef<MediaStream|null>(null);
  const config=useRef<RTCIceServer[]>([]);
  const pcMap=useRef(new Map<string,RTCPeerConnection>());
  const audioMap=useRef(new Map<string,HTMLAudioElement>());
  const candidateQueue=useRef(new Map<string,RTCIceCandidateInit[]>());
  const voiceMonitor=useRef<VoiceActivityMonitor|null>(null);
  const knownPeers=useRef(new Set<string>());
  const recentPeers=useRef<VoicePeer[]>([]);
  const cursor=useRef('0');
  const polling=useRef(false);
  const timers=useRef<number[]>([]);
  const mutedRef=useRef(false);
  const deafenedRef=useRef(false);
  const priorMuteRef=useRef(false);
  const ownJoinedAt=useRef('');
  const base='/api/v1/communities/'+communityId+'/channels/'+channelId+'/voice';

  const stop=useCallback((notify=true)=>{
    running.current=false;
    const sessionId=selfSession.current;selfSession.current=null;
    for(const timer of timers.current)window.clearInterval(timer);
    timers.current=[];
    for(const pc of pcMap.current.values())pc.close();
    pcMap.current.clear();candidateQueue.current.clear();knownPeers.current.clear();
    voiceMonitor.current?.dispose();voiceMonitor.current=null;recentPeers.current=[];setSpeaking(new Set());
    for(const el of audioMap.current.values()){el.pause();el.srcObject=null;el.remove();}
    audioMap.current.clear();local.current?.getTracks().forEach(track=>track.stop());local.current=null;
    cursor.current='0';ownJoinedAt.current='';mutedRef.current=false;deafenedRef.current=false;priorMuteRef.current=false;
    setPhase('idle');setMuted(false);setDeafened(false);setPeers([]);setConnections({});setAudioBlocked(false);
    if(sessionId&&notify){
      void fetch(base+'/sessions/'+sessionId,{method:'DELETE',credentials:'same-origin',cache:'no-store',keepalive:true}).catch(()=>{});
    }
  },[base]);

  const sendSignal=useCallback(async(to:string,kind:VoiceSignal['kind'],payload:VoiceSignal['payload'])=>{
    if(!running.current||!selfSession.current)return;
    await req(base+'/signal',json({
      sessionId:selfSession.current,recipientSessionId:to,kind,payload
    }));
  },[base]);

  const closePeer=useCallback((id:string)=>{
    const pc=pcMap.current.get(id);
    if(pc){pc.close();pcMap.current.delete(id);}
    const audio=audioMap.current.get(id);
    if(audio){audio.pause();audio.srcObject=null;audio.remove();audioMap.current.delete(id);}
    candidateQueue.current.delete(id);
    voiceMonitor.current?.remove(id);
    setSpeaking(old=>{if(!old.has(id))return old;const n=new Set(old);n.delete(id);return n;});
    setConnections(old=>{const next={...old};delete next[id];return next;});
  },[]);

  const connect=useCallback(async(id:string,initiator:boolean)=>{
    if(!running.current||id===selfSession.current)return null;
    const existing=pcMap.current.get(id);
    if(existing)return existing;
    const pc=new RTCPeerConnection({iceServers:config.current});
    pcMap.current.set(id,pc);
    pc.onconnectionstatechange=()=>{
      if(!running.current)return;
      setConnections(old=>({...old,[id]:pc.connectionState}));
    };
    pc.onicecandidate=event=>{
      if(event.candidate)void sendSignal(id,'candidate',event.candidate.toJSON()).catch(()=>{
        if(running.current)setError(pt?'Falha de sinalização de rede.':'Network signaling failed.');
      });
    };
    pc.ontrack=event=>{
      if(!running.current)return;
      let element=audioMap.current.get(id);
      if(!element){
        element=document.createElement('audio');element.autoplay=true;
        element.setAttribute('playsinline','');
        element.style.display='none';element.muted=deafenedRef.current;
        document.body.appendChild(element);
        audioMap.current.set(id,element);
      }
      const media=event.streams[0]??new MediaStream([event.track]);
      element.srcObject=media;
      voiceMonitor.current?.add(id,media);
      void element.play().catch(()=>{if(running.current)setAudioBlocked(true);});
    };
    local.current?.getAudioTracks().forEach(track=>pc.addTrack(track,local.current!));
    if(initiator){
      try{
        const offer=await pc.createOffer();
        await pc.setLocalDescription(offer);
        await sendSignal(id,'offer',{type:'offer',sdp:pc.localDescription?.sdp??offer.sdp});
      }catch{
        closePeer(id);
        if(running.current)setError(pt?'Não foi possível chamar outro participante.':'Could not connect to participant.');
        return null;
      }
    }
    return pc;
  },[sendSignal,closePeer,pt]);

  const handleSignal=useCallback(async(signal:VoiceSignal)=>{
    if(!running.current||signal.senderSessionId===selfSession.current)return;
    const id=signal.senderSessionId;
    try{
      let pc:RTCPeerConnection|null|undefined=pcMap.current.get(id);
      if(signal.kind==='offer'){
        if(!pc)pc=await connect(id,false);
        if(!pc)return;
        if(pc.signalingState!=='stable'){
          // Newly joined users initiate, but a stale negotiation should never stay open.
          closePeer(id);pc=await connect(id,false);if(!pc)return;
        }
        await pc.setRemoteDescription(signal.payload as RTCSessionDescriptionInit);
        for(const c of candidateQueue.current.get(id)??[])await pc.addIceCandidate(c);
        candidateQueue.current.delete(id);
        const answer=await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sendSignal(id,'answer',{type:'answer',sdp:pc.localDescription?.sdp??answer.sdp});
      }else if(signal.kind==='answer'){
        if(!pc)return;
        if(pc.signalingState==='have-local-offer'){
          await pc.setRemoteDescription(signal.payload as RTCSessionDescriptionInit);
          for(const c of candidateQueue.current.get(id)??[])await pc.addIceCandidate(c);
          candidateQueue.current.delete(id);
        }
      }else{
        const candidate=signal.payload as RTCIceCandidateInit;
        if(pc?.remoteDescription)await pc.addIceCandidate(candidate);
        else candidateQueue.current.set(id,[...(candidateQueue.current.get(id)??[]),candidate].slice(-100));
      }
    }catch{
      if(running.current)setError(pt?'Falha na negociação de áudio. Tente sair e entrar novamente.':'Audio negotiation failed. Please leave and rejoin.');
    }
  },[connect,sendSignal,closePeer,pt]);

  const sync=useCallback(async()=>{
    if(!running.current||!selfSession.current||polling.current)return;
    polling.current=true;
    try{
      const state=await req<VoiceState>(base+'/state?sessionId='+encodeURIComponent(selfSession.current)+'&after='+cursor.current);
      if(!running.current)return;
      setPeers(state.peers);recentPeers.current=state.peers;
      const currentIds=new Set(state.peers.map(peer=>peer.sessionId));
      const previous=knownPeers.current;
      if(!deafenedRef.current){
        if(state.peers.some(peer=>!peer.isSelf&&!previous.has(peer.sessionId)))playVoiceRoomCue('join');
        if([...previous].some(id=>id!==selfSession.current&&!currentIds.has(id)))playVoiceRoomCue('leave');
      }
      knownPeers.current=currentIds;
      for(const signal of state.signals){
        await handleSignal(signal);
        cursor.current=signal.id;
      }
      if(!state.signals.length)cursor.current=state.cursor;
      const peersNow=new Set(state.peers.map(p=>p.sessionId));
      for(const id of pcMap.current.keys())if(!peersNow.has(id))closePeer(id);
      for(const peer of state.peers){
        if(peer.isSelf||pcMap.current.has(peer.sessionId))continue;
        // Newest session makes the offer; the older participant waits for it.
        if(new Date(ownJoinedAt.current).getTime()>new Date(peer.joinedAt).getTime()){
          await connect(peer.sessionId,true);
        }
      }
      setError(old=>old==='VOICE_NETWORK_RETRY'?'':old);
    }catch(e){
      if(!running.current)return;
      if(e instanceof Error&&(['VOICE_SESSION_ENDED','MEMBERS_ONLY'].includes(e.message))){
        stop(false);
        setError(pt?'Sua sessão de voz terminou ou você perdeu o acesso à comunidade.':'Voice session ended or community access was revoked.');
      }else setError('VOICE_NETWORK_RETRY');
    }finally{polling.current=false;}
  },[base,connect,closePeer,handleSignal,stop,pt]);

  async function join(){
    if(joining.current||running.current)return;
    // Unlock during the actual click, before awaiting getUserMedia and the API.
    unlockVoiceRoomAudio();
    joining.current=true;setPhase('joining');setError('');
    let stream:MediaStream|null=null;
    try{
      if(!navigator.mediaDevices?.getUserMedia||!window.RTCPeerConnection)throw Error('UNSUPPORTED');
      stream=await navigator.mediaDevices.getUserMedia({
        audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false
      });
      if(disposed.current){stream.getTracks().forEach(track=>track.stop());return;}
      const sessionId=crypto.randomUUID();
      const result=await req<VoiceJoin>(base+'/join',json({sessionId}));
      if(disposed.current){
        stream.getTracks().forEach(track=>track.stop());
        void fetch(base+'/sessions/'+sessionId,{method:'DELETE',credentials:'same-origin',keepalive:true}).catch(()=>{});
        return;
      }
      local.current=stream;selfSession.current=sessionId;
      voiceMonitor.current=new VoiceActivityMonitor();voiceMonitor.current.add(sessionId,stream);
      config.current=result.rtc.iceServers;
      ownJoinedAt.current=result.peers.find(peer=>peer.sessionId===sessionId)?.joinedAt??new Date().toISOString();
      running.current=true;cursor.current='0';knownPeers.current=new Set(result.peers.map(peer=>peer.sessionId));
      setPeers(result.peers);recentPeers.current=result.peers;setPhase('joined');
      playVoiceRoomCue('join');
      for(const peer of result.peers)if(!peer.isSelf)void connect(peer.sessionId,true);
      timers.current=[
        window.setInterval(()=>{void sync();},1300),
        window.setInterval(()=>{
          if(!running.current||!selfSession.current||!voiceMonitor.current)return;
          const exclusions=new Set<string>();
          if(mutedRef.current)exclusions.add(selfSession.current);
          // Disabled remote microphones must not show activity from stale audio.
          for(const peer of recentPeers.current)if(peer.muted)exclusions.add(peer.sessionId);
          const next=voiceMonitor.current.sample(exclusions);
          setSpeaking(old=>{
            if(old.size===next.size&&[...old].every(id=>next.has(id)))return old;
            return next;
          });
        },90),
        window.setInterval(()=>{
          if(!running.current||!selfSession.current)return;
          void req(base+'/heartbeat',json({sessionId:selfSession.current,muted:mutedRef.current,deafened:deafenedRef.current}))
            .catch(()=>{if(running.current)setError('VOICE_NETWORK_RETRY');});
        },12000),
      ];
      void sync();
    }catch(e){
      stream?.getTracks().forEach(track=>track.stop());
      stop(false);
      const code=e instanceof Error?e.message:'';
      setError(code==='VOICE_ROOM_FULL'?(pt?'Sala cheia (limite de 6 pessoas).':'Room is full (6 participants).'):
        code==='UNSUPPORTED'?(pt?'Este navegador não suporta áudio WebRTC.':'This browser does not support WebRTC audio.'):
        code==='NotAllowedError'?(pt?'Autorize o microfone nas configurações do navegador.':'Allow microphone access in browser settings.'):
        code==='MEMBERS_ONLY'?(pt?'Você não tem permissão para acessar esta sala.':'You cannot join this room.'):
        (pt?'Não foi possível entrar. Confira o microfone e a conexão.':'Could not join. Check your microphone and connection.'));
    }finally{joining.current=false;}
  }
  function leaveRoom(){
    if(running.current&&!deafenedRef.current)playVoiceRoomCue('leave');
    stop();
  }
  function toggleMute(){
    if(deafenedRef.current)return;
    const next=!mutedRef.current;mutedRef.current=next;setMuted(next);
    local.current?.getAudioTracks().forEach(track=>{track.enabled=!next;});
    if(selfSession.current)void req(base+'/heartbeat',json({sessionId:selfSession.current,muted:next,deafened:false})).catch(()=>{});
  }
  function toggleDeafen(){
    const next=!deafenedRef.current;
    if(next)priorMuteRef.current=mutedRef.current;
    deafenedRef.current=next;setDeafened(next);
    for(const player of audioMap.current.values())player.muted=next;
    const nextMute=next?true:priorMuteRef.current;
    mutedRef.current=nextMute;setMuted(nextMute);
    local.current?.getAudioTracks().forEach(track=>{track.enabled=!nextMute;});
    if(selfSession.current)void req(base+'/heartbeat',json({sessionId:selfSession.current,muted:nextMute,deafened:next})).catch(()=>{});
  }
  function enableAudio(){
    void Promise.all([...audioMap.current.values()].map(el=>el.play())).then(()=>setAudioBlocked(false))
      .catch(()=>setAudioBlocked(true));
  }
  useEffect(()=>{
    disposed.current=false;
    const unload=()=>stop();
    window.addEventListener('pagehide',unload);
    return ()=>{
      disposed.current=true;
      window.removeEventListener('pagehide',unload);
      stop();
    };
  },[stop]);

  // Send real presence to the channel list; do not invent participants.
  const visiblePeers=peers.map(peer=>({
    ...peer,deafened:peer.isSelf?deafened:peer.deafened,
    muted:peer.isSelf?muted:peer.muted,
    speaking:!((peer.isSelf?muted:peer.muted))&&speaking.has(peer.sessionId),
  }));
  useEffect(()=>{onParticipantsChange?.(phase==='joined'?visiblePeers:[]);},
    // The parent receives a new list only as real presence, mute or activity changes.
    [onParticipantsChange,phase,peers,muted,deafened,speaking]);
  useEffect(()=>()=>onParticipantsChange?.([]),[onParticipantsChange]);

  const count=phase==='joined'?peers.length:0;
  const remoteReady=peers.filter(p=>!p.isSelf&&connections[p.sessionId]==='connected').length;
  return <section className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 sm:py-6">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><Volume2 className="size-5"/></div>
          <div className="min-w-0">
            <h3 className="text-base font-semibold">{pt?'Conversa por voz':'Voice chat'}</h3>
            <p className="text-xs text-muted-foreground">{phase==='joined'?(pt?count+' na sala':count+' in room'):
              phase==='joining'?(pt?'Entrando…':'Joining…'):(pt?'Conecte-se para conversar':'Connect to join the conversation')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs text-muted-foreground" role="status">
          <span className={'size-2 rounded-full '+(phase==='joined'?'bg-emerald-500':phase==='joining'?'bg-amber-500':'bg-muted-foreground/40')}/>
          {phase==='joined'?(pt?'Conectado':'Connected'):phase==='joining'?(pt?'Conectando':'Connecting'):(pt?'Desconectado':'Disconnected')}
        </div>
      </div>
      {error&&<div role="alert" className="mx-auto mt-4 max-w-5xl rounded-xl border border-destructive/35 bg-destructive/5 p-3 text-xs text-destructive">
        {error==='VOICE_NETWORK_RETRY'?(pt?'Reconectando…':'Reconnecting…'):error}</div>}
      {phase!=='joined'?<div className="flex min-h-[280px] flex-col items-center justify-center gap-4 py-12 text-center">
        <div className="grid size-24 place-items-center rounded-[2rem] border border-border bg-card shadow-sm"><Headphones className="size-11 text-primary"/></div>
        <div className="space-y-1">
          <h4 className="text-base font-semibold">{pt?'Entre no canal de voz':'Join voice channel'}</h4>
          <p className="max-w-sm text-sm text-muted-foreground">{pt?'Converse com os membros que estiverem conectados.':'Talk with other members in the room.'}</p>
        </div>
        <Button className="min-h-11 rounded-xl px-6" disabled={phase==='joining'} onClick={()=>void join()}>
          <Headphones className="size-4"/>{phase==='joining'?(pt?'Conectando…':'Connecting…'):(pt?'Conectar':'Connect')}</Button>
      </div>:<div className="mx-auto mt-6 max-w-5xl">
        <div className="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Users className="size-4"/><span>{pt?'Participantes':'Participants'} · {count}/6</span>
          {remoteReady>0&&<span className="ml-auto">{remoteReady} {pt?'áudio conectado':'audio connected'}</span>}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {visiblePeers.map(peer=>{
            const connection=connections[peer.sessionId];
            const ready=peer.isSelf||connection==='connected';
            const talking=ready&&!!peer.speaking;
            return <div key={peer.sessionId}
              className={'relative flex min-h-44 min-w-0 flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border bg-card px-3 py-5 text-center shadow-sm transition-[box-shadow,border-color] sm:min-h-48 '+(talking?'border-emerald-500 ring-2 ring-emerald-500/65 shadow-[0_0_16px_rgba(16,185,129,0.35)] animate-pulse':'border-border/70')}>
              <div className={'rounded-full p-1 '+(talking?'ring-2 ring-emerald-500':ready?'ring-1 ring-border':'ring-2 ring-border')}>
                <UserAvatar name={peer.displayName} image={peer.avatarUrl} size="lg"/>
              </div>
              <div className="min-w-0 max-w-full">
                <p className="truncate text-sm font-semibold">{peer.displayName}</p>
                <p className="truncate text-xs text-muted-foreground">{peer.isSelf?(pt?'Você':'You'):'@'+peer.handle}</p>
              </div>
              <div className="absolute right-3 top-3 flex items-center gap-1">
                {peer.deafened&&<span className="grid size-8 place-items-center rounded-full border border-destructive/30 bg-destructive/10 text-destructive"
                  title={pt?'Áudio desligado':'Audio disabled'} aria-label={pt?'Áudio desligado':'Audio disabled'}>
                  <VolumeX className="size-4"/></span>}
                <span className={'grid size-8 place-items-center rounded-full border '+(peer.muted?'border-destructive/30 bg-destructive/10 text-destructive':'border-border/50 bg-background/90 text-muted-foreground')}
                  title={peer.muted?(pt?'Microfone desligado':'Microphone muted'):(pt?'Microfone ligado':'Microphone on')}
                  aria-label={peer.muted?(pt?'Microfone desligado':'Microphone muted'):(pt?'Microfone ligado':'Microphone on')}>
                  {peer.muted?<MicOff className="size-4"/>:<Mic className="size-4"/>}
                </span>
              </div>
              {!ready&&<span className="absolute bottom-2 text-[11px] text-muted-foreground">
                {connection==='failed'?(pt?'Falha na conexão':'Connection failed'):(pt?'Conectando…':'Connecting…')}</span>}
            </div>;
          })}
        </div>
      </div>}
    </div>

    {phase==='joined'&&<div className="z-10 shrink-0 border-t border-border bg-card/95 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3">
        <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
          <span className="size-2 rounded-full bg-emerald-500"/>{pt?'Voz conectada':'Voice connected'}
        </div>
        <div className="flex flex-1 items-center justify-center gap-2 sm:flex-initial">
          <button type="button" onClick={toggleMute} disabled={deafened}
            className={'grid size-11 place-items-center rounded-xl border transition-colors disabled:cursor-not-allowed disabled:opacity-60 '+(muted?'border-destructive/35 bg-destructive/10 text-destructive':'border-border bg-secondary hover:bg-secondary/70')}
            aria-label={muted?(pt?'Ativar microfone':'Unmute microphone'):(pt?'Silenciar microfone':'Mute microphone')}
            title={muted?(pt?'Ativar microfone':'Unmute microphone'):(pt?'Silenciar microfone':'Mute microphone')}>
            {muted?<MicOff className="size-5"/>:<Mic className="size-5"/>}
          </button>
          <button type="button" onClick={toggleDeafen}
            className={'grid size-11 place-items-center rounded-xl border transition-colors '+(deafened?'border-destructive/35 bg-destructive/10 text-destructive':'border-border bg-secondary hover:bg-secondary/70')}
            aria-label={deafened?(pt?'Ativar áudio':'Undeafen'):(pt?'Desativar áudio e microfone':'Deafen')}
            title={deafened?(pt?'Ativar áudio':'Undeafen'):(pt?'Desativar áudio e microfone':'Deafen')}>
            {deafened?<VolumeX className="size-5"/>:<Volume2 className="size-5"/>}
          </button>
          {audioBlocked&&!deafened&&<Button variant="outline" className="min-h-11 rounded-xl" onClick={enableAudio}>
            <Volume2 className="size-4"/>{pt?'Ativar som':'Enable sound'}</Button>}
          <button type="button" onClick={leaveRoom}
            className="flex min-h-11 items-center gap-2 rounded-xl bg-destructive px-4 font-semibold text-destructive-foreground hover:bg-destructive/90"
            aria-label={pt?'Desconectar da sala':'Disconnect from room'} title={pt?'Desconectar':'Disconnect'}>
            <PhoneOff className="size-5"/><span className="text-sm">{pt?'Sair':'Leave'}</span>
          </button>
        </div>
        <div className="hidden text-xs text-muted-foreground sm:block">{count}/6</div>
      </div>
    </div>}
  </section>;
}
