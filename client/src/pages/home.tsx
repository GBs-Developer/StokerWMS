import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  Package, ClipboardCheck, Store, LogOut, ClipboardList,
  Warehouse, PackagePlus, ArrowRightLeft, MapPin, BarChart3,
  Truck, AlertTriangle, FileText, Users, Settings, ShieldCheck,
  Printer, Cog, BoxesIcon, ScrollText, Search, Trash2, TrendingUp,
  ChevronDown, ChevronRight, PanelLeftClose, PanelLeftOpen,
  Menu, X,
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
    accentColor: "text-blue-600 dark:text-blue-400",
    accentBg: "bg-blue-50 dark:bg-blue-950/40",
    items: [
      { icon: Package,        label: "Separação",       description: "Separar pedidos de entrega",    href: "/separacao",           color: "text-blue-600 dark:text-blue-400",    bg: "bg-blue-100 dark:bg-blue-900/40" },
      { icon: ClipboardCheck, label: "Conferência",     description: "Conferir pedidos separados",    href: "/conferencia",         color: "text-green-600 dark:text-green-400",  bg: "bg-green-100 dark:bg-green-900/40" },
      { icon: Store,          label: "Balcão",          description: "Atendimento ao cliente",        href: "/balcao",              color: "text-orange-600 dark:text-orange-400",bg: "bg-orange-100 dark:bg-orange-900/40" },
      { icon: ClipboardList,  label: "Fila de Pedidos", description: "Acompanhamento em tempo real",  href: "/fila-pedidos",        color: "text-violet-600 dark:text-violet-400",bg: "bg-violet-100 dark:bg-violet-900/40" },
      { icon: PackagePlus,    label: "Recebimento",     description: "Receber NFs e gerar pallets",   href: "/wms/recebimento",     color: "text-blue-600 dark:text-blue-400",    bg: "bg-blue-100 dark:bg-blue-900/40" },
      { icon: MapPin,         label: "Endereçamento",   description: "Alocar pallets em endereços",   href: "/wms/checkin",         color: "text-teal-600 dark:text-teal-400",    bg: "bg-teal-100 dark:bg-teal-900/40" },
      { icon: ArrowRightLeft, label: "Transferência",   description: "Movimentar pallets",            href: "/wms/transferencia",   color: "text-cyan-600 dark:text-cyan-400",    bg: "bg-cyan-100 dark:bg-cyan-900/40" },
      { icon: BarChart3,      label: "Contagem",        description: "Ciclos de contagem",            href: "/wms/contagem",        color: "text-indigo-600 dark:text-indigo-400",bg: "bg-indigo-100 dark:bg-indigo-900/40" },
      { icon: Warehouse,      label: "Endereços",       description: "Gerenciar endereços WMS",       href: "/wms/enderecos",       color: "text-slate-600 dark:text-slate-400",  bg: "bg-slate-100 dark:bg-slate-800/60" },
      { icon: Search,         label: "Buscar Produtos", description: "Pesquisar estoque",             href: "/wms/produtos",        color: "text-sky-600 dark:text-sky-400",      bg: "bg-sky-100 dark:bg-sky-900/40" },
    ],
  },
  {
    id: "logistica",
    label: "Logística",
    icon: Truck,
    accentColor: "text-emerald-600 dark:text-emerald-400",
    accentBg: "bg-emerald-50 dark:bg-emerald-950/40",
    items: [
      { icon: Package,       label: "Pedidos",   description: "Gerenciar pedidos",           href: "/supervisor/orders",       color: "text-blue-600 dark:text-blue-400",   bg: "bg-blue-100 dark:bg-blue-900/40" },
      { icon: Truck,         label: "Rotas",     description: "Gerenciar rotas de entrega",  href: "/supervisor/routes",       color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-900/40" },
      { icon: ScrollText,    label: "Expedição", description: "Atribuir pedidos a rotas",    href: "/supervisor/route-orders", color: "text-teal-600 dark:text-teal-400",   bg: "bg-teal-100 dark:bg-teal-900/40" },
      { icon: AlertTriangle, label: "Exceções",  description: "Exceções pendentes",          href: "/supervisor/exceptions",   color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-900/40" },
    ],
  },
  {
    id: "administracao",
    label: "Administração",
    icon: Cog,
    accentColor: "text-amber-600 dark:text-amber-400",
    accentBg: "bg-amber-50 dark:bg-amber-950/40",
    items: [
      { icon: Users,         label: "Usuários",         description: "Gerenciar operadores",           href: "/supervisor/users",              color: "text-blue-600 dark:text-blue-400",    bg: "bg-blue-100 dark:bg-blue-900/40" },
      { icon: TrendingUp,    label: "KPIs",             description: "Desempenho e produtividade",     href: "/admin/kpi-operadores",          color: "text-violet-600 dark:text-violet-400",bg: "bg-violet-100 dark:bg-violet-900/40" },
      { icon: FileText,      label: "Relatórios",       description: "Gerar relatórios",               href: "/supervisor/reports",            color: "text-slate-600 dark:text-slate-400",  bg: "bg-slate-100 dark:bg-slate-800/60" },
      { icon: ClipboardCheck,label: "Auditoria",        description: "Logs de operações",              href: "/supervisor/audit",              color: "text-green-600 dark:text-green-400",  bg: "bg-green-100 dark:bg-green-900/40" },
      { icon: MapPin,        label: "End. Produto",     description: "Vincular produtos a endereços",  href: "/supervisor/product-addresses",  color: "text-teal-600 dark:text-teal-400",    bg: "bg-teal-100 dark:bg-teal-900/40" },
      { icon: Settings,      label: "Mapping Studio",   description: "Mapeamento DB2",                 href: "/supervisor/mapping-studio",     color: "text-cyan-600 dark:text-cyan-400",    bg: "bg-cyan-100 dark:bg-cyan-900/40" },
      { icon: ShieldCheck,   label: "Permissões",       description: "Definir acessos",                href: "/admin/permissoes",              color: "text-amber-600 dark:text-amber-400",  bg: "bg-amber-100 dark:bg-amber-900/40" },
      { icon: Cog,           label: "Modo Separação",   description: "Configurar separação",           href: "/supervisor/separation-settings",color: "text-slate-600 dark:text-slate-400",  bg: "bg-slate-100 dark:bg-slate-800/60" },
      { icon: Printer,       label: "Impressoras",      description: "Configurar impressoras",         href: "/supervisor/print-settings",     color: "text-indigo-600 dark:text-indigo-400",bg: "bg-indigo-100 dark:bg-indigo-900/40" },
      { icon: Trash2,        label: "Limpeza de Dados", description: "Resetar dados de teste",         href: "/admin/limpeza",                 color: "text-red-600 dark:text-red-400",      bg: "bg-red-100 dark:bg-red-900/40" },
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
  const adminExclusive = ["/admin/permissoes","/admin/limpeza","/supervisor/print-settings","/admin/kpi-operadores"];
  const supervisorExclusive = ["/admin/kpi-operadores"];
  if (role === "administrador") return [...new Set([...base, ...adminExclusive])];
  if (role === "supervisor")    return [...new Set([...base, ...supervisorExclusive])];
  return base;
}

function DesktopSidebar({
  allowedHrefs, userName, companyName, onLogout
}: { allowedHrefs: string[]; userName: string; companyName?: string; onLogout: () => void }) {
  const [collapsed, setCollapsed] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    operacao: true, logistica: true, administracao: true,
  });
  const [location] = useLocation();

  const visibleGroups = ALL_GROUPS
    .map(g => ({ ...g, items: g.items.filter(i => allowedHrefs.includes(i.href)) }))
    .filter(g => g.items.length > 0);

  const toggle = (id: string) => setExpandedGroups(p => ({ ...p, [id]: !p[id] }));
  const initials = userName.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();

  return (
    <aside
      className={cn(
        "hidden lg:flex flex-col h-screen sticky top-0 bg-sidebar border-r border-sidebar-border shrink-0 transition-all duration-300",
        collapsed ? "w-[72px]" : "w-[260px]"
      )}
    >
      {/* Logo */}
      <div className={cn(
        "flex items-center h-14 border-b border-sidebar-border shrink-0",
        collapsed ? "justify-center px-3" : "px-4 justify-between"
      )}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <Warehouse className="h-4 w-4 text-primary-foreground" />
          </div>
          {!collapsed && <span className="font-bold text-sidebar-foreground text-sm tracking-tight">Stoker</span>}
        </div>
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            className="p-1.5 rounded-lg text-sidebar-foreground/30 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
            data-testid="btn-sidebar-collapse"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* User */}
      <div className={cn(
        "border-b border-sidebar-border shrink-0",
        collapsed ? "px-2 py-3 flex flex-col items-center gap-2" : "px-4 py-3 flex items-center gap-3"
      )}>
        <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-[11px] font-bold text-primary shrink-0">
          {initials}
        </div>
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-sidebar-foreground truncate">{userName}</p>
            {companyName && <p className="text-[10px] text-sidebar-foreground/40 truncate">{companyName}</p>}
          </div>
        )}
        {!collapsed && (
          <button
            onClick={onLogout}
            className="p-1.5 rounded-lg text-sidebar-foreground/30 hover:text-red-400 hover:bg-sidebar-accent transition-colors shrink-0"
            title="Sair"
            data-testid="btn-logout-sidebar"
          >
            <LogOut className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2">
        {visibleGroups.map(group => {
          const GIcon = group.icon;
          const isExpanded = expandedGroups[group.id] !== false;

          return (
            <div key={group.id} className="mb-1">
              {/* Group header */}
              {!collapsed && (
                <button
                  onClick={() => toggle(group.id)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 mx-1 rounded-lg text-sidebar-foreground/40 hover:text-sidebar-foreground/70 transition-colors"
                >
                  <GIcon className={cn("h-3.5 w-3.5 shrink-0", group.accentColor)} />
                  <span className="flex-1 text-left text-[10px] font-bold uppercase tracking-widest">{group.label}</span>
                  {isExpanded
                    ? <ChevronDown className="h-3 w-3 shrink-0" />
                    : <ChevronRight className="h-3 w-3 shrink-0" />
                  }
                </button>
              )}

              {/* Group separator (collapsed) */}
              {collapsed && (
                <div className="mx-2 my-1 border-t border-sidebar-border/50" />
              )}

              {/* Items */}
              <div className={cn(collapsed ? "px-1.5 space-y-0.5" : "px-2 pb-1 space-y-0.5")}>
                {(collapsed || isExpanded) && group.items.map(item => {
                  const IIcon = item.icon;
                  const isActive = location === item.href || location.startsWith(item.href + "/");
                  return collapsed ? (
                    <Link key={item.href} href={item.href}>
                      <div
                        title={item.label}
                        className={cn(
                          "flex items-center justify-center w-9 h-9 mx-auto rounded-lg cursor-pointer transition-colors",
                          isActive
                            ? "bg-sidebar-primary text-sidebar-primary-foreground"
                            : "text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                        )}
                        data-testid={`nav-${item.href.replace(/\//g, "-").slice(1)}`}
                      >
                        <IIcon className="h-4 w-4" />
                      </div>
                    </Link>
                  ) : (
                    <Link key={item.href} href={item.href}>
                      <div
                        className={cn(
                          "flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors",
                          isActive
                            ? "bg-sidebar-primary text-sidebar-primary-foreground"
                            : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                        )}
                        data-testid={`nav-${item.href.replace(/\//g, "-").slice(1)}`}
                      >
                        <IIcon className="h-4 w-4 shrink-0" />
                        <span className="text-[13px] truncate">{item.label}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Collapsed: expand + logout */}
      {collapsed && (
        <div className="border-t border-sidebar-border px-1.5 py-3 space-y-1">
          <button
            onClick={() => setCollapsed(false)}
            className="flex items-center justify-center w-9 h-9 mx-auto rounded-lg text-sidebar-foreground/30 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
            title="Expandir"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
          <button
            onClick={onLogout}
            className="flex items-center justify-center w-9 h-9 mx-auto rounded-lg text-sidebar-foreground/30 hover:text-red-400 hover:bg-sidebar-accent transition-colors"
            title="Sair"
            data-testid="btn-logout-sidebar-collapsed"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      )}
    </aside>
  );
}

function ModuleCard({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <Link href={item.href}>
      <div
        className="group flex flex-col gap-2 p-4 rounded-2xl bg-card border border-border/50 hover:border-primary/30 hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer"
        data-testid={`tile-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
      >
        <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center", item.bg)}>
          <Icon className={cn("h-5 w-5", item.color)} />
        </div>
        <div>
          <p className="text-[13px] font-semibold text-foreground leading-tight">{item.label}</p>
          <p className="text-[11px] text-muted-foreground leading-tight mt-0.5 line-clamp-2">{item.description}</p>
        </div>
      </div>
    </Link>
  );
}

export default function HomePage() {
  const { user, logout, companiesData, companyId } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    operacao: true, logistica: true, administracao: true,
  });

  const role = user?.role ?? "";
  const customModules = user?.allowedModules as string[] | null | undefined;
  const allowedHrefs = buildAllowedHrefs(role, customModules);
  const userName = user?.name ?? "Operador";
  const companyName = companiesData?.find(c => c.id === companyId)?.name;
  const roleLabel = ROLE_LABELS[role] ?? role;

  const visibleGroups = ALL_GROUPS
    .map(g => ({ ...g, items: g.items.filter(i => allowedHrefs.includes(i.href)) }))
    .filter(g => g.items.length > 0);

  const hasNoModules = visibleGroups.length === 0;

  return (
    <div className="flex h-[100dvh] bg-background overflow-hidden">

      {/* Desktop Sidebar */}
      <DesktopSidebar
        allowedHrefs={allowedHrefs}
        userName={userName}
        companyName={companyName}
        onLogout={logout}
      />

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60" onClick={() => setMobileMenuOpen(false)} />
          <aside className="fixed inset-y-0 left-0 z-50 w-72 bg-sidebar border-r border-sidebar-border flex flex-col shadow-2xl lg:hidden">
            {/* Drawer header */}
            <div className="flex items-center justify-between px-4 h-14 border-b border-sidebar-border shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
                  <Warehouse className="h-4 w-4 text-primary-foreground" />
                </div>
                <span className="font-bold text-sidebar-foreground text-sm">Stoker</span>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-lg text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {/* Drawer user */}
            <div className="px-4 py-3 border-b border-sidebar-border flex items-center gap-3 shrink-0">
              <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-[11px] font-bold text-primary">
                {userName.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-sidebar-foreground truncate">{userName}</p>
                {companyName && <p className="text-[10px] text-sidebar-foreground/40 truncate">{companyName}</p>}
              </div>
              <button
                onClick={logout}
                className="p-1.5 rounded-lg text-sidebar-foreground/30 hover:text-red-400 hover:bg-sidebar-accent transition-colors"
                title="Sair"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
            {/* Drawer nav */}
            <nav className="flex-1 overflow-y-auto py-2">
              {visibleGroups.map(group => {
                const GIcon = group.icon;
                return (
                  <div key={group.id} className="mb-1">
                    <div className="flex items-center gap-2 px-3 py-1.5 text-sidebar-foreground/40">
                      <GIcon className={cn("h-3.5 w-3.5 shrink-0", group.accentColor)} />
                      <span className="text-[10px] font-bold uppercase tracking-widest">{group.label}</span>
                    </div>
                    <div className="px-2 pb-1 space-y-0.5">
                      {group.items.map(item => {
                        const IIcon = item.icon;
                        return (
                          <Link key={item.href} href={item.href}>
                            <div
                              onClick={() => setMobileMenuOpen(false)}
                              className="flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                              data-testid={`mobile-nav-${item.href.replace(/\//g, "-").slice(1)}`}
                            >
                              <IIcon className="h-4 w-4 shrink-0" />
                              <span className="text-[13px]">{item.label}</span>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </nav>
          </aside>
        </>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Topbar */}
        <header className="flex items-center gap-3 px-4 lg:px-6 h-14 border-b border-border/50 bg-card shrink-0">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="lg:hidden p-2 -ml-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            data-testid="btn-mobile-menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground leading-tight">Bem-vindo, {userName.split(" ")[0]}</p>
            <p className="text-[11px] text-muted-foreground">{roleLabel}{companyName ? ` · ${companyName}` : ""}</p>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={logout}
            className="hidden lg:flex text-muted-foreground hover:text-foreground h-8 px-3 gap-1.5"
            data-testid="button-logout"
          >
            <LogOut className="h-4 w-4" />
            <span className="text-xs">Sair</span>
          </Button>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto px-4 lg:px-6 py-6 space-y-8">

            {hasNoModules && (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-muted flex items-center justify-center">
                  <Package className="h-8 w-8 text-muted-foreground/30" />
                </div>
                <p className="text-base font-semibold text-foreground">Nenhum módulo disponível</p>
                <p className="text-sm text-muted-foreground mt-1">Entre em contato com o administrador do sistema.</p>
              </div>
            )}

            {visibleGroups.map((group, idx) => {
              const GIcon = group.icon;
              const isExpanded = expandedSections[group.id] !== false;

              return (
                <section key={group.id} className="space-y-3 animate-slide-up" style={{ animationDelay: `${idx * 60}ms` }}>
                  {/* Section header */}
                  <button
                    onClick={() => setExpandedSections(p => ({ ...p, [group.id]: !p[group.id] }))}
                    className="flex items-center gap-2 group"
                    data-testid={`section-toggle-${group.id}`}
                  >
                    <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center", group.accentBg)}>
                      <GIcon className={cn("h-3.5 w-3.5", group.accentColor)} />
                    </div>
                    <h2 className="text-sm font-bold text-foreground">{group.label}</h2>
                    <span className="text-[11px] text-muted-foreground ml-1">({group.items.length})</span>
                    <div className="ml-1 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors">
                      {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </div>
                  </button>

                  {/* Module cards grid */}
                  {isExpanded && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                      {group.items.map(item => (
                        <ModuleCard key={item.href} item={item} />
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </main>
      </div>
    </div>
  );
}
