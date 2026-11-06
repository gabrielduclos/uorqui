#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const versionPattern=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(alpha|beta|rc)\.(0|[1-9]\d*))?$/;
const manifests=['package.json','apps/web/package.json','apps/api/package.json'];
function fail(message){console.error('Version policy:',message);process.exitCode=1;}
function versionParts(value){
  const match=versionPattern.exec(value??'');
  if(!match)throw Error('Invalid semver version: '+value);
  return {major:Number(match[1]),minor:Number(match[2]),patch:Number(match[3]),channel:match[4]??null,num:match[5]===undefined?null:Number(match[5])};
}
function compareVersions(next,previous){
  const a=versionParts(next),b=versionParts(previous);
  for(const field of ['major','minor','patch']){
    if(a[field]!==b[field])return a[field]>b[field]?1:-1;
  }
  if(!a.channel&&b.channel)return 1;
  if(a.channel&&!b.channel)return -1;
  if(!a.channel&&!b.channel)return 0;
  const stages={alpha:0,beta:1,rc:2};
  if(stages[a.channel]!==stages[b.channel])return stages[a.channel]>stages[b.channel]?1:-1;
  return Math.sign(a.num-b.num);
}
function readVersion(path){return JSON.parse(readFileSync(path,'utf8')).version;}
const versions=manifests.map(readVersion),current=versions[0];
try{versionParts(current);}catch(error){fail(error.message);}
if(!versions.every(v=>v===current))fail('Root, API, and web manifests must carry exactly the same version. Got '+versions.join(', '));
for(const file of ['CHANGELOG.md','CHANGELOG.pt-BR.md']){
  const body=readFileSync(file,'utf8');
  if(!body.includes('## ['+current+']'))fail(file+' must contain a release entry for '+current);
  if(!body.includes('## [Unreleased]'))fail(file+' must retain an Unreleased section for the next change.');
}
const base=process.env.BASE_SHA;
if(base){
  try{
    // Full checkout is required; an unreachable base SHA is never treated as
    // a bootstrap to bypass version checks.
    execFileSync('git',['rev-parse','--verify',base+'^{commit}'],{stdio:'pipe'});
    const baseline=JSON.parse(execFileSync('git',['show',base+':package.json'],{encoding:'utf8'})).version;
    let policyAlreadyInstalled=true;
    try{execFileSync('git',['cat-file','-e',base+':.github/workflows/version-policy.yml'],{stdio:'pipe'});}
    catch{policyAlreadyInstalled=false;}
    if(policyAlreadyInstalled){
      if(compareVersions(current,baseline)<=0)fail('Every PR must increase the version: base='+baseline+' PR='+current);
      else console.log('Version bump verified:',baseline,'→',current);
    }else{
      // This initial consolidation formalizes the existing technical beta
      // rather than introducing a second tag for an unchanged release.
      if(current!=='0.1.0-beta.1'||baseline!==current)
        fail('Initial bootstrap must preserve the existing 0.1.0-beta.1 baseline.');
      else console.log('First version-policy installation: freezing',current,'as baseline.');
    }
  }catch(error){fail('Unable to validate base version: '+error.message);}
}
if(!process.exitCode)console.log('Manifest/changelog consistency verified for',current);
