import assert from 'node:assert/strict';
import {test} from 'node:test';
import {moveChannelWithinKind} from '../src/channelOrder.ts';

const channels=[
  {id:'text-1',kind:'text'}, {id:'voice-1',kind:'voice'},
  {id:'text-2',kind:'text'}, {id:'meeting-1',kind:'meeting'},
  {id:'text-3',kind:'text'},
];

test('move channels up and down within the same visible category',()=>{
  const initial=channels.map(ch=>ch.id);
  const up=moveChannelWithinKind(channels,initial,'text-3','text-2');
  assert.deepEqual(up.filter(id=>id.startsWith('text-')),['text-1','text-3','text-2']);
  const down=moveChannelWithinKind(channels,initial,'text-1','text-2');
  assert.deepEqual(down.filter(id=>id.startsWith('text-')),['text-2','text-1','text-3']);
  assert.deepEqual(channels.map(ch=>ch.id),initial,'original list stays immutable');
});

test('cross-category and invalid moves cannot change channel order',()=>{
  const initial=channels.map(ch=>ch.id);
  assert.deepEqual(moveChannelWithinKind(channels,initial,'voice-1','text-2'),initial);
  assert.deepEqual(moveChannelWithinKind(channels,initial,'missing','text-2'),initial);
  assert.deepEqual(moveChannelWithinKind(channels,initial,'text-2','text-2'),initial);
});
