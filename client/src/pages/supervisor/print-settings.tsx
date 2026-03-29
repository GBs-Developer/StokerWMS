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
import { Input } from "@/components/ui/input";
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
  // configs: tipo → nome da impressora
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

  const printers: PrinterInfo[] = printersData?.printers ?? [];
  const users: UserInfo[] = Array.isArray(usersData) ? usersData : [];

  // Usuário alvo: admin escolhe qualquer um; outros só veem o próprio
  const targetUserId: number | null = isAdmin ? selectedUserId : (currentUser?.id ?? null);
  const selectedUser = users.find((u) => u.id === targetUserId);

  // Recarrega configs do localStorage quando o usuário alvo muda
  useEffect(() => {
    const loaded: Record<string, string> = {};
    for (const type of PRINT_TYPES) {
      const cfg = getPrintConfig(type, targetUserId);
      if (cfg) loaded[type] = cfg.printer;
    }
    setConfigs(loaded);
    setSaved({});
  }, [targetUserId]);

  function handleSave(type: PrintType) {
    const printer = (configs[type] ?? "").trim();
    if (!printer) {
      clearPrintConfig(type, targetUserId);
    } else {
      setPrintConfig(type, { printer, copies: 1 }, targetUserId);
    }
    setSaved((prev) => ({ ...prev, [type]: true }));
    setTimeout(() => setSaved((prev) => ({ ...prev, [type]: false })), 2000);
    const userLabel = selectedUser ? ` para ${selectedUser.name || selectedUser.username}` : "";
    toast({
      title: "Configuração salva",
      description: `${PRINT_TYPE_LABELS[type]}: ${printer || "sem padrão"}${userLabel}`,
    });
  }

  function handleClear(type: PrintType) {
    clearPrintConfig(type, targetUserId);
    setConfigs((prev) => { const n = { ...prev }; delete n[type]; return n; });
    toast({ title: "Configuração removida", description: `${PRINT_TYPE_LABELS[type]} sem impressora padrão.` });
  }

  const hasPrinters = printers.length > 0;
  const showConfigCards = !isAdmin || targetUserId != null;

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
                Usuário
              </CardTitle>
              <CardDescription className="text-xs">
                Escolha o usuário cujas impressoras você quer configurar.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingUsers ? (
                <div className="text-sm text-muted-foreground">Carregando usuários...</div>
              ) : (
                <Select
                  value={selectedUserId != null ? String(selectedUserId) : ""}
                  onValueChange={(v) => setSelectedUserId(v ? Number(v) : null)}
                >
                  <SelectTrigger data-testid="select-user">
                    <SelectValue placeholder="Selecionar usuário..." />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {`${u.name || u.username} (${ROLE_LABELS[u.role] ?? u.role})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </CardContent>
          </Card>
        )}

        {/* Aguardando seleção */}
        {isAdmin && targetUserId == null && !loadingUsers && (
          <Card>
            <CardContent className="py-10 flex flex-col items-center gap-3 text-muted-foreground">
              <User className="h-8 w-8" />
              <p className="text-sm text-center">Selecione um usuário acima para configurar suas impressoras.</p>
            </CardContent>
          </Card>
        )}

        {/* Cards de configuração por tipo de impressão */}
        {showConfigCards && (
          <>
            {selectedUser && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground px-1">
                <User className="h-3.5 w-3.5 shrink-0" />
                <span>Configurando:</span>
                <strong className="text-foreground">{selectedUser.name || selectedUser.username}</strong>
                <span className="text-xs">({ROLE_LABELS[selectedUser.role] ?? selectedUser.role})</span>
              </div>
            )}

            {loadingPrinters && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2 px-1">
                <Printer className="h-4 w-4 animate-pulse" />
                Verificando impressoras disponíveis...
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
                      ? `Impressora atual: ${configs[type]}`
                      : "Nenhuma impressora configurada para este tipo"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label>Impressora padrão</Label>

                    {/* Se o servidor retornou a lista de impressoras, mostra Select; caso contrário, campo de texto */}
                    {hasPrinters ? (
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
                          <SelectItem value="__none__">Sem padrão</SelectItem>
                          {printers.map((p) => (
                            <SelectItem key={p.name} value={p.name}>
                              {p.name}{p.isDefault ? " (padrão do sistema)" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="flex flex-col gap-1">
                        <Input
                          placeholder="Nome exato da impressora no Windows..."
                          value={configs[type] ?? ""}
                          onChange={(e) =>
                            setConfigs((prev) => ({ ...prev, [type]: e.target.value }))
                          }
                          data-testid={`input-printer-${type}`}
                        />
                        {!loadingPrinters && (
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-muted-foreground">
                              Servidor sem impressoras detectadas — digite o nome manualmente.
                            </p>
                            <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => refetch()}>
                              <RotateCcw className="h-3 w-3 mr-1" /> Recarregar
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
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

            <p className="text-xs text-muted-foreground text-center px-4 pb-2">
              As configurações são salvas por usuário neste dispositivo/navegador.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
