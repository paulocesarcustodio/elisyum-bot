"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { type ColumnDef } from "@tanstack/react-table";
import { authClient } from "@/lib/auth-client";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";

type User = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  createdAt: string;
  updatedAt: string;
  role: string;
  banned: boolean | null;
  banReason: string | null;
  banExpires: string | null;
};

type UserModal = {
  mode: "create" | "edit";
  user?: User;
} | null;

export default function UsersPage() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<UserModal>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "user" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    authClient.getSession().then(({ data }) => {
      if (!data) router.push("/login");
      else setSession(data);
    });
  }, []);

  useEffect(() => {
    if (!session) return;
    fetchUsers();
  }, [session]);

  async function fetchUsers() {
    setLoading(true);
    const res = await fetch("/api/admin/users");
    if (res.ok) {
      const data = await res.json();
      setUsers(data.users || []);
    }
    setLoading(false);
  }

  function openCreate() {
    setForm({ name: "", email: "", password: "", role: "user" });
    setModal({ mode: "create" });
  }

  function openEdit(user: User) {
    setForm({ name: user.name, email: user.email, password: "", role: user.role });
    setModal({ mode: "edit", user });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    const url = modal?.mode === "create"
      ? "/api/admin/users"
      : `/api/admin/users/${modal!.user!.id}`;
    const method = modal?.mode === "create" ? "POST" : "PATCH";

    const body: Record<string, any> = { name: form.name, email: form.email, role: form.role };
    if (form.password) body.password = form.password;

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setSubmitting(false);
    if (res.ok) {
      setModal(null);
      fetchUsers();
    } else {
      const err = await res.json();
      alert(err.error || "Erro ao salvar usuário");
    }
  }

  async function handleDelete(user: User) {
    if (!confirm(`Deletar "${user.name}" (${user.email})?`)) return;
    const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
    if (res.ok) fetchUsers();
  }

  const columns: ColumnDef<User>[] = useMemo(() => [
    {
      id: "nome",
      header: "Nome",
      accessorKey: "name",
      meta: { headerClassName: "w-[1%] whitespace-nowrap", cellClassName: "w-[1%] whitespace-nowrap" } as Record<string, string>,
      cell: ({ row }) => (
        <span className="font-medium">{row.original.name}</span>
      ),
    },
    {
      id: "email",
      header: "Email",
      accessorKey: "email",
      meta: { headerClassName: "w-[1%] whitespace-nowrap" } as Record<string, string>,
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.original.email}</span>
      ),
    },
    {
      id: "role",
      header: "Função",
      accessorKey: "role",
      meta: { headerClassName: "w-[1%] whitespace-nowrap", cellClassName: "w-[1%] whitespace-nowrap" } as Record<string, string>,
      cell: ({ row }) => {
        const role = row.original.role;
        const isAdmin = role === "admin";
        return (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
              isAdmin
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {isAdmin ? "Admin" : "Usuário"}
          </span>
        );
      },
    },
    {
      id: "createdAt",
      header: "Criado em",
      accessorKey: "createdAt",
      sortDescFirst: true,
      meta: { headerClassName: "w-[1%] whitespace-nowrap", cellClassName: "w-[1%] whitespace-nowrap" } as Record<string, string>,
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">
          {new Date(row.original.createdAt).toLocaleDateString("pt-BR")}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      meta: { headerClassName: "w-[1%] whitespace-nowrap", cellClassName: "w-[1%] whitespace-nowrap" } as Record<string, string>,
      cell: ({ row }) => {
        const user = row.original;
        return (
          <div className="flex gap-1 items-center justify-end">
            <button
              type="button"
              onClick={() => openEdit(user)}
              className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
              title="Editar"
            >
              <Pencil className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => handleDelete(user)}
              className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-destructive transition-colors"
              title="Deletar"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        );
      },
    },
  ], []);

  function modalTitle() {
    if (!modal) return "";
    return modal.mode === "create" ? "Novo Usuário" : "Editar Usuário";
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      style={{ maxWidth: 960, margin: "0 auto", padding: "2rem 1rem" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <div>
          <h1 className="text-2xl font-bold">Usuários</h1>
          <p className="text-muted-foreground text-sm">{users.length} usuários</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4 mr-2" />
          Novo Usuário
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={users}
        isLoading={loading}
        searchPlaceholder="Buscar usuário..."
        emptyMessage="Nenhum usuário encontrado"
      />

      {modal && (
        <div
          style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)", zIndex: 100 }}
          onClick={() => setModal(null)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={e => e.stopPropagation()}
            className="bg-card border rounded-lg p-6 max-w-md w-[90%] shadow-2xl"
          >
            <h3 className="text-lg font-semibold mb-4">{modalTitle()}</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm text-muted-foreground block mb-1">Nome</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  required
                  className="w-full px-3 py-2 rounded-md border bg-background text-foreground text-sm"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground block mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  required
                  className="w-full px-3 py-2 rounded-md border bg-background text-foreground text-sm"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground block mb-1">
                  {modal.mode === "create" ? "Senha" : "Nova senha (deixe em branco para manter)"}
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  required={modal.mode === "create"}
                  className="w-full px-3 py-2 rounded-md border bg-background text-foreground text-sm"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground block mb-1">Função</label>
                <select
                  value={form.role}
                  onChange={e => setForm({ ...form, role: e.target.value })}
                  className="w-full px-3 py-2 rounded-md border bg-background text-foreground text-sm"
                >
                  <option value="user">Usuário</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <Button type="button" variant="outline" onClick={() => setModal(null)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}
