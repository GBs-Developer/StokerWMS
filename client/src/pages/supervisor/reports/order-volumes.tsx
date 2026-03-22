import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, ArrowLeft, PackageOpen, ShoppingBag, Archive, Box, Tag } from "lucide-react";
import { GradientHeader } from "@/components/ui/gradient-header";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface OrderVolume {
    id: string;
    orderId: string;
    erpOrderId: string;
    sacola: number;
    caixa: number;
    saco: number;
    avulso: number;
    totalVolumes: number;
    createdAt: string;
    updatedAt: string;
}

export default function OrderVolumesReport() {
    const { toast } = useToast();
    const [printingId, setPrintingId] = useState<string | null>(null);

    const { data: volumes, isLoading } = useQuery<OrderVolume[]>({
        queryKey: ["/api/order-volumes"],
    });

    const handlePrint = (vol: OrderVolume) => {
        setPrintingId(vol.id);
        const now = format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
        const createdAt = vol.createdAt
            ? format(new Date(vol.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
            : now;

        const labels: string[] = [];
        for (let i = 1; i <= vol.totalVolumes; i++) {
            labels.push(`
        <div class="label">
          <div class="title">STOKER WMS</div>
          <div class="row"><span class="label-key">Pedido:</span> <span class="value mono">${vol.erpOrderId}</span></div>
          <hr/>
          <div class="row small"><span class="label-key">🛍 Sacola:</span> ${vol.sacola} &nbsp;|&nbsp; <span class="label-key">📦 Caixa:</span> ${vol.caixa}</div>
          <div class="row small"><span class="label-key">🎒 Saco:</span>  ${vol.saco}  &nbsp;|&nbsp; <span class="label-key">📋 Avulso:</span> ${vol.avulso}</div>
          <hr/>
          <div class="volume-number">${i}/${vol.totalVolumes}</div>
          <hr/>
          <div class="row small">Gerado em: ${createdAt}</div>
        </div>
        ${i < vol.totalVolumes ? '<div class="page-break"></div>' : ""}
      `);
        }

        const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Etiquetas Volume - Ped. ${vol.erpOrderId}</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: Arial, sans-serif; font-size: 11px; }
.label { width: 100mm; height: 150mm; padding: 6mm; display: flex; flex-direction: column; justify-content: space-between; border: 1px dashed #999; page-break-inside: avoid; }
.title { font-size: 14px; font-weight: bold; text-align: center; letter-spacing: 1px; }
.row { display: flex; gap: 6px; align-items: center; font-size: 11px; }
.small { font-size: 10px; color: #333; }
.label-key { font-weight: bold; }
.value { font-size: 12px; }
.mono { font-family: monospace; font-weight: bold; font-size: 13px; }
.volume-number { text-align: center; font-size: 40px; font-weight: 900; letter-spacing: 2px; color: #111; }
hr { border: none; border-top: 1px solid #ccc; margin: 2mm 0; }
.page-break { page-break-after: always; }
@media print { @page { size: 100mm 150mm; margin: 0; } .page-break { display: block; } }
</style>
<script>window.onload = function() { window.print(); }</script>
</head><body>${labels.join("")}</body></html>`;

        const win = window.open("", "_blank");
        if (win) {
            win.document.write(html);
            win.document.close();
            toast({ title: "Etiquetas geradas!", description: `${vol.totalVolumes} etiqueta(s) do pedido ${vol.erpOrderId}.` });
        }
        setPrintingId(null);
    };

    const formatDate = (dateStr: string) => {
        try { return format(new Date(dateStr), "dd/MM/yyyy HH:mm", { locale: ptBR }); }
        catch { return dateStr; }
    };

    return (
        <div className="min-h-screen bg-background">
            <GradientHeader>
                <div className="flex items-center justify-between w-full">
                    <div>
                        <h1 className="text-3xl font-bold text-white">Etiquetas de Volume</h1>
                        <p className="text-white/80">Visualize e reimprima etiquetas geradas na conferência</p>
                    </div>
                    <Link href="/supervisor/reports">
                        <Button variant="ghost" className="text-white hover:bg-white/10">
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Voltar
                        </Button>
                    </Link>
                </div>
            </GradientHeader>

            <div className="p-6 max-w-4xl mx-auto">
                {isLoading ? (
                    <div className="flex justify-center p-12">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                ) : !volumes || volumes.length === 0 ? (
                    <Card>
                        <CardContent className="flex flex-col items-center py-12 text-muted-foreground">
                            <PackageOpen className="h-12 w-12 mb-4 opacity-20" />
                            <p>Nenhuma etiqueta de volume gerada ainda.</p>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="space-y-3">
                        {volumes.map(vol => (
                            <Card key={vol.id} className="border border-orange-100 dark:border-orange-900/30">
                                <CardContent className="p-4">
                                    <div className="flex items-center justify-between gap-4 flex-wrap">
                                        <div className="space-y-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono font-bold text-base">{vol.erpOrderId}</span>
                                                <span className="px-2 py-0.5 bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 rounded text-xs font-semibold">
                                                    {vol.totalVolumes} vol
                                                </span>
                                            </div>
                                            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                                                {vol.sacola > 0 && <span><ShoppingBag className="inline h-3 w-3 mr-0.5" />Sacola: {vol.sacola}</span>}
                                                {vol.caixa > 0 && <span><Box className="inline h-3 w-3 mr-0.5" />Caixa: {vol.caixa}</span>}
                                                {vol.saco > 0 && <span><Archive className="inline h-3 w-3 mr-0.5" />Saco: {vol.saco}</span>}
                                                {vol.avulso > 0 && <span><Tag className="inline h-3 w-3 mr-0.5" />Avulso: {vol.avulso}</span>}
                                            </div>
                                            <div className="text-xs text-muted-foreground">Gerado em: {formatDate(vol.createdAt)}</div>
                                        </div>
                                        <Button
                                            size="sm"
                                            className="bg-orange-600 hover:bg-orange-700 text-white shrink-0"
                                            onClick={() => handlePrint(vol)}
                                            disabled={printingId === vol.id}
                                        >
                                            {printingId === vol.id
                                                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                : <PackageOpen className="h-4 w-4 mr-2" />
                                            }
                                            Reimprimir
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
