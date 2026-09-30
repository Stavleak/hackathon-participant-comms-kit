import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
const root=new URL('../',import.meta.url);
const text=await readFile(new URL('.env.local',root),'utf8').catch(()=>{console.error('Сначала выполните pnpm setup');process.exit(1);});
const configuration=Object.fromEntries(text.split(/\r?\n/).filter(line=>line&&!line.startsWith('#')).map(line=>{const i=line.indexOf('=');return[line.slice(0,i),line.slice(i+1).replace(/^"|"$/g,'')];}));
const env={...process.env,...configuration};
const production=process.argv.includes('--production');
const origin=new URL(env.APP_ORIGIN||'http://127.0.0.1:3005');
if(origin.protocol!=='http:'||origin.hostname!=='127.0.0.1'||!origin.port)throw new Error('APP_ORIGIN должен быть локальным HTTP адресом с портом');
const children=[spawn('cargo',['run','--manifest-path','backend/Cargo.toml','--locked',...(production?['--release']:[])],{cwd:root,env,stdio:'inherit',shell:false,windowsHide:true}),spawn(process.execPath,['node_modules/next/dist/bin/next',production?'start':'dev','--hostname','127.0.0.1','--port',origin.port],{cwd:root,env,stdio:'inherit',shell:false,windowsHide:true})];
let stopping=false;
function stop(){if(stopping)return;stopping=true;for(const child of children)child.kill();}
for(const child of children){child.on('error',error=>{console.error(error.message);process.exitCode=1;stop();});child.on('exit',code=>{if(!stopping)process.exitCode=code||0;stop();});}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
