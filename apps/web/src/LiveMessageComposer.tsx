import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent, type RefObject } from 'react';
import { Camera, FileText, Images, MapPin, Mic, Pause, Pencil, Play, Plus, Send, Smile, Square, Video, X } from 'lucide-react';
import { attachmentLabel } from './chatAttachmentLabels';
import { createPortal } from 'react-dom';
import { ChatAudioPlayer } from './ChatAudioPlayer';
import { ChatImageEditor } from './ChatImageEditor';
import { cn } from '@/lib/utils';
import { optimizeVideoAttachment } from './videoCompression';
import { optimizeImageAttachment } from './imageCompression';

const EMOJI_GROUPS = [
  { pt: 'Expressões', en: 'Expressions', symbols: ['😀','😃','😁','😂','🤣','😊','😍','🥰','😘','😎','🥹','😢','😭','😡','🤔','😴','🤩','😮'] },
  { pt: 'Gestos', en: 'Gestures', symbols: ['👍','👎','👏','🙌','🙏','👋','👌','✌️','🤝','💪','🫶','👀'] },
  { pt: 'Corações e símbolos', en: 'Hearts and symbols', symbols: ['❤️','🩷','💜','💙','💚','💔','🔥','✨','🎉','✅','⭐','🎮'] },
] as const;

const ATTACHMENTS = [
  { icon: Images, pt: 'Galeria', en: 'Gallery' },
  { icon: Camera, pt: 'Câmera', en: 'Camera' },
  { icon: FileText, pt: 'Arquivo', en: 'File' },
  { icon: MapPin, pt: 'Localização', en: 'Location' },
] as const;

