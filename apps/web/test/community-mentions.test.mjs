import assert from 'node:assert/strict';
import {test} from 'node:test';
import {activeCommunityMention,replaceCommunityMention,insertNamedCommunityMention,reconcileSelectedMentions,serializeCommunityMentions} from '../src/communityMentions.ts';
import {readFileSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MessageText} from '../src/MessageText.tsx';

test('autocomplete works at the beginning, after words, punctuation and newlines',()=>{
  for(const message of ['@ana','Bom dia @ana','Oi! @ana','( @ana','Linha 1\n@ana','Vamos: @ana']){
    const mention=activeCommunityMention(message,message.length);
    assert.equal(mention?.query,'ana',message);
    assert.equal(message.slice(mention.start,mention.end),'@ana');
  }
  assert.deepEqual(activeCommunityMention('Bom dia @',9),{start:8,end:9,query:''});
});

test('does not trigger in email addresses or in a normal word',()=>{
  for(const message of ['email@exemplo','texto@ana','pessoa123@ana']){
    assert.equal(activeCommunityMention(message,message.length),null,message);
  }
  assert.equal(activeCommunityMention('oi @ana',100),null);
});

test('selection in the middle of a sentence inserts mention without losing its suffix',()=>{
  const text='Bom dia @an, como vai?';
  const mention=activeCommunityMention(text,text.indexOf(','));
  assert.deepEqual(mention,{start:8,end:11,query:'an'});
  const result=replaceCommunityMention(text,mention,'ana');
  assert.equal(result.text,'Bom dia @ana, como vai?');
  assert.equal(result.caret,12);
});

test('completing a partial handle from inside the text replaces the whole token',()=>{
  const text='Olá @aninha tudo certo';
  const mention=activeCommunityMention(text,text.indexOf('@')+3);
  assert.deepEqual(mention,{start:4,end:11,query:'an'});
  assert.deepEqual(replaceCommunityMention(text,mention,'ana'),
    {text:'Olá @ana tudo certo',caret:8});
});

test('mention is followed by a separating space before the rest of a sentence',()=>{
  const text='Oi @an tudo bem';
  const mention=activeCommunityMention(text,text.indexOf(' tudo'));
  assert.equal(replaceCommunityMention(text,mention,'ana').text,'Oi @ana tudo bem');
  assert.equal(replaceCommunityMention('Oi @an, tudo bem',activeCommunityMention('Oi @an, tudo bem',6),'ana').text,
    'Oi @ana, tudo bem');
  assert.deepEqual(replaceCommunityMention('Oi @an',activeCommunityMention('Oi @an',6),'ana'),
    {text:'Oi @ana ',caret:8});
});

test('selected mention displays a member name but sends the canonical handle',()=>{
  const initial='Bom dia, @jess, tudo bem?';
  const active=activeCommunityMention(initial,initial.indexOf(',',10));
  assert.ok(active);
  const selected=insertNamedCommunityMention(initial,active,[],{
    handle:'jessica_pigari',displayName:'JESSICA PIGARI'
  });
  assert.ok(selected);
  assert.equal(selected.text,'Bom dia, JESSICA PIGARI, tudo bem?');
  assert.deepEqual(selected.mentions,[{
    start:9,end:23,label:'JESSICA PIGARI',handle:'jessica_pigari'
  }]);
  assert.equal(serializeCommunityMentions(selected.text,selected.mentions),
    'Bom dia, @jessica_pigari, tudo bem?');
});

test('typing before or after a named mention keeps its stable username',()=>{
  const initial='Olá @jess, tudo bem?';
  const chosen=insertNamedCommunityMention(initial,activeCommunityMention(initial,9),[],{
    handle:'jessica_pigari',displayName:'Jessica Pigari'
  });
  assert.ok(chosen);
  const prefixed='Bom dia! '+chosen.text;
  const moved=reconcileSelectedMentions(chosen.text,prefixed,chosen.mentions);
  assert.deepEqual(moved.map(m=>m.start),[chosen.mentions[0].start+9]);
  assert.equal(serializeCommunityMentions(prefixed,moved),'Bom dia! Olá @jessica_pigari, tudo bem?');
  const appended=prefixed+' Estou chegando.';
  assert.equal(serializeCommunityMentions(appended,
    reconcileSelectedMentions(prefixed,appended,moved)),
    'Bom dia! Olá @jessica_pigari, tudo bem? Estou chegando.');
});

