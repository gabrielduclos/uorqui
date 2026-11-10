import assert from 'node:assert/strict';
import { test } from 'node:test';
import { signedVisitorIpHeaders } from '../worker/clientIpProof.ts';
import {
  resolveVisitorIp, verifyEdgeVisitorIp, visitorIpLogKey,
} from '../../api/src/auth/verified-client-ip.ts';

const secret = 'uorqui-example-test-only-shared-secret-0123456789';
const moment = Date.parse('2026-11-10T15:00:00Z');
const path = '/api/auth/get-session';

function requestFor(ip, url='https://uorqui.app'+path, method='GET') {
  return new Request(url, {method, headers:{'cf-connecting-ip':ip}});
}

test('Cloudflare-signed IPs remain separate on the Render auth endpoint', async () => {
  const visitorA=await signedVisitorIpHeaders(requestFor('198.51.100.11'),secret,moment);
  const visitorB=await signedVisitorIpHeaders(requestFor('198.51.100.12'),secret,moment);
  assert.ok(visitorA && visitorB);
  assert.notEqual(visitorA['x-uorqui-edge-proof'],visitorB['x-uorqui-edge-proof']);
  const resultA=resolveVisitorIp(visitorA,'GET',path,'10.0.0.10',secret,moment);
  const resultB=resolveVisitorIp(visitorB,'GET',path,'10.0.0.10',secret,moment);
  assert.deepEqual(resultA,{ip:'198.51.100.11',source:'verified-cloudflare'});
  assert.deepEqual(resultB,{ip:'198.51.100.12',source:'verified-cloudflare'});
  assert.notEqual(visitorIpLogKey(resultA.ip,secret),visitorIpLogKey(resultB.ip,secret));
  assert.doesNotMatch(visitorIpLogKey(resultA.ip,secret),/198\\.51\\.100\\.11/);
});

test('IPv6 visitor IP is signed and accepted', async () => {
  const headers=await signedVisitorIpHeaders(requestFor('2001:db8::abcd'),secret,moment);
  assert.ok(headers);
  assert.equal(verifyEdgeVisitorIp(headers,'GET',path,secret,moment),'2001:db8::abcd');
});

test('direct access to Render cannot choose its own identity through headers', () => {
  const forged={
    'cf-connecting-ip':'198.51.100.11',
    'x-forwarded-for':'198.51.100.11',
    'x-uorqui-verified-client-ip':'198.51.100.11',
    'x-uorqui-edge-ip':'198.51.100.11',
    'x-uorqui-edge-ts':String(moment/1000),
    'x-uorqui-edge-proof':'a'.repeat(64),
  };
  assert.deepEqual(resolveVisitorIp(forged,'GET',path,'192.0.2.10',secret,moment),
    {ip:'192.0.2.10',source:'transport'});
  assert.equal(verifyEdgeVisitorIp(forged,'GET',path,secret,moment),null);
});

test('signatures cannot be replayed on a different endpoint, verb or after expiry', async () => {
  const headers=await signedVisitorIpHeaders(requestFor('198.51.100.11'),secret,moment);
  assert.ok(headers);
  assert.equal(verifyEdgeVisitorIp(headers,'GET','/api/auth/sign-in/email',secret,moment),null);
  assert.equal(verifyEdgeVisitorIp(headers,'POST',path,secret,moment),null);
  assert.equal(verifyEdgeVisitorIp(headers,'GET',path,secret,moment+121_000),null);
  assert.equal(verifyEdgeVisitorIp(headers,'GET',path,'incorrect-secret-0123456789-aaaaaa',moment),null);
  assert.equal(verifyEdgeVisitorIp(headers,'GET',path,undefined,moment),null);
});

test('unsigned, missing or malformed addresses cannot bypass verification', async () => {
  assert.equal(await signedVisitorIpHeaders(requestFor('198.51.100.11'),undefined,moment),null);
  assert.equal(await signedVisitorIpHeaders(requestFor('198.51.100.11, 203.0.113.5'),secret,moment),null);
  assert.deepEqual(resolveVisitorIp({},'GET',path,undefined,secret,moment),
    {ip:null,source:'unavailable'});
});
