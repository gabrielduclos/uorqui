import { useCallback, useEffect, useRef, useState } from 'react';
import { Headphones, Maximize2, Minimize2, Mic, MicOff, MonitorUp, MonitorOff, PhoneOff, Volume2, VolumeX, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UserAvatar } from './UserProfiles';
import { useUorquiPreferences } from './UorquiPreferences';
import { VoiceActivityMonitor } from './VoiceActivityMonitor';
import { playVoiceRoomCue, unlockVoiceRoomAudio } from './communityVoiceSounds';

export type CommunityVoiceParticipant={sessionId:string;handle:string;displayName:string;avatarUrl:string|null;muted:boolean;deafened:boolean;isSelf:boolean;speaking?:boolean};
export type VoiceRoomTarget={communityId:string;channelId:string;communityName:string;channelName:string};
export type VoicePhase='idle'|'joining'|'joined';
type VoicePeer=CommunityVoiceParticipant & {joinedAt:string};
type VoiceSignal={id:string;senderSessionId:string;kind:'offer'|'answer'|'candidate';payload:RTCSessionDescriptionInit|RTCIceCandidateInit};
type VoiceJoin={sessionId:string;peers:VoicePeer[];rtc:{iceServers:RTCIceServer[];relayAvailable:boolean};maxParticipants:number};
type VoiceState={peers:VoicePeer[];signals:VoiceSignal[];cursor:string};

async function req<T>(url:string,init?:RequestInit):Promise<T>{
  const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...init});
  if(!r.ok){const error=await r.json().catch(()=>null) as {error?:string}|null;throw Error(error?.error??'HTTP_'+r.status);}
  return r.status===204?undefined as T:r.json() as Promise<T>;
}
function ScreenTile({stream,label}:{stream:MediaStream;label:string}){
  const el=useRef<HTMLVideoElement|null>(null);
  useEffect(()=>{const video=el.current;if(!video)return;video.srcObject=stream;void video.play().catch(()=>{});
    return ()=>{video.pause();video.srcObject=null;};},[stream]);
  return <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-black">
    <video ref={el} autoPlay playsInline muted className="aspect-video w-full object-contain" aria-label={label}/>
    <p className="truncate bg-card px-3 py-2 text-xs font-medium">{label}</p>
  </div>;
}
const json=(value:unknown):RequestInit=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});

