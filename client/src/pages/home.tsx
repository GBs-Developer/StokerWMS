import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { GradientHeader } from "@/components/ui/gradient-header";
import { ActionTile } from "@/components/ui/action-tile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Package,
  ClipboardCheck,
  Store,
  LogOut,
  ClipboardList,
  Warehouse,
  PackagePlus,
  ArrowRightLeft,
  MapPin,
  BarChart3,
  Truck,
  AlertTriangle,
  FileText,
  Users,
  Settings,
  SlidersHorizontal,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  Cog,
  BoxesIcon,
  ScrollText,
  Search,
} from "lucide-react";

interface ModuleItem {
  icon: any;
  title: string;
  description: string;
  href: string;
}

interface ModuleSection {
  id: string;
  title: string;
  icon: any;
  iconColor: string;
  iconBg: string;
  modules: ModuleItem[];
}

export default function HomePage() {
  const { user, logout, companiesData, companyId } = useAuth();
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    operacao: true,
    logistica: true,
    administracao: true,
  });

  const roleLabels: Record<string, string> = {
    administrador: "Administrador",
    supervisor: "Supervisor",
    separacao: "Separador",
    conferencia: "Conferente",
    balcao: "Balcão",
    fila_pedidos: "Fila de Pedidos",
    recebedor: "Recebedor",
    empilhador: "Empilhador",
    conferente_wms: "Conferente WMS",
  };

  const allSections: ModuleSection[] = [
    {
      id: "operacao",
      title: "Operação",
      icon: BoxesIcon,
      iconColor: "text-blue-500",
      iconBg: "bg-blue-500/10",
      modules: [
        { icon: PackagePlus, title: "Recebimento", description: "Receber NFs e gerar pallets", href: "/wms/recebimento" },
        { icon: MapPin, title: "Endereçamento", description: "Alocar pallets em endereços", href: "/wms/checkin" },
        { icon: ArrowRightLeft, title: "Transferência", description: "Movimentar pallets", href: "/wms/transferencia" },
        { icon: BarChart3, title: "Contagem", description: "Ciclos de contagem", href: "/wms/contagem" },
        { icon: Warehouse, title: "Endereços", description: "Gerenciar endereços", href: "/wms/enderecos" },
        { icon: Search, title: "Buscar Produtos", description: "Pesquisar estoque", href: "/wms/produtos" },
      ],
    },
    {
      id: "logistica",
      title: "Logística",
      icon: Truck,
      iconColor: "text-emerald-500",
      iconBg: "bg-emerald-500/10",
      modules: [
        { icon: Package, title: "Pedidos", description: "Gerenciar pedidos", href: "/supervisor/orders" },
        { icon: Truck, title: "Rotas", description: "Gerenciar rotas", href: "/supervisor/routes" },
        { icon: ScrollText, title: "Expedição", description: "Atribuir pedidos a rotas", href: "/supervisor/route-orders" },
        { icon: AlertTriangle, title: "Exceções", description: "Exceções pendentes", href: "/supervisor/exceptions" },
      ],
    },
    {
      id: "administracao",
      title: "Administração",
      icon: Cog,
      iconColor: "text-amber-500",
      iconBg: "bg-amber-500/10",
      modules: [
        { icon: Users, title: "Usuários", description: "Gerenciar operadores", href: "/supervisor/users" },
        { icon: SlidersHorizontal, title: "Regras Qtd Manual", description: "Configurar regras", href: "/supervisor/manual-qty-rules" },
        { icon: MapPin, title: "Endereços Produto", description: "Vincular produtos a endereços", href: "/supervisor/product-addresses" },
        { icon: Settings, title: "Mapping Studio", description: "Mapeamento DB2", href: "/supervisor/mapping-studio" },
        { icon: FileText, title: "Relatórios", description: "Gerar relatórios", href: "/supervisor/reports" },
        { icon: ClipboardCheck, title: "Auditoria", description: "Logs de operações", href: "/supervisor/audit" },
        { icon: ShieldCheck, title: "Permissões", description: "Definir acessos", href: "/admin/permissoes" },
        { icon: Cog, title: "Modo Separação", description: "Configurar separação", href: "/supervisor/separation-settings" },
      ],
    },
  ];

  const roleModuleAccess: Record<string, string[]> = {
    administrador: [
      "/wms/recebimento", "/wms/checkin", "/wms/transferencia", "/wms/contagem", "/wms/enderecos", "/wms/produtos",
      "/fila-pedidos", "/supervisor/orders", "/supervisor/routes", "/supervisor/route-orders", "/supervisor/exceptions",
      "/supervisor/users", "/supervisor/manual-qty-rules", "/supervisor/product-addresses", "/supervisor/mapping-studio",
      "/supervisor/reports", "/supervisor/audit", "/admin/permissoes", "/supervisor/separation-settings",
    ],
    supervisor: [
      "/wms/recebimento", "/wms/checkin", "/wms/transferencia", "/wms/contagem", "/wms/enderecos", "/wms/produtos",
      "/fila-pedidos", "/supervisor/orders", "/supervisor/routes", "/supervisor/route-orders", "/supervisor/exceptions",
      "/supervisor/users", "/supervisor/product-addresses", "/supervisor/reports", "/supervisor/audit",
      "/supervisor/separation-settings",
    ],
    separacao: ["/separacao"],
    conferencia: ["/conferencia"],
    balcao: ["/balcao"],
    fila_pedidos: ["/fila-pedidos"],
    recebedor: ["/wms/recebimento", "/wms/produtos"],
    empilhador: ["/wms/checkin", "/wms/transferencia", "/wms/produtos"],
    conferente_wms: ["/wms/contagem", "/wms/produtos"],
  };

  const userRole = user?.role || "";
  const userAllowedModules = user?.allowedModules as string[] | null | undefined;
  const allowedHrefs = Array.isArray(userAllowedModules)
    ? userAllowedModules
    : (roleModuleAccess[userRole] || []);

  const legacyStandaloneModules: ModuleItem[] = [];
  if (userRole === "separacao" || allowedHrefs.includes("/separacao")) {
    legacyStandaloneModules.push({ icon: Package, title: "Separação", description: "Separar pedidos de entrega", href: "/separacao" });
  }
  if (userRole === "conferencia" || allowedHrefs.includes("/conferencia")) {
    legacyStandaloneModules.push({ icon: ClipboardCheck, title: "Conferência", description: "Conferir pedidos separados", href: "/conferencia" });
  }
  if (userRole === "balcao" || allowedHrefs.includes("/balcao")) {
    legacyStandaloneModules.push({ icon: Store, title: "Balcão", description: "Atendimento ao cliente", href: "/balcao" });
  }
  if (allowedHrefs.includes("/fila-pedidos")) {
    legacyStandaloneModules.push({ icon: ClipboardList, title: "Fila de Pedidos", description: "Acompanhamento real-time", href: "/fila-pedidos" });
  }

  const filteredSections = allSections
    .map((section) => ({
      ...section,
      modules: section.modules.filter((m) => allowedHrefs.includes(m.href)),
    }))
    .filter((section) => section.modules.length > 0);

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const userRoleLabel = user?.role ? (roleLabels[user.role] || user.role) : "";
  const hasNoModules = filteredSections.length === 0 && legacyStandaloneModules.length === 0;
  const companyName = companiesData?.find(c => c.id === companyId)?.name;

  return (
    <div className="min-h-[100dvh] bg-background">
      <GradientHeader
        title="Stoker"
        subtitle={`${user?.name || "Operador"} — ${userRoleLabel}`}
        compact
      >
        <div className="flex items-center gap-2">
          {companyName && (
            <Badge variant="secondary" className="bg-white/10 text-white/90 border-white/15 text-[11px] font-medium backdrop-blur-sm">
              {companyName}
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={logout}
            className="text-white/70 hover:text-white hover:bg-white/10 h-9 px-3"
            data-testid="button-logout"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </GradientHeader>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-3 safe-bottom">
        {legacyStandaloneModules.length > 0 && (
          <div className="grid grid-cols-2 gap-3 animate-slide-up">
            {legacyStandaloneModules.map((module) => (
              <ActionTile
                key={module.href}
                icon={module.icon}
                title={module.title}
                description={module.description}
                href={module.href}
              />
            ))}
          </div>
        )}

        {filteredSections.map((section, sIdx) => {
          const isExpanded = expandedSections[section.id] !== false;
          const SectionIcon = section.icon;

          return (
            <div
              key={section.id}
              className="rounded-2xl border border-border/50 bg-card overflow-hidden animate-slide-up"
              style={{ animationDelay: `${sIdx * 80}ms` }}
              data-testid={`section-${section.id}`}
            >
              <button
                onClick={() => toggleSection(section.id)}
                className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-muted/50 transition-colors"
                data-testid={`button-toggle-${section.id}`}
              >
                <div className={`w-9 h-9 rounded-xl ${section.iconBg} flex items-center justify-center shrink-0`}>
                  <SectionIcon className={`h-[18px] w-[18px] ${section.iconColor}`} />
                </div>
                <div className="flex-1 text-left min-w-0">
                  <h2 className="text-sm font-semibold text-foreground">{section.title}</h2>
                  <p className="text-[11px] text-muted-foreground">{section.modules.length} módulo{section.modules.length !== 1 ? "s" : ""}</p>
                </div>
                <div className="text-muted-foreground/50 shrink-0">
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </div>
              </button>

              {isExpanded && (
                <div className="px-3 pb-3">
                  <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
                    {section.modules.map((module) => (
                      <ActionTile
                        key={module.href}
                        icon={module.icon}
                        title={module.title}
                        description={module.description}
                        href={module.href}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {hasNoModules && (
          <div className="text-center py-16 text-muted-foreground animate-fade-in">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-muted flex items-center justify-center">
              <Package className="h-8 w-8 opacity-30" />
            </div>
            <p className="text-base font-medium">Nenhum módulo disponível</p>
            <p className="text-sm mt-1">Entre em contato com o administrador</p>
          </div>
        )}
      </main>
    </div>
  );
}
