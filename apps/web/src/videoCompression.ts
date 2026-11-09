/**
 * Best-effort, local video compression using browser media APIs.
 * Attempts to retain audio through Web Audio, and falls back to the original
 * when conversion is unsupported or increases size. Test audio on devices. Unsupported browsers fall back
 * to the original and normal attachment validation still applies.
 */
export type VideoOptimizationResult={file:File;compressed:boolean};

export async function optimizeVideoAttachment(
  source:File,signal?:AbortSignal,onProgress?:(percent:number)=>void
):Promise<VideoOptimizationResult>{
  const unchanged={file:source,compressed:false};
  if(!source.type.startsWith('video/')||!source.size||source.size<=8*1024*1024||source.size>300*1024*1024)return unchanged;
  if(signal?.aborted)throw Error('ABORTED');
  if(typeof MediaRecorder==='undefined'||typeof AudioContext==='undefined')return unchanged;
  const withDeadline=async<T>(promise:Promise<T>,ms:number):Promise<T>=>{
    let timer=0;
    let onAbort:(()=>void)|null=null;
    const timeout=new Promise<T>((_,reject)=>{
      timer=window.setTimeout(()=>reject(Error('VIDEO_TIMEOUT')),ms);
    });
    const cancelled=new Promise<T>((_,reject)=>{
      onAbort=()=>reject(Error('ABORTED'));
      if(signal?.aborted)onAbort();
      else if(signal)signal.addEventListener('abort',onAbort,{once:true});
    });
    try{return await Promise.race([promise,timeout,cancelled]);}
    finally{
      window.clearTimeout(timer);
      if(onAbort)signal?.removeEventListener('abort',onAbort);
    }
  };
  const canvas=document.createElement('canvas');
  if(typeof canvas.captureStream!=='function')return unchanged;
  const outputMime=[
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4',
    'video/webm;codecs=vp8,opus','video/webm',
  ].find(type=>MediaRecorder.isTypeSupported(type));
  if(!outputMime)return unchanged;

  const url=URL.createObjectURL(source);
  const video=document.createElement('video');
  video.playsInline=true;
  video.preload='auto';
  video.src=url;
  let audioContext:AudioContext|null=null;
  let canvasStream:MediaStream|null=null;
  let audioOutput:MediaStream|null=null;
  let recorder:MediaRecorder|null=null;
  let frame=0;
  let watchdog=0;
  let rejectPending:((error:Error)=>void)|null=null;
  let screenWakeLock:WakeLockSentinel|null=null;
  const abort=()=>rejectPending?.(Error('ABORTED'));
  signal?.addEventListener('abort',abort,{once:true});
  try{
    const loaded=await withDeadline(new Promise<boolean>(resolve=>{
      if(video.readyState>=1){resolve(true);return;}
      video.addEventListener('loadedmetadata',()=>resolve(true),{once:true});
      video.addEventListener('error',()=>resolve(false),{once:true});
    }),15000);
    if(signal?.aborted)throw Error('ABORTED');
    const duration=video.duration;
    // Real-time browser transcoding is too costly for very long clips.
    if(!loaded||!Number.isFinite(duration)||duration<=0||duration>180||
       !video.videoWidth||!video.videoHeight)return unchanged;
    // Keep source aspect ratio, cap landscape/portrait at a 720p-equivalent frame.
    const scale=Math.min(1,1280/video.videoWidth,720/video.videoHeight);
    canvas.width=Math.max(2,Math.round(video.videoWidth*scale/2)*2);
    canvas.height=Math.max(2,Math.round(video.videoHeight*scale/2)*2);
    const context=canvas.getContext('2d',{alpha:false});
    if(!context)return unchanged;
    audioContext=new AudioContext();
    const audioTarget=audioContext.createMediaStreamDestination();
    audioOutput=audioTarget.stream;
    const audioSource=audioContext.createMediaElementSource(video);
    audioSource.connect(audioTarget);
    canvasStream=canvas.captureStream(24);
    const recordingStream=new MediaStream([
      ...canvasStream.getVideoTracks(),...audioTarget.stream.getAudioTracks(),
    ]);
    // Browser compression runs in real time; avoid display sleep where supported.
    if('wakeLock' in navigator&&document.visibilityState==='visible'){
      try{screenWakeLock=await navigator.wakeLock.request('screen');}
      catch{/* Low-power mode and unsupported browsers may decline. */}
    }
    if(signal?.aborted)throw Error('ABORTED');
    try{
      recorder=new MediaRecorder(recordingStream,{
        mimeType:outputMime,videoBitsPerSecond:1_300_000,audioBitsPerSecond:96_000,
      });
    }catch{return unchanged;}
    const chunks:Blob[]=[];
    let settled=false;
    const finished=new Promise<Blob>((resolve,reject)=>{
      rejectPending=reject;
      recorder!.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
      recorder!.onerror=()=>{if(!settled){settled=true;reject(Error('VIDEO_ENCODER_FAILED'));}};
      recorder!.onstop=()=>{
        if(!settled){settled=true;resolve(new Blob(chunks,{type:recorder!.mimeType.split(';')[0]}));}
      };
      video.addEventListener('ended',()=>{
        if(recorder?.state!=='inactive')recorder?.stop();
      },{once:true});
      video.addEventListener('error',()=>{
        if(!settled){settled=true;reject(Error('VIDEO_DECODE_FAILED'));}
      },{once:true});
      watchdog=window.setTimeout(()=>{
        if(!settled){settled=true;reject(Error('VIDEO_TIMEOUT'));}
      },Math.ceil(duration*1700+15000));
    });
    // Ensure a play() failure does not cause a secondary unhandled rejection.
    void finished.catch(()=>{});
    await withDeadline(audioContext.resume(),5000);
    if(audioContext.state!=='running')return unchanged;
    if(signal?.aborted)throw Error('ABORTED');
    recorder.start(1000);
    await withDeadline(video.play(),5000);
    let lastPercent=-1;
    const draw=()=>{
      if(signal?.aborted||video.ended||video.error)return;
      try{context.drawImage(video,0,0,canvas.width,canvas.height);}catch{}
      const progress=Math.min(99,Math.floor((video.currentTime/duration)*100));
      if(progress!==lastPercent){lastPercent=progress;onProgress?.(progress);}
      frame=window.requestAnimationFrame(draw);
    };
    draw();
    const result=await finished;
    if(signal?.aborted)throw Error('ABORTED');
    const mime=result.type==='video/mp4'?'video/mp4':result.type==='video/webm'?'video/webm':null;
    if(!mime||!result.size||result.size>=source.size*0.96)return unchanged;
    const extension=mime==='video/mp4'?'mp4':'webm';
    const base=source.name.replace(/\.[^.]+$/,'').slice(0,145);
    onProgress?.(100);
    return {file:new File([result],base+'-compactado.'+extension,{type:mime}),compressed:true};
  }catch(error){
    if(signal?.aborted||(error instanceof Error&&error.message==='ABORTED'))throw Error('ABORTED');
    return unchanged;
  }finally{
    signal?.removeEventListener('abort',abort);
    window.cancelAnimationFrame(frame);
    window.clearTimeout(watchdog);
    video.pause();
    if(recorder?.state!=='inactive'){try{recorder?.stop();}catch{}}
    canvasStream?.getTracks().forEach(track=>track.stop());
    audioOutput?.getTracks().forEach(track=>track.stop());
    if(audioContext)void audioContext.close().catch(()=>{});
    if(screenWakeLock)void screenWakeLock.release().catch(()=>{});
    video.removeAttribute('src');video.load();
    URL.revokeObjectURL(url);
    rejectPending=null;
  }
}
