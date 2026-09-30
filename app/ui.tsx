'use client';
import {useId,type ButtonHTMLAttributes,type InputHTMLAttributes,type ReactNode} from 'react';
import {Button as KumoButton} from '@cloudflare/kumo/components/button';
import {Input} from '@cloudflare/kumo/components/input';
import Link from 'next/link';

type Tone='neutral'|'success'|'warning'|'danger';
export function Button({variant='primary',className='',...props}:ButtonHTMLAttributes<HTMLButtonElement>&{variant?:'primary'|'secondary'|'outline'|'danger'|'ghost'}) {
  return <KumoButton {...props} variant={variant==='outline'?'secondary':variant==='danger'?'destructive':variant} size="base" className={`kit-button kit-button--${variant} ${className}`} />;
}
export function Field({label,hint,id,...props}:Omit<InputHTMLAttributes<HTMLInputElement>,'size'>&{label:string;hint?:string}) {
  const generated=useId();const inputId=id||generated;
  return <label className="field" htmlFor={inputId}><span>{label}</span><Input {...props} id={inputId} size="base" aria-label={label} aria-describedby={hint?`${inputId}-hint`:undefined}/>{hint&&<small id={`${inputId}-hint`} className="muted">{hint}</small>}</label>;
}
export function Panel({title,children,className=''}:{title?:ReactNode;children:ReactNode;className?:string}){return <section className={`panel ${className}`}>{title&&<h2>{title}</h2>}{children}</section>;}
export function Status({children,tone='neutral'}:{children:ReactNode;tone?:Tone}){return <span className="status" data-tone={tone}><span aria-hidden="true">{tone==='success'?'✓':tone==='danger'?'×':tone==='warning'?'!':'○'}</span>{children}</span>;}
export function AppShell({title,description,loading,error,children}:{title:string;description:string;loading?:boolean;error?:string|null;children:ReactNode}) {
  return <><header className="site-header"><a href="https://stavleak.com/ru" aria-label="Сайт Stavleak"><picture><source media="(prefers-color-scheme: dark)" srcSet="/stavleak-logo-dark.svg"/><img src="/stavleak-logo.svg" width="180" height="38" alt="Stavleak"/></picture></a><nav aria-label="Рабочая среда"><a href="https://org.stavleak.com/ru#toolkit">Материалы организатора</a><Link href="/ru/login">Доступ</Link></nav></header><main id="main-content" className="shell"><div className="page-heading"><p className="eyebrow">Инструмент организатора</p><h1>{title}</h1><p className="muted">{description}</p></div>{loading&&<p role="status">Загружаем рабочий набор…</p>}{error&&<div role="alert" className="alert">{error}<p><Button variant="secondary" onClick={()=>window.location.reload()}>Загрузить актуальную версию</Button></p></div>}{children}</main><footer className="site-footer"><a href="https://stavleak.com/ru">Stavleak</a> · Хакатоны для организаций и рабочая среда события.</footer></>;
}
