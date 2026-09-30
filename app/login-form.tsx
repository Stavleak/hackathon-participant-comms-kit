'use client';
import {useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import {AppShell,Button,Field,Panel} from './ui';
export default function LoginForm(){
  const [password,setPassword]=useState('');const[error,setError]=useState<string|null>(null);const[busy,setBusy]=useState(false);const router=useRouter();
  async function login(event:FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setError(null);try{const response=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});const body:{error?:string}=await response.json();if(!response.ok)throw new Error(body.error||'Вход не выполнен');setPassword('');router.replace('/ru');router.refresh();}catch(cause){setError(cause instanceof Error?cause.message:'Не удалось войти');}finally{setBusy(false);}}
  async function logout(){setBusy(true);setError(null);try{const response=await fetch('/api/logout',{method:'POST'});if(!response.ok)throw new Error('Не удалось выйти');router.refresh();}catch(cause){setError(cause instanceof Error?cause.message:'Не удалось выйти');}finally{setBusy(false);}}
  return <AppShell title="Доступ к рабочей среде" description="Введите пароль, выбранный при локальной настройке." error={error}><Panel title="Войти"><form className="stack" onSubmit={login}><Field label="Пароль рабочей среды" type="password" autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)} required minLength={12} maxLength={256}/><div className="actions"><Button type="submit" disabled={busy}>{busy?'Проверяем…':'Войти'}</Button><Button type="button" variant="secondary" onClick={()=>void logout()} disabled={busy}>Завершить сеанс</Button></div></form></Panel></AppShell>;
}