/** A small P2P mesh: audio is end-to-end encrypted by DTLS/SRTP, never stored by the app. */
export default function CommunityVoiceRoom({communityId,channelId,communityName,channelName,mode='expanded',onMinimize,onRestore,onLeave,onPhaseChange,onParticipantsChange}:{
  communityId:string;channelId:string;communityName:string;channelName:string;
  mode?:'expanded'|'floating';onMinimize?:()=>void;onRestore?:()=>void;onLeave?:()=>void;
  onPhaseChange?:(phase:VoicePhase)=>void;
  onParticipantsChange?:(participants:CommunityVoiceParticipant[])=>void;
}){
  const {locale}=useUorquiPreferences();const pt=locale==='pt-BR';
  const [phase,setPhase]=useState<VoicePhase>('idle');
  const [peers,setPeers]=useState<VoicePeer[]>([]);
  const [muted,setMuted]=useState(false);
  const [deafened,setDeafened]=useState(false);
  const [connections,setConnections]=useState<Record<string,RTCPeerConnectionState>>({});
  const [speaking,setSpeaking]=useState<Set<string>>(()=>new Set());
  const [error,setError]=useState('');
  const [audioBlocked,setAudioBlocked]=useState(false);
  const [micInterrupted,setMicInterrupted]=useState(false);
  const [screenBusy,setScreenBusy]=useState(false);
  const [sharing,setSharing]=useState(false);
  const [screens,setScreens]=useState<Record<string,MediaStream>>({});
  const running=useRef(false);
  const disposed=useRef(false);
  const joining=useRef(false);
  const selfSession=useRef<string|null>(null);
  const local=useRef<MediaStream|null>(null);
  const config=useRef<RTCIceServer[]>([]);
  const pcMap=useRef(new Map<string,RTCPeerConnection>());
  const audioMap=useRef(new Map<string,HTMLAudioElement>());
  const screenRef=useRef<MediaStream|null>(null);
  const screenSenders=useRef(new Map<string,RTCRtpSender>());
  const negotiations=useRef(new Set<string>());
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
  const recoveringMic=useRef(false);
  const foregroundTimer=useRef<number|null>(null);
  const base='/api/v1/communities/'+communityId+'/channels/'+channelId+'/voice';

  const stop=useCallback((notify=true)=>{
    if(foregroundTimer.current!==null)window.clearTimeout(foregroundTimer.current);
    foregroundTimer.current=null;
    setMicInterrupted(false);
    running.current=false;
    const sessionId=selfSession.current;selfSession.current=null;
    for(const timer of timers.current)window.clearInterval(timer);
    screenRef.current?.getTracks().forEach(t=>{t.onended=null;t.stop();});screenRef.current=null;
    screenSenders.current.clear();negotiations.current.clear();setSharing(false);setScreens({});setScreenBusy(false);
    timers.current=[];
    for(const pc of pcMap.current.values())pc.close();
    pcMap.current.clear();candidateQueue.current.clear();knownPeers.current.clear();
    voiceMonitor.current?.dispose();voiceMonitor.current=null;recentPeers.current=[];setSpeaking(new Set());
    for(const el of audioMap.current.values()){el.pause();el.srcObject=null;el.remove();}
    audioMap.current.clear();local.current?.getTracks().forEach(track=>{track.onmute=null;track.onunmute=null;track.onended=null;track.stop();});local.current=null;
    cursor.current='0';ownJoinedAt.current='';mutedRef.current=false;deafenedRef.current=false;priorMuteRef.current=false;
    setPhase('idle');setMuted(false);setDeafened(false);setPeers([]);setConnections({});setAudioBlocked(false);
    if(sessionId&&notify){
      void fetch(base+'/sessions/'+sessionId,{method:'DELETE',credentials:'same-origin',cache:'no-store',keepalive:true}).catch(()=>{});
    }
  },[base]);

  const watchMic=useCallback((track:MediaStreamTrack)=>{
    track.onmute=()=>{if(running.current&&!mutedRef.current)setMicInterrupted(true);};
    track.onunmute=()=>{if(running.current)setMicInterrupted(false);};
    track.onended=()=>{if(running.current)setMicInterrupted(true);};
  },[]);
  const restoreMic=useCallback(async()=>{
    if(!running.current||!selfSession.current||recoveringMic.current)return;
    const track=local.current?.getAudioTracks()[0];
    if(track?.readyState==='live'&&!track.muted){setMicInterrupted(false);return;}
    recoveringMic.current=true;
    let stream:MediaStream|null=null;
    try{
      stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
      if(!running.current||!selfSession.current){stream.getTracks().forEach(t=>t.stop());return;}
      const replacement=stream.getAudioTracks()[0];
      if(!replacement)throw Error('NO_AUDIO_TRACK');
      replacement.enabled=!mutedRef.current;
      await Promise.all([...pcMap.current.values()].flatMap(pc=>
        pc.getSenders().filter(sender=>sender.track?.kind==='audio')
          .map(sender=>sender.replaceTrack(replacement).catch(()=>{}))));
      const previous=local.current;
      local.current=stream;
      watchMic(replacement);
      voiceMonitor.current?.remove(selfSession.current);
      voiceMonitor.current?.add(selfSession.current,stream);
      previous?.getTracks().forEach(t=>{t.onmute=null;t.onunmute=null;t.onended=null;t.stop();});
      setMicInterrupted(false);
    }catch{
      stream?.getTracks().forEach(t=>t.stop());
      setMicInterrupted(true);
    }finally{recoveringMic.current=false;}
  },[watchMic]);

  const sendSignal=useCallback(async(to:string,kind:VoiceSignal['kind'],payload:VoiceSignal['payload'])=>{
    if(!running.current||!selfSession.current)return;
    await req(base+'/signal',json({
      sessionId:selfSession.current,recipientSessionId:to,kind,payload
    }));
  },[base]);

  const closePeer=useCallback((id:string)=>{
    const pc=pcMap.current.get(id);
    if(pc){pc.close();pcMap.current.delete(id);}
    screenSenders.current.delete(id);negotiations.current.delete(id);
    setScreens(old=>{if(!(id in old))return old;const next={...old};delete next[id];return next;});
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
      if(event.track.kind==='video'){
        const media=event.streams[0]??new MediaStream([event.track]);
        const display=()=>{if(running.current)setScreens(old=>({...old,[id]:media}));};
        const hide=()=>setScreens(old=>{if(!(id in old))return old;const next={...old};delete next[id];return next;});
        event.track.onunmute=display;event.track.onmute=hide;event.track.onended=hide;
        display();return;
      }
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
    const video=screenRef.current?.getVideoTracks()[0];
    if(video&&screenRef.current)screenSenders.current.set(id,pc.addTrack(video,screenRef.current));
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
        if(pc.signalingState==='have-local-offer'){
          // Roll back a simultaneous local renegotiation; keep existing media tracks.
          await pc.setLocalDescription({type:'rollback'});
        }else if(pc.signalingState!=='stable')return;
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

  const renegotiate=useCallback(async(id:string)=>{
    const pc=pcMap.current.get(id);
    if(!pc||pc.signalingState==='closed'||negotiations.current.has(id))return;
    if(pc.signalingState!=='stable'){
      window.setTimeout(()=>{if(running.current)void renegotiate(id);},250);
      return;
    }
    negotiations.current.add(id);
    try{
      const offer=await pc.createOffer();
      await pc.setLocalDescription(offer);
      await sendSignal(id,'offer',{type:'offer',sdp:pc.localDescription?.sdp??offer.sdp});
    }catch{if(running.current)setError(pt?'Não foi possível sincronizar a tela.':'Could not synchronize screen sharing.');}
    finally{negotiations.current.delete(id);}
  },[sendSignal,pt]);

  function stopScreenShare(){
    const old=screenRef.current;
    if(!old)return;
    screenRef.current=null;
    for(const track of old.getTracks()){track.onended=null;track.stop();}
    setSharing(false);
    if(selfSession.current)setScreens(previous=>{const next={...previous};delete next[selfSession.current!];return next;});
    for(const [id,sender] of screenSenders.current){
      const pc=pcMap.current.get(id);
      if(pc&&pc.signalingState!=='closed'){
        try{pc.removeTrack(sender);}catch{}
        void renegotiate(id);
      }
    }
    screenSenders.current.clear();
  }
  async function toggleScreenShare(){
    if(screenRef.current){stopScreenShare();return;}
    if(!running.current||!('getDisplayMedia' in (navigator.mediaDevices??{})))return;
    setScreenBusy(true);setError('');
    let stream:MediaStream|null=null;
    try{
      stream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:15},audio:false});
      if(!running.current||disposed.current){stream.getTracks().forEach(t=>t.stop());return;}
      const video=stream.getVideoTracks()[0];
      if(!video)throw Error('No screen video track');
      screenRef.current=stream;setSharing(true);
      const own=selfSession.current;
      if(own)setScreens(old=>({...old,[own]:stream!}));
      video.onended=()=>stopScreenShare();
      for(const [id,pc] of pcMap.current){
        if(pc.signalingState==='closed')continue;
        screenSenders.current.set(id,pc.addTrack(video,stream));
        void renegotiate(id);
      }
    }catch(e){
      stream?.getTracks().forEach(t=>t.stop());
      if(e instanceof Error&&(['NotAllowedError','AbortError'].includes(e.name)))return;
      setError(pt?'Não foi possível compartilhar a tela.':'Could not share your screen.');
    }finally{setScreenBusy(false);}
  }

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
    try{
      const session=(navigator as Navigator & {audioSession?:{type:string}}).audioSession;
      if(session)session.type='play-and-record';
    }catch{/* Optional browser API. */}
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
      running.current=true;watchMic(stream.getAudioTracks()[0]);setMicInterrupted(false);
      cursor.current='0';knownPeers.current=new Set(result.peers.map(peer=>peer.sessionId));
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
    onLeave?.();
  }
  function toggleMute(){
    if(deafenedRef.current)return;
    const next=!mutedRef.current;mutedRef.current=next;setMuted(next);
    local.current?.getAudioTracks().forEach(track=>{track.enabled=!next;});
    if(!next&&micInterrupted)void restoreMic();
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

  useEffect(()=>{
    const resume=()=>{
      if(document.visibilityState!=='visible'||!running.current||!selfSession.current)return;
      void req(base+'/heartbeat',json({sessionId:selfSession.current,muted:mutedRef.current,deafened:deafenedRef.current}))
        .catch(()=>{if(running.current)setError('VOICE_NETWORK_RETRY');});
      void sync();
      if(foregroundTimer.current!==null)window.clearTimeout(foregroundTimer.current);
      foregroundTimer.current=window.setTimeout(()=>{
        foregroundTimer.current=null;
        if(!running.current||document.visibilityState!=='visible')return;
        const track=local.current?.getAudioTracks()[0];
        if(!track||track.readyState!=='live'||track.muted)void restoreMic();
        else setMicInterrupted(false);
        for(const [id,pc] of pcMap.current){
          if(pc.connectionState==='failed'){
            try{pc.restartIce();void renegotiate(id);}catch{/* Retry on next state sync. */}
          }
        }
        if(!deafenedRef.current)for(const player of audioMap.current.values()){
          void player.play().catch(()=>setAudioBlocked(true));
        }
      },750);
    };
    document.addEventListener('visibilitychange',resume);
    window.addEventListener('focus',resume);
    window.addEventListener('online',resume);
    return ()=>{
      document.removeEventListener('visibilitychange',resume);
      window.removeEventListener('focus',resume);
      window.removeEventListener('online',resume);
      if(foregroundTimer.current!==null)window.clearTimeout(foregroundTimer.current);
    };
  },[base,sync,restoreMic,renegotiate]);
  // Keep the screen awake for an active voice session in the installed PWA.
  // This component stays mounted even when the call is a floating mini-player
  // and the user navigates to another Uorqui tab.
  useEffect(()=>{
    if(phase!=='joined')return;
    const installed=window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & {standalone?:boolean}).standalone===true;
    if(!installed||!('wakeLock' in navigator))return;

    let cancelled=false;
    let requesting=false;
    let lock:WakeLockSentinel|null=null;
    const acquire=async()=>{
      if(cancelled||requesting||lock||document.visibilityState!=='visible')return;
      requesting=true;
      try{
        const next=await navigator.wakeLock.request('screen');
        if(cancelled){void next.release().catch(()=>{});return;}
        lock=next;
        next.addEventListener('release',()=>{
          if(lock===next)lock=null;
        });
      }catch{
        // Unsupported, denied or power saving: the operating system retains control.
      }finally{requesting=false;}
    };
    const onResume=()=>{if(document.visibilityState==='visible')void acquire();};
    document.addEventListener('visibilitychange',onResume);
    window.addEventListener('focus',onResume);
    void acquire();
    return ()=>{
      cancelled=true;
      document.removeEventListener('visibilitychange',onResume);
      window.removeEventListener('focus',onResume);
      const current=lock;lock=null;
      if(current)void current.release().catch(()=>{});
    };
  },[phase]);

  useEffect(()=>{onPhaseChange?.(phase);},[onPhaseChange,phase]);

  // Send real presence to the channel list; do not invent participants.
  const visiblePeers=peers.map(peer=>({
    ...peer,deafened:peer.isSelf?deafened:peer.deafened,
    muted:peer.isSelf?(muted||micInterrupted):peer.muted,
    speaking:!((peer.isSelf?muted:peer.muted))&&speaking.has(peer.sessionId),
  }));
  useEffect(()=>{onParticipantsChange?.(phase==='joined'?visiblePeers:[]);},
    // The parent receives a new list only as real presence, mute or activity changes.
    [onParticipantsChange,phase,peers,muted,deafened,speaking,micInterrupted]);
  useEffect(()=>()=>onParticipantsChange?.([]),[onParticipantsChange]);

  const count=phase==='joined'?peers.length:0;
  const activeSpeakers=phase==='joined'?visiblePeers.filter(peer=>peer.speaking):[];
  if(mode==='floating')return <section role="region" aria-label={pt?'Chamada de voz em andamento':'Ongoing voice call'}
    className="inline-flex max-w-full overflow-hidden rounded-xl border border-primary/30 bg-card shadow-2xl">
    <div className="flex min-w-0 items-center gap-1 p-1.5">
      <button type="button" className="flex min-w-0 items-center gap-2 rounded-lg px-1 py-1 text-left hover:bg-accent"
        onClick={onRestore} aria-label={pt?'Voltar para a sala de voz':'Return to voice room'}>
        <span className="relative grid size-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
          <Headphones className="size-4"/>
          <span className={'absolute -right-0.5 -top-0.5 size-2 rounded-full bg-emerald-500 ring-2 ring-card '+(activeSpeakers.length?'animate-pulse':'')} aria-hidden="true"/>
        </span>
        <span className="min-w-0 max-w-24 sm:max-w-32">
          <span className="block truncate text-xs font-semibold">{channelName}</span>
          <span className="block truncate text-[10px] text-muted-foreground">{count} {pt?'na sala':'in room'}</span>
        </span>
      </button>
      <button type="button" onClick={onRestore}
        className="grid size-9 shrink-0 place-items-center rounded-lg text-primary hover:bg-accent"
        aria-label={pt?'Expandir chamada':'Expand call'} title={pt?'Expandir':'Expand'}>
        <Maximize2 className="size-4"/>
      </button>
      <button type="button" onClick={toggleMute} disabled={deafened}
        className={'grid size-9 shrink-0 place-items-center rounded-lg border disabled:opacity-50 '+(muted?'border-destructive/40 text-destructive':'border-border')}
        aria-label={muted?(pt?'Ativar microfone':'Unmute microphone'):(pt?'Silenciar microfone':'Mute microphone')}>
        {muted?<MicOff className="size-4"/>:<Mic className="size-4"/>}
      </button>
      <button type="button" onClick={leaveRoom} className="grid size-9 shrink-0 place-items-center rounded-lg bg-destructive text-destructive-foreground"
        aria-label={pt?'Desconectar da sala':'Disconnect from room'}><PhoneOff className="size-4"/></button>
    </div>
  </section>;
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
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs text-muted-foreground" role="status">
            <span className={'size-2 rounded-full '+(phase==='joined'?'bg-emerald-500':phase==='joining'?'bg-amber-500':'bg-muted-foreground/40')}/>
            {phase==='joined'?(pt?'Conectado':'Connected'):phase==='joining'?(pt?'Conectando':'Connecting'):(pt?'Desconectado':'Disconnected')}
          </div>
          {onMinimize&&<Button type="button" variant="outline" size="sm" onClick={onMinimize} className="min-h-10 gap-1.5"
            aria-label={phase==='joined'?(pt?'Minimizar chamada':'Minimize call'):(pt?'Fechar sala':'Close room')}>
            <Minimize2 className="size-4"/><span className="hidden sm:inline">{phase==='joined'?(pt?'Minimizar':'Minimize'):(pt?'Fechar':'Close')}</span>
          </Button>}
        </div>
      </div>
      {error&&<div role="alert" className="mx-auto mt-4 max-w-5xl rounded-xl border border-destructive/35 bg-destructive/5 p-3 text-xs text-destructive">
        {error==='VOICE_NETWORK_RETRY'?(pt?'Reconectando…':'Reconnecting…'):error}</div>}
      {phase==='joined'&&micInterrupted&&<div role="status" className="mx-auto mt-3 flex w-full max-w-5xl flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-3 text-xs">
        <span>{pt?'O sistema interrompeu o microfone, mas a sala permanece aberta.':'System microphone capture was interrupted; the room remains open.'}</span>
        <Button size="sm" variant="outline" onClick={()=>void restoreMic()}><Mic className="size-4"/>{pt?'Reativar microfone':'Restore microphone'}</Button>
      </div>}
      {phase==='joined'&&Object.keys(screens).length>0&&<div className="mx-auto mt-5 grid w-full max-w-5xl grid-cols-1 gap-3 lg:grid-cols-2">
        {Object.entries(screens).map(([id,stream])=><ScreenTile key={id} stream={stream} label={id===selfSession.current?
          (pt?'Sua tela':'Your screen'):
          (pt?'Tela de ':'Screen from ')+(peers.find(p=>p.sessionId===id)?.displayName??'')}/>)}
      </div>}
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
              className={'relative flex min-h-44 min-w-0 flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border bg-card px-3 py-5 text-center shadow-sm transition-[box-shadow,border-color] sm:min-h-48 '+(talking?'border-emerald-500 ring-2 ring-emerald-500/65 shadow-[0_0_16px_rgba(16,185,129,0.35)]':'border-border/70')}>
              {talking&&<span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-2xl border-2 border-emerald-400 animate-pulse"/>}
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
          <button type="button" disabled={screenBusy||!('getDisplayMedia' in (navigator.mediaDevices??{}))} onClick={()=>void toggleScreenShare()}
            className={'grid size-11 place-items-center rounded-xl border transition-colors disabled:opacity-40 '+(sharing?'border-primary/60 bg-primary/15 text-primary':'border-border bg-secondary hover:bg-secondary/70')}
            aria-label={sharing?(pt?'Parar compartilhamento de tela':'Stop screen sharing'):(pt?'Compartilhar tela':'Share screen')}
            title={('getDisplayMedia' in (navigator.mediaDevices??{}))?(sharing?(pt?'Parar apresentação':'Stop presenting'):(pt?'Compartilhar tela':'Share screen')):
              (pt?'Não disponível neste navegador':'Unavailable in this browser')}>
            {screenBusy?<span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"/>:
              sharing?<MonitorOff className="size-5"/>:<MonitorUp className="size-5"/>}
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
