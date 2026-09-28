"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Music, Users, LogOut, Activity } from "lucide-react"
import { authClient } from "@/lib/auth-client"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"

const navItems = [
  { href: "/dashboard", label: "Áudios", icon: Music },
  { href: "/dashboard/users", label: "Usuários", icon: Users, admin:true },
  { href: "/dashboard/operations", label: "Operações", icon: Activity, admin:true },
]

export function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [isAdmin,setIsAdmin]=useState(false)
  useEffect(()=>{void authClient.getSession().then(({data})=>setIsAdmin((data?.user as {role?:string}|undefined)?.role==='admin'))},[])

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <a href="/dashboard">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <Music className="size-4" />
                </div>
                <span className="font-semibold">Elisyum Bot</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navegação</SidebarGroupLabel>
          <SidebarMenu>
            {navItems.filter(item=>!item.admin || isAdmin).map((item) => {
              const isActive = pathname === item.href
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                    <a href={item.href}>
                      <item.icon />
                      <span>{item.label}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Sair">
              <button
                type="button"
                onClick={async () => {
                  await authClient.signOut()
                  router.push("/login")
                }}
                className="text-muted-foreground hover:text-destructive"
              >
                <LogOut />
                <span>Sair</span>
              </button>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
