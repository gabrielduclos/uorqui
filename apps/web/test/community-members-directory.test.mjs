import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const page=readFileSync(new URL('../src/LiveCommunities.tsx',import.meta.url),'utf8');
const dialog=readFileSync(new URL('../src/CommunityMembersDialog.tsx',import.meta.url),'utf8');
const api=readFileSync(new URL('../../api/src/community-routes.ts',import.meta.url),'utf8');

test('clicking the community member count opens the accessible read-only member dialog',()=>{
  assert.match(page,/community\?\.myRole\?<button type="button" onClick=\{\(\)=>setMembersDialogOpen\(true\)\}/);
  assert.match(page,/aria-label=\{pt\?'Ver membros da comunidade':'View community members'\}/);
  assert.match(page,/aria-haspopup="dialog"/);
  assert.match(page,/<CommunityMembersDialog id=\{community\?\.myRole\?community\.id:null\}/);
  assert.match(dialog,/<Dialog\.Root open=\{Boolean\(open&&id\)\}/);
  assert.match(dialog,/<Dialog\.Title/);
  assert.match(dialog,/type="search"/);
  assert.match(dialog,/navigateToPublicProfile\(event,member\.handle\)/);
});

test('member directory is public to accepted members but never moderation access',()=>{
  assert.match(api,/app\.get\('\/api\/v1\/communities\/:id\/members'/);
  assert.match(api,/if\(!await membership\(id,me\)\)return reply\.code\(403\)/);
  assert.match(api,/NOT EXISTS \(SELECT 1 FROM user_blocks/);
  assert.match(api,/CASE WHEN cm\.user_id=\$2 OR p\.is_public=true OR f\.status='accepted'/);
  assert.doesNotMatch(dialog,/\/moderation/);
  assert.doesNotMatch(dialog,/removeMember|banMember|roleChange|Gerenciar permissões/);
});
