import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { validRequestOrigin } from '../dist/request-origin.js';

const previous=process.env.WEB_ORIGIN;
after(()=>{
  if(previous===undefined)delete process.env.WEB_ORIGIN;
  else process.env.WEB_ORIGIN=previous;
});

test('shared API origin guard preserves exact canonical WEB_ORIGIN checks',()=>{
  process.env.WEB_ORIGIN='https://uorqui.app';
  const req=(origin)=>({headers:origin===undefined?{}:{origin}});
  assert.equal(validRequestOrigin(req('https://uorqui.app')),true);
  for(const origin of [
    undefined,'https://evil.example','http://uorqui.app',
    'https://uorqui.app/','https://uorqui.app.evil.example',
    'https://main.uorqui1.workers.dev'
  ])assert.equal(validRequestOrigin(req(origin)),false,'Rejected origin: '+String(origin));
});
test('shared API origin guard preserves local development default',()=>{
  delete process.env.WEB_ORIGIN;
  assert.equal(validRequestOrigin({headers:{origin:'http://localhost:5173'}}),true);
  assert.equal(validRequestOrigin({headers:{origin:'http://localhost:5174'}}),false);
});
