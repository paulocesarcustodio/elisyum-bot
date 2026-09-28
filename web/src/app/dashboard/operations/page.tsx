'use client'
import {useEffect,useState} from 'react'
import {DataTable} from '@/components/ui/data-table'
import {Alert,AlertTitle,AlertDescription} from '@/components/ui/alert'
import type {ColumnDef} from '@tanstack/react-table'
type Operation={id:string;command:string|null;source:string;status:string;attempts:number;created_at:string}
const labels:Record<string,string>={pending:'Na fila',running:'Executando',succeeded:'Concluída',failed:'Falhou',rejected:'Recusada',expired:'Expirou',uncertain:'Resultado incerto'}
const columns:ColumnDef<Operation>[]=[
    {accessorKey:'command',header:'Comando',cell:({row})=>row.original.command || 'Mensagem'},
    {accessorKey:'status',header:'Estado',cell:({row})=>labels[row.original.status] || row.original.status},
    {accessorKey:'attempts',header:'Tentativas'},
    {accessorKey:'created_at',header:'Recebida',cell:({row})=>new Date(row.original.created_at).toLocaleString('pt-BR')},
    {accessorKey:'id',header:'Identificação'},
]
export default function OperationsPage(){
    const [rows,setRows]=useState<Operation[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true)
    useEffect(()=>{
        let stopped=false
        async function refresh(){
            try{
                const response=await fetch('/api/operations'),data=await response.json()
                if(!response.ok)throw new Error(data.error)
                if(!stopped){setRows(data.operations);setError('')}
            }catch(error){if(!stopped)setError((error as Error).message)}finally{if(!stopped)setLoading(false)}
        }
        void refresh();const timer=setInterval(refresh,5000)
        return ()=>{stopped=true;clearInterval(timer)}
    },[])
    return <section className="mx-auto flex max-w-6xl flex-col gap-4 p-6">
        <h1 className="text-2xl font-semibold">Operações recentes</h1>
        <p className="text-muted-foreground">Últimas 100 mensagens processadas. Atualização a cada cinco segundos.</p>
        {error && <Alert variant="destructive"><AlertTitle>Acesso indisponível</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
        {rows.some(row=>row.status==='uncertain') && <Alert><AlertTitle>Há ações com resultado incerto</AlertTitle><AlertDescription>Confira o resultado no WhatsApp antes de solicitar a ação novamente. O bot não repete automaticamente um envio que pode ter sido concluído.</AlertDescription></Alert>}
        <DataTable columns={columns} data={rows} isLoading={loading} emptyMessage="Nenhuma operação registrada" />
    </section>
}
