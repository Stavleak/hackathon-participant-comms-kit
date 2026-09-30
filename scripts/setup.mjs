import {randomBytes} from 'node:crypto';
import {writeFile,access} from 'node:fs/promises';
import {createInterface} from 'node:readline/promises';
const file=new URL('../.env.local',import.meta.url);
try{await access(file);console.error('.env.local уже существует. Настройка не перезаписывает пароль и рабочие данные.');process.exit(1);}catch(error){if(error.code!=='ENOENT')throw error;}
const input=createInterface({input:process.stdin,output:process.stdout});
const password=await input.question('Выберите пароль локальной рабочей среды (минимум 12 символов): ');input.close();
if(password.length<12||password.length>256||/[\r\n"\\]/.test(password)){console.error('Используйте 12–256 символов без кавычек, обратной косой черты и перевода строки.');process.exit(1);}
await writeFile(file,`APP_PASSWORD="${password}"\nAPP_SESSION_SECRET=${randomBytes(32).toString('hex')}\nAPI_TOKEN=${randomBytes(32).toString('hex')}\nAPI_URL=http://127.0.0.1:3006\nAPI_PORT=3006\nAPP_ORIGIN=http://127.0.0.1:3005\nDATA_FILE=data/state.json\n`,{mode:0o600,flag:'wx'});
console.log('Настройка сохранена локально. Запустите pnpm dev и откройте http://127.0.0.1:3005/ru');
