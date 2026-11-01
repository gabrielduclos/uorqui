/** Original, quiet UI chimes synthesized locally; no external audio files. */
export type VoiceRoomCue = 'join' | 'leave';
let sharedAudio: AudioContext | null = null;
function getAudio(): AudioContext | null {
  if(typeof window==='undefined'||!window.AudioContext)return null;
  try {
    if(!sharedAudio||sharedAudio.state==='closed')sharedAudio=new window.AudioContext();
    return sharedAudio;
  }catch{return null;}
}
export function unlockVoiceRoomAudio(){
  const ctx=getAudio();
  if(ctx?.state==='suspended')void ctx.resume().catch(()=>{});
}
export function playVoiceRoomCue(cue:VoiceRoomCue){
  const ctx=getAudio();
  if(!ctx||ctx.state==='closed')return;
  if(ctx.state==='suspended')void ctx.resume().catch(()=>{});
  const notes=cue==='join'?[587.33,783.99]:[659.25,440];
  const start=ctx.currentTime+0.015;
  notes.forEach((frequency,index)=>{
    const at=start+index*0.090;
    try {
      const osc=ctx.createOscillator(),gain=ctx.createGain();
      osc.type='sine';
      osc.frequency.setValueAtTime(frequency,at);
      gain.gain.setValueAtTime(0.0001,at);
      gain.gain.exponentialRampToValueAtTime(0.055,at+0.022);
      gain.gain.exponentialRampToValueAtTime(0.0001,at+0.15);
      osc.connect(gain);gain.connect(ctx.destination);
      osc.start(at);osc.stop(at+0.16);
      osc.onended=()=>{osc.disconnect();gain.disconnect();};
    }catch{/* Audio is optional; room flow must never fail due to a cue. */}
  });
}
