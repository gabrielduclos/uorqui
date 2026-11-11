/** Active @handle before the caret. Matches server-side mention boundaries and
 * does not treat an email address such as pessoa@exemplo.com as a mention. */
export type ActiveCommunityMention={start:number;end:number;query:string};

export function activeCommunityMention(text:string,caret:number):ActiveCommunityMention|null{
  if(!Number.isInteger(caret)||caret<0||caret>text.length)return null;
  const before=text.slice(0,caret);
  const match=/(?:^|[^a-zA-Z0-9_])@([a-zA-Z0-9_]{0,31})$/.exec(before);
  if(!match)return null;
  // The caret can be positioned inside an existing mention, not just at its end.
  const suffix=/^[a-zA-Z0-9_]*/.exec(text.slice(caret))?.[0]??'';
  if(match[1].length+suffix.length>32)return null;
  return {start:caret-match[1].length-1,end:caret+suffix.length,query:match[1]};
}

export function replaceCommunityMention(text:string,mention:ActiveCommunityMention,handle:string){
  const suffix=text.slice(mention.end);
  const space=!suffix || !/^[\s,.;!?)}\]]/.test(suffix)?' ':'';
  const value=text.slice(0,mention.start)+'@'+handle+space+suffix;
  return {text:value,caret:mention.start+handle.length+1+space.length};
}

/** Draft text displays the full name without @, but the API receives @handle.
 * These ranges keep identity separate from the editable visible label, so the
 * existing authorization and mention notification rules remain unchanged. */
export type SelectedCommunityMention={
  start:number;end:number;label:string;handle:string;
};

/** Keep committed mentions if the edit happened wholly before or after them.
 * Editing inside a mention invalidates its binding: ordinary text is never
 * silently sent as a different user's @handle. */
export function reconcileSelectedMentions(
  previousText:string,nextText:string,selected:readonly SelectedCommunityMention[],
):SelectedCommunityMention[]{
  if(previousText===nextText)return [...selected];
  let prefix=0;
  while(prefix<previousText.length&&prefix<nextText.length&&
    previousText[prefix]===nextText[prefix])prefix++;
  let suffix=0;
  while(suffix<previousText.length-prefix&&suffix<nextText.length-prefix&&
    previousText[previousText.length-1-suffix]===nextText[nextText.length-1-suffix])suffix++;
  const oldEnd=previousText.length-suffix;
  const delta=nextText.length-previousText.length;
  return selected.flatMap(mention=>{
    let next=mention;
    if(mention.end<=prefix){/* unchanged prefix */}
    else if(mention.start>=oldEnd)next={...mention,start:mention.start+delta,end:mention.end+delta};
    else return [];
    return nextText.slice(next.start,next.end)===next.label?[next]:[];
  });
}

/** Insert a selected member's displayed name and bind that exact label to
 * their stable username, even if several people have the same display name. */
export function insertNamedCommunityMention(
  text:string,active:ActiveCommunityMention,selected:readonly SelectedCommunityMention[],
  member:{handle:string;displayName:string},
){
  const handle=member.handle.trim().toLowerCase();
  if(!/^[a-z][a-z0-9_]{2,31}$/.test(handle))return null;
  const displayName=member.displayName.trim().replace(/\s+/g,' ').slice(0,90)||handle;
  // The @ is only a typing trigger. Once confirmed, keep just the name
  // visible while the selected range retains the canonical account handle.
  const inserted=replaceCommunityMention(text,active,displayName);
  const replacement={
    text:inserted.text.slice(0,active.start)+inserted.text.slice(active.start+1),
    caret:inserted.caret-1
  };
  const label=displayName;
  const mention:SelectedCommunityMention={
    start:active.start,end:active.start+label.length,label,handle
  };
  return {...replacement,mentions:[
    ...reconcileSelectedMentions(text,replacement.text,selected),mention
  ].sort((a,b)=>a.start-b.start)};
}

/** Encode the display-only aliases back to stable handles before posting
 * any message, media caption or location. The server does not need metadata. */
export function serializeCommunityMentions(
  text:string,selected:readonly SelectedCommunityMention[],
):string{
  let output=text;
  for(const mention of [...selected].sort((a,b)=>b.start-a.start)){
    if(mention.start<0||mention.end>text.length||mention.start>=mention.end||
       text.slice(mention.start,mention.end)!==mention.label)continue;
    output=output.slice(0,mention.start)+'@'+mention.handle+output.slice(mention.end);
  }
  return output;
}
