/** A meeting link navigates to an existing room; it never grants membership. */
const uuid=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

export function buildMeetingLink(origin:string,communityId:string,channelId:string):string{
  if(!uuid.test(communityId)||!uuid.test(channelId))throw Error('INVALID_MEETING_ROOM');
  const url=new URL('/',origin);
  url.searchParams.set('community',communityId);
  url.searchParams.set('channel',channelId);
  url.searchParams.set('meeting','1');
  return url.toString();
}

export function isMeetingLink(params:URLSearchParams):boolean{
  return params.get('meeting')==='1'&&uuid.test(params.get('community')??'')&&
    uuid.test(params.get('channel')??'');
}
