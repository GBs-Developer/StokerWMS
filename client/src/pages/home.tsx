import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { Link } from "wouter";
import {
  Package, ClipboardCheck, Store, LogOut, ClipboardList,
  Warehouse, PackagePlus, ArrowRightLeft, MapPin, BarChart3,
  Truck, AlertTriangle, FileText, Users, Settings, ShieldCheck,
  Printer, Cog, BoxesIcon, ScrollText, Search, Trash2, TrendingUp,
  ChevronDown, ChevronRight, PanelLeftClose, PanelLeftOpen,
  Menu, X, Sun, Moon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface NavItem {
  icon: LucideIcon;
  label: string;
  description: string;
  href: string;
  color: string;
  bg: string;
}

interface NavGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  accentColor: string;
  accentBg: string;
  items: NavItem[];
}

const ALL_GROUPS: NavGroup[] = [
  {
    id: "operacao",
    label: "Operação",
    icon: BoxesIcon,
    accentColor: "text-blue-400",
    accentBg: "bg-blue-500/15",
    items: [
      { icon: Package,        label: "Separação",       description: "Separar pedidos de entrega",   href: "/separacao",           color: "text-blue-400",   bg: "bg-blue-500/15" },
      { icon: ClipboardCheck, label: "Conferência",     description: "Conferir pedidos separados",   href: "/conferencia",         color: "text-green-400",  bg: "bg-green-500/15" },
      { icon: Store,          label: "Balcão",          description: "Atendimento ao cliente",       href: "/balcao",              color: "text-orange-400", bg: "bg-orange-500/15" },
      { icon: ClipboardList,  label: "Fila de Pedidos", description: "Acompanhamento em tempo real", href: "/fila-pedidos",        color: "text-violet-400", bg: "bg-violet-500/15" },
      { icon: PackagePlus,    label: "Recebimento",     description: "Receber NFs e gerar pallets",  href: "/wms/recebimento",     color: "text-blue-400",   bg: "bg-blue-500/15" },
      { icon: MapPin,         label: "Endereçamento",   description: "Alocar pallets em endereços",  href: "/wms/checkin",         color: "text-teal-400",   bg: "bg-teal-500/15" },
      { icon: ArrowRightLeft, label: "Transferência",   description: "Movimentar pallets",           href: "/wms/transferencia",   color: "text-cyan-400",   bg: "bg-cyan-500/15" },
      { icon: BarChart3,      label: "Contagem",        description: "Ciclos de contagem",           href: "/wms/contagem",        color: "text-indigo-400", bg: "bg-indigo-500/15" },
      { icon: Warehouse,      label: "Endereços",       description: "Gerenciar endereços WMS",      href: "/wms/enderecos",       color: "text-slate-400",  bg: "bg-slate-500/15" },
      { icon: Search,         label: "Buscar Produtos", description: "Pesquisar estoque",            href: "/wms/produtos",        color: "text-sky-400",    bg: "bg-sky-500/15" },
    ],
  },
  {
    id: "logistica",
    label: "Logística",
    icon: Truck,
    accentColor: "text-emerald-400",
    accentBg: "bg-emerald-500/15",
    items: [
      { icon: Package,       label: "Pedidos",   description: "Gerenciar pedidos",          href: "/supervisor/orders",       color: "text-blue-400",   bg: "bg-blue-500/15" },
      { icon: Truck,         label: "Rotas",     description: "Gerenciar rotas de entrega", href: "/supervisor/routes",       color: "text-emerald-400",bg: "bg-emerald-500/15" },
      { icon: ScrollText,    label: "Expedição", description: "Atribuir pedidos a rotas",   href: "/supervisor/route-orders", color: "text-teal-400",   bg: "bg-teal-500/15" },
      { icon: AlertTriangle, label: "Exceções",  description: "Exceções pendentes",         href: "/supervisor/exceptions",   color: "text-amber-400",  bg: "bg-amber-500/15" },
    ],
  },
  {
    id: "administracao",
    label: "Administração",
    icon: Cog,
    accentColor: "text-amber-400",
    accentBg: "bg-amber-500/15",
    items: [
      { icon: Users,         label: "Usuários",         description: "Gerenciar operadores",          href: "/supervisor/users",               color: "text-blue-400",   bg: "bg-blue-500/15" },
      { icon: TrendingUp,    label: "KPIs",             description: "Desempenho e produtividade",    href: "/admin/kpi-operadores",           color: "text-violet-400", bg: "bg-violet-500/15" },
      { icon: FileText,      label: "Relatórios",       description: "Gerar relatórios",              href: "/supervisor/reports",             color: "text-slate-400",  bg: "bg-slate-500/15" },
      { icon: ClipboardCheck,label: "Auditoria",        description: "Logs de operações",             href: "/supervisor/audit",               color: "text-green-400",  bg: "bg-green-500/15" },
      { icon: MapPin,        label: "End. Produto",     description: "Vincular produtos a endereços", href: "/supervisor/product-addresses",   color: "text-teal-400",   bg: "bg-teal-500/15" },
      { icon: Settings,      label: "Mapping Studio",   description: "Mapeamento DB2",                href: "/supervisor/mapping-studio",      color: "text-cyan-400",   bg: "bg-cyan-500/15" },
      { icon: ShieldCheck,   label: "Permissões",       description: "Definir acessos",               href: "/admin/permissoes",               color: "text-amber-400",  bg: "bg-amber-500/15" },
      { icon: Cog,           label: "Modo Separação",   description: "Configurar separação",          href: "/supervisor/separation-settings", color: "text-slate-400",  bg: "bg-slate-500/15" },
      { icon: Printer,       label: "Impressoras",      description: "Configurar impressoras",        href: "/supervisor/print-settings",      color: "text-indigo-400", bg: "bg-indigo-500/15" },
      { icon: Trash2,        label: "Limpeza de Dados", description: "Resetar dados de teste",        href: "/admin/limpeza",                  color: "text-red-400",    bg: "bg-red-500/15" },
    ],
  },
];

