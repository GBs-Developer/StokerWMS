import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Package, ArrowLeft, PackageOpen, ClipboardList, MapPin, ArrowRightLeft } from "lucide-react";
import { useLocation, Link } from "wouter";
import { GradientHeader } from "@/components/ui/gradient-header";
import { SectionCard } from "@/components/ui/section-card";
import { useAuth } from "@/lib/auth";

export default function Reports() {
    const [, setLocation] = useLocation();
    const { user } = useAuth();
    const isAdmin = user?.role === "administrador";
    const allowedReports: string[] | null = (user as any)?.allowedReports ?? null;
    const canSeeReport = (id: string) => allowedReports === null || allowedReports.includes(id);

    return (
        <div className="min-h-screen bg-background">
            <GradientHeader>
                <div className="flex items-center justify-between w-full">
                    <div>
                        <h1 className="text-3xl font-bold text-white">Relatórios</h1>
                        <p className="text-white/80">Gere relatórios personalizados do sistema</p>
                    </div>
                    <Link href="/">
                        <Button variant="ghost" className="text-white hover:bg-white/10">
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Voltar
                        </Button>
                    </Link>
                </div>
            </GradientHeader>

            <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {canSeeReport("picking-list") && (
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
                    )}

                    {isAdmin && canSeeReport("badge-generation") && (
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

                    {canSeeReport("loading-map") && (
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
                    )}

                    {canSeeReport("loading-map-products") && (
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
                    )}

                    {canSeeReport("order-volumes") && (
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
                    )}

                    {canSeeReport("counting-cycles") && (
                    <div
                        className="cursor-pointer"
                        onClick={() => setLocation("/supervisor/reports/counting-cycles")}
                    >
                        <SectionCard className="hover:shadow-lg transition-shadow border-purple-200">
                            <CardHeader>
                                <div className="flex items-center gap-2">
                                    <ClipboardList className="h-5 w-5 text-purple-600" />
                                    <CardTitle>Ciclos de Contagem</CardTitle>
                                </div>
                                <CardDescription>
                                    Relatório de ciclos de contagem com divergências e status de aprovação.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Button className="w-full bg-purple-600 hover:bg-purple-700" data-testid="button-counting-cycles-report">
                                    <ClipboardList className="mr-2 h-4 w-4" />
                                    Ver Contagens
                                </Button>
                            </CardContent>
                        </SectionCard>
                    </div>
                    )}

                    {canSeeReport("wms-addresses") && (
                    <div
                        className="cursor-pointer"
                        onClick={() => setLocation("/supervisor/reports/wms-addresses")}
                    >
                        <SectionCard className="hover:shadow-lg transition-shadow border-teal-200">
                            <CardHeader>
                                <div className="flex items-center gap-2">
                                    <MapPin className="h-5 w-5 text-teal-600" />
                                    <CardTitle>Endereços WMS</CardTitle>
                                </div>
                                <CardDescription>
                                    Ocupação, tipos e status dos endereços do armazém.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Button className="w-full bg-teal-600 hover:bg-teal-700" data-testid="button-wms-addresses-report">
                                    <MapPin className="mr-2 h-4 w-4" />
                                    Ver Endereços
                                </Button>
                            </CardContent>
                        </SectionCard>
                    </div>
                    )}

                    {canSeeReport("pallet-movements") && (
                    <div
                        className="cursor-pointer"
                        onClick={() => setLocation("/supervisor/reports/pallet-movements")}
                    >
                        <SectionCard className="hover:shadow-lg transition-shadow border-indigo-200">
                            <CardHeader>
                                <div className="flex items-center gap-2">
                                    <ArrowRightLeft className="h-5 w-5 text-indigo-600" />
                                    <CardTitle>Movimentações de Pallets</CardTitle>
                                </div>
                                <CardDescription>
                                    Histórico de recebimento, alocação, transferência e cancelamento de pallets.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Button className="w-full bg-indigo-600 hover:bg-indigo-700" data-testid="button-pallet-movements-report">
                                    <ArrowRightLeft className="mr-2 h-4 w-4" />
                                    Ver Movimentações
                                </Button>
                            </CardContent>
                        </SectionCard>
                    </div>
                    )}
                </div>
            </div>
        </div>
    );
}
