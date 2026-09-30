import {cookies} from 'next/headers';
import {cookieName,lifetime,passwordMatches,sameOrigin,signSession,takeLoginAttempt} from '../../../lib/session';

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({error:'Неверный источник запроса'},{status:403});
  if (!takeLoginAttempt()) return Response.json({error:'Слишком много попыток. Повторите через минуту.'},{status:429});
  try {
    const text = await request.text();
    if (text.length > 1024) return Response.json({error:'Слишком длинный запрос'},{status:413});
    const body: unknown = JSON.parse(text);
    if (!body || typeof body !== 'object' || !('password' in body) || typeof body.password !== 'string' || body.password.length > 256) return Response.json({error:'Введите пароль рабочей среды'},{status:400});
    if (!passwordMatches(body.password)) return Response.json({error:'Пароль не подошёл'},{status:401});
    (await cookies()).set(cookieName,signSession(),{httpOnly:true,sameSite:'strict',secure:process.env.APP_ORIGIN?.startsWith('https://') || false,path:'/',maxAge:lifetime});
    return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
  } catch { return Response.json({error:'Не удалось открыть рабочую среду. Проверьте локальную настройку.'},{status:503}); }
}