const ROLE_LABELS: Record<string, string> = {
  administrador: "Administrador", supervisor: "Supervisor",
  separacao: "Separador", conferencia: "Conferente",
  balcao: "Balcão", fila_pedidos: "Fila de Pedidos",
  recebedor: "Recebedor", empilhador: "Empilhador",
  conferente_wms: "Conferente WMS",
};

const ROLE_MODULE_ACCESS: Record<string, string[]> = {
  administrador: [
    "/wms/recebimento","/wms/checkin","/wms/transferencia","/wms/contagem","/wms/enderecos","/wms/produtos",
    "/fila-pedidos","/supervisor/orders","/supervisor/routes","/supervisor/route-orders","/supervisor/exceptions",
    "/supervisor/users","/supervisor/product-addresses","/supervisor/mapping-studio",
    "/supervisor/reports","/supervisor/audit","/admin/permissoes","/supervisor/separation-settings",
    "/admin/limpeza","/supervisor/print-settings","/admin/kpi-operadores",
  ],
  supervisor: [
    "/wms/recebimento","/wms/checkin","/wms/transferencia","/wms/contagem","/wms/enderecos","/wms/produtos",
    "/fila-pedidos","/supervisor/orders","/supervisor/routes","/supervisor/route-orders","/supervisor/exceptions",
    "/supervisor/users","/supervisor/product-addresses","/supervisor/reports","/supervisor/audit",
    "/supervisor/separation-settings","/admin/kpi-operadores",
  ],
  separacao:      ["/separacao"],
  conferencia:    ["/conferencia"],
  balcao:         ["/balcao"],
  fila_pedidos:   ["/fila-pedidos"],
  recebedor:      ["/wms/recebimento","/wms/produtos"],
  empilhador:     ["/wms/checkin","/wms/transferencia","/wms/produtos"],
  conferente_wms: ["/wms/contagem","/wms/produtos"],
};

function buildAllowedHrefs(role: string, customModules?: string[] | null): string[] {
  const base = Array.isArray(customModules) ? customModules : (ROLE_MODULE_ACCESS[role] ?? []);
  if (role === "administrador") return [...new Set([...base, "/admin/permissoes","/admin/limpeza","/supervisor/print-settings","/admin/kpi-operadores"])];
  if (role === "supervisor")    return [...new Set([...base, "/admin/kpi-operadores"])];
  return base;
}

