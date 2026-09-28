"use client";

import { useEffect, useState, useRef, useMemo, useCallback, memo } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { type ColumnDef } from "@tanstack/react-table";
import { authClient } from "@/lib/auth-client";
import { Progress } from '@/components/ui/progress';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { LucidePencil } from "@/components/icons/lucide/pencil";
import { LucideTrash2 } from "@/components/icons/lucide/trash-2";
import {
  AudioPlayer,
  AudioPlayerElement,
  AudioPlayerControlBar,
  AudioPlayerPlayButton,
  AudioPlayerTimeRange,
  AudioPlayerTimeDisplay,
  AudioPlayerDurationDisplay,
} from "@/components/ai-elements/audio-player";

type Audio = {
  id: number;
  ownerJid: string;
  audioName: string;
  canEdit: boolean;
  mimeType: string;
  seconds: number | null;
  ptt: number;
  createdAt: string;
};

const PlayerCell = memo(function PlayerCell({ audio, playing, onPlay, onPause, onEnded }: {
  audio: Audio;
  playing: string | null;
  onPlay: (name: string) => void;
  onPause: () => void;
  onEnded: () => void;
}) {
  const isThisPlaying = playing === audio.audioName;
  return (
    <div className="w-full">
      <AudioPlayer>
        <AudioPlayerElement
          src={`/api/audio/${encodeURIComponent(audio.audioName)}`}
          autoPlay={isThisPlaying}
          onEnded={onEnded}
          onPlay={() => onPlay(audio.audioName)}
          onPause={onPause}
        />
        <AudioPlayerControlBar>
          <AudioPlayerPlayButton />
          <AudioPlayerTimeRange />
          <AudioPlayerTimeDisplay />
          <AudioPlayerDurationDisplay />
        </AudioPlayerControlBar>
      </AudioPlayer>
    </div>
  );
});

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? match[2] : null;
}

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${value};path=/;max-age=31536000;SameSite=Lax`;
}

export default function DashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [audios, setAudios] = useState<Audio[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(() => {
    const saved = getCookie("rowsPerPage");
    return saved ? parseInt(saved, 10) : 50;
  });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError,setUploadError]=useState('');
  const [job,setJob]=useState<{id:string;status:string;progress:number;error?:string|null}|null>(null);
  const [renameModal, setRenameModal] = useState<{ name: string; newName: string } | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadName, setUploadName] = useState("");

  useEffect(() => {
    authClient.getSession().then(({ data }) => {
      if (!data) router.push("/login");
      else setSession(data);
    });
  }, []);

  useEffect(() => {
    if (!session) return;
    fetchAudios();
  }, [session, page, search, limit]);

  async function fetchAudios() {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) params.set("search", search);
    const res = await fetch(`/api/audio?${params}`);
    if (res.ok) {
      const data = await res.json();
      setAudios(data.audios);
      setTotal(data.total);
    }
    setLoading(false);
  }

  useEffect(()=>{
    if(!session)return;
    const id=localStorage.getItem(`audio-upload:${session.user.id}`);
    if(id){setJob({id,status:'queued',progress:0});setUploading(true);}
  },[session]);

  useEffect(()=>{
    if(!job?.id)return;
    let cancelled=false;
    let timer:ReturnType<typeof setTimeout>;
    async function poll(){
      try{
        const response=await fetch(`/api/jobs/${job!.id}`);
        const data=await response.json();
        if(!response.ok)throw new Error(data.error || 'Não foi possível consultar o processamento.');
        if(cancelled)return;
        setJob(data);
        if(['completed','failed','cancelled','expired'].includes(data.status)){
          setUploading(false);
          if(session)localStorage.removeItem(`audio-upload:${session.user.id}`);
          if(data.status==='completed'){setPage(1);await fetchAudios();}
          return;
        }
        timer=setTimeout(poll,1000);
      }catch(error){if(!cancelled){setUploadError((error as Error).message);setUploading(false);}}
    }
    void poll();
    return ()=>{cancelled=true;clearTimeout(timer);};
  },[job?.id]);

  async function handleUpload(e:React.FormEvent){
    e.preventDefault();
    const file=fileRef.current?.files?.[0];
    if(!file || !uploadName)return;
    setUploadError('');
    if(file.size>24*1024*1024){setUploadError('O arquivo deve ter no máximo 24 MB.');return;}
    setUploading(true);
    try{
      const form=new FormData();form.set('file',file);form.set('name',uploadName);
      const response=await fetch('/api/audio',{method:'POST',body:form});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error || 'Não foi possível enviar o áudio.');
      localStorage.setItem(`audio-upload:${session.user.id}`,data.jobId);
      setJob({id:data.jobId,status:'queued',progress:0});
      fileRef.current!.value='';setUploadName('');
    }catch(error){setUploadError((error as Error).message);setUploading(false);}
  }

  async function cancelUpload(){
    if(!job)return;
    const response=await fetch(`/api/jobs/${job.id}`,{method:'DELETE'});
    if(!response.ok)setUploadError('Não foi possível cancelar o processamento.');
  }

  async function handleDelete(name: string) {
    if (!confirm(`Deletar "${name}"?`)) return;
    const res = await fetch(`/api/audio?name=${encodeURIComponent(name)}`, { method: "DELETE" });
    if (res.ok) fetchAudios();
  }

  async function handleRename() {
    if (!renameModal) return;
    const res = await fetch(`/api/audio/${encodeURIComponent(renameModal.name)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newName: renameModal.newName }),
    });
    if (res.ok) {
      setRenameModal(null);
      fetchAudios();
    } else {
      const err = await res.json();
      alert(err.error || "Erro ao renomear");
    }
  }

  const handleLimitChange = useCallback((newLimit: number) => {
    setLimit(newLimit);
    setPage(1);
    setCookie("rowsPerPage", String(newLimit));
  }, []);

  const columns: ColumnDef<Audio>[] = useMemo(() => [
    {
      id: "nome",
      header: "Nome",
      meta: { headerClassName: "w-[1%] whitespace-nowrap", cellClassName: "w-[1%] whitespace-nowrap" } as Record<string, string>,
      cell: ({ row }) => (
        <span className="font-medium">{row.original.audioName}</span>
      ),
    },
    {
      id: "player",
      header: "",
      meta: { cellClassName: "p-1" } as Record<string, string>,
      cell: ({ row }) => (
        <PlayerCell
          audio={row.original}
          playing={playing}
          onPlay={(name) => setPlaying(name)}
          onPause={() => setPlaying(null)}
          onEnded={() => setPlaying(null)}
        />
      ),
    },
    {
      id: "actions",
      header: "",
      meta: { headerClassName: "w-[1%] whitespace-nowrap", cellClassName: "w-[1%] whitespace-nowrap" } as Record<string, string>,
      cell: ({ row }) => {
        const audio = row.original;
        if(!audio.canEdit)return null;
        return (
          <div className="flex gap-1 items-center justify-end">
            <button
              type="button"
              onClick={() => setRenameModal({ name: audio.audioName, newName: audio.audioName })}
              className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
              title="Renomear"
            >
              <LucidePencil className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => handleDelete(audio.audioName)}
              className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-destructive transition-colors"
              title="Deletar"
            >
              <LucideTrash2 className="size-4" />
            </button>
          </div>
        );
      },
    },
  ], []);

  const totalPages = Math.ceil(total / limit);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      style={{ maxWidth: 960, margin: "0 auto", padding: "2rem 1rem" }}
    >

      <form onSubmit={handleUpload} className="mb-4">
        <FieldGroup className="md:grid md:grid-cols-[1fr_1fr_auto] md:items-end">
          <Field>
            <FieldLabel htmlFor="audio-file">Arquivo de áudio</FieldLabel>
            <Input id="audio-file" ref={fileRef} type="file" accept="audio/*" required disabled={uploading} />
          </Field>
          <Field>
            <FieldLabel htmlFor="audio-name">Nome do áudio</FieldLabel>
            <Input id="audio-name" value={uploadName} onChange={e=>setUploadName(e.target.value)} maxLength={100} required disabled={uploading} />
          </Field>
          <Button type="submit" disabled={uploading}>{uploading?'Processando…':'Enviar áudio'}</Button>
        </FieldGroup>
      </form>
      {uploadError && <Alert variant="destructive" className="mb-4"><AlertTitle>Não foi possível concluir</AlertTitle><AlertDescription>{uploadError}</AlertDescription></Alert>}
      {job && <Alert variant={['failed','expired'].includes(job.status)?'destructive':'default'} className="mb-4">
        <AlertTitle>{{queued:'Áudio na fila',running:'Preparando o áudio',completed:'Áudio salvo',failed:'Falha no processamento',cancelled:'Envio cancelado',expired:'Tempo de processamento esgotado'}[job.status] || job.status}</AlertTitle>
        <AlertDescription className="w-full">
          {['queued','running'].includes(job.status)?<>
            <p>Você pode continuar usando o painel enquanto o áudio é preparado.</p>
            <Progress value={job.progress} aria-label="Progresso do áudio" />
            <Button type="button" variant="outline" size="sm" onClick={cancelUpload}>Cancelar</Button>
          </>:<p>{job.error || (job.status==='completed'?'O áudio já está disponível na biblioteca.':'Você pode enviar outro arquivo.')}</p>}
        </AlertDescription>
      </Alert>}

      <input
        type="text"
        placeholder="Buscar áudio..."
        value={search}
        onChange={e => { setSearch(e.target.value); setPage(1); }}
        className="w-full px-3 py-2 rounded-md border bg-card text-foreground text-sm mb-4"
      />

      <DataTable
        columns={columns}
        data={audios}
        isLoading={loading}
        emptyMessage="Nenhum áudio encontrado"
        disableSearch
        disablePagination
      />

      <div className="flex justify-between items-center mt-6">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Linhas por página:</span>
          <select
            value={limit}
            onChange={e => handleLimitChange(Number(e.target.value))}
            className="px-2 py-1 rounded-md border bg-card text-foreground text-sm"
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Anterior
            </Button>
            <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Próximo
            </Button>
          </div>
        )}
      </div>

      {renameModal && (
        <div
          style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)", zIndex: 100 }}
          onClick={() => setRenameModal(null)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={e => e.stopPropagation()}
            className="bg-card border rounded-lg p-6 max-w-sm w-[90%] shadow-2xl"
          >
            <h3 className="text-lg font-semibold mb-4">Renomear áudio</h3>
            <input
              type="text"
              value={renameModal.newName}
              onChange={e => setRenameModal({ ...renameModal, newName: e.target.value })}
              className="w-full px-3 py-2 rounded-md border bg-background text-foreground text-sm mb-4"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setRenameModal(null)}>
                Cancelar
              </Button>
              <Button onClick={handleRename}>
                Salvar
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}
