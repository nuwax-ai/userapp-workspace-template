import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { walkAndPack } from './pack-templates.mjs';
import { selectManager } from '../../userapp-next-template/scripts/install-locked.mjs';

function fixture(work) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'template-pack-'));
  try { const source=path.join(root,'source');fs.mkdirSync(source);work(source,path.join(root,'destination'),root); }
  finally { fs.rmSync(root,{recursive:true,force:true}); }
}
function write(root,name,body) { const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,body);return file; }

test('pack copies arbitrary source resources/scripts and filters private/cache state',()=>fixture((source,destination)=>{
  write(source,'scripts/migrate.py','print("runtime")');write(source,'new-runtime-name/value.json','{"runtime":true}');
  write(source,'.env.example','placeholder');write(source,'.gitignore','artifact.zip');
  for(const name of ['.env','.env.local','.cache/state','.pytest_cache/result','.agents/config','.ssh/id_rsa','secrets/key.txt','.deps-stamp','.deps-install-old/input','artifact.zip','temporary.tmp','.deploy-operation.json','migration-receipts/old.json'])write(source,name,'private-or-cache');
  walkAndPack(source,destination,'worker-python');
  assert.equal(fs.readFileSync(path.join(destination,'scripts/migrate.py'),'utf8'),'print("runtime")');
  assert(fs.existsSync(path.join(destination,'new-runtime-name/value.json')));assert(fs.existsSync(path.join(destination,'_gitignore')));assert(fs.existsSync(path.join(destination,'.env.example')));
  for(const name of ['.env','.env.local','.cache','.pytest_cache','.agents','.ssh','secrets','.deps-stamp','.deps-install-old','artifact.zip','temporary.tmp','.deploy-operation.json','migration-receipts'])assert(!fs.existsSync(path.join(destination,name)),name);
}));

test('pack rejects an escaping link before touching existing output',()=>fixture((source,destination,root)=>{
  const outside=write(root,'outside-secret','preserve outside');write(destination,'previous','preserve old output');fs.symlinkSync(outside,path.join(source,'public-alias'));
  assert.throws(()=>walkAndPack(source,destination,'worker-python'),/escapes/);
  assert.equal(fs.readFileSync(path.join(destination,'previous'),'utf8'),'preserve old output');assert.equal(fs.readFileSync(outside,'utf8'),'preserve outside');
}));

test('pack handles safe internal links and retains executable mode',()=>fixture((source,destination)=>{
  const script=write(source,'scripts/migrate.sh','#!/bin/sh\necho ok\n');fs.chmodSync(script,0o751);fs.symlinkSync(script,path.join(source,'migrate-alias.sh'));
  walkAndPack(source,destination,'worker-python');assert.equal(fs.readFileSync(path.join(destination,'migrate-alias.sh'),'utf8'),'#!/bin/sh\necho ok\n');assert.equal(fs.statSync(path.join(destination,'scripts/migrate.sh')).mode&0o777,0o751);
}));

test('pack rejects directory cycles and private aliases',()=>fixture((source,destination)=>{
  fs.symlinkSync(source,path.join(source,'loop'));assert.throws(()=>walkAndPack(source,destination,'worker-python'),/cycle/);fs.unlinkSync(path.join(source,'loop'));
  const privateFile=write(source,'.env.private','private input');fs.symlinkSync(privateFile,path.join(source,'public-alias'));
  assert.throws(()=>walkAndPack(source,destination,'worker-python'),/excluded input/);assert(!fs.existsSync(destination));
}));

test('pack retains Go cmd/server source directory while excluding a server output file',()=>fixture((source,destination)=>{
  const main = write(source,'cmd/server/main.go','package main\nfunc main() {}\n');
  write(source,'server','compiled output');
  fs.symlinkSync(main,path.join(source,'main-source-alias.go'));
  fs.symlinkSync(path.dirname(main),path.join(source,'server-source-alias'));
  walkAndPack(source,destination,'backend-go');
  assert.equal(fs.readFileSync(path.join(destination,'cmd/server/main.go'),'utf8'),'package main\nfunc main() {}\n');
  assert(!fs.existsSync(path.join(destination,'server')));
  assert.equal(fs.readFileSync(path.join(destination,'main-source-alias.go'),'utf8'),'package main\nfunc main() {}\n');
  assert.equal(fs.readFileSync(path.join(destination,'server-source-alias/main.go'),'utf8'),'package main\nfunc main() {}\n');
}));

test('locked installer follows single npm/pnpm locks and uses frozen commands',()=>fixture((source)=>{
  write(source,'package.json','{}');write(source,'package-lock.json','{}');
  assert.deepEqual(selectManager(source),{manager:'npm',version:undefined,initializesLock:false,installArgs:['ci']});
  fs.unlinkSync(path.join(source,'package-lock.json'));write(source,'pnpm-lock.yaml','lockfileVersion: 9.0');
  assert.deepEqual(selectManager(source),{manager:'pnpm',version:undefined,initializesLock:false,installArgs:['install','--frozen-lockfile']});
}));

test('explicit packageManager selects its lock and rejects switching from a different valid lock',()=>fixture((source)=>{
  write(source,'package.json','{"packageManager":"pnpm@12.9.1"}');write(source,'package-lock.json','{}');
  assert.throws(()=>selectManager(source),/pnpm-lock.yaml is missing/);
  write(source,'pnpm-lock.yaml','lockfileVersion: 9.0');assert.equal(selectManager(source).manager,'pnpm');
  write(source,'package.json','{"packageManager":"npm@10.9.8"}');assert.equal(selectManager(source).manager,'npm');
}));

test('ambiguous or unsupported manager inputs fail and absent locks preserve explicit initialization',()=>fixture((source)=>{
  write(source,'package.json','{}');assert.deepEqual(selectManager(source),{manager:'pnpm',version:undefined,initializesLock:true,installArgs:['install']});
  write(source,'package-lock.json','{}');write(source,'pnpm-lock.yaml','lockfileVersion: 9.0');assert.throws(()=>selectManager(source),/Both package-lock/);
  write(source,'package.json','{"packageManager":"yarn@1.22.22"}');assert.throws(()=>selectManager(source),/Unsupported packageManager/);
}));
