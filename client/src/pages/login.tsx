import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@shared/schema";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { User, Lock, Loader2, Download, Sun, Moon } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function LoginPage() {
  const [, navigate] = useLocation();
  const { login } = useAuth();
  const { toast } = useToast();
  const { theme, toggle: toggleTheme } = useTheme();
  const [isLoading, setIsLoading] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone) {
      setIsInstalled(true);
    }
    const handler = (e: Event) => { e.preventDefault(); setDeferredPrompt(e as BeforeInstallPromptEvent); };
    const installedHandler = () => { setIsInstalled(true); setDeferredPrompt(null); };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", installedHandler);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") { setDeferredPrompt(null); setIsInstalled(true); }
  };

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  const onSubmit = async (data: LoginInput) => {
    setIsLoading(true);
    try {
      const result = await login(data.username, data.password);
      if (result.success) {
        if (result.requireCompanySelection) { navigate("/select-company"); return; }
        toast({ title: "Login realizado", description: "Bem-vindo ao Stoker!" });
        navigate("/");
      } else {
        toast({ title: "Credenciais incorretas", description: "Usuário ou senha inválidos.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro de conexão", description: "Não foi possível conectar ao servidor.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center px-5 relative">

      {/* Theme toggle — canto superior direito */}
      <button
        onClick={toggleTheme}
        className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-xl bg-card border border-border/40 text-muted-foreground hover:text-foreground hover:border-border transition-colors"
        title={theme === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro"}
        data-testid="btn-theme-toggle-login"
      >
        {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>

      <div className="w-full max-w-sm animate-fade-in space-y-8">

        {/* Logo */}
        <div className="flex flex-col items-center gap-4">
          <img
            src="/stoker-logo-transparent.png"
            alt="Stoker WMS"
            className="w-32 h-32 object-contain drop-shadow-2xl select-none"
            draggable={false}
          />
          <div className="text-center">
            <h1 className="text-2xl font-extrabold text-foreground tracking-tight">Stoker</h1>
            <p className="text-xs text-muted-foreground/60 mt-0.5 tracking-wider uppercase font-medium">
              Warehouse Management System
            </p>
          </div>
        </div>

        {/* Card de login */}
        <div className="rounded-2xl border border-border/40 bg-card shadow-xl p-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <div className="relative">
                        <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 pointer-events-none" />
                        <Input
                          {...field}
                          placeholder="Usuário"
                          autoComplete="username"
                          className="pl-10 h-12 rounded-xl bg-background border-border/50 text-sm placeholder:text-muted-foreground/40 focus:border-primary/60 transition-colors"
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
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 pointer-events-none" />
                        <Input
                          {...field}
                          type="password"
                          placeholder="Senha"
                          autoComplete="current-password"
                          className="pl-10 h-12 rounded-xl bg-background border-border/50 text-sm placeholder:text-muted-foreground/40 focus:border-primary/60 transition-colors"
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
                className="w-full h-12 text-sm font-semibold rounded-xl mt-2"
                disabled={isLoading}
                data-testid="button-login"
              >
                {isLoading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Entrando...</>
                ) : (
                  "Entrar"
                )}
              </Button>
            </form>
          </Form>
        </div>

        {/* PWA install */}
        {deferredPrompt && !isInstalled && (
          <button
            onClick={handleInstall}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-border/40 bg-card text-muted-foreground text-sm hover:text-foreground hover:border-border transition-colors"
            data-testid="button-install"
          >
            <Download className="h-4 w-4" />
            Instalar aplicativo
          </button>
        )}

        <p className="text-center text-muted-foreground/30 text-xs font-medium">Stoker v2.0</p>
      </div>
    </div>
  );
}
