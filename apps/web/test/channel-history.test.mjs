import assert from 'node:assert/strict';
import {test} from 'node:test';
import {channelHistoryBounds,channelHistorySearchPath,channelHistoryDayLabel,groupChannelMessages} from '../src/channelHistory.ts';
import {localDayKey} from '../src/messageTimestamp.ts';

const now=new Date(2026,10,11,10,30); // Wednesday

test('period filters use local midnight and ISO weeks, not UTC days',()=>{
  const today=new Date(2026,10,11).getTime(),yesterday=new Date(2026,10,10).getTime();
  assert.deepEqual(channelHistoryBounds('today',now),{from:today,to:new Date(2026,10,12).getTime()});
  assert.deepEqual(channelHistoryBounds('yesterday',now),{from:yesterday,to:today});
  assert.deepEqual(channelHistoryBounds('last-week',now),{from:new Date(2026,10,2).getTime(),to:new Date(2026,10,9).getTime()});
  assert.deepEqual(channelHistoryBounds('this-week',now),{from:new Date(2026,10,9).getTime(),to:new Date(2026,10,16).getTime()});
  assert.deepEqual(channelHistoryBounds('older',now),{to:new Date(2026,10,2).getTime()});
  assert.deepEqual(channelHistoryBounds('all',now),{});
});

test('search URL contains encoded text and date bounds without leaking channel scope',()=>{
  const path=channelHistorySearchPath('community-123','channel-456','  projetos & férias  ','yesterday',100,now);
  const url=new URL(path,'https://uorqui.app');
  assert.equal(url.pathname,'/api/v1/communities/community-123/channels/channel-456/messages');
  assert.equal(url.searchParams.get('q'),'projetos & férias');
  assert.equal(url.searchParams.get('offset'),'100');
  assert.equal(url.searchParams.get('from'),String(new Date(2026,10,10).getTime()));
});

test('messages group into local calendar days preserving order',()=>{
  const d1=new Date(2026,10,10,23,58).toISOString(),d2=new Date(2026,10,11,0,1).toISOString();
  const groups=groupChannelMessages([{id:1,createdAt:d1},{id:2,createdAt:d1},{id:3,createdAt:d2}]);
  assert.deepEqual(groups.map(x=>[x.dayKey,x.messages.map(m=>m.id)]),[
    [localDayKey(new Date(d1)),[1,2]],[localDayKey(new Date(d2)),[3]]
  ]);
  assert.equal(channelHistoryDayLabel('2026-11-11','2026-11-11','pt-BR'),'Hoje');
  assert.equal(channelHistoryDayLabel('2026-11-10','2026-11-11','pt-BR'),'Ontem');
  assert.match(channelHistoryDayLabel('2026-11-05','2026-11-11','pt-BR'),/^Semana passada/);
});

import { readFileSync } from 'node:fs';

const channelUi=readFileSync(new URL('../src/LiveCommunities.tsx',import.meta.url),'utf8');
const dividerUi=readFileSync(new URL('../src/ChannelDateFilter.tsx',import.meta.url),'utf8');

test('date separator stays immediately before its day messages and holds the period picker',()=>{
  const marker=channelUi.indexOf('data-uorqui-channel-date-separator');
  const messageStart=channelUi.indexOf('group.messages.map(message=>',marker);
  assert.ok(marker>=0&&messageStart>marker,'date separator must precede the first message of each group');
  const divider=channelUi.slice(marker,messageStart);
  assert.match(divider,/<ChannelDateFilter dayKey={group.dayKey}/);
  assert.doesNotMatch(divider,/sticky top-0/,'date separators must scroll naturally with their day');
  assert.match(dividerUi,/<DropdownMenu.Trigger asChild>/);
  assert.match(dividerUi,/<DropdownMenu.RadioGroup value={period}/);
  assert.match(dividerUi,/<time dateTime={dayKey}/);
  for(const label of ['Todas as datas','Hoje','Ontem','Semana passada']){
    assert.ok(dividerUi.includes(label),'period menu is missing '+label);
  }
});

test('header search icon toggles a collapsible search field without a persistent toolbar',()=>{
  const header=channelUi.indexOf('<header data-uorqui-context-header');
  const icon=channelUi.indexOf('aria-expanded={searchOpen}',header);
  const description=channelUi.indexOf('Descrição fixa do canal',header);
  const searchBar=channelUi.indexOf('id="uorqui-channel-search"',icon);
  assert.ok(header>=0&&icon>header&&searchBar>icon&&searchBar<description,
    'search icon belongs in the header and its bar opens directly underneath');
  assert.match(channelUi,/if\(searchOpen\)\{setSearchOpen\(false\);setChannelSearch\(''\);\}/);
  assert.match(channelUi,/searchOpen&&\s*<div id="uorqui-channel-search"/);
  assert.match(channelUi,/onClick={toggleChannelSearch}/);
  assert.doesNotMatch(channelUi,/<select value={historyPeriod}/,
    'date filtering should no longer consume a permanent toolbar');
});
