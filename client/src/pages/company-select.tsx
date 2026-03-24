import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Building2, Loader2 } from "lucide-react";

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
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[hsl(213,67%,22%)] via-[hsl(207,62%,35%)] to-[hsl(157,50%,28%)] p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <h1 className="text-5xl font-bold text-white mb-2 drop-shadow-xl tracking-tight">Stoker</h1>
          <p className="text-white/70 mt-2 text-sm">
            Olá, {user?.name || "Operador"}! Selecione a empresa.
          </p>
        </div>

        <Card className="shadow-2xl border-0 bg-white/95 backdrop-blur-sm">
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-xl font-semibold">Selecionar Empresa</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {companiesData.map((company) => (
              <Button
                key={company.id}
                variant="outline"
                className="w-full h-16 text-left justify-start gap-4 text-base"
                onClick={() => handleSelect(company.id)}
                data-testid={`button-select-company-${company.id}`}
                disabled={isLoading}
              >
                <Building2 className="h-6 w-6 text-primary flex-shrink-0" />
                <div className="flex-1 text-left">
                  <div className="font-semibold truncate">{company.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">CNPJ: {company.cnpj || "Não cadastrado"} • ID {company.id}</div>
                </div>
                {isLoading && <Loader2 className="ml-auto h-4 w-4 animate-spin" />}
              </Button>
            ))}

            <div className="pt-2">
              <Button
                variant="ghost"
                className="w-full text-muted-foreground"
                onClick={logout}
              >
                Sair
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
