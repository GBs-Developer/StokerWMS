import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { GradientHeader } from "@/components/ui/gradient-header";
import { SectionCard } from "@/components/ui/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
    FormDescription,
} from "@/components/ui/form";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { ArrowLeft, Map, Plus, Pencil, Trash2 } from "lucide-react";
import type { Route } from "@shared/schema";

const routeSchema = z.object({
    code: z.string().optional(),
    name: z.string().min(2, "Nome obrigatório"),
    description: z.string().optional(),
    active: z.boolean().default(true),
});

type RouteInput = z.infer<typeof routeSchema>;

export default function RoutesPage() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [editingRoute, setEditingRoute] = useState<Route | null>(null);

    const { data: routes, isLoading } = useQuery<Route[]>({
        queryKey: ["/api/routes"],
    });

    const form = useForm<RouteInput>({
        resolver: zodResolver(routeSchema),
        defaultValues: {
            name: "",
            description: "",
            active: true,
        },
    });

    const editForm = useForm<RouteInput>({
        resolver: zodResolver(routeSchema),
        defaultValues: {
            name: "",
            description: "",
            active: true,
        },
    });

    const createRouteMutation = useMutation({
        mutationFn: async (data: RouteInput) => {
            const res = await apiRequest("POST", "/api/routes", data);
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/routes"] });
            setShowCreateDialog(false);
            form.reset();
            toast({
                title: "Rota criada",
                description: "A nova rota foi cadastrada com sucesso",
            });
        },
        onError: (error: Error) => {
            const description = error.message.includes("400")
                ? "Dados inválidos: Verifique se todos os campos foram preenchidos corretamente."
                : error.message || "Erro ao criar rota";

            toast({
                title: "Erro ao criar rota",
                description: description,
                variant: "destructive",
            });
        },
    });

    const updateRouteMutation = useMutation({
        mutationFn: async (data: RouteInput) => {
            if (!editingRoute) return;
            const res = await apiRequest("PATCH", `/api/routes/${editingRoute.id}`, data);
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/routes"] });
            setEditingRoute(null);
            editForm.reset();
            toast({
                title: "Rota atualizada",
                description: "As alterações foram salvas com sucesso",
            });
        },
        onError: () => {
            toast({
                title: "Erro",
                description: "Falha ao atualizar rota",
                variant: "destructive",
            });
        },
    });

    const deleteRouteMutation = useMutation({
        mutationFn: async (id: string) => {
            await apiRequest("DELETE", `/api/routes/${id}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/routes"] });
            toast({
                title: "Rota desativada",
                description: "A rota foi desativada com sucesso",
            });
        },
    });

    const onSubmit = (data: RouteInput) => {
        createRouteMutation.mutate(data);
    };

    const onUpdateSubmit = (data: RouteInput) => {
        updateRouteMutation.mutate(data);
    };

    const handleEdit = (route: Route) => {
        setEditingRoute(route);
        editForm.reset({
            code: route.code,
            name: route.name,
            description: route.description || "",
            active: route.active,
        });
    };

    return (
        <div className="min-h-screen bg-background">
            <GradientHeader title="Gestão de Rotas" subtitle="Cadastre e gerencie as rotas de entrega">
                <Link href="/supervisor">
                    <Button
                        variant="outline"
                        size="sm"
                        className="bg-white/10 border-white/20 text-white hover:bg-white/20"
                    >
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Voltar
                    </Button>
                </Link>
            </GradientHeader>

            <main className="max-w-7xl mx-auto px-4 py-6 space-y-4">
                <div className="flex justify-end">
                    <Button onClick={() => setShowCreateDialog(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        Nova Rota
                    </Button>
                </div>

                <SectionCard title="Rotas Cadastradas" icon={<Map className="h-4 w-4 text-primary" />}>
                    {isLoading ? (
                        <div className="space-y-2">
                            {Array.from({ length: 3 }).map((_, i) => (
                                <Skeleton key={i} className="h-12 w-full" />
                            ))}
                        </div>
                    ) : routes && routes.length > 0 ? (
                        <div className="overflow-x-auto -mx-6">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Código</TableHead>
                                        <TableHead>Nome</TableHead>
                                        <TableHead>Descrição</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {routes.map((route) => (
                                        <TableRow key={route.id}>
                                            <TableCell className="font-mono">{route.code}</TableCell>
                                            <TableCell className="font-medium">{route.name}</TableCell>
                                            <TableCell>{route.description || "-"}</TableCell>
                                            <TableCell>
                                                {route.active ? (
                                                    <Badge variant="outline" className="bg-green-100 text-green-700 border-0">
                                                        Ativa
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline" className="bg-gray-100 text-gray-700 border-0">
                                                        Inativa
                                                    </Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleEdit(route)}
                                                    className="hover:bg-primary/10 hover:text-primary mr-1"
                                                >
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => {
                                                        if (!route.active) {
                                                            toast({
                                                                title: "Ação desnecessária",
                                                                description: "Esta rota já está inativa.",
                                                                variant: "default",
                                                            });
                                                            return;
                                                        }
                                                        if (confirm("Deseja realmente desativar esta rota?")) {
                                                            deleteRouteMutation.mutate(route.id);
                                                        }
                                                    }}
                                                    className={`hover:bg-red-100 hover:text-red-700 ${!route.active ? "opacity-50 cursor-pointer" : ""}`}
                                                    title={!route.active ? "Rota já inativa" : "Desativar rota"}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    ) : (
                        <div className="text-center py-12 text-muted-foreground">
                            <Map className="h-16 w-16 mx-auto mb-4 opacity-40" />
                            <p className="text-lg font-medium">Nenhuma rota cadastrada</p>
                            <p className="text-sm">Crie a primeira rota para começar</p>
                        </div>
                    )}
                </SectionCard>
            </main>

            {/* Create Route Dialog */}
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Nova Rota</DialogTitle>
                    </DialogHeader>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                            <FormField
                                control={form.control}
                                name="code"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Código (Opcional)</FormLabel>
                                        <FormControl>
                                            <Input {...field} placeholder="Ex: 001, SUL" />
                                        </FormControl>
                                        <FormDescription className="text-xs">
                                            Deixe em branco para gerar automaticamente.
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Nome da Rota</FormLabel>
                                        <FormControl>
                                            <Input {...field} placeholder="Ex: Rota Sul, Rota 1" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="description"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Descrição (Opcional)</FormLabel>
                                        <FormControl>
                                            <Input {...field} placeholder="Detalhes adicionais" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <div className="flex justify-end gap-2 pt-4">
                                <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>
                                    Cancelar
                                </Button>
                                <Button type="submit" disabled={createRouteMutation.isPending}>
                                    Criar Rota
                                </Button>
                            </div>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>

            {/* Edit Route Dialog */}
            <Dialog open={!!editingRoute} onOpenChange={(open) => !open && setEditingRoute(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Editar Rota</DialogTitle>
                    </DialogHeader>
                    <Form {...editForm}>
                        <form onSubmit={editForm.handleSubmit(onUpdateSubmit)} className="space-y-4">
                            <FormField
                                control={editForm.control}
                                name="code"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Código (Opcional)</FormLabel>
                                        <FormControl>
                                            <Input {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={editForm.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Nome da Rota</FormLabel>
                                        <FormControl>
                                            <Input {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={editForm.control}
                                name="description"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Descrição (Opcional)</FormLabel>
                                        <FormControl>
                                            <Input {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={editForm.control}
                                name="active"
                                render={({ field }) => (
                                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                                        <div className="space-y-0.5">
                                            <FormLabel>Rota Ativa</FormLabel>
                                            <FormDescription>
                                                Desativar para ocultar da seleção
                                            </FormDescription>
                                        </div>
                                        <FormControl>
                                            <Switch
                                                checked={field.value}
                                                onCheckedChange={field.onChange}
                                            />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />
                            <div className="flex justify-end gap-2 pt-4">
                                <Button type="button" variant="outline" onClick={() => setEditingRoute(null)}>
                                    Cancelar
                                </Button>
                                <Button type="submit" disabled={!editForm.formState.isDirty || updateRouteMutation.isPending}>
                                    Salvar Alterações
                                </Button>
                            </div>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
