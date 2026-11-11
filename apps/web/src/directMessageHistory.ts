import {channelHistoryBounds,type ChannelHistoryPeriod,type CustomChannelDateRange} from './channelHistory';

/** DM history uses the same local-calendar period boundaries as channel history.
 * The authenticated server validates conversation participation before reading. */
export function directMessageHistoryPath(
  conversationId:string,period:ChannelHistoryPeriod,range:CustomChannelDateRange,
  offset=0,now=new Date()
):string{
  const bounds=channelHistoryBounds(period,now,range);
  const params=new URLSearchParams();
  if(bounds.from!==undefined)params.set('from',String(bounds.from));
  if(bounds.to!==undefined)params.set('to',String(bounds.to));
  if(offset>0)params.set('offset',String(offset));
  return '/api/v1/dm/conversations/'+encodeURIComponent(conversationId)+'/messages?'+params;
}
