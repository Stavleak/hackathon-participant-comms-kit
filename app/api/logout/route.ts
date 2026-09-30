import {cookies} from 'next/headers';
import {cookieName,sameOrigin} from '../../../lib/session';
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({error:'Неверный источник запроса'},{status:403});
  (await cookies()).delete(cookieName);
  return Response.json({ok:true});
}
