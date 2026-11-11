import assert from 'node:assert/strict';
import {test} from 'node:test';
import {activeCommunityMention,replaceCommunityMention} from '../src/communityMentions.ts';

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
});
