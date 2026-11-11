import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const reader=readFileSync(new URL('../src/EmailInbox.tsx',import.meta.url),'utf8');
const route=readFileSync(new URL('../../api/src/mail-routes.ts',import.meta.url),'utf8');

test('opened email actions offer reply, new message, spam and delete on the same toolbar',()=>{
  const open=reader.indexOf('Ações do email aberto');
  const article=reader.indexOf('<article key={selected.id}',open);
  assert.ok(open>0&&article>open);
  const toolbar=reader.slice(open,article);
  for(const call of ["moveOpenedMessage('spam')","moveOpenedMessage('trash')"]){
    assert.ok(toolbar.includes(call),call);
  }
  assert.match(toolbar,/Marcar como spam/);
  assert.match(toolbar,/Excluir email/);
  assert.match(toolbar,/Responder/);
  assert.match(toolbar,/Novo email/);
  assert.match(toolbar,/aria-label=/);
  assert.match(toolbar,/disabled={!!detailMoving/);
});

test('opened-message move operates on exactly the currently selected provider message',()=>{
  assert.match(reader,/const message=selected;/);
  assert.match(reader,/ids:\[message\.id\],destination/);
  assert.match(reader,/result\.moved\?\.includes\(message\.id\)/);
  assert.match(reader,/clearReadPush\(\{kind:'mail',accountId:message\.accountId,messageId:message\.id\}\)/);
  assert.match(reader,/setNotice\(destination==='trash'\?'movedTrash':'movedSpam'\)/);
  assert.match(reader,/setDetailMoveError/);
  assert.match(route,/app\.post\('\/api\/v1\/mail\/accounts\/:accountId\/messages\/move'/);
  assert.match(route,/destination: \{ enum: \['trash', 'spam'\] \}/);
});