function ModuleCard({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <Link href={item.href}>
      <div
        className="group flex flex-col gap-3 p-4 rounded-2xl bg-card border border-border/40 hover:border-primary/40 hover:bg-card/80 hover:-translate-y-0.5 hover:shadow-lg transition-all cursor-pointer"
        data-testid={`tile-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
      >
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", item.bg)}>
          <Icon className={cn("h-5 w-5", item.color)} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground leading-tight truncate">{item.label}</p>
          <p className="text-[11px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">{item.description}</p>
        </div>
      </div>
    </Link>
  );
}

export default function HomePage() {
  const { user, logout, companiesData, companyId } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  const role = user?.role ?? "";
  const customModules = user?.allowedModules as string[] | null | undefined;
  const allowedHrefs = buildAllowedHrefs(role, customModules);
  const userName = user?.name ?? "Operador";
  const companyName = companiesData?.find(c => c.id === companyId)?.name;
  const roleLabel = ROLE_LABELS[role] ?? role;

  const visibleGroups = ALL_GROUPS
    .map(g => ({ ...g, items: g.items.filter(i => allowedHrefs.includes(i.href)) }))
    .filter(g => g.items.length > 0);

  const activeGroupData = visibleGroups.find(g => g.id === activeGroup) ?? null;
  const initials = userName.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();

  function handleGroupClick(id: string) {
    setActiveGroup(prev => (prev === id ? null : id));
    setMobileOpen(false);
  }

  const SidebarContent = ({ isMobile = false }: { isMobile?: boolean }) => (
    <>
      {/* User info */}
      <div className={cn(
        "border-b border-sidebar-border shrink-0",
        sidebarCollapsed && !isMobile ? "px-2 py-3 flex flex-col items-center gap-2" : "px-4 py-3"
      )}>
        <div className={cn(
          "flex items-center",
          sidebarCollapsed && !isMobile ? "justify-center" : "gap-3"
        )}>
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-[11px] font-bold text-primary shrink-0 select-none">
            {initials}
          </div>
          {(!sidebarCollapsed || isMobile) && (
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-sidebar-foreground truncate leading-tight">{userName}</p>
              {companyName && <p className="text-[10px] text-sidebar-foreground/40 truncate">{companyName}</p>}
            </div>
          )}
          {(!sidebarCollapsed || isMobile) && (
            <button
              onClick={logout}
              className="p-1.5 rounded-lg text-sidebar-foreground/30 hover:text-red-400 hover:bg-white/5 transition-colors shrink-0"
              title="Sair"
              data-testid="btn-logout-sidebar"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto py-2 space-y-0.5">
        {visibleGroups.map(group => {
          const GIcon = group.icon;
          const isActive = activeGroup === group.id;

          return (
            <div key={group.id}>
              <button
                onClick={() => handleGroupClick(group.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 mx-1 rounded-xl transition-colors",
                  sidebarCollapsed && !isMobile ? "justify-center w-auto mx-1.5" : "mx-2",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-white/5"
                )}
                title={sidebarCollapsed && !isMobile ? group.label : undefined}
                data-testid={`nav-group-${group.id}`}
              >
                <GIcon className={cn("h-4 w-4 shrink-0", isActive ? "text-sidebar-primary-foreground" : group.accentColor)} />
                {(!sidebarCollapsed || isMobile) && (
                  <>
                    <span className="flex-1 text-left text-[13px] font-medium">{group.label}</span>
                    <span className={cn("text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-md",
                      isActive ? "bg-white/20 text-white" : "bg-white/5 text-sidebar-foreground/40"
                    )}>
                      {group.items.length}
                    </span>
                  </>
                )}
              </button>
            </div>
          );
        })}
      </nav>

      {/* Bottom actions */}
      {(sidebarCollapsed && !isMobile) && (
        <div className="border-t border-sidebar-border px-1.5 py-3 space-y-1">
          <button
            onClick={() => setSidebarCollapsed(false)}
            className="flex items-center justify-center w-9 h-9 mx-auto rounded-lg text-sidebar-foreground/30 hover:text-sidebar-foreground hover:bg-white/5 transition-colors"
            title="Expandir menu"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
          <button
            onClick={logout}
            className="flex items-center justify-center w-9 h-9 mx-auto rounded-lg text-sidebar-foreground/30 hover:text-red-400 hover:bg-white/5 transition-colors"
            title="Sair"
            data-testid="btn-logout-collapsed"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      )}
    </>
  );

  return (
    <div className="flex h-[100dvh] bg-background overflow-hidden">

      {/* Desktop Sidebar */}
      <aside className={cn(
        "hidden lg:flex flex-col h-screen sticky top-0 bg-sidebar border-r border-sidebar-border shrink-0 transition-all duration-300 ease-in-out",
        sidebarCollapsed ? "w-[72px]" : "w-[260px]"
      )}>
        {/* Logo + collapse */}
        <div className={cn(
          "flex items-center h-14 border-b border-sidebar-border shrink-0",
          sidebarCollapsed ? "justify-center px-3" : "px-4 justify-between"
        )}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shrink-0">
              <Warehouse className="h-4 w-4 text-primary-foreground" />
            </div>
            {!sidebarCollapsed && (
              <span className="font-bold text-sidebar-foreground text-sm tracking-tight">Stoker</span>
            )}
          </div>
          {!sidebarCollapsed && (
            <button
              onClick={() => setSidebarCollapsed(true)}
              className="p-1.5 rounded-lg text-sidebar-foreground/30 hover:text-sidebar-foreground hover:bg-white/5 transition-colors"
              data-testid="btn-sidebar-collapse"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          )}
        </div>

        <SidebarContent />
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} />
          <aside className="fixed inset-y-0 left-0 z-50 w-72 bg-sidebar border-r border-sidebar-border flex flex-col shadow-2xl lg:hidden">
            <div className="flex items-center justify-between px-4 h-14 border-b border-sidebar-border shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
                  <Warehouse className="h-4 w-4 text-primary-foreground" />
                </div>
                <span className="font-bold text-sidebar-foreground text-sm">Stoker</span>
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                className="p-1.5 rounded-lg text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-white/5 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <SidebarContent isMobile />
          </aside>
        </>
      )}

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Topbar */}
        <header className="flex items-center gap-3 px-4 lg:px-5 h-14 border-b border-border/40 bg-card shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden p-2 -ml-1 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            data-testid="btn-mobile-menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex-1 min-w-0">
            {activeGroupData ? (
              <>
                <p className="text-sm font-semibold text-foreground leading-tight">{activeGroupData.label}</p>
                <p className="text-[11px] text-muted-foreground">{activeGroupData.items.length} módulos</p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-foreground leading-tight">{userName.split(" ")[0]}</p>
                <p className="text-[11px] text-muted-foreground">{roleLabel}{companyName ? ` · ${companyName}` : ""}</p>
              </>
            )}
          </div>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="flex items-center justify-center w-8 h-8 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title={theme === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro"}
            data-testid="btn-theme-toggle"
          >
            {theme === "dark"
              ? <Sun className="h-4 w-4" />
              : <Moon className="h-4 w-4" />
            }
          </button>

          <button
            onClick={logout}
            className="hidden lg:flex items-center justify-center w-8 h-8 rounded-xl text-muted-foreground hover:text-red-500 hover:bg-muted transition-colors"
            title="Sair"
            data-testid="button-logout"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {activeGroupData ? (
            /* Module grid */
            <div className="max-w-5xl mx-auto px-4 lg:px-6 py-6 animate-fade-in">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
                {activeGroupData.items.map(item => (
                  <ModuleCard key={item.href} item={item} />
                ))}
              </div>
            </div>
          ) : (
            /* Logo splash */
            <div className="flex flex-col items-center justify-center h-full gap-6 animate-fade-in select-none">
              <img
                src="/stoker-logo-transparent.png"
                alt="Stoker WMS"
                className="w-48 h-48 object-contain drop-shadow-2xl"
                draggable={false}
              />
              <div className="text-center space-y-1.5">
                <p className="text-sm text-muted-foreground/60">
                  Selecione um módulo no menu lateral para começar
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
