"use client";

import { useEffect, useState, useRef, useMemo, useCallback, memo } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { type ColumnDef } from "@tanstack/react-table";
import { authClient } from "@/lib/auth-client";
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
  filePath: string;
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

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file || !uploadName) return;

    setUploading(true);
    const form = new FormData();
    form.set("file", file);
    form.set("name", uploadName);

    const res = await fetch("/api/audio", { method: "POST", body: form });
    if (res.ok) {
      fileRef.current!.value = "";
      setUploadName("");
      setPage(1);
      fetchAudios();
    } else {
      const err = await res.json();
      alert(err.error || "Erro ao upload");
    }
    setUploading(false);
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

      <form onSubmit={handleUpload} className="flex gap-2 mb-4 flex-wrap">
        <input
          ref={fileRef}
          type="file"
          accept="audio/ogg,audio/opus,audio/mpeg"
          required
          className="flex-1 min-w-[200px] px-3 py-2 rounded-md border bg-card text-foreground text-sm"
        />
        <input
          type="text"
          placeholder="Nome do áudio"
          value={uploadName}
          onChange={e => setUploadName(e.target.value)}
          required
          className="flex-1 min-w-[150px] px-3 py-2 rounded-md border bg-card text-foreground text-sm"
        />
        <Button type="submit" disabled={uploading}>
          {uploading ? "Enviando..." : "Upload"}
        </Button>
      </form>

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
