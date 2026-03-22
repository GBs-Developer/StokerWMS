import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth, getCompanyLabel } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Building2, Loader2 } from "lucide-react";

export default function CompanySelectPage() {
  const [, navigate] = useLocation();
  const { user, allowedCompanies, selectCompany, logout } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const handleSelect = async (companyId: number) => {
    setIsLoading(true);
    try {
      const success = await selectCompany(companyId);
      if (success) {
        toast({
          title: "Empresa selecionada",
          description: getCompanyLabel(companyId),
        });
        navigate("/");
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
          <h1 className="text-5xl font-bold text-white mb-2 drop-shadow-xl tracking-tight">Stokar</h1>
          <p className="text-white/70 mt-2 text-sm">
            Olá, {user?.name || "Operador"}! Selecione a empresa.
          </p>
        </div>

        <Card className="shadow-2xl border-0 bg-white/95 backdrop-blur-sm">
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-xl font-semibold">Selecionar Empresa</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {allowedCompanies.map((id) => (
              <Button
                key={id}
                variant="outline"
                className="w-full h-16 text-left justify-start gap-4 text-base"
                onClick={() => handleSelect(id)}
                disabled={isLoading}
              >
                <Building2 className="h-6 w-6 text-primary flex-shrink-0" />
                <div>
                  <div className="font-semibold">{getCompanyLabel(id)}</div>
                  <div className="text-xs text-muted-foreground">IDEMPRESA {id}</div>
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
