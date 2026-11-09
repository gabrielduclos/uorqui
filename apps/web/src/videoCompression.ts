/**
 * Best-effort, local video compression using browser media APIs.
 * Keeps the audio track through Web Audio; never silently uploads a silent
 * transcode or a file larger than the source. Unsupported browsers fall back
 * to the original and normal attachment validation still applies.
 */
export type VideoOptimizationResult={file:File;compressed:boolean};

export async function optimizeVideoAttachment(
  source:File,signal?:AbortSignal,onProgress?:(percent:number)=>void
):Promise<VideoOptimizationResult>{
  const unchanged={file:source,compressed:false};
  if(!source.type.startsWith('video/')||!source.size||source.size>300*1024*1024)return unchanged;
  if(signal?.aborted)throw Error('ABORTED');
  if(typeof MediaRecorder==='undefined'||typeof AudioContext==='undefined')return unchanged;
  const canvas=document.createElement('canvas');
  if(typeof canvas.captureStream!=='function')return unchanged;
  const outputMime=[
    'video/webm;codecs=vp8,opus','video/webm',
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4',
  ].find(type=>MediaRecorder.isTypeSupported(type));
  if(!outputMime)return unchanged;

  const url=URL.createObjectURL(source);
  const video=document.createElement('video');
  video.playsInline=true;
  video.preload='auto';
  video.src=url;
  let audioContext:AudioContext|null=null;
  let canvasStream:MediaStream|null=null;
  let recorder:MediaRecorder|null=null;
  let frame=0;
  let watchdog=0;
  let rejectPending:((error:Error)=>void)|null=null;
  const abort=()=>rejectPending?.(Error('ABORTED'));
  signal?.addEventListener('abort',abort,{once:true});
  try{
    const loaded=await new Promise<boolean>(resolve=>{
      if(video.readyState>=1){resolve(true);return;}
      const timeout=window.setTimeout(()=>resolve(false),15000);
      video.addEventListener('loadedmetadata',()=>{window.clearTimeout(timeout);resolve(true);},{once:true});
      video.addEventListener('error',()=>{window.clearTimeout(timeout);resolve(false);},{once:true});
    });
    if(signal?.aborted)throw Error('ABORTED');
    const duration=video.duration;
    // Real-time browser transcoding is too costly for very long clips.
    if(!loaded||!Number.isFinite(duration)||duration<=0||duration>180||
       !video.videoWidth||!video.videoHeight)return unchanged;
    const scale=Math.min(1,960/video.videoWidth,960/video.videoHeight);
    canvas.width=Math.max(2,Math.round(video.videoWidth*scale/2)*2);
    canvas.height=Math.max(2,Math.round(video.videoHeight*scale/2)*2);
    const context=canvas.getContext('2d',{alpha:false});
    if(!context)return unchanged;
    audioContext=new AudioContext();
    const audioTarget=audioContext.createMediaStreamDestination();
    const audioSource=audioContext.createMediaElementSource(video);
    audioSource.connect(audioTarget);
    canvasStream=canvas.captureStream(24);
    const recordingStream=new MediaStream([
      ...canvasStream.getVideoTracks(),...audioTarget.stream.getAudioTracks(),
    ]);
    try{
      recorder=new MediaRecorder(recordingStream,{
        mimeType:outputMime,videoBitsPerSecond:1_100_000,audioBitsPerSecond:96_000,
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
    await audioContext.resume();
    if(signal?.aborted)throw Error('ABORTED');
    recorder.start(1000);
    await video.play();
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
    const base=source.name.replace(/\.[^.]+$/,'');
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
    if(audioContext)void audioContext.close().catch(()=>{});
    video.removeAttribute('src');video.load();
    URL.revokeObjectURL(url);
    rejectPending=null;
  }
}
