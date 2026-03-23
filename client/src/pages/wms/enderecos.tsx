import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth, getCompanyLabel } from "@/lib/auth";
import { GradientHeader } from "@/components/ui/gradient-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, MapPin, Loader2, ToggleLeft, ToggleRight, Trash2, Search } from "lucide-react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";

export default function EnderecosPage() {
  const [, navigate] = useLocation();
  const { companyId } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [bairro, setBairro] = useState("");
  const [rua, setRua] = useState("");
  const [bloco, setBloco] = useState("");
  const [nivel, setNivel] = useState("");
  const [type, setType] = useState("standard");
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

  const { data: addresses = [], isLoading } = useQuery({
    queryKey: ["wms-addresses", companyId],
    queryFn: async () => {
      const res = await fetch("/api/wms-addresses", { credentials: "include" });
      if (!res.ok) throw new Error("Erro ao buscar endereços");
      return res.json();
    },
    enabled: !!companyId,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/wms-addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bairro, rua, bloco, nivel, type }),
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wms-addresses"] });
      setBairro(""); setRua(""); setBloco(""); setNivel("");
      setShowForm(false);
      toast({ title: "Endereço criado" });
    },
    onError: (e: Error) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const res = await fetch(`/api/wms-addresses/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Erro");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wms-addresses"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/wms-addresses/${id}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao remover endereço");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wms-addresses"] });
      setDeleteTarget(null);
      toast({ title: "Endereço apagado" });
    },
    onError: (e: Error) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    },
  });

  const typeLabels: Record<string, string> = {
    standard: "Padrão",
    picking: "Picking",
    recebimento: "Recebimento",
    expedicao: "Expedição",
  };

  const filteredAddresses = searchTerm
    ? addresses.filter((addr: any) =>
        addr.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        addr.bairro?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        addr.rua?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : addresses;

  return (
    <div className="min-h-screen bg-background">
      <GradientHeader title="Endereços WMS" subtitle={companyId ? getCompanyLabel(companyId) : ""}>
        <Button variant="outline" size="sm" onClick={() => navigate("/")} className="bg-white/10 border-white/20 text-white hover:bg-white/20" data-testid="button-back">
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
        </Button>
      </GradientHeader>

      <main className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
          <h2 className="text-lg font-semibold">{filteredAddresses.length} endereço{filteredAddresses.length !== 1 ? "s" : ""}</h2>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar endereço..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-9 w-48"
                data-testid="input-search-address"
              />
            </div>
            <Button onClick={() => setShowForm(!showForm)} size="sm" data-testid="button-new-address">
              <Plus className="h-4 w-4 mr-2" /> Novo
            </Button>
          </div>
        </div>

        {showForm && (
          <Card className="mb-4">
            <CardHeader><CardTitle className="text-base">Novo Endereço</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                <Input placeholder="Bairro" value={bairro} onChange={e => setBairro(e.target.value)} data-testid="input-bairro" />
                <Input placeholder="Rua" value={rua} onChange={e => setRua(e.target.value)} data-testid="input-rua" />
                <Input placeholder="Bloco" value={bloco} onChange={e => setBloco(e.target.value)} data-testid="input-bloco" />
                <Input placeholder="Nível" value={nivel} onChange={e => setNivel(e.target.value)} data-testid="input-nivel" />
              </div>
              <div className="flex items-center gap-3">
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger className="w-40" data-testid="select-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Padrão</SelectItem>
                    <SelectItem value="picking">Picking</SelectItem>
                    <SelectItem value="recebimento">Recebimento</SelectItem>
                    <SelectItem value="expedicao">Expedição</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={() => createMutation.mutate()} disabled={!bairro || !rua || !bloco || !nivel || createMutation.isPending} data-testid="button-create-address">
                  {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="text-center py-12"><Loader2 className="h-8 w-8 mx-auto animate-spin text-muted-foreground" /></div>
        ) : filteredAddresses.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <MapPin className="h-12 w-12 mx-auto mb-4 opacity-40" />
            <p>{searchTerm ? "Nenhum endereço encontrado" : "Nenhum endereço cadastrado"}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredAddresses.map((addr: any) => (
              <div key={addr.id} className={`flex items-center justify-between p-3 rounded-lg border group ${addr.active ? 'bg-card' : 'bg-muted/50 opacity-60'}`} data-testid={`row-address-${addr.id}`}>
                <div className="flex items-center gap-3">
                  <MapPin className="h-5 w-5 text-primary" />
                  <div>
                    <span className="font-mono font-semibold">{addr.code}</span>
                    <div className="text-xs text-muted-foreground">
                      {addr.bairro} / {addr.rua} / {addr.bloco} / {addr.nivel}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={addr.type === "standard" ? "default" : "secondary"}>
                    {typeLabels[addr.type] || addr.type}
                  </Badge>
                  <Button variant="ghost" size="sm" onClick={() => toggleMutation.mutate({ id: addr.id, active: !addr.active })} data-testid={`button-toggle-${addr.id}`}>
                    {addr.active ? <ToggleRight className="h-4 w-4 text-green-600" /> : <ToggleLeft className="h-4 w-4 text-gray-400" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => setDeleteTarget(addr)}
                    data-testid={`button-delete-${addr.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apagar Endereço</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja apagar o endereço <span className="font-mono font-semibold">{deleteTarget?.code}</span>? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} data-testid="button-cancel-delete-address">
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete-address"
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