export function LiveMessageComposer({ value, onChange, onSelectionChange, onSubmit, onAttach, onShareLocation, sending, locale, textareaRef, editing = false, onGif, gifOpen = false }: {
  value: string; onChange: (text: string) => void;
  onSelectionChange?: (text:string,start:number,end:number)=>void;
  onSubmit: () => void;
  onAttach: (file: File, caption: string) => void;
  onShareLocation: (latitude:number,longitude:number,caption:string) => void;
  sending: boolean; locale: string; textareaRef: RefObject<HTMLTextAreaElement | null>; editing?: boolean;
  onGif?:()=>void;gifOpen?:boolean;
}) {
  const pt = locale === 'pt-BR';
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const controls = useRef<HTMLFormElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraKindRef = useRef<'image' | 'video'>('image');
  const [cameraOptions,setCameraOptions] = useState(false);
  const [pending,setPending] = useState<File | null>(null);
  const [pendingUrl,setPendingUrl] = useState<string | null>(null);
  const localUrl = useRef<string | null>(null);
  const [pendingPhotos,setPendingPhotos] = useState<File[]>([]);
  const [photoUrls,setPhotoUrls] = useState<string[]>([]);
  const photoLocalUrls = useRef<string[]>([]);
  const [editingPhotoIndex,setEditingPhotoIndex] = useState<number | null>(null);
  const [editorOpen,setEditorOpen] = useState(false);
  const [pendingLocation,setPendingLocation] = useState<{latitude:number;longitude:number}|null>(null);
  const [locating,setLocating] = useState(false);
  const [recording,setRecording] = useState<'idle'|'recording'|'paused'>('idle');
  const [recordSeconds,setRecordSeconds] = useState(0);
  const [error,setError] = useState('');
  const [optimizing,setOptimizing] = useState(false);
  const [optimizationProgress,setOptimizationProgress] = useState(0);
  const [optimizationKind,setOptimizationKind] = useState<'image'|'video'>('video');
  const [optimizingFile,setOptimizingFile] = useState<{name:string;size:number}|null>(null);
  const [videoNotice,setVideoNotice] = useState('');
  const optimizationController=useRef<AbortController|null>(null);
  const optimizingRef=useRef(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const audioStream = useRef<MediaStream | null>(null);
  const recordingChunks = useRef<Blob[]>([]);
  const discardRecording = useRef(false);
  const mounted = useRef(true);
  const canSend = (!!value.trim() || !!pending || pendingPhotos.length>0 || !!pendingLocation) && !sending && !locating && !optimizing && recording==='idle';
  const maxHeight = 208;
  useEffect(()=>{
    mounted.current = true;
    return ()=>{
      mounted.current = false;
      optimizationController.current?.abort();
      if(recorder.current && recorder.current.state!=='inactive') { recorder.current.onstop=null; recorder.current.stop(); }
      audioStream.current?.getTracks().forEach(track=>track.stop());
      if(localUrl.current) URL.revokeObjectURL(localUrl.current);
      photoLocalUrls.current.forEach(url=>URL.revokeObjectURL(url));
    };
  },[]);
  useEffect(()=>{
    if(recording==='idle')return;
    const interval=window.setInterval(()=>{ if(recorder.current?.state==='recording')setRecordSeconds(s=>s+1); },1000);
    return ()=>window.clearInterval(interval);
  },[recording]);

  // Screen Wake Lock is released as soon as a voice note ends or is discarded.
  useEffect(()=>{
    if(recording==='idle'||!('wakeLock' in navigator))return;
    let stopped=false,requesting=false;
    let lock:WakeLockSentinel|null=null;
    const acquire=async()=>{
      if(stopped||requesting||lock||document.visibilityState!=='visible')return;
      requesting=true;
      try{
        const next=await navigator.wakeLock.request('screen');
        if(stopped){void next.release().catch(()=>{});return;}
        lock=next;
        next.addEventListener('release',()=>{if(lock===next)lock=null;});
      }catch{
        // Browsers and the OS may refuse wake lock, e.g. in low-power mode.
      }finally{requesting=false;}
    };
    const resume=()=>{if(document.visibilityState==='visible')void acquire();};
    document.addEventListener('visibilitychange',resume);
    window.addEventListener('focus',resume);
    void acquire();
    return ()=>{
      stopped=true;
      document.removeEventListener('visibilitychange',resume);
      window.removeEventListener('focus',resume);
      const current=lock;lock=null;
      if(current)void current.release().catch(()=>{});
    };
  },[recording==='idle']);

  function clearPending() {
    if(localUrl.current)URL.revokeObjectURL(localUrl.current);
    localUrl.current=null;
    photoLocalUrls.current.forEach(url=>URL.revokeObjectURL(url));
    photoLocalUrls.current=[];
    setPending(null); setPendingUrl(null); setPendingPhotos([]); setPhotoUrls([]);
    setEditingPhotoIndex(null); setEditorOpen(false);setVideoNotice('');
  }
  function stagePhotos(files:File[]) {
    if(editing || optimizingRef.current || !files.length)return;
    const next=[...(pending?.type.startsWith('image/')?[pending]:[]),...pendingPhotos,...files];
    if(next.length>10){setError(pt?'Selecione no máximo 10 fotos por envio.':'Select up to 10 photos per batch.');return;}
    const valid=new Set(['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif']);
    if(next.some(file=>!valid.has(file.type) || !file.size || file.size>50*1024*1024 ||
      !file.name || file.name.length>180 || /[\\/\r\n\u0000-\u001f]/.test(file.name))){
      setError(pt?'Selecione fotos válidas de até 50 MB cada.':'Select valid photos up to 50 MB each.');return;
    }
    clearPending();
    const urls=next.map(file=>URL.createObjectURL(file));
    photoLocalUrls.current=urls;
    setPendingPhotos(next);setPhotoUrls(urls);
    setPendingLocation(null);setError('');setAttachmentsOpen(false);
  }
  function removePhoto(index:number) {
    const remaining=pendingPhotos.filter((_,i)=>i!==index);
    const urls=photoUrls.filter((_,i)=>i!==index);
    URL.revokeObjectURL(photoUrls[index]);
    photoLocalUrls.current=urls;setPendingPhotos(remaining);setPhotoUrls(urls);
    setEditorOpen(false);setEditingPhotoIndex(null);
  }
  function saveEditedPhoto(blob:Blob) {
    if(editingPhotoIndex===null || !pendingPhotos[editingPhotoIndex])return;
    const source=pendingPhotos[editingPhotoIndex];
    const file=new File([blob],source.name.replace(/\.[^.]+$/,'')+'-editada.png',{type:'image/png'});
    const next=URL.createObjectURL(file),index=editingPhotoIndex;
    URL.revokeObjectURL(photoUrls[index]);
    setPendingPhotos(old=>old.map((item,i)=>i===index?file:item));
    const urls=photoUrls.map((url,i)=>i===index?next:url);
    photoLocalUrls.current=urls;setPhotoUrls(urls);
    setEditorOpen(false);setEditingPhotoIndex(null);
  }
  function stageFile(file:File) {
    setPendingLocation(null);
    const mime=file.type || 'application/octet-stream';
    const allowed=new Set(['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif',
      'video/mp4','video/webm','video/quicktime','application/pdf','text/plain','application/zip','application/octet-stream',
      'audio/webm','audio/mp4','audio/ogg','audio/mpeg','audio/wav','audio/x-m4a','audio/aac']);
    if(!file.size || file.size>50*1024*1024){setError(pt?'O arquivo deve ter até 50 MB.':'Maximum file size is 50 MB.');return;}
    if(!allowed.has(mime)){setError(pt?'Formato de arquivo não suportado.':'Unsupported file format.');return;}
    if(!file.name || file.name.length>180 || /[\\/\r\n\u0000-\u001f]/.test(file.name)){setError(pt?'Nome do arquivo inválido.':'Invalid filename.');return;}
    clearPending();
    const url=URL.createObjectURL(file);
    localUrl.current=url;setPending(file);setPendingUrl(url);setError('');setAttachmentsOpen(false);
  }
  async function stageVideo(file:File){
    if(optimizingRef.current||editing)return;
    if(!file.size||file.size>300*1024*1024||!['video/mp4','video/webm','video/quicktime'].includes(file.type)){
      setError(pt?'Escolha um vídeo MP4, WebM ou MOV de até 300 MB para compactar.':
        'Choose an MP4, WebM or MOV video up to 300 MB for compression.');return;
    }
    const controller=new AbortController();
    optimizationController.current=controller;
    optimizingRef.current=true;setOptimizing(true);setOptimizationKind('video');setOptimizationProgress(0);
    setOptimizingFile({name:file.name,size:file.size});
    setVideoNotice('');setError('');
    try{
      const result=await optimizeVideoAttachment(file,controller.signal,percent=>{
        if(mounted.current)setOptimizationProgress(percent);
      });
      if(controller.signal.aborted||!mounted.current)return;
      if(result.file.size>50*1024*1024){
        setError(pt?'Não foi possível reduzir o vídeo para até 50 MB neste navegador.':
          'This browser could not reduce the video to 50 MB or less.');return;
      }
      stageFile(result.file);
      setVideoNotice(result.compressed
        ?(pt?'Vídeo compactado: ':'Video compressed: ')+(file.size/1048576).toFixed(1)+' MB → '+(result.file.size/1048576).toFixed(1)+' MB'
        :(pt?'Vídeo já pequeno ou sem compactação disponível; original preservado.':
          'Video already small or compression unavailable; original preserved.'));
    }catch(error){
      if(!mounted.current)return;
      if(error instanceof Error&&error.message==='ABORTED')
        setVideoNotice(pt?'Compactação cancelada. Nenhum vídeo foi enviado.':'Compression cancelled. No video was sent.');
      else setError(pt?'Falha ao preparar o vídeo.':'Could not prepare the video.');
    }finally{
      if(optimizationController.current===controller)optimizationController.current=null;
      optimizingRef.current=false;
      if(mounted.current){setOptimizing(false);setOptimizingFile(null);}
    }
  }
  function selectGallery(files:File[]){
    if(!files.length||optimizingRef.current)return;
    const hasVideo=files.some(file=>file.type.startsWith('video/'));
    if(!hasVideo){stagePhotos(files);return;}
    if(files.length!==1){
      setError(pt?'Selecione apenas um vídeo por vez na galeria. Fotos podem ser enviadas em lote.':
        'Select one video at a time from Gallery. Photos can be sent in batches.');
      return;
    }
    void stageVideo(files[0]);
  }

  async function toggleRecording() {
    if(recorder.current?.state==='recording'){recorder.current.stop();return;}
    if(recorder.current?.state==='paused'){recorder.current.stop();return;}
    if(!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder==='undefined'){
      setError(pt?'Este navegador não permite gravar áudio.':'Audio recording is unavailable.');return;
    }
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      if(!mounted.current){stream.getTracks().forEach(t=>t.stop());return;}
      audioStream.current=stream;recordingChunks.current=[];discardRecording.current=false;
      const preferred=['audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus']
        .find(mime=>MediaRecorder.isTypeSupported(mime));
      const instance=new MediaRecorder(stream,preferred?{mimeType:preferred}:undefined);
      recorder.current=instance;
      instance.ondataavailable=e=>{if(e.data.size)recordingChunks.current.push(e.data);};
      instance.onstop=()=>{
        stream.getTracks().forEach(t=>t.stop());audioStream.current=null;recorder.current=null;
        if(!mounted.current)return;
        setRecording('idle');
        if(discardRecording.current){recordingChunks.current=[];return;}
        const mime=instance.mimeType.split(';')[0] || 'audio/webm';
        const blob=new Blob(recordingChunks.current,{type:mime});recordingChunks.current=[];
        if(!blob.size){setError(pt?'Não foi possível capturar áudio.':'No audio was captured.');return;}
        const ext=mime.includes('mp4')?'m4a':mime.includes('ogg')?'ogg':'webm';
        stageFile(new File([blob],'gravacao-'+Date.now()+'.'+ext,{type:mime}));
      };
      instance.onerror=()=>{setError(pt?'Erro ao gravar áudio.':'Audio recording failed.');};
      instance.start(500);setRecordSeconds(0);setRecording('recording');setError('');
      setAttachmentsOpen(false);setEmojiOpen(false);
    }catch{
      audioStream.current?.getTracks().forEach(t=>t.stop());audioStream.current=null;
      setError(pt?'Permita o acesso ao microfone nas configurações.':'Allow microphone access to record.');
    }
  }
  function pauseRecording(){
    if(recorder.current?.state==='recording'){recorder.current.pause();setRecording('paused');}
    else if(recorder.current?.state==='paused'){recorder.current.resume();setRecording('recording');}
  }
  function cancelRecording(){
    discardRecording.current=true;
    if(recorder.current?.state!=='inactive')recorder.current?.stop();
    audioStream.current?.getTracks().forEach(t=>t.stop());
    setRecording('idle');recordingChunks.current=[];
  }
  async function sendOptimizedPhotos() {
    if (optimizingRef.current || !pendingPhotos.length) return;
    const files = [...pendingPhotos], caption = value.trim();
    const controller = new AbortController();
    optimizationController.current = controller;
    optimizingRef.current = true;
    setOptimizing(true);setOptimizationKind('image');setOptimizationProgress(0);
    setVideoNotice('');setError('');
    try {
      const ready: File[] = [];
      for (let index = 0; index < files.length; index++) {
        setOptimizingFile({name: files[index].name, size: files[index].size});
        ready.push(await optimizeImageAttachment(files[index], controller.signal));
        if (controller.signal.aborted || !mounted.current) return;
        setOptimizationProgress(Math.round((index + 1) / files.length * 100));
      }
      if (controller.signal.aborted || !mounted.current) return;
      clearPending();
      onChange('');
      ready.forEach((file, index) => onAttach(file, index === 0 ? caption : ''));
    } catch (error) {
      if (!mounted.current) return;
      if (controller.signal.aborted || (error instanceof Error && error.message === 'ABORTED'))
        setVideoNotice(pt ? 'Compactação cancelada. Nenhuma foto foi enviada.' : 'Compression cancelled. No photo was sent.');
      else setError(pt ? 'Não foi possível preparar as fotos.' : 'Could not prepare the photos.');
    } finally {
      if (optimizationController.current === controller) optimizationController.current = null;
      optimizingRef.current = false;
      if (mounted.current) {setOptimizing(false);setOptimizingFile(null);}
    }
  }
  function sendSelected(){
    if(!canSend)return;
    if(pendingPhotos.length){void sendOptimizedPhotos();}
    else if(pending){const file=pending;const caption=value.trim();clearPending();onChange('');onAttach(file,caption);}
    else if(pendingLocation){const {latitude,longitude}=pendingLocation;setPendingLocation(null);const caption=value.trim();onChange('');onShareLocation(latitude,longitude,caption);}
    else onSubmit();
  }
  function chooseLocation(){
    setAttachmentsOpen(false);
    if(!navigator.geolocation){setError(pt?'Este dispositivo não oferece localização.':'Location is unavailable.');return;}
    setLocating(true);setError('');
    navigator.geolocation.getCurrentPosition(pos=>{
      if(!mounted.current)return;
      clearPending();
      setPendingLocation({latitude:pos.coords.latitude,longitude:pos.coords.longitude});
      setLocating(false);
    },()=>{
      if(!mounted.current)return;
      setLocating(false);setError(pt?'Não foi possível obter sua localização. Verifique a permissão.':'Could not get your location. Check permissions.');
    },{enableHighAccuracy:false,timeout:12000,maximumAge:30000});
  }
  function chosenFile(file?:File){if(file && !editing){if(file.type.startsWith('video/'))void stageVideo(file);else stageFile(file);}}
  

  useLayoutEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.overflowY = 'hidden';
    node.style.height = 'auto';
    const height = Math.min(maxHeight, Math.max(48, node.scrollHeight));
    node.style.height = height + 'px';
    node.style.overflowY = node.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [value, textareaRef]);

  useEffect(() => {
    if (!emojiOpen && !attachmentsOpen) return;
    const outside = (event: PointerEvent) => {
      if (!controls.current?.contains(event.target as Node)) {
        setEmojiOpen(false);
        setAttachmentsOpen(false);
      }
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setEmojiOpen(false);
        setAttachmentsOpen(false);
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape, true);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape, true); };
  }, [emojiOpen, attachmentsOpen]);

  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (canSend) sendSelected();
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canSend) sendSelected();
  }

  return <form ref={controls} onSubmit={submit}
    className="relative flex w-full min-w-0 flex-wrap items-end gap-1 sm:gap-2" data-live-message-composer>
    {optimizing&&<div className="w-full min-w-0 space-y-2 rounded-lg border border-border bg-card p-3" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-xs">
        <span className="min-w-0 flex-1 truncate font-semibold" title={optimizingFile?.name}>
          {optimizationKind==='image'?(pt?'Compactando foto':'Compressing photo'):(pt?'Compactando vídeo':'Compressing video')} · {optimizingFile?(optimizingFile.size/1048576).toFixed(1)+' MB':''}
        </span>
        <span className="shrink-0 text-muted-foreground">{optimizationProgress}%</span>
        <button type="button" className="min-h-9 shrink-0 rounded-md border border-border px-2 text-xs hover:bg-accent"
          onClick={()=>optimizationController.current?.abort()}>{pt?'Cancelar':'Cancel'}</button>
      </div>
      <progress max={100} value={optimizationProgress} className="h-2 w-full accent-primary"
        aria-label={pt?'Progresso da compactação':optimizationKind==='image'?'Image compression progress':'Video compression progress'}/>
      <p className="text-[11px] text-muted-foreground">
        {optimizationKind==='image'
          ?(pt?'Processando no dispositivo. As fotos serão enviadas após a otimização.':'Processing on this device. Photos will be sent after optimization.')
          :(pt?'Processando no dispositivo. O vídeo só será enviado depois de compactado.':'Processing on this device. Video will be uploaded only after compression.')}
      </p>
    </div>}
    {videoNotice&&!optimizing&&<p role="status" className="w-full text-xs text-muted-foreground">{videoNotice}</p>}
    {pendingPhotos.length>0 && <div className="w-full min-w-0 border border-border bg-muted/60 p-2 text-xs" role="status">
      <p className="mb-2 font-semibold">{pt?pendingPhotos.length+' foto(s) selecionada(s)':pendingPhotos.length+' selected photo(s)'}</p>
      <div className="grid max-h-48 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-5">
        {pendingPhotos.map((file,index)=><div key={photoUrls[index]} className="relative min-w-0 border border-border bg-background p-1">
          <img src={photoUrls[index]} alt={pt?'Foto '+(index+1):'Photo '+(index+1)} className="h-20 w-full object-contain"/>
          <div className="flex items-center justify-between gap-1 pt-1">
            <button type="button" aria-label={pt?'Editar foto '+(index+1):'Edit photo '+(index+1)} disabled={optimizing} onClick={()=>{setEditingPhotoIndex(index);setEditorOpen(true);}} className="grid size-7 place-items-center hover:bg-accent"><Pencil className="size-3.5"/></button>
            <button type="button" aria-label={pt?'Remover foto '+(index+1):'Remove photo '+(index+1)} disabled={optimizing} onClick={()=>removePhoto(index)} className="grid size-7 place-items-center hover:bg-accent"><X className="size-3.5"/></button>
          </div>
        </div>)}
      </div>
    </div>}
    {(pending && pendingUrl) && <div className="flex w-full min-w-0 items-start gap-2 border border-border bg-muted/60 p-2 text-xs" role="status">
      <div className="min-w-0 flex-1">
        <p className="mb-1 truncate font-semibold" title={!/^(image|audio|video)\//.test(pending.type) ? pending.name : undefined}>
          {/^(image|audio|video)\//.test(pending.type) ? attachmentLabel(pending.type,locale) : pending.name}
          {' · '}{(pending.size/1048576).toFixed(1)} MB
        </p>
        {pending.type.startsWith('image/') ? <div className="flex items-center gap-2">
          <img src={pendingUrl} alt={attachmentLabel(pending.type,locale)} className="max-h-36 max-w-[min(55vw,220px)] object-contain" />
          <button type="button" onClick={()=>setEditorOpen(true)}
            className="inline-flex items-center gap-1 border border-border px-2 py-1 hover:bg-accent">
            <Pencil className="size-4"/>{pt?'Editar imagem':'Edit image'}
          </button>
        </div> : pending.type.startsWith('audio/') ? <ChatAudioPlayer src={pendingUrl}/> :
          pending.type.startsWith('video/') ? <video src={pendingUrl} controls playsInline preload="metadata" className="max-h-36 max-w-full"/> :
          <span>{pt?'Arquivo pronto para enviar':'File ready to send'}</span>}
      </div>
      <button type="button" aria-label={pt?'Remover anexo':'Remove attachment'} onClick={clearPending}
        className="grid size-9 shrink-0 place-items-center hover:bg-accent"><X className="size-4"/></button>
    </div>}
    {pendingLocation && <div className="flex w-full items-center gap-2 border border-border bg-muted/60 p-2 text-xs">
      <MapPin className="size-5 text-primary"/>
      <span className="min-w-0 flex-1 truncate">{pt?'Localização pronta para enviar':'Location ready to send'} · {pendingLocation.latitude.toFixed(4)}, {pendingLocation.longitude.toFixed(4)}</span>
      <button type="button" onClick={()=>setPendingLocation(null)} aria-label={pt?'Remover localização':'Remove location'} className="grid size-9 place-items-center"><X className="size-4"/></button>
    </div>}
    {locating && <p className="w-full text-xs text-muted-foreground" role="status">{pt?'Obtendo localização…':'Getting location…'}</p>}
    {recording!=='idle' && <div className="flex w-full items-center gap-2 border border-destructive/40 bg-destructive/5 p-2 text-xs" role="status">
      <span className="size-2 animate-pulse rounded-full bg-destructive"/>
      <span className="flex-1">{recording==='paused'?(pt?'Gravação pausada':'Recording paused'):(pt?'Gravando áudio':'Recording audio')} · {Math.floor(recordSeconds/60)}:{String(recordSeconds%60).padStart(2,'0')}</span>
      <button type="button" onClick={pauseRecording} className="grid size-9 place-items-center hover:bg-accent" aria-label={recording==='paused'?(pt?'Retomar gravação':'Resume recording'):(pt?'Pausar gravação':'Pause recording')}>{recording==='paused'?<Play className="size-4"/>:<Pause className="size-4"/>}</button>
      <button type="button" onClick={cancelRecording} className="grid size-9 place-items-center hover:bg-accent" aria-label={pt?'Descartar áudio':'Discard audio'}><X className="size-4"/></button>
    </div>}
    {error && <p role="alert" className="w-full text-xs text-destructive">{error}</p>}
    {editorOpen && (editingPhotoIndex!==null ? !!photoUrls[editingPhotoIndex] : !!pendingUrl&&!!pending) && typeof document!=='undefined' && createPortal(
      <div className="fixed inset-0 z-[120] flex flex-col bg-black/95 p-3 text-white sm:p-6" role="dialog" aria-modal="true" aria-label={pt?'Editar imagem':'Edit image'}>
        <ChatImageEditor key={editingPhotoIndex!==null?photoUrls[editingPhotoIndex]:pendingUrl!}
          src={editingPhotoIndex!==null?photoUrls[editingPhotoIndex]:pendingUrl!}
          onCancel={()=>{setEditorOpen(false);setEditingPhotoIndex(null);}}
          onSave={blob=>{if(editingPhotoIndex!==null)saveEditedPhoto(blob);
            else if(pending){const filename=pending.name.replace(/\.[^.]+$/,'')+'-editada.png';stageFile(new File([blob],filename,{type:'image/png'}));setEditorOpen(false);}}}/>
      </div>,document.body)}
    <div className="relative shrink-0">
      <button type="button" aria-label={pt ? 'Adicionar anexo' : 'Add attachment'}
        aria-expanded={attachmentsOpen} aria-haspopup="dialog"
        onClick={() => { setAttachmentsOpen(v => !v); setEmojiOpen(false); }}
        className="grid size-11 lg:size-12 place-items-center text-muted-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
        <Plus className={cn('size-6 transition-transform',attachmentsOpen && 'rotate-45')} />
      </button>
      {attachmentsOpen && <div role="dialog" aria-label={pt ? 'Adicionar à conversa' : 'Add to chat'}
        className="absolute bottom-full left-0 z-40 mb-2 w-[min(510px,calc(100vw-24px))] max-w-[calc(100vw-24px)] border border-border bg-popover p-2 text-popover-foreground shadow-xl">
        <div className="flex items-center justify-between px-2 py-1">
          <span className="text-xs font-semibold">{pt ? 'Adicionar à conversa' : 'Add to conversation'}</span>
          <button type="button" onClick={() => setAttachmentsOpen(false)}
            aria-label={pt ? 'Fechar anexos' : 'Close attachments'} className="grid size-7 place-items-center hover:bg-accent">
            <X className="size-4"/>
          </button>
        </div>
        {cameraOptions ? <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={()=>{cameraKindRef.current='image';cameraRef.current?.setAttribute('accept','image/*');cameraRef.current?.click();setCameraOptions(false);setAttachmentsOpen(false);}}
            className="flex min-h-16 flex-col items-center justify-center border border-border p-2 text-xs hover:bg-accent"><Camera className="size-5"/>{pt?'Tirar foto':'Take photo'}</button>
          <button type="button" onClick={()=>{cameraKindRef.current='video';cameraRef.current?.setAttribute('accept','video/*');cameraRef.current?.click();setCameraOptions(false);setAttachmentsOpen(false);}}
            className="flex min-h-16 flex-col items-center justify-center border border-border p-2 text-xs hover:bg-accent"><Video className="size-5"/>{pt?'Gravar vídeo':'Record video'}</button>
          <button type="button" onClick={()=>setCameraOptions(false)} className="col-span-2 text-xs hover:bg-accent">{pt?'Voltar':'Back'}</button>
        </div> : <div>
          <div className="grid grid-cols-4 gap-1">
          {ATTACHMENTS.map(({icon: Icon,pt:labelPt,en},index) => <button key={en} type="button"
            disabled={sending || editing || optimizing || recording!=='idle'}
            onClick={() => {
              if(index===1){setCameraOptions(true);return;}
              if(index===3){chooseLocation();return;}
              [galleryRef,cameraRef,fileRef][index]?.current?.click();
              setAttachmentsOpen(false);
            }}
            title={index===3 ? (pt ? 'Compartilhar localização atual' : 'Share current location') : undefined}
            className="flex min-h-[64px] min-w-0 flex-col items-center justify-center gap-1 border border-border/70 px-0.5 text-[10px] hover:bg-accent disabled:opacity-40"
            aria-label={pt ? labelPt : en}>
            <Icon className="size-5 text-primary"/><span className="truncate">{pt ? labelPt : en}</span>
          </button>)}
          </div>
        </div>}
        <p className="px-2 pt-2 text-[11px] text-muted-foreground">
          {pt ? 'Anexos até 50 MB após compactação. Vídeos originais até 300 MB.' : 'Attachments up to 50 MB after compression. Videos up to 300 MB before compression.'}
        </p>
      </div>}
    </div>
    <input ref={galleryRef} type="file" multiple accept="image/*,video/mp4,video/webm,video/quicktime" className="sr-only"
      onChange={e => { const files=Array.from(e.target.files??[]); e.target.value=''; selectGallery(files); }} />
    <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only"
      onChange={e => { const file=e.target.files?.[0]; e.target.value=''; if(file?.type.startsWith('image/'))stagePhotos([file]);else chosenFile(file); }} />
    <input ref={fileRef} type="file" accept=".pdf,.txt,.zip,.mp3,.m4a,.ogg,.webm,.wav,image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,video/mp4,video/webm,video/quicktime,application/octet-stream" className="sr-only"
      onChange={e => { const file=e.target.files?.[0]; e.target.value=''; chosenFile(file); }} />
    <textarea ref={textareaRef} rows={1} value={value} disabled={recording!=='idle'}
      onPaste={e=>{const file=Array.from(e.clipboardData.items).find(item=>item.kind==='file' && item.type.startsWith('image/'))?.getAsFile();if(file){e.preventDefault();stagePhotos([file]);}}}
      onChange={event => onChange(event.target.value)}
      onSelect={event => onSelectionChange?.(event.currentTarget.value,
        event.currentTarget.selectionStart,event.currentTarget.selectionEnd)}
      onKeyDown={keyDown} maxLength={4000}
      aria-label={pt ? 'Escrever mensagem' : 'Write a message'}
      data-message-composer placeholder={editing ? (pt ? 'Editar mensagem…' : 'Edit message…') : (pt ? 'Mensagem…' : 'Message…')}
      className="min-h-12 max-h-52 min-w-0 flex-1 resize-none rounded-lg border border-input bg-background px-3 py-3 text-base leading-6 text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/40"
    />
    <div className="relative shrink-0">
      <button type="button" aria-label={pt ? 'Abrir lista de emojis' : 'Open emoji picker'}
        aria-expanded={emojiOpen} aria-haspopup="dialog"
        onPointerDown={event => event.preventDefault()}
        onClick={() => { setEmojiOpen(v => !v); setAttachmentsOpen(false); }}
        className="grid size-11 lg:size-12 place-items-center text-muted-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
        <Smile className="size-5"/>
      </button>
      {emojiOpen && <div role="dialog" aria-label={pt ? 'Emojis' : 'Emojis'}
        className="absolute bottom-full right-0 z-40 mb-2 w-[min(276px,calc(100vw-20px))] max-h-[min(252px,42dvh)] overflow-y-auto border border-border bg-popover p-2 text-popover-foreground shadow-xl">
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xs font-semibold">{pt ? 'Emojis' : 'Emojis'}</p>
          <button type="button" aria-label={pt ? 'Fechar emojis' : 'Close emojis'}
            onPointerDown={event => event.preventDefault()}
            onClick={() => setEmojiOpen(false)} className="grid size-8 place-items-center hover:bg-accent">
            <X className="size-4"/>
          </button>
        </div>
        {EMOJI_GROUPS.map(group => <section key={group.en} className="mb-2">
          <p className="mb-1 text-xs text-muted-foreground">{pt ? group.pt : group.en}</p>
          <div className="grid grid-cols-6 gap-1">
            {group.symbols.map(emoji => <button type="button" key={emoji}
              aria-label={emoji} onPointerDown={event => event.preventDefault()}
              onClick={() => { onChange(value + emoji); }}
              className="grid size-8 place-items-center text-base leading-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">{emoji}</button>)}
          </div>
        </section>)}
      </div>}
    </div>
    {onGif&&<button type="button" onClick={onGif} aria-expanded={gifOpen}
        aria-label={pt?'Selecionar GIF':'Choose GIF'}
        className={cn('grid h-11 lg:h-12 shrink-0 place-items-center rounded-lg px-1.5 text-[11px] font-bold text-muted-foreground hover:bg-accent',gifOpen&&'text-primary')}>GIF</button>}
    {canSend
      ? <button type="submit" aria-label={pt ? 'Enviar mensagem' : 'Send message'}
        className="grid size-11 lg:size-12 shrink-0 place-items-center rounded-[5px] bg-primary text-primary-foreground hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <Send className="size-5"/>
      </button>
      : <button type="button" onClick={()=>void toggleRecording()} disabled={sending || editing || optimizing || (!!pending && recording==='idle') || pendingPhotos.length>0}
        aria-label={recording!=='idle'?(pt?'Finalizar gravação':'Finish recording'):(pt?'Gravar áudio':'Record voice note')}
        className={cn('grid size-11 lg:size-12 shrink-0 place-items-center',recording!=='idle'?'bg-destructive text-destructive-foreground':'text-muted-foreground',sending && 'opacity-40')}>
        {recording!=='idle'?<Square className="size-4" fill="currentColor"/>:<Mic className="size-5"/>}
      </button>}
  </form>;
}
