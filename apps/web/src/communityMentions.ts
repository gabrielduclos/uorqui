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
  const space=suffix.length&&!/^\s|^[,.;!?)}\]]/.test(suffix)?' ':'';
  const value=text.slice(0,mention.start)+'@'+handle+space+suffix;
  return {text:value,caret:mention.start+handle.length+1+space.length};
}
