import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Building2, Loader2, Warehouse } from "lucide-react";

export default function CompanySelectPage() {
  const [, navigate] = useLocation();
  const { user, companyId, companiesData, selectCompany, logout } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (companyId) {
      navigate("/");
    }
  }, [companyId, navigate]);

  const handleSelect = async (selectedId: number) => {
    setIsLoading(true);
    try {
      const success = await selectCompany(selectedId);
      if (success) {
        toast({
          title: "Empresa selecionada",
          description: companiesData.find(c => c.id === selectedId)?.name || `Empresa ${selectedId}`,
        });
      } else {
        toast({
          title: "Erro",
          description: "Não foi possível selecionar a empresa",
          variant: "destructive",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-[hsl(222,47%,11%)] via-[hsl(217,50%,22%)] to-[hsl(199,70%,18%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(99,179,237,0.12),_transparent_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_rgba(56,178,172,0.08),_transparent_50%)]" />

      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-1/4 -right-1/4 w-[600px] h-[600px] rounded-full bg-blue-500/5 blur-3xl" />
        <div className="absolute -bottom-1/4 -left-1/4 w-[500px] h-[500px] rounded-full bg-teal-500/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md px-4">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10 flex items-center justify-center mb-5 shadow-2xl">
            <Warehouse className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-4xl font-extrabold text-white tracking-tight">Stoker</h1>
          <p className="text-white/40 mt-2 text-sm">
            Olá, {user?.name || "Operador"}! Selecione a empresa.
          </p>
        </div>

        <div className="glass-card rounded-2xl p-6 shadow-2xl">
          <h2 className="text-lg font-semibold text-center mb-4">Selecionar Empresa</h2>
          <div className="space-y-3">
            {companiesData.map((company) => (
              <Button
                key={company.id}
                variant="outline"
                className="w-full h-auto min-h-[4rem] py-3 text-left justify-start gap-3 whitespace-normal"
                onClick={() => handleSelect(company.id)}
                data-testid={`button-select-company-${company.id}`}
                disabled={isLoading}
              >
                <Building2 className="h-6 w-6 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0 text-left">
                  <div className="font-semibold text-sm leading-tight break-words">{company.name}</div>
                  <div className="text-xs text-muted-foreground mt-1">CNPJ: {company.cnpj || "Não cadastrado"} • ID {company.id}</div>
                </div>
                {isLoading && <Loader2 className="ml-auto h-4 w-4 animate-spin flex-shrink-0" />}
              </Button>
            ))}

            <div className="pt-2">
              <Button
                variant="ghost"
                className="w-full text-muted-foreground"
                onClick={logout}
                data-testid="button-logout"
              >
                Sair
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
