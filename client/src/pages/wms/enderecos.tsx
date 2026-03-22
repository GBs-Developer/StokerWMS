import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth, getCompanyLabel } from "@/lib/auth";
import { GradientHeader } from "@/components/ui/gradient-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, MapPin, Upload, Loader2, ToggleLeft, ToggleRight } from "lucide-react";
import { useLocation } from "wouter";

export default function EnderecosPage() {
  const [, navigate] = useLocation();
  const { user, companyId, logout } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [bairro, setBairro] = useState("");
  const [rua, setRua] = useState("");
  const [bloco, setBloco] = useState("");
  const [nivel, setNivel] = useState("");
  const [type, setType] = useState("standard");

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

  const typeLabels: Record<string, string> = {
    standard: "Padrão",
    picking: "Picking",
    recebimento: "Recebimento",
    expedicao: "Expedição",
  };

  return (
    <div className="min-h-screen bg-background">
      <GradientHeader title="Endereços WMS" subtitle={companyId ? getCompanyLabel(companyId) : ""}>
        <Button variant="outline" size="sm" onClick={() => navigate("/")} className="bg-white/10 border-white/20 text-white hover:bg-white/20">
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
        </Button>
      </GradientHeader>

      <main className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">{addresses.length} endereços</h2>
          <Button onClick={() => setShowForm(!showForm)} size="sm">
            <Plus className="h-4 w-4 mr-2" /> Novo
          </Button>
        </div>

        {showForm && (
          <Card className="mb-4">
            <CardHeader><CardTitle className="text-base">Novo Endereço</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                <Input placeholder="Bairro" value={bairro} onChange={e => setBairro(e.target.value)} />
                <Input placeholder="Rua" value={rua} onChange={e => setRua(e.target.value)} />
                <Input placeholder="Bloco" value={bloco} onChange={e => setBloco(e.target.value)} />
                <Input placeholder="Nível" value={nivel} onChange={e => setNivel(e.target.value)} />
              </div>
              <div className="flex items-center gap-3">
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Padrão</SelectItem>
                    <SelectItem value="picking">Picking</SelectItem>
                    <SelectItem value="recebimento">Recebimento</SelectItem>
                    <SelectItem value="expedicao">Expedição</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={() => createMutation.mutate()} disabled={!bairro || !rua || !bloco || !nivel || createMutation.isPending}>
                  {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="text-center py-12"><Loader2 className="h-8 w-8 mx-auto animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-2">
            {addresses.map((addr: any) => (
              <div key={addr.id} className={`flex items-center justify-between p-3 rounded-lg border ${addr.active ? 'bg-card' : 'bg-muted/50 opacity-60'}`}>
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
                  <Button variant="ghost" size="sm" onClick={() => toggleMutation.mutate({ id: addr.id, active: !addr.active })}>
                    {addr.active ? <ToggleRight className="h-4 w-4 text-green-600" /> : <ToggleLeft className="h-4 w-4 text-gray-400" />}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
