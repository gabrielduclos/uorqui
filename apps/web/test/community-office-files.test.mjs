import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const composer=readFileSync(new URL('../src/LiveMessageComposer.tsx',import.meta.url),'utf8');
const community=readFileSync(new URL('../src/LiveCommunities.tsx',import.meta.url),'utf8');
const worker=readFileSync(new URL('../worker/index.ts',import.meta.url),'utf8');
const api=readFileSync(new URL('../../api/src/community-routes.ts',import.meta.url),'utf8');

test('community-only Office picker offers Word Excel PowerPoint including legacy extensions',()=>{
  assert.match(community,/gifOpen={mediaPicker==='gif'} allowOffice/);
  assert.match(composer,/allowOffice = false/);
  assert.match(composer,/allowOffice\?',\.doc,\.docx,\.xls,\.xlsx,\.ppt,\.pptx'/);
  for(const ext of ['.doc','.docx','.xls','.xlsx','.ppt','.pptx'])
    assert.ok(composer.includes(ext),'picker should support '+ext);
});

test('Worker validates Office magic signatures, 50 MB max, and attachment download',()=>{
  for(const type of [
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]){
    assert.ok(worker.includes("'"+type+"'"),'Worker MIME: '+type);
    assert.ok(api.includes("'"+type+"'"),'API MIME: '+type);
    assert.ok(community.includes("'"+type+"'"),'Web MIME: '+type);
  }
  assert.match(worker,/communityId && COMMUNITY_OFFICE_TYPES.has\(type\)/);
  assert.match(worker,/OFFICE_OPENXML_TYPES.has\(type\)/);
  assert.match(worker,/OFFICE_LEGACY_TYPES.has\(type\)/);
  assert.match(worker,/MAX_DM_BYTES = 50 \* 1024 \* 1024/);
  assert.match(worker,/content-disposition/);
});
