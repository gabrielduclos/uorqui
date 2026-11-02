import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { getPool } from './db/client.js';

const HASH_BYTES=64;
export function hashChannelPassword(password:string):string {
  const salt=randomBytes(16);
  const digest=scryptSync(password,salt,HASH_BYTES);
  return 'scrypt-v1:'+salt.toString('hex')+':'+digest.toString('hex');
}
export function verifyChannelPassword(password:string,stored:string):boolean {
  const [scheme,salt,hash]=stored.split(':');
  if(scheme!=='scrypt-v1'||!/^[0-9a-f]{32}$/.test(salt??'')||!/^[0-9a-f]{128}$/.test(hash??''))return false;
  const actual=scryptSync(password,Buffer.from(salt,'hex'),HASH_BYTES);
  return timingSafeEqual(actual,Buffer.from(hash,'hex'));
}
export type ChannelGate='allowed'|'members_only'|'password_required'|'not_found';
/** All channel reads and writes must use this server-side gate, not a UI-only lock. */
export async function channelGate(communityId:string,channelId:string,userId:string):Promise<ChannelGate>{
  const result=await getPool().query(
    'SELECT c.password_hash IS NOT NULL AS protected,m.role,gr.user_id IS NOT NULL AS granted '+
    'FROM community_channels c LEFT JOIN community_members m ON m.community_id=c.community_id AND m.user_id=$3 '+
    'LEFT JOIN community_channel_password_access gr ON gr.channel_id=c.id AND gr.user_id=$3 '+
    'WHERE c.id=$1 AND c.community_id=$2',[channelId,communityId,userId]);
  if(!result.rowCount)return 'not_found';
  const row=result.rows[0] as {protected:boolean;role:string|null;granted:boolean};
  if(!row.role)return 'members_only';
  if(row.protected&&!['owner','admin'].includes(row.role)&&!row.granted)return 'password_required';
  return 'allowed';
}
export const channelGateError=(gate:ChannelGate)=>gate==='password_required'?'CHANNEL_PASSWORD_REQUIRED':
  gate==='not_found'?'CHANNEL_NOT_FOUND':'MEMBERS_ONLY';
export const channelGateStatus=(gate:ChannelGate)=>gate==='not_found'?404:403;
