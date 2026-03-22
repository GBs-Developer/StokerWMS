import { useAuth } from "@/lib/auth";
import { GradientHeader } from "@/components/ui/gradient-header";
import { ActionTile } from "@/components/ui/action-tile";
import { Button } from "@/components/ui/button";
import {
  Package,
  ClipboardCheck,
  Store,
  Settings,
  LogOut,
  ClipboardList,
} from "lucide-react";

export default function HomePage() {
  const { user, logout } = useAuth();

  const roleLabels: Record<string, string> = {
    administrador: "Administrador",
    supervisor: "Supervisor",
    separacao: "Separador",
    conferencia: "Conferente",
    balcao: "Balcão",
    fila_pedidos: "Fila de Pedidos",
  };

  const roleModules: Record<string, { icon: any; title: string; description: string; href: string }[]> = {
    administrador: [
      {
        icon: Settings,
        title: "Painel Supervisor",
        description: "Gerenciar pedidos e operações",
        href: "/supervisor",
      },
      {
        icon: ClipboardList,
        title: "Fila de Pedidos",
        description: "Acompanhamento em tempo real",
        href: "/fila-pedidos",
      },
    ],
    supervisor: [
      {
        icon: Settings,
        title: "Painel Supervisor",
        description: "Gerenciar pedidos e operações",
        href: "/supervisor",
      },
    ],
    separacao: [
      {
        icon: Package,
        title: "Separação",
        description: "Separar pedidos de entrega",
        href: "/separacao",
      },
    ],
    conferencia: [
      {
        icon: ClipboardCheck,
        title: "Conferência",
        description: "Conferir pedidos separados",
        href: "/conferencia",
      },
    ],
    balcao: [
      {
        icon: Store,
        title: "Balcão",
        description: "Atendimento ao cliente",
        href: "/balcao",
      },
    ],
    fila_pedidos: [
      {
        icon: ClipboardList,
        title: "Fila de Pedidos",
        description: "Acompanhamento em tempo real",
        href: "/fila-pedidos",
      },
    ],
  };

  const userModules = user?.role ? (roleModules[user.role] || []) : [];
  const userRoleLabel = user?.role ? (roleLabels[user.role] || user.role) : "";

  return (
    <div className="min-h-screen bg-background">
      <GradientHeader
        title="Stokar"
        subtitle={`${user?.name || "Operador"} — ${userRoleLabel}`}
      >
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
      </GradientHeader>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <h2 className="text-lg font-semibold text-foreground mb-4">
          Módulos Disponíveis
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {userModules.map((module) => (
            <ActionTile
              key={module.href}
              icon={module.icon}
              title={module.title}
              description={module.description}
              href={module.href}
            />
          ))}
        </div>

        {userModules.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Package className="h-16 w-16 mx-auto mb-4 opacity-40" />
            <p className="text-lg font-medium">Nenhum módulo disponível</p>
            <p className="text-sm">Entre em contato com o supervisor</p>
          </div>
        )}
      </main>
    </div>
  );
}
