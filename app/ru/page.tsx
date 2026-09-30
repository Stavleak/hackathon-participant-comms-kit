import {redirect} from 'next/navigation';
import {authorized} from '../../lib/session';
import Workbench from '../workbench';
export default async function Page(){if(!(await authorized()))redirect('/ru/login');return <Workbench/>;}
