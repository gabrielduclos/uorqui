import {useEffect,useState,type CSSProperties} from 'react';
import {createPortal} from 'react-dom';
import {Camera,CheckCircle2,ChevronRight,Home,MessageCircle,SkipForward,Users} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Spinner} from '@/components/ui/spinner';
import {UserAvatar,type UserProfileData} from './UserProfiles';
import {ProfilePhotoCropper} from './ProfilePhotoCropper';
import {invalidateProfileImage} from './profileImageCache';
import {useUorquiPreferences} from './UorquiPreferences';

// Version 2 presents the product in context instead of interrupting it with a dialog.
export const onboardingStorageKey=(userId:string)=>'uorqui:tour:v2:'+userId;
type Tab='feed'|'conversations'|'communities';
type Highlight={top:number;left:number;width:number;height:number};

export function OnboardingTour({userId,profile,onProfileSaved,onNavigate,onFinish}:{
  userId:string;profile:UserProfileData;onProfileSaved:(profile:UserProfileData)=>void;
  onNavigate:(tab:Tab)=>void;onFinish:()=>void
}){
  const {locale}=useUorquiPreferences(),pt=locale==='pt-BR';
  const [step,setStep]=useState(0);
  const [target,setTarget]=useState<Highlight|null>(null);
  const [cropFile,setCropFile]=useState<File|null>(null);
  const [uploading,setUploading]=useState(false);
  const [error,setError]=useState('');
  const [photoSaved,setPhotoSaved]=useState(false);
  const screens=[
    {icon:Home,tab:'feed' as Tab,title:pt?'Feed':'Feed',
      description:pt?'Aqui você acompanha publicações, fotos e vídeos.':'See posts, photos and videos here.'},
    {icon:MessageCircle,tab:'conversations' as Tab,title:pt?'Mensagens':'Messages',
      description:pt?'Aqui ficam suas conversas privadas.':'Find your private conversations here.'},
    {icon:Users,tab:'communities' as Tab,title:pt?'Comunidades':'Communities',
      description:pt?'Explore canais de texto e salas de áudio.':'Explore text channels and voice rooms.'},
  ];
  const current=screens[step];

  useEffect(()=>{
    if(step<3)onNavigate(screens[step].tab);
  },[step,onNavigate]);

  useEffect(()=>{
    if(step>=3){setTarget(null);return;}
    setTarget(null);
    let misses=0;
    const update=()=>{
      const elements=document.querySelectorAll<HTMLElement>('[data-uorqui-tour-target="'+screens[step].tab+'"]');
      const element=Array.from(elements).find(item=>{
        const bounds=item.getBoundingClientRect();
        return bounds.width>0&&bounds.height>0&&getComputedStyle(item).visibility!=='hidden';
      });
      if(!element){
        // If navigation really isn't available, fall back to the photo-only step.
        if(++misses>=12)setStep(3);
        return;
      }
      misses=0;
      const bounds=element.getBoundingClientRect();
      setTarget(previous=>{
        const next={top:bounds.top,left:bounds.left,width:bounds.width,height:bounds.height};
        return previous&&Object.keys(next).every(key=>previous[key as keyof Highlight]===next[key as keyof Highlight])?previous:next;
      });
    };
    const tick=window.setInterval(update,180);
    const frame=window.requestAnimationFrame(update);
    window.addEventListener('resize',update);
    window.addEventListener('orientationchange',update);
    window.visualViewport?.addEventListener('resize',update);
    return ()=>{
      window.clearInterval(tick);
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize',update);
      window.removeEventListener('orientationchange',update);
      window.visualViewport?.removeEventListener('resize',update);
    };
  },[step]);

  function finish(){
    try{localStorage.setItem(onboardingStorageKey(userId),'done');}catch{}
    onFinish();
  }

  async function savePhoto(image:Blob){
    if(uploading)return;
    setUploading(true);setError('');
    try{
      const response=await fetch('/api/media/profile/avatar',{
        method:'POST',credentials:'same-origin',headers:{'Content-Type':image.type},body:image,
      });
      const result=await response.json().catch(()=>null) as {profile?:UserProfileData}|null;
      if(!response.ok||!result?.profile)throw Error('PHOTO_UPLOAD_FAILED');
      invalidateProfileImage(profile.avatarUrl);
      onProfileSaved(result.profile);
      setCropFile(null);
      setPhotoSaved(true);
    }catch{
      setError(pt?'Não foi possível salvar a foto. Você pode tentar outra ou continuar sem foto.':
        'Could not save the photo. Try another or continue without a photo.');
      throw Error('PHOTO_UPLOAD_FAILED');
    }finally{setUploading(false);}
  }

  const padding=6;
  const hole=target?{
    top:Math.max(0,target.top-padding),
    left:Math.max(0,target.left-padding),
    right:Math.min(window.innerWidth,target.left+target.width+padding),
    bottom:Math.min(window.innerHeight,target.top+target.height+padding),
  }:null;
  const hintPosition:CSSProperties=target
    ?window.innerWidth<768
      ?{left:12,right:12,bottom:Math.max(20,window.innerHeight-target.top+16)}
      :{left:Math.max(12,Math.min(window.innerWidth-348,target.left+target.width+16)),
        top:Math.max(12,Math.min(window.innerHeight-230,target.top))}
    :{left:12,right:12,bottom:110};

  return createPortal(<>
    {current?<>
      <div aria-hidden="true" className="fixed inset-0 z-[84] bg-black/55" hidden={!!hole}/>
      {hole&&<>
        <div aria-hidden="true" className="fixed z-[84] bg-black/55" style={{top:0,left:0,right:0,height:hole.top}}/>
        <div aria-hidden="true" className="fixed z-[84] bg-black/55" style={{top:hole.top,left:0,width:hole.left,height:hole.bottom-hole.top}}/>
        <div aria-hidden="true" className="fixed z-[84] bg-black/55" style={{top:hole.top,left:hole.right,right:0,height:hole.bottom-hole.top}}/>
        <div aria-hidden="true" className="fixed z-[84] bg-black/55" style={{top:hole.bottom,left:0,right:0,bottom:0}}/>
        <div aria-hidden="true" className="pointer-events-none fixed z-[86] rounded-xl border-2 border-primary ring-4 ring-primary/30"
          style={{top:hole.top,left:hole.left,width:hole.right-hole.left,height:hole.bottom-hole.top}}/>
      </>}
      <section role="region" aria-live="polite" aria-label={pt?'Tutorial do Uorqui':'Uorqui tutorial'}
        className="fixed z-[90] w-auto rounded-xl border border-border bg-card p-4 text-card-foreground shadow-2xl md:w-80"
        style={hintPosition}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-muted-foreground">
            {pt?'Conheça o Uorqui':'Discover Uorqui'} · {step+1}/4
          </span>
          <button type="button" onClick={finish}
            className="flex min-h-9 items-center gap-1 px-2 text-xs text-muted-foreground hover:text-foreground">
            <SkipForward className="size-3.5"/>{pt?'Pular':'Skip'}
          </button>
        </div>
        <div className="my-3 flex items-center gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <current.icon className="size-5"/>
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold">{current.title}</h2>
            <p className="mt-0.5 text-sm leading-5 text-muted-foreground">{current.description}</p>
          </div>
        </div>
        <div className="flex justify-between gap-2">
          <Button type="button" variant="outline" disabled={step===0}
            onClick={()=>setStep(n=>Math.max(0,n-1))} className="min-h-10">
            {pt?'Voltar':'Back'}
          </Button>
          <Button type="button" onClick={()=>setStep(n=>n+1)} className="min-h-10 gap-1">
            {pt?'Próximo':'Next'}<ChevronRight className="size-4"/>
          </Button>
        </div>
      </section>
    </>:<div className="fixed inset-0 z-[85] flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-5">
      <section role="dialog" aria-modal="true" aria-labelledby="uorqui-photo-title"
        className="w-full max-w-md rounded-t-2xl border border-border bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-card-foreground shadow-2xl sm:rounded-2xl sm:p-7">
        <div className="mb-4 flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {pt?'Seu perfil':'Your profile'} · 4/4
          </span>
          <button type="button" disabled={uploading} onClick={finish}
            className="flex min-h-10 items-center gap-1.5 px-2 text-sm text-muted-foreground hover:text-foreground">
            <SkipForward className="size-4"/>{pt?'Pular':'Skip'}
          </button>
        </div>
        <h2 id="uorqui-photo-title" className="text-xl font-bold">
          {pt?'Escolha sua foto de perfil':'Choose your profile photo'}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {pt?'Adicione uma foto agora ou continue sem foto. Você poderá alterar depois em Perfil.':
            'Add a photo now, or continue without one. You can change it later in Profile.'}
        </p>
        <div className="flex justify-center py-5">
          <UserAvatar size="lg" name={profile.displayName} image={profile.avatarUrl}/>
        </div>
        <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border border-input px-4 text-sm font-semibold hover:bg-accent focus-within:outline-2 focus-within:outline-ring">
          <Camera className="size-5"/>{pt?'Escolher ou trocar foto':'Choose or change photo'}
          <input type="file" accept="image/*" className="sr-only" disabled={uploading}
            onChange={event=>{
              const file=event.currentTarget.files?.[0];
              event.currentTarget.value='';
              if(!file)return;
              if(!file.type.startsWith('image/')||file.size>15*1024*1024){
                setError(pt?'Escolha uma imagem de até 15 MB.':'Choose an image up to 15 MB.');
                return;
              }
              setError('');setCropFile(file);
            }}/>
        </label>
        {photoSaved&&<p role="status" className="mt-3 flex items-center gap-2 text-sm text-primary">
          <CheckCircle2 className="size-4"/>{pt?'Foto salva.':'Photo saved.'}</p>}
        {error&&<p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
        <div className="mt-6 flex gap-3">
          <Button type="button" variant="outline" disabled={uploading}
            className="min-h-12 flex-1" onClick={()=>setStep(2)}>{pt?'Voltar':'Back'}</Button>
          <Button type="button" disabled={uploading} className="min-h-12 flex-1" onClick={finish}>
            {uploading?<Spinner className="size-4"/>:photoSaved?(pt?'Concluir':'Finish'):(pt?'Continuar sem foto':'Continue without photo')}
          </Button>
        </div>
      </section>
    </div>}
    {cropFile&&<ProfilePhotoCropper kind="avatar" file={cropFile}
      onCancel={()=>setCropFile(null)} onSave={savePhoto}/>}
  </>,document.body);
}
