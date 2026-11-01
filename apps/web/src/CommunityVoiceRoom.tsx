import { useCallback, useEffect, useRef, useState } from 'react';
import { Headphones, LogOut, Mic, MicOff, RefreshCw, Volume2, VolumeX, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UserAvatar } from './UserProfiles';
import { useUorquiPreferences } from './UorquiPreferences';

type VoicePeer={sessionId:string;handle:string;displayName:string;avatarUrl:string|null;muted:boolean;joinedAt:string;isSelf:boolean};
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
export default function CommunityVoiceRoom({communityId,channelId}:{communityId:string;channelId:string}){
  const {locale}=useUorquiPreferences();const pt=locale==='pt-BR';
  const [phase,setPhase]=useState<'idle'|'joining'|'joined'>('idle');
  const [peers,setPeers]=useState<VoicePeer[]>([]);
  const [muted,setMuted]=useState(false);
  const [relayAvailable,setRelayAvailable]=useState(false);
  const [connections,setConnections]=useState<Record<string,RTCPeerConnectionState>>({});
  const [error,setError]=useState('');
  const [audioBlocked,setAudioBlocked]=useState(false);
  const running=useRef(false);
  const joining=useRef(false);
  const selfSession=useRef<string|null>(null);
  const local=useRef<MediaStream|null>(null);
  const config=useRef<RTCIceServer[]>([]);
  const pcMap=useRef(new Map<string,RTCPeerConnection>());
  const audioMap=useRef(new Map<string,HTMLAudioElement>());
  const candidateQueue=useRef(new Map<string,RTCIceCandidateInit[]>());
  const cursor=useRef('0');
  const polling=useRef(false);
  const timers=useRef<number[]>([]);
  const mutedRef=useRef(false);
  const ownJoinedAt=useRef('');
  const base='/api/v1/communities/'+communityId+'/channels/'+channelId+'/voice';

  const stop=useCallback((notify=true)=>{
    running.current=false;
    const sessionId=selfSession.current;selfSession.current=null;
    for(const timer of timers.current)window.clearInterval(timer);
    timers.current=[];
    for(const pc of pcMap.current.values())pc.close();
    pcMap.current.clear();candidateQueue.current.clear();
    for(const el of audioMap.current.values()){el.pause();el.srcObject=null;el.remove();}
    audioMap.current.clear();local.current?.getTracks().forEach(track=>track.stop());local.current=null;
    cursor.current='0';ownJoinedAt.current='';mutedRef.current=false;
    setPhase('idle');setMuted(false);setPeers([]);setConnections({});setAudioBlocked(false);
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
        element.style.display='none';
        document.body.appendChild(element);
        audioMap.current.set(id,element);
      }
      element.srcObject=event.streams[0]??new MediaStream([event.track]);
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
      setPeers(state.peers);
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
    joining.current=true;setPhase('joining');setError('');
    let stream:MediaStream|null=null;
    try{
      if(!navigator.mediaDevices?.getUserMedia||!window.RTCPeerConnection)throw Error('UNSUPPORTED');
      stream=await navigator.mediaDevices.getUserMedia({
        audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false
      });
      const sessionId=crypto.randomUUID();
      const result=await req<VoiceJoin>(base+'/join',json({sessionId}));
      local.current=stream;selfSession.current=sessionId;
      config.current=result.rtc.iceServers;
      setRelayAvailable(result.rtc.relayAvailable);
      ownJoinedAt.current=result.peers.find(peer=>peer.sessionId===sessionId)?.joinedAt??new Date().toISOString();
      running.current=true;cursor.current='0';setPeers(result.peers);setPhase('joined');
      for(const peer of result.peers)if(!peer.isSelf)void connect(peer.sessionId,true);
      timers.current=[
        window.setInterval(()=>{void sync();},1300),
        window.setInterval(()=>{
          if(!running.current||!selfSession.current)return;
          void req(base+'/heartbeat',json({sessionId:selfSession.current,muted:mutedRef.current}))
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
  function toggleMute(){
    const next=!mutedRef.current;mutedRef.current=next;setMuted(next);
    local.current?.getAudioTracks().forEach(track=>{track.enabled=!next;});
    if(selfSession.current)void req(base+'/heartbeat',json({sessionId:selfSession.current,muted:next})).catch(()=>{});
  }
  function enableAudio(){
    void Promise.all([...audioMap.current.values()].map(el=>el.play())).then(()=>setAudioBlocked(false))
      .catch(()=>setAudioBlocked(true));
  }
  useEffect(()=>{
    const unload=()=>stop();
    window.addEventListener('pagehide',unload);
    return ()=>{window.removeEventListener('pagehide',unload);stop();};
  },[stop]);

  return <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-4 pb-8 sm:p-6">
    <div className="mx-auto w-full max-w-xl space-y-5">
      <div className="space-y-2 text-center">
        <Headphones className="mx-auto size-9 text-primary"/>
        <h3 className="text-lg font-semibold">{pt?'Sala de voz':'Voice room'}</h3>
        <p className="text-xs leading-5 text-muted-foreground">{pt?
          'Áudio entre participantes da comunidade. O microfone só é ativado quando você entra.':
          'Live audio between community members. The microphone turns on only after you join.'}</p>
      </div>
      {phase==='idle'?<Button className="mx-auto flex min-h-11" disabled={joining.current} onClick={()=>void join()}>
        <Headphones className="size-4"/>{pt?'Entrar na sala de voz':'Join voice room'}
      </Button>:phase==='joining'?<p role="status" className="text-center text-sm text-muted-foreground">
        {pt?'Solicitando microfone e conectando…':'Requesting microphone and connecting…'}</p>:<>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button variant={muted?'outline':'secondary'} className="min-h-11" onClick={toggleMute}>
            {muted?<MicOff className="size-4"/>:<Mic className="size-4"/>}
            {muted?(pt?'Microfone desligado':'Mic muted'):(pt?'Microfone ligado':'Mic on')}
          </Button>
          <Button variant="destructive" className="min-h-11" onClick={()=>stop()}>
            <LogOut className="size-4"/>{pt?'Sair':'Leave'}
          </Button>
          {audioBlocked&&<Button variant="outline" onClick={enableAudio}><Volume2 className="size-4"/>
            {pt?'Ativar som':'Enable sound'}</Button>}
        </div>
        <p role="status" className="text-center text-xs text-muted-foreground">{relayAvailable?
          (pt?'Conexão direta ou relay TURN disponível.':'Direct or TURN relay connection available.'):
          (pt?'Conexão direta STUN: redes restritas podem precisar de TURN.':'STUN-only: restrictive networks may require TURN.')}</p>
      </>}
      {error&&<div role="alert" className="rounded-xl border border-destructive/35 bg-destructive/5 px-3 py-2 text-center text-xs text-destructive">
        {error==='VOICE_NETWORK_RETRY'?(pt?'Reconectando sinalização…':'Reconnecting signaling…'):error}
      </div>}
      {phase==='joined'&&<div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-sm font-semibold"><Users className="size-4 text-primary"/>
          {pt?'Participantes':'Participants'} <span className="text-xs font-normal text-muted-foreground">({peers.length}/6)</span></div>
        {peers.map(peer=><div key={peer.sessionId} className="flex items-center gap-3">
          <UserAvatar name={peer.displayName} image={peer.avatarUrl} size="sm"/>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{peer.displayName}{peer.isSelf&&<span className="ml-2 text-xs text-muted-foreground">{pt?'(você)':'(you)'}</span>}</div>
            <p className="truncate text-[11px] text-muted-foreground">@{peer.handle} · {peer.isSelf?
              (pt?'Conectado':'Connected'):
              connections[peer.sessionId]==='connected'?(pt?'Áudio conectado':'Audio connected'):
              connections[peer.sessionId]==='failed'?(pt?'Falha na conexão':'Connection failed'):
              (pt?'Conectando…':'Connecting…')}</p>
          </div>
          {peer.muted?<MicOff aria-label={pt?'Silenciado':'Muted'} className="size-4 text-muted-foreground"/>:
            <Mic aria-label={pt?'Microfone ativo':'Microphone active'} className="size-4 text-primary"/>}
        </div>)}
      </div>}
      <div className="flex items-start gap-2 rounded-xl border border-border/80 bg-secondary/30 p-3 text-xs leading-5 text-muted-foreground">
        {phase==='joined'?<Volume2 className="mt-0.5 size-4 shrink-0"/>:<VolumeX className="mt-0.5 size-4 shrink-0"/>}
        <p>{pt?
          'A chamada utiliza WebRTC: o Uorqui transmite apenas a sinalização pelo servidor; o áudio não é gravado nem salvo. Em conexões restritas, configure o TURN para maior confiabilidade.':
          'WebRTC transmits audio peer-to-peer. Uorqui stores only temporary signaling, never recorded audio. Configure TURN for better reliability on restricted networks.'}</p>
      </div>
      {phase==='joined'&&<Button variant="ghost" size="sm" className="mx-auto flex" onClick={()=>void sync()}>
        <RefreshCw className="size-4"/>{pt?'Atualizar participantes':'Refresh participants'}</Button>}
    </div>
  </div>;
}
