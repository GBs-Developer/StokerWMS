import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Package, ArrowLeft, PackageOpen } from "lucide-react";
import { useLocation, Link } from "wouter";
import { GradientHeader } from "@/components/ui/gradient-header";
import { SectionCard } from "@/components/ui/section-card";
import { useAuth } from "@/lib/auth";

export default function Reports() {
    const [, setLocation] = useLocation();
    const { user } = useAuth();
    const isAdmin = user?.role === "administrador";

    return (
        <div className="min-h-screen bg-background">
            <GradientHeader>
                <div className="flex items-center justify-between w-full">
                    <div>
                        <h1 className="text-3xl font-bold text-white">Relatórios</h1>
                        <p className="text-white/80">Gere relatórios personalizados do sistema</p>
                    </div>
                    <Link href="/supervisor">
                        <Button variant="ghost" className="text-white hover:bg-white/10">
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Voltar
                        </Button>
                    </Link>
                </div>
            </GradientHeader>

            <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div
                        className="cursor-pointer"
                        onClick={() => setLocation("/supervisor/reports/picking-list")}
                    >
                        <SectionCard className="hover:shadow-lg transition-shadow">
                            <CardHeader>
                                <div className="flex items-center gap-2">
                                    <Package className="h-5 w-5 text-primary" />
                                    <CardTitle>Romaneio de Separação</CardTitle>
                                </div>
                                <CardDescription>
                                    Gere romaneios de separação por ponto de retirada e local de estoque
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Button className="w-full">
                                    <FileText className="mr-2 h-4 w-4" />
                                    Gerar Relatório
                                </Button>
                            </CardContent>
                        </SectionCard>
                    </div>

                    {isAdmin && (
                        <div
                            className="cursor-pointer"
                            onClick={() => setLocation("/supervisor/reports/badge-generation")}
                        >
                            <SectionCard className="hover:shadow-lg transition-shadow">
                                <CardHeader>
                                    <div className="flex items-center gap-2">
                                        <FileText className="h-5 w-5 text-primary" />
                                        <CardTitle>Cartões de Acesso</CardTitle>
                                    </div>
                                    <CardDescription>
                                        Gere cartões com código de barras para autorização rápida de exceções.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <Button className="w-full">
                                        <FileText className="mr-2 h-4 w-4" />
                                        Gerar Cartões
                                    </Button>
                                </CardContent>
                            </SectionCard>
                        </div>
                    )}

                    <div
                        className="cursor-pointer"
                        onClick={() => setLocation("/supervisor/reports/loading-map")}
                    >
                        <SectionCard className="hover:shadow-lg transition-shadow border-green-200">
                            <CardHeader>
                                <div className="flex items-center gap-2">
                                    <Package className="h-5 w-5 text-green-600" />
                                    <CardTitle>Mapa de Carregamento</CardTitle>
                                </div>
                                <CardDescription>
                                    Gere e imprima o mapa de produtos carregados por pacote/carga.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Button className="w-full bg-green-600 hover:bg-green-700">
                                    <FileText className="mr-2 h-4 w-4" />
                                    Ver Mapa
                                </Button>
                            </CardContent>
                        </SectionCard>
                    </div>

                    <div
                        className="cursor-pointer"
                        onClick={() => setLocation("/supervisor/reports/loading-map-products")}
                    >
                        <SectionCard className="hover:shadow-lg transition-shadow border-blue-200">
                            <CardHeader>
                                <div className="flex items-center gap-2">
                                    <Package className="h-5 w-5 text-blue-600" />
                                    <CardTitle>Mapa de Carregamento (Produto)</CardTitle>
                                </div>
                                <CardDescription>
                                    Gere e imprima listagem consolidada por produtos a carregar do pacote/carga.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Button className="w-full bg-blue-600 hover:bg-blue-700">
                                    <FileText className="mr-2 h-4 w-4" />
                                    Gerar Relatório
                                </Button>
                            </CardContent>
                        </SectionCard>
                    </div>
                    <div
                        className="cursor-pointer"
                        onClick={() => setLocation("/supervisor/reports/order-volumes")}
                    >
                        <SectionCard className="hover:shadow-lg transition-shadow border-orange-200">
                            <CardHeader>
                                <div className="flex items-center gap-2">
                                    <PackageOpen className="h-5 w-5 text-orange-600" />
                                    <CardTitle>Etiquetas de Volume</CardTitle>
                                </div>
                                <CardDescription>
                                    Visualize e reimprima etiquetas de volume geradas na conferência.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Button className="w-full bg-orange-600 hover:bg-orange-700">
                                    <PackageOpen className="mr-2 h-4 w-4" />
                                    Ver Etiquetas
                                </Button>
                            </CardContent>
                        </SectionCard>
                    </div>
                </div>
            </div>
        </div>
    );
}
