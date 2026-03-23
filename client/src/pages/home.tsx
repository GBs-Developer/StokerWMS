import { useState } from "react";
import { useAuth, getCompanyLabel } from "@/lib/auth";
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
  color: string;
  modules: ModuleItem[];
}

export default function HomePage() {
  const { user, companyId, logout } = useAuth();
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
      color: "from-blue-500/20 to-blue-600/10",
      modules: [
        { icon: PackagePlus, title: "Recebimento", description: "Receber NFs e gerar pallets", href: "/wms/recebimento" },
        { icon: MapPin, title: "Endereçamento", description: "Alocar pallets em endereços", href: "/wms/checkin" },
        { icon: ArrowRightLeft, title: "Transferência", description: "Movimentar pallets entre endereços", href: "/wms/transferencia" },
        { icon: BarChart3, title: "Contagem", description: "Ciclos de contagem e inventário", href: "/wms/contagem" },
        { icon: Warehouse, title: "Endereços", description: "Gerenciar endereços do armazém", href: "/wms/enderecos" },
        { icon: Search, title: "Buscar Produtos", description: "Pesquisar produtos e estoque", href: "/wms/produtos" },
      ],
    },
    {
      id: "logistica",
      title: "Logística",
      icon: Truck,
      color: "from-emerald-500/20 to-emerald-600/10",
      modules: [
        { icon: ClipboardList, title: "Fila de Pedidos", description: "Acompanhamento em tempo real", href: "/fila-pedidos" },
        { icon: Package, title: "Pedidos", description: "Gerenciar pedidos de entrega", href: "/supervisor/orders" },
        { icon: Truck, title: "Rotas", description: "Cadastro e gerenciamento de rotas", href: "/supervisor/routes" },
        { icon: ScrollText, title: "Expedição", description: "Atribuir pedidos a rotas", href: "/supervisor/route-orders" },
        { icon: AlertTriangle, title: "Exceções", description: "Gerenciar exceções pendentes", href: "/supervisor/exceptions" },
      ],
    },
    {
      id: "administracao",
      title: "Administração",
      icon: Cog,
      color: "from-amber-500/20 to-amber-600/10",
      modules: [
        { icon: Users, title: "Usuários", description: "Gerenciar operadores do sistema", href: "/supervisor/users" },
        { icon: SlidersHorizontal, title: "Regras de Quantidade Manual", description: "Configurar regras de quantidade", href: "/supervisor/manual-qty-rules" },
        { icon: Settings, title: "Mapping Studio", description: "Mapeamento DB2 → Aplicação", href: "/supervisor/mapping-studio" },
        { icon: FileText, title: "Relatórios", description: "Gerar relatórios e análises", href: "/supervisor/reports" },
        { icon: ClipboardCheck, title: "Auditoria", description: "Logs de operações do sistema", href: "/supervisor/audit" },
        { icon: ShieldCheck, title: "Permissões de Acesso", description: "Definir acessos por usuário", href: "/admin/permissoes" },
      ],
    },
  ];

  const roleModuleAccess: Record<string, string[]> = {
    administrador: [
      "/wms/recebimento", "/wms/checkin", "/wms/transferencia", "/wms/contagem", "/wms/enderecos", "/wms/produtos",
      "/fila-pedidos", "/supervisor/orders", "/supervisor/routes", "/supervisor/route-orders", "/supervisor/exceptions",
      "/supervisor/users", "/supervisor/manual-qty-rules", "/supervisor/mapping-studio", "/supervisor/reports", "/supervisor/audit",
      "/admin/permissoes",
    ],
    supervisor: [
      "/wms/recebimento", "/wms/checkin", "/wms/transferencia", "/wms/contagem", "/wms/enderecos", "/wms/produtos",
      "/fila-pedidos", "/supervisor/orders", "/supervisor/routes", "/supervisor/route-orders", "/supervisor/exceptions",
      "/supervisor/users", "/supervisor/reports", "/supervisor/audit",
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
  if (userRole === "separacao") {
    legacyStandaloneModules.push({ icon: Package, title: "Separação", description: "Separar pedidos de entrega", href: "/separacao" });
  }
  if (userRole === "conferencia") {
    legacyStandaloneModules.push({ icon: ClipboardCheck, title: "Conferência", description: "Conferir pedidos separados", href: "/conferencia" });
  }
  if (userRole === "balcao") {
    legacyStandaloneModules.push({ icon: Store, title: "Balcão", description: "Atendimento ao cliente", href: "/balcao" });
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

  return (
    <div className="min-h-screen bg-background">
      <GradientHeader
        title="Stokar"
        subtitle={`${user?.name || "Operador"} — ${userRoleLabel}`}
      >
        <div className="flex items-center gap-2">
          {companyId && (
            <Badge variant="secondary" className="bg-white/20 text-white border-white/30 text-xs">
              {getCompanyLabel(companyId)}
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={logout}
            className="bg-white/10 border-white/20 text-white hover:bg-white/20"
            data-testid="button-logout"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sair
          </Button>
        </div>
      </GradientHeader>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {legacyStandaloneModules.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

        {filteredSections.map((section) => {
          const isExpanded = expandedSections[section.id] !== false;
          const SectionIcon = section.icon;

          return (
            <div key={section.id} className="rounded-2xl border border-border/60 bg-card overflow-hidden" data-testid={`section-${section.id}`}>
              <button
                onClick={() => toggleSection(section.id)}
                className="w-full flex items-center gap-3 px-5 py-4 hover:bg-muted/50 transition-colors"
                data-testid={`button-toggle-${section.id}`}
              >
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${section.color} flex items-center justify-center`}>
                  <SectionIcon className="h-5 w-5 text-foreground/70" />
                </div>
                <div className="flex-1 text-left">
                  <h2 className="text-base font-semibold text-foreground">{section.title}</h2>
                  <p className="text-xs text-muted-foreground">{section.modules.length} módulo{section.modules.length !== 1 ? "s" : ""}</p>
                </div>
                {isExpanded ? (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                )}
              </button>

              {isExpanded && (
                <div className="px-4 pb-4">
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
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
          <div className="text-center py-12 text-muted-foreground">
            <Package className="h-16 w-16 mx-auto mb-4 opacity-40" />
            <p className="text-lg font-medium">Nenhum módulo disponível</p>
            <p className="text-sm">Entre em contato com o administrador</p>
          </div>
        )}
      </main>
    </div>
  );
}
