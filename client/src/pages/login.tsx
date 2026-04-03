import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@shared/schema";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { User, Lock, Loader2, Download, Warehouse } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function LoginPage() {
  const [, navigate] = useLocation();
  const { login } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setIsInstalled(true);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const installedHandler = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', installedHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setIsInstalled(true);
    }
  };

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginInput) => {
    setIsLoading(true);
    try {
      const result = await login(data.username, data.password);
      if (result.success) {
        if (result.requireCompanySelection) {
          navigate("/select-company");
          return;
        }
        toast({
          title: "Login realizado",
          description: "Bem-vindo ao Stoker!",
        });
        navigate("/");
      } else {
        toast({
          title: "Erro no login",
          description: "Credenciais incorretas",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Erro",
        description: "Falha na conexao com o servidor",
        variant: "destructive",
      });
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

      <div className="relative w-full max-w-sm px-6 animate-fade-in">
        <div className="flex flex-col items-center mb-10">
          <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10 flex items-center justify-center mb-5 shadow-2xl">
            <Warehouse className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-4xl font-extrabold text-white tracking-tight">Stoker</h1>
          <p className="text-white/40 mt-1.5 text-sm font-medium tracking-wider uppercase">Warehouse Management</p>
        </div>

        <div className="glass-card rounded-2xl p-6 shadow-2xl">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <div className="relative">
                        <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                        <Input
                          {...field}
                          placeholder="Seu usuario"
                          autoComplete="username"
                          className="pl-11 h-14 rounded-xl bg-background/60 border-border/40 text-base placeholder:text-muted-foreground/50 focus:bg-background focus:border-primary/40 transition-all"
                          disabled={isLoading}
                          data-testid="input-username"
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                        <Input
                          {...field}
                          type="password"
                          placeholder="Sua senha"
                          autoComplete="current-password"
                          className="pl-11 h-14 rounded-xl bg-background/60 border-border/40 text-base placeholder:text-muted-foreground/50 focus:bg-background focus:border-primary/40 transition-all"
                          disabled={isLoading}
                          data-testid="input-password"
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full h-14 text-base font-semibold rounded-xl shadow-lg shadow-primary/20 transition-all active:scale-[0.98]"
                disabled={isLoading}
                data-testid="button-login"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Entrando...
                  </>
                ) : (
                  "Entrar"
                )}
              </Button>
            </form>
          </Form>
        </div>

        {deferredPrompt && !isInstalled && (
          <button
            onClick={handleInstall}
            className="w-full mt-4 flex items-center justify-center gap-2 py-3 px-4 rounded-xl glass text-white text-sm font-medium transition-all active:scale-[0.98]"
          >
            <Download className="h-4 w-4" />
            Instalar App
          </button>
        )}

        <p className="text-center text-white/25 text-xs mt-8 font-medium">
          Stoker v2.0
        </p>
      </div>
    </div>
  );
}
