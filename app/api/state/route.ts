import {authorized,sameOrigin} from '../../../lib/session';
export const runtime = 'nodejs';

async function relay(request: Request, write: boolean) {
  try {
    if (!(await authorized())) return Response.json({error:'Войдите в рабочую среду'},{status:401});
    if (write && !sameOrigin(request)) return Response.json({error:'Неверный источник запроса'},{status:403});
    const address = new URL(process.env.API_URL || 'http://127.0.0.1:3006');
    if (address.protocol !== 'http:' || address.hostname !== '127.0.0.1' || address.username || address.password) throw new Error('Invalid backend address');
    const token = process.env.API_TOKEN;
    if (!token || token.length < 32) throw new Error('Missing backend credential');
    let body: string | undefined;
    if (write) { body = await request.text(); if (Buffer.byteLength(body) > 512*1024) return Response.json({error:'Рабочий набор превышает 512 КБ'},{status:413}); }
    const response = await fetch(new URL('/state',address),{method:write?'PUT':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body,cache:'no-store',signal:AbortSignal.timeout(10_000)});
    const payload: unknown = await response.json();
    return Response.json(payload,{status:response.status,headers:{'Cache-Control':'no-store'}});
  } catch { return Response.json({error:'Рабочая среда недоступна. Проверьте запущенный процесс и повторите загрузку.'},{status:503}); }
}
export function GET(request: Request) {return relay(request,false);}
export function PUT(request: Request) {return relay(request,true);}
