import {localDayKey} from './messageTimestamp';

export type ChannelHistoryPeriod='all'|'today'|'yesterday'|'this-week'|'last-week'|'last-seven'|'this-month'|'custom';
export type CustomChannelDateRange={from:string;to:string};
export type HistoryBounds={from?:number;to?:number};

/** Reject invalid or rollover dates. Inputs must have calendar dates in the
 * YYYY-MM-DD form returned by a native date input. */
export function parseLocalCalendarDay(value:string):Date|null{
  const match=/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(value);
  if(!match)return null;
  const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
  if(year<1970||year>2100||month<1||month>12||day<1||day>31)return null;
  const date=new Date(year,month-1,day);
  if(date.getFullYear()!==year||date.getMonth()!==month-1||date.getDate()!==day)return null;
  return date;
}
export function isValidCustomChannelRange(range:CustomChannelDateRange):boolean{
  const from=parseLocalCalendarDay(range.from),to=parseLocalCalendarDay(range.to);
  return Boolean(from&&to&&from.getTime()<=to.getTime());
}

/** Use browser-local calendar boundaries so a "today" filter includes the
 * viewer's local midnight even when the API/server is in another timezone. */
export function channelHistoryBounds(
  period:ChannelHistoryPeriod,now=new Date(),customRange?:CustomChannelDateRange
):HistoryBounds{
  const today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const tomorrow=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1);
  const yesterday=new Date(now.getFullYear(),now.getMonth(),now.getDate()-1);
  const monday=new Date(now.getFullYear(),now.getMonth(),now.getDate()-((now.getDay()+6)%7));
  const nextMonday=new Date(monday.getFullYear(),monday.getMonth(),monday.getDate()+7);
  const lastMonday=new Date(monday.getFullYear(),monday.getMonth(),monday.getDate()-7);
  const thisMonth=new Date(now.getFullYear(),now.getMonth(),1);
  const nextMonth=new Date(now.getFullYear(),now.getMonth()+1,1);
  switch(period){
    case 'today':return {from:today.getTime(),to:tomorrow.getTime()};
    case 'yesterday':return {from:yesterday.getTime(),to:today.getTime()};
    case 'this-week':return {from:monday.getTime(),to:nextMonday.getTime()};
    case 'last-week':return {from:lastMonday.getTime(),to:monday.getTime()};
    case 'last-seven':return {from:new Date(now.getFullYear(),now.getMonth(),now.getDate()-6).getTime(),to:tomorrow.getTime()};
    case 'this-month':return {from:thisMonth.getTime(),to:nextMonth.getTime()};
    case 'custom':{
      if(!customRange||!isValidCustomChannelRange(customRange))return {};
      const from=parseLocalCalendarDay(customRange.from)!;
      const end=parseLocalCalendarDay(customRange.to)!;
      const nextDay=new Date(end.getFullYear(),end.getMonth(),end.getDate()+1);
      return {from:from.getTime(),to:nextDay.getTime()};
    }
    default:return {};
  }
}

/** Build the search URL using exact-match terms; the API remains the authority
 * over membership, channel password access and restricted channel grants. */
export function channelHistorySearchPath(communityId:string,channelId:string,
  query:string,period:ChannelHistoryPeriod,offset=0,now=new Date(),
  customRange?:CustomChannelDateRange
):string{
  const params=new URLSearchParams();
  if(query.trim())params.set('q',query.trim().slice(0,120));
  const bounds=channelHistoryBounds(period,now,customRange);
  if(bounds.from!==undefined)params.set('from',String(bounds.from));
  if(bounds.to!==undefined)params.set('to',String(bounds.to));
  if(offset>0)params.set('offset',String(offset));
  return '/api/v1/communities/'+encodeURIComponent(communityId)+
    '/channels/'+encodeURIComponent(channelId)+'/messages?'+params.toString();
}

export function groupChannelMessages<T extends {createdAt:string}>(messages:T[]){
  const groups:{dayKey:string;messages:T[]}[]=[];
  for(const message of messages){
    const date=new Date(message.createdAt);
    const dayKey=Number.isFinite(date.getTime())?localDayKey(date):'unknown';
    if(groups[groups.length-1]?.dayKey!==dayKey)groups.push({dayKey,messages:[]});
    groups[groups.length-1].messages.push(message);
  }
  return groups;
}

export function channelHistoryDayLabel(dayKey:string,todayKey:string,locale:string):string{
  const pt=locale==='pt-BR';
  const date=new Date(dayKey+'T12:00:00');
  const today=new Date(todayKey+'T12:00:00');
  if(!Number.isFinite(date.getTime())||!Number.isFinite(today.getTime()))return dayKey;
  if(dayKey===todayKey)return pt?'Hoje':'Today';
  const yesterday=new Date(today.getFullYear(),today.getMonth(),today.getDate()-1);
  if(dayKey===localDayKey(yesterday))return pt?'Ontem':'Yesterday';
  const monday=new Date(today.getFullYear(),today.getMonth(),today.getDate()-((today.getDay()+6)%7));
  const previousMonday=new Date(monday.getFullYear(),monday.getMonth(),monday.getDate()-7);
  const prefix=date>=previousMonday&&date<monday?(pt?'Semana passada · ':'Last week · '):'';
  const label=date.toLocaleDateString(locale,{
    weekday:'long',day:'numeric',month:'long',...(date.getFullYear()!==today.getFullYear()?{year:'numeric'}:{})
  });
  return prefix+label;
}
