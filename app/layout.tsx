import type {Metadata} from 'next';
import type {ReactNode} from 'react';
import {title} from './config';
import './globals.css';
export const metadata:Metadata={title:`${title} · Stavleak`,description:'Рабочий инструмент для организатора хакатона.',robots:{index:false,follow:false}};
export default function Layout({children}:{children:ReactNode}){return <html lang="ru"><body><a className="skip-link" href="#main-content">Перейти к содержимому</a>{children}</body></html>;}