test('editing the displayed name removes its mention binding',()=>{
  const chosen=insertNamedCommunityMention('@jess',activeCommunityMention('@jess',5),[],{
    handle:'jessica_pigari',displayName:'Jessica Pigari'
  });
  assert.ok(chosen);
  const edited=chosen.text.replace('Pigari','Pigar');
  const next=reconcileSelectedMentions(chosen.text,edited,chosen.mentions);
  assert.deepEqual(next,[]);
  assert.equal(serializeCommunityMentions(edited,next),edited);
});

test('two people with the same name retain independent handles',()=>{
  const first=insertNamedCommunityMention('Olá @jess e @jess',
    activeCommunityMention('Olá @jess e @jess',9),[],{
      handle:'jessica_pigari',displayName:'Jessica'
    });
  assert.ok(first);
  const secondActive=activeCommunityMention(first.text,first.text.length);
  assert.ok(secondActive);
  const second=insertNamedCommunityMention(first.text,secondActive,first.mentions,{
    handle:'jessica_lima',displayName:'Jessica'
  });
  assert.ok(second);
  assert.equal(serializeCommunityMentions(second.text,second.mentions),
    'Olá @jessica_pigari e @jessica_lima ');
});

test('channel UI serializes text and attachment captions but keeps mentions display-only',()=>{
  const channels=readFileSync(new URL('../src/LiveCommunities.tsx',import.meta.url),'utf8');
  const composer=readFileSync(new URL('../src/LiveMessageComposer.tsx',import.meta.url),'utf8');
  const renderer=readFileSync(new URL('../src/MessageText.tsx',import.meta.url),'utf8');
  assert.match(channels,/insertNamedCommunityMention\(draft,mentionAt,draftMentions\.current/);
  assert.match(channels,/queueText\(serializeDraft\(draft\),true\)/);
  assert.match(channels,/serializeValue={serializeDraft}/);
  assert.match(channels,/mentionDisplayNames={mentionDisplayNames}/);
  assert.match(composer,/serializeValue\?\.\(value\)\?\?value/);
  assert.match(renderer,/title={'@'\+handle}/);
});

test('rendered message shows linked name and exposes @username on hover and accessibility',()=>{
  const html=renderToStaticMarkup(createElement(MessageText,{
    text:'Bom dia, @jessica_pigari!',mentions:true,
    allowedHandles:new Set(['jessica_pigari']),
    mentionDisplayNames:new Map([['jessica_pigari','Jessica Pigari']])
  }));
  assert.match(html,/href="\/@jessica_pigari"/);
  assert.match(html,/title="@jessica_pigari"/);
  assert.match(html,/aria-label="Jessica Pigari \(@jessica_pigari\)"/);
  assert.match(html,/>Jessica Pigari<\/a>/);
  assert.doesNotMatch(html,/>@Jessica Pigari<\/a>/);
  assert.doesNotMatch(html,/>@jessica_pigari<\/a>/);
});

test('unauthorized mentions stay plain text without leaking display names',()=>{
  const html=renderToStaticMarkup(createElement(MessageText,{
    text:'Olá @jessica_pigari',mentions:true,
    allowedHandles:new Set(['other_member']),
    mentionDisplayNames:new Map([['jessica_pigari','Jessica Pigari']])
  }));
  assert.doesNotMatch(html,/href="\/@jessica_pigari"/);
  assert.doesNotMatch(html,/Jessica Pigari/);
  assert.match(html,/@jessica_pigari/);
});


// A confirmed mention is visually just the name, including in the draft.
// Serializing it must still preserve both the @ handle and the rest of a sentence.
test('confirmed name has no visible @ but still notifies the selected username',()=>{
  const raw='Bom dia, @jess!';
  const chosen=insertNamedCommunityMention(raw,activeCommunityMention(raw,raw.indexOf('!')),[],{
    handle:'jessica_pigari',displayName:'Jessica Pigari'
  });
  assert.ok(chosen);
  assert.equal(chosen.text,'Bom dia, Jessica Pigari!');
  assert.equal(chosen.mentions[0].label,'Jessica Pigari');
  assert.equal(serializeCommunityMentions(chosen.text,chosen.mentions),'Bom dia, @jessica_pigari!');
});

test('name-only mention at the start preserves spaces and cursor position',()=>{
  const chosen=insertNamedCommunityMention('@jess',activeCommunityMention('@jess',5),[],{
    handle:'jessica_pigari',displayName:'Jessica Pigari'
  });
  assert.ok(chosen);
  assert.deepEqual({text:chosen.text,caret:chosen.caret},
    {text:'Jessica Pigari ',caret:'Jessica Pigari '.length});
  assert.equal(serializeCommunityMentions(chosen.text,chosen.mentions),'@jessica_pigari ');
});
