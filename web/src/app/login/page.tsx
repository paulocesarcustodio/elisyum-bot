"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Ferrofluid from "@/components/Ferrofluid";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (data.error || data.message) {
        setError(data.message || data.error || "Erro ao fazer login");
        return;
      }
      window.location.href = "/dashboard";
    } catch (e: any) {
      setError(e?.message || "Erro de conexão ao servidor");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ position: "relative", minHeight: "100vh" }}>
      <div style={{ position: "fixed", inset: 0, zIndex: 0 }}>
        <Ferrofluid
          colors={["#000000", "#ffffff", "#666666"]}
          speed={0.3}
          scale={1.6}
          turbulence={0.8}
          fluidity={0.15}
          rimWidth={0.25}
          sharpness={2.5}
          shimmer={1.2}
          glow={2}
          flowDirection="down"
          opacity={0.6}
          mouseInteraction={true}
          mouseStrength={0.8}
          mouseRadius={0.3}
          mouseDampening={0.15}
        />
      </div>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        style={{ position: "relative", zIndex: 1, display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", padding: "1rem" }}
      >
        <form onSubmit={handleSignIn} style={{ background: "linear-gradient(145deg, var(--card) 0%, #141417 100%)", padding: "2.5rem", borderRadius: "var(--radius)", border: "1px solid var(--border)", width: "100%", maxWidth: "400px", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
          <h1 style={{ marginBottom: "0.25rem", fontSize: "1.5rem" }}>Elisyum Bot</h1>
          <p style={{ color: "var(--muted-foreground)", marginBottom: "2rem", fontSize: "0.875rem" }}>Painel de gerenciamento</p>

          {error && (
            <div style={{ background: "rgba(239,68,68,0.1)", color: "var(--destructive)", padding: "0.75rem", borderRadius: "var(--radius)", marginBottom: "1rem", fontSize: "0.875rem" }}>
              {error}
            </div>
          )}

          <div style={{ marginBottom: "1rem" }}>
            <label htmlFor="email" style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.875rem", color: "var(--muted-foreground)" }}>Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={{ width: "100%", padding: "0.75rem", background: "var(--muted)", border: "1px solid var(--border)", borderRadius: "var(--radius)", color: "var(--foreground)", outline: "none" }}
            />
          </div>

          <div style={{ marginBottom: "1.5rem" }}>
            <label htmlFor="password" style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.875rem", color: "var(--muted-foreground)" }}>Senha</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              style={{ width: "100%", padding: "0.75rem", background: "var(--muted)", border: "1px solid var(--border)", borderRadius: "var(--radius)", color: "var(--foreground)", outline: "none" }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{ width: "100%", padding: "0.75rem", background: "var(--primary)", color: "#fff", border: "none", borderRadius: "var(--radius)", cursor: "pointer", fontWeight: 600, opacity: loading ? 0.6 : 1, marginBottom: "0.5rem" }}
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
