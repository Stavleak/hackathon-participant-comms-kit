'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';

interface Envelope<Data,Analysis> {revision:number;data:Data;analysis:Analysis}
export function useWorkbench<Data extends object,Analysis extends object>() {
  const router=useRouter();
  const [snapshot,setSnapshot]=useState<Envelope<Data,Analysis>|null>(null);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [conflict,setConflict]=useState(false);
  const busy=useRef(false);
  const revision=useRef(0);
  const decode=useCallback(async(response:Response)=>{
    const body: Envelope<Data,Analysis> & {error?:string}=await response.json();
    if (!response.ok) {
      if(response.status===401) router.replace('/ru/login');
      if(response.status===409) setConflict(true);
      throw new Error(body.error || 'Не удалось выполнить действие');
    }
    if(!Number.isSafeInteger(body.revision) || body.revision<0 || !body.data || typeof body.data!=='object' || !body.analysis || typeof body.analysis!=='object') throw new Error('Получен неполный ответ. Повторите загрузку.');
    revision.current=body.revision;setSnapshot(body);setConflict(false);
  },[router]);
  const reload=useCallback(async()=>{
    if(busy.current)return;
    setLoading(true);setError(null);
    try {await decode(await fetch('/api/state',{cache:'no-store'}));}
    catch(cause){setError(cause instanceof Error?cause.message:'Не удалось загрузить данные');}
    finally{setLoading(false);}
  },[decode]);
  useEffect(()=>{
    const controller=new AbortController();
    async function loadInitial(){
      try {const response=await fetch('/api/state',{cache:'no-store',signal:controller.signal});if(!controller.signal.aborted)await decode(response);}
      catch(cause){if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Не удалось загрузить данные');}
      finally{if(!controller.signal.aborted)setLoading(false);}
    }
    void loadInitial();return()=>controller.abort();
  },[decode]);
  const save=useCallback(async(data:Data)=>{
    if(busy.current){setError('Дождитесь завершения предыдущего сохранения');return false;}
    busy.current=true;setSaving(true);setError(null);
    try {await decode(await fetch('/api/state',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({expected_revision:revision.current,data})}));return true;}
    catch(cause){setError(cause instanceof Error?cause.message:'Не удалось сохранить данные');return false;}
    finally{busy.current=false;setSaving(false);}
  },[decode]);
  return {data:snapshot?.data??null,analysis:snapshot?.analysis??null,revision:snapshot?.revision??0,loading,saving,error,conflict,save,reload};
}
