import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {Camera,CheckCircle2,ChevronRight,Hash,Home,MessageCircle,SkipForward,Users} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Spinner} from '@/components/ui/spinner';
import {UserAvatar,type UserProfileData} from './UserProfiles';
import {ProfilePhotoCropper} from './ProfilePhotoCropper';
import {invalidateProfileImage} from './profileImageCache';
import {useUorquiPreferences} from './UorquiPreferences';

export const onboardingStorageKey=(userId:string)=>'uorqui:tour:v1:'+userId;
type Tab='feed'|'conversations'|'communities';

export function OnboardingTour({userId,profile,onProfileSaved,onNavigate,onFinish}:{
  userId:string;profile:UserProfileData;onProfileSaved:(profile:UserProfileData)=>void;
  onNavigate:(tab:Tab)=>void;onFinish:()=>void
}){
  const {locale}=useUorquiPreferences(),pt=locale==='pt-BR';
  const [step,setStep]=useState(0);
  const [cropFile,setCropFile]=useState<File|null>(null);
  const [uploading,setUploading]=useState(false);
  const [error,setError]=useState('');
  const [photoSaved,setPhotoSaved]=useState(false);
  const screens=[
    {icon:Home,tab:'feed' as Tab,title:pt?'Este é o Feed':'This is the Feed',
      description:pt?'Aqui você acompanha publicações, fotos e vídeos de outras pessoas.':'Find posts, photos and videos shared by others.'},
    {icon:MessageCircle,tab:'conversations' as Tab,title:pt?'Estas são as Mensagens':'These are Messages',
      description:pt?'Converse em particular com seus contatos.':'Talk privately with your contacts.'},
    {icon:Users,tab:'communities' as Tab,title:pt?'Estas são as Comunidades':'These are Communities',
      description:pt?'Participe de canais de texto e salas de áudio.':'Join text channels and voice rooms.'},
  ];
  useEffect(()=>{if(step<screens.length)onNavigate(screens[step].tab);},[step]);
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
  const current=screens[step];
  return createPortal(<>
    <div className="fixed inset-0 z-[85] flex items-end justify-center bg-black/35 p-0 sm:items-center sm:p-5"
      role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="uorqui-tour-title"
        className="w-full max-w-md rounded-t-2xl border border-border bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-card-foreground shadow-2xl sm:rounded-2xl sm:p-7">
        <div className="mb-5 flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {pt?'Conheça o Uorqui':'Discover Uorqui'} · {step+1}/4
          </span>
          <button type="button" disabled={uploading} onClick={finish}
            className="flex min-h-10 items-center gap-1.5 px-2 text-sm text-muted-foreground hover:text-foreground">
            <SkipForward className="size-4"/>{pt?'Pular apresentação':'Skip tour'}
          </button>
        </div>
        <div className="mb-6 flex gap-1.5" aria-label={pt?'Progresso da apresentação':'Tour progress'}>
          {[0,1,2,3].map(n=><span key={n} className={'h-1.5 flex-1 rounded-full '+(n<=step?'bg-primary':'bg-muted')}/>)}
        </div>
        {current?<div className="space-y-4">
          <div className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <current.icon className="size-7"/>
          </div>
          <div>
            <h2 id="uorqui-tour-title" className="text-xl font-bold">{current.title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{current.description}</p>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
            <Hash className="size-4 shrink-0 text-primary"/>
            {pt?'Você pode explorar esta tela depois da apresentação.':
              'You can explore this screen after the tour.'}
          </div>
        </div>:<div className="space-y-4">
          <h2 id="uorqui-tour-title" className="text-xl font-bold">
            {pt?'Escolha sua foto de perfil':'Choose your profile photo'}
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            {pt?'Você pode adicionar uma foto agora ou continuar sem foto. É possível trocar depois em Perfil.':
              'Add a photo now, or continue without one. You can change it later in Profile.'}
          </p>
          <div className="flex justify-center py-2">
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
          {photoSaved&&<p role="status" className="flex items-center gap-2 text-sm text-primary"><CheckCircle2 className="size-4"/>
            {pt?'Foto salva.':'Photo saved.'}</p>}
          {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>}
        <div className="mt-7 flex gap-3">
          {step>0&&<Button type="button" variant="outline" disabled={uploading}
            className="min-h-12 flex-1" onClick={()=>setStep(n=>n-1)}>{pt?'Voltar':'Back'}</Button>}
          <Button type="button" disabled={uploading} className="min-h-12 flex-1"
            onClick={()=>step===3?finish():setStep(n=>n+1)}>
            {uploading?<Spinner className="size-4"/>:step===3?
              (pt?'Continuar sem foto / Concluir':'Continue / Finish'):
              (pt?'Próximo':'Next')}
            {!uploading&&step<3&&<ChevronRight className="size-4"/>}
          </Button>
        </div>
      </section>
    </div>
    {cropFile&&<ProfilePhotoCropper kind="avatar" file={cropFile}
      onCancel={()=>setCropFile(null)} onSave={savePhoto}/>}
  </>,document.body);
}
