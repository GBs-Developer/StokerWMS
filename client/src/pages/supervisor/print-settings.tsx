import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { GradientHeader } from "@/components/ui/gradient-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Printer, RotateCcw, Save, CheckCircle2, User } from "lucide-react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import {
  getPrintConfig,
  setPrintConfig,
  clearPrintConfig,
  PRINT_TYPE_LABELS,
  PRINT_TYPES,
  type PrintType,
} from "@/lib/print-config";

interface PrinterInfo {
  name: string;
  isDefault: boolean;
}

interface UserInfo {
  id: number;
  username: string;
  name: string;
  role: string;
}

const ROLE_LABELS: Record<string, string> = {
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

export default function PrintSettingsPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user: currentUser } = useAuth();

  const isAdmin = currentUser?.role === "administrador";

  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [configs, setConfigs] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  const { data: printersData, isLoading: loadingPrinters, refetch } = useQuery({
    queryKey: ["/api/print/printers"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/print/printers");
      return res.json() as Promise<{ success: boolean; printers: PrinterInfo[]; default_printer: string | null }>;
    },
  });

  const { data: usersData, isLoading: loadingUsers } = useQuery({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/users");
      return res.json() as Promise<UserInfo[]>;
    },
    enabled: isAdmin,
  });

  const printers = printersData?.printers ?? [];
  const users: UserInfo[] = usersData ?? [];

  // Usuário alvo para configuração (admin pode escolher, outros só veem o próprio)
  const targetUserId = isAdmin ? selectedUserId : (currentUser?.id ?? null);

  // Quando o usuário alvo muda, recarrega as configs dele
  useEffect(() => {
    const loaded: Record<string, string> = {};
    for (const type of PRINT_TYPES) {
      const cfg = getPrintConfig(type, targetUserId);
      if (cfg) loaded[type] = cfg.printer;
    }
    setConfigs(loaded);
    setSaved({});
  }, [targetUserId]);

  const selectedUser = users.find((u) => u.id === selectedUserId);

  function handleSave(type: PrintType) {
    const printer = configs[type];
    if (!printer) {
      clearPrintConfig(type, targetUserId);
    } else {
      setPrintConfig(type, { printer, copies: 1 }, targetUserId);
    }
    setSaved((prev) => ({ ...prev, [type]: true }));
    setTimeout(() => setSaved((prev) => ({ ...prev, [type]: false })), 2000);
    const userLabel = isAdmin && selectedUser
      ? ` para ${selectedUser.name || selectedUser.username}`
      : "";
    toast({
      title: "Configuração salva",
      description: `${PRINT_TYPE_LABELS[type]}: ${printer || "sem padrão"}${userLabel}`,
    });
  }

  function handleClear(type: PrintType) {
    clearPrintConfig(type, targetUserId);
    setConfigs((prev) => { const n = { ...prev }; delete n[type]; return n; });
    const userLabel = isAdmin && selectedUser
      ? ` de ${selectedUser.name || selectedUser.username}`
      : "";
    toast({ title: "Configuração removida", description: `${PRINT_TYPE_LABELS[type]} sem padrão${userLabel}.` });
  }

  const loading = loadingPrinters || (isAdmin && loadingUsers);

  return (
    <div className="min-h-[100dvh] bg-background">
      <GradientHeader title="Configuração de Impressoras" subtitle="Defina a impressora padrão por usuário" compact>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/")}
          className="text-white/70 hover:text-white hover:bg-white/10 h-9"
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar
        </Button>
      </GradientHeader>

      <main className="max-w-lg mx-auto px-4 py-5 space-y-4">

        {/* Seletor de usuário — só aparece para administradores */}
        {isAdmin && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                Selecionar usuário
              </CardTitle>
              <CardDescription className="text-xs">
                Escolha o usuário cujas configurações de impressora você deseja definir.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Select
                value={selectedUserId != null ? String(selectedUserId) : "__none__"}
                onValueChange={(v) => setSelectedUserId(v === "__none__" ? null : Number(v))}
              >
                <SelectTrigger data-testid="select-user">
                  <SelectValue placeholder="Selecionar usuário..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    <span className="text-muted-foreground">Selecionar usuário...</span>
                  </SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      <span>{u.name || u.username}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({ROLE_LABELS[u.role] ?? u.role})
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        )}

        {/* Enquanto carrega */}
        {loading && (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
            <Printer className="h-5 w-5 animate-pulse" />
            Carregando...
          </div>
        )}

        {/* Nenhuma impressora no servidor */}
        {!loading && printers.length === 0 && (
          <Card>
            <CardContent className="py-10 flex flex-col items-center gap-3 text-muted-foreground">
              <Printer className="h-8 w-8" />
              <p className="text-sm text-center">
                Nenhuma impressora encontrada no servidor.<br />
                Verifique se o sistema está rodando na máquina correta.
              </p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RotateCcw className="h-4 w-4 mr-1.5" /> Tentar novamente
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Cards de impressora por tipo — exige usuário selecionado quando admin */}
        {!loading && printers.length > 0 && (!isAdmin || targetUserId != null) && (
          <>
            {isAdmin && selectedUser && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground px-1">
                <User className="h-4 w-4" />
                Configurando impressoras de:{" "}
                <strong className="text-foreground">{selectedUser.name || selectedUser.username}</strong>
                <span className="text-xs">({ROLE_LABELS[selectedUser.role] ?? selectedUser.role})</span>
              </div>
            )}

            {PRINT_TYPES.map((type) => (
              <Card key={type}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Printer className="h-4 w-4 text-muted-foreground" />
                    {PRINT_TYPE_LABELS[type]}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {configs[type]
                      ? `Impressora configurada: ${configs[type]}`
                      : "Sem impressora padrão configurada"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label>Impressora padrão</Label>
                    <Select
                      value={configs[type] ?? "__none__"}
                      onValueChange={(v) =>
                        setConfigs((prev) => ({ ...prev, [type]: v === "__none__" ? "" : v }))
                      }
                    >
                      <SelectTrigger data-testid={`select-printer-${type}`}>
                        <SelectValue placeholder="Selecionar impressora..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">
                          <span className="text-muted-foreground">Sem padrão</span>
                        </SelectItem>
                        {printers.map((p) => (
                          <SelectItem key={p.name} value={p.name}>
                            {p.name}
                            {p.isDefault && (
                              <span className="ml-2 text-xs text-muted-foreground">(padrão do sistema)</span>
                            )}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleSave(type)}
                      data-testid={`btn-save-printer-${type}`}
                    >
                      {saved[type] ? (
                        <><CheckCircle2 className="h-4 w-4 mr-1.5" />Salvo!</>
                      ) : (
                        <><Save className="h-4 w-4 mr-1.5" />Salvar</>
                      )}
                    </Button>
                    {configs[type] && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleClear(type)}
                        data-testid={`btn-clear-printer-${type}`}
                      >
                        <RotateCcw className="h-4 w-4 mr-1.5" />
                        Remover
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </>
        )}

        {/* Admin sem usuário selecionado */}
        {!loading && printers.length > 0 && isAdmin && targetUserId == null && (
          <Card>
            <CardContent className="py-10 flex flex-col items-center gap-3 text-muted-foreground">
              <User className="h-8 w-8" />
              <p className="text-sm text-center">Selecione um usuário acima para configurar suas impressoras.</p>
            </CardContent>
          </Card>
        )}

        {!loading && printers.length > 0 && (
          <p className="text-xs text-muted-foreground text-center px-4">
            As configurações são salvas por usuário neste navegador/dispositivo.
          </p>
        )}
      </main>
    </div>
  );
}
