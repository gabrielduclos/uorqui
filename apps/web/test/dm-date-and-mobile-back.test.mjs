import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {directMessageHistoryPath} from '../src/directMessageHistory.ts';
import {groupChannelMessages,channelHistoryDayLabel} from '../src/channelHistory.ts';
import {backFromAppScreen,currentAppEntry,prepareAppHistory,pushAppHistory,replaceAppScreenWithArea} from '../src/mobileAppHistory.ts';

const dm=readFileSync(new URL('../src/LiveDirectChat.tsx',import.meta.url),'utf8');
const shell=readFileSync(new URL('../src/SocialShell.tsx',import.meta.url),'utf8');
const channel=readFileSync(new URL('../src/LiveCommunities.tsx',import.meta.url),'utf8');
const mail=readFileSync(new URL('../src/EmailInbox.tsx',import.meta.url),'utf8');

test('DM filters use full authorized server history and local date boundaries',()=>{
  const now=new Date(2026,10,11,18,0);
  const url=new URL(directMessageHistoryPath('chat-id','custom',
    {from:'2026-11-02',to:'2026-11-11'},100,now),'https://uorqui.app');
  assert.equal(url.pathname,'/api/v1/dm/conversations/chat-id/messages');
  assert.equal(url.searchParams.get('from'),String(new Date(2026,10,2).getTime()));
  assert.equal(url.searchParams.get('to'),String(new Date(2026,10,12).getTime()));
  assert.equal(url.searchParams.get('offset'),'100');
  const groups=groupChannelMessages([{createdAt:new Date(2026,10,10,12).toISOString()},
    {createdAt:new Date(2026,10,11,1).toISOString()}]);
  assert.equal(groups.length,2);
  assert.equal(channelHistoryDayLabel(groups[1].dayKey,'2026-11-11','pt-BR'),'Hoje');
});

test('DM divider appears immediately before each day and reuses channel filter UI',()=>{
  const day=dm.indexOf('data-uorqui-dm-date-divider');
  const message=dm.indexOf('group.messages.map(message',day);
  assert.ok(day>=0&&message>day,'messages must follow their date divider');
  assert.match(dm.slice(day,message),/<ChannelDateFilter dayKey={group.dayKey}/);
  assert.match(dm,/directMessageHistoryPath\(activeId,historyPeriod,customHistoryRange/);
  assert.match(dm,/historyFiltered \|\| !activeId \|\| messagesLoading/);
  assert.match(dm,/historyFiltered \|\| !activeId \|\| messagesLoading \|\| !positionedRef/);
});

test('Android history records nested screens and only navigates back when a matching entry exists',()=>{
  const previous=globalThis.window;
  const entries=[{url:'https://uorqui.app/',state:{}}];
  let index=0,backCalls=0;
  const mock={
    location:{pathname:'/',href:'https://uorqui.app/'},
    matchMedia:()=>({matches:true}),
    history:{
      get length(){return entries.length;},
      get state(){return entries[index].state;},
      replaceState(state,title,url){entries[index]={state,url};},
      pushState(state,title,url){entries.splice(index+1);entries.push({state,url});index=entries.length-1;},
      back(){backCalls++;if(index>0)index--;}
    }
  };
  globalThis.window=mock;
  try{
    prepareAppHistory('conversations');
    assert.equal(currentAppEntry().area,'conversations');
    pushAppHistory({area:'conversations',screen:'dm',id:'chat-one'});
    assert.equal(entries.length,2);
    pushAppHistory({area:'conversations',screen:'dm',id:'chat-one'});
    assert.equal(entries.length,2,'same chat must not create duplicate history entries');
    assert.equal(backFromAppScreen('dm','chat-one'),true);
    assert.equal(backCalls,1);
    assert.equal(currentAppEntry().screen,undefined);
    assert.equal(backFromAppScreen('dm','chat-one'),false);
    pushAppHistory({area:'communities',screen:'channel',id:'channel-one',communityId:'community-one'});
    replaceAppScreenWithArea('communities','channel','channel-one');
    assert.equal(currentAppEntry().area,'communities');
    assert.equal(currentAppEntry().screen,undefined);
  }finally{
    if(previous===undefined)delete globalThis.window;
    else globalThis.window=previous;
  }
});

test('Android Back works in landscape and tablets, not just narrow portraits',()=>{
  const previous=globalThis.window;
  let pushed=0;
  globalThis.window={
    location:{pathname:'/',href:'https://uorqui.app/'},
    navigator:{userAgent:'Mozilla/5.0 (Linux; Android 14; Tablet) AppleWebKit/537.36'},
    matchMedia:()=>({matches:false}),
    history:{state:null,pushState(){pushed++;}}
  };
  try{
    pushAppHistory({area:'email'});
    assert.equal(pushed,1);
  }finally{
    if(previous===undefined)delete globalThis.window;
    else globalThis.window=previous;
  }
});

test('module and detail components connect Android system Back to app history',()=>{
  assert.match(shell,/prepareAppHistory\(currentArea.current\)/);
  assert.match(shell,/window.addEventListener\('popstate',restore\)/);
  assert.match(shell,/pushAppHistory\(\{area:next\}\)/);
  assert.match(dm,/backFromAppScreen\('dm',activeIdRef.current\)/);
  assert.match(channel,/backFromAppScreen\('channel',channelId\)/);
  assert.match(mail,/backFromAppScreen\('mail',selected.id\)/);
});
