/**
 * Real audio-level detection for local and remote streams (no voice data saved).
 * Connect analysers to a silent gain sink so remote audio does not play twice.
 */
type Watch={source:MediaStreamAudioSourceNode;analyser:AnalyserNode;values:Uint8Array;lastSound:number};
export class VoiceActivityMonitor {
  private ctx:AudioContext|null=null;
  private sink:GainNode|null=null;
  private streams=new Map<string,Watch>();
  add(id:string,stream:MediaStream){
    if(this.streams.has(id)||!stream.getAudioTracks().length)return;
    try{
      if(!this.ctx){
        this.ctx=new AudioContext();
        this.sink=this.ctx.createGain();
        this.sink.gain.value=0;
        this.sink.connect(this.ctx.destination);
        if(this.ctx.state==='suspended')void this.ctx.resume().catch(()=>{});
      }
      const source=this.ctx.createMediaStreamSource(stream);
      const analyser=this.ctx.createAnalyser();
      analyser.fftSize=512;
      analyser.smoothingTimeConstant=0.55;
      source.connect(analyser);
      analyser.connect(this.sink!);
      this.streams.set(id,{source,analyser,values:new Uint8Array(analyser.fftSize),lastSound:0});
    }catch{/* Unsupported/blocked audio analysis should not break the call. */}
  }
  remove(id:string){
    const current=this.streams.get(id);if(!current)return;
    current.source.disconnect();current.analyser.disconnect();this.streams.delete(id);
  }
  sample(excluded:Set<string>):Set<string>{
    const active=new Set<string>();
    const now=performance.now();
    for(const [id,watch] of this.streams){
      if(excluded.has(id))continue;
      try{
        watch.analyser.getByteTimeDomainData(watch.values);
        let squared=0;
        for(const value of watch.values){
          const norm=(value-128)/128;
          squared+=norm*norm;
        }
        const rms=Math.sqrt(squared/watch.values.length);
        if(rms>0.029)watch.lastSound=now;
        if(now-watch.lastSound<240)active.add(id);
      }catch{continue;}
    }
    return active;
  }
  dispose(){
    for(const id of this.streams.keys())this.remove(id);
    this.sink?.disconnect();this.sink=null;
    if(this.ctx)void this.ctx.close().catch(()=>{});
    this.ctx=null;
  }
}
