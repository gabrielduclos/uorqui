/** Moves a channel inside its existing text/voice/meeting category.
 * The server still receives the complete ordered ID list for atomic persistence. */
export function moveChannelWithinKind(
  channels:readonly {id:string;kind:string}[],
  currentOrder:readonly string[],
  fromId:string,
  toId:string,
):string[]{
  const from=channels.find(channel=>channel.id===fromId);
  const to=channels.find(channel=>channel.id===toId);
  if(!from||!to||from.kind!==to.kind||fromId===toId)return [...currentOrder];
  const sourceIndex=currentOrder.indexOf(fromId);
  const targetIndex=currentOrder.indexOf(toId);
  if(sourceIndex<0||targetIndex<0)return [...currentOrder];
  const next=[...currentOrder];
  next.splice(sourceIndex,1);
  const insertion=next.indexOf(toId)+(sourceIndex<targetIndex?1:0);
  next.splice(insertion,0,fromId);
  return next;
}
