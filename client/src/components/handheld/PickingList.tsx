
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Order, OrderItem, Product } from "@shared/schema";
import { usePickingStore, PickingItem } from "@/lib/pickingStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Loader2, Package, MapPin } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type OrderWithItems = Order & {
    items: (OrderItem & { product: Product })[];
};

export function PickingList() {
    const { startSession } = usePickingStore();
    const { toast } = useToast();
    const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

    // 1. Fetch Orders (Summary)
    const { data: orders, isLoading: ordersLoading } = useQuery<Order[]>({
        queryKey: ["/api/orders"],
        // In a real app, we would verify status filter server-side
        select: (data) => data.filter(o => o.status === 'pendente' || o.status === 'em_separacao')
    });

    // 2. Fetch Order Details (on expansion)
    const { data: orderDetails, isLoading: detailsLoading } = useQuery<OrderWithItems>({
        queryKey: ["/api/orders", expandedOrder],
        enabled: !!expandedOrder,
        queryFn: async () => {
            const res = await apiRequest("GET", `/api/orders/${expandedOrder}`);
            if (!res.ok) throw new Error("Failed to fetch order details");
            return res.json();
        }
    });

    const handleStartPicking = async (order: Order, section: string, items: (OrderItem & { product: Product })[]) => {
        try {
            // Locking attempt
            const lockRes = await apiRequest("POST", "/api/lock", {
                orderId: order.id,
                sectionId: section
            });

            if (!lockRes.ok) {
                const error = await lockRes.json();
                toast({
                    variant: "destructive",
                    title: "Bloqueado",
                    description: error.message || "Esta seção já está sendo separada por outro usuário."
                });
                return;
            }

            const { sessionId } = await lockRes.json();

            // Convert items to PickingItems
            const pickingItems: PickingItem[] = items.map(i => ({
                ...i,
                qtyPickedLocal: i.qtyPicked || 0,
                statusLocal: i.status === 'separado' ? 'synced' : 'pending'
            }));

            startSession({
                orderId: order.id,
                sectionId: section,
                sessionId,
                lastHeartbeat: Date.now()
            }, pickingItems);

        } catch (e) {
            toast({
                variant: "destructive",
                title: "Erro",
                description: "Não foi possível iniciar a sessão."
            });
        }
    };

    // Helper to group items by section
    const getSections = (items: (OrderItem & { product: Product })[]) => {
        const sections: Record<string, (OrderItem & { product: Product })[]> = {};
        items.forEach(item => {
            if (!sections[item.section]) sections[item.section] = [];
            sections[item.section].push(item);
        });
        return Object.entries(sections);
    };

    if (ordersLoading) {
        return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }

    return (
        <div className="space-y-4">
            <h2 className="text-xl font-bold mb-4">Pedidos Disponíveis</h2>
            {orders?.length === 0 && <p className="text-muted-foreground text-center">Nenhum pedido pendente.</p>}

            <Accordion type="single" collapsible onValueChange={setExpandedOrder}>
                {orders?.map(order => (
                    <AccordionItem key={order.id} value={order.id}>
                        <AccordionTrigger className="hover:no-underline px-4 border rounded-lg mb-2 bg-card hover:bg-accent">
                            <div className="flex flex-col items-start text-left w-full">
                                <div className="flex justify-between w-full">
                                    <span className="font-bold">Pedido #{order.erpOrderId}</span>
                                    <Badge variant={order.priority > 0 ? "destructive" : "outline"}>
                                        {order.priority > 0 ? "Prioridade" : "Normal"}
                                    </Badge>
                                </div>
                                <span className="text-sm text-muted-foreground">{order.customerName}</span>
                            </div>
                        </AccordionTrigger>

                        <AccordionContent className="px-2 pt-2 pb-4">
                            {detailsLoading && expandedOrder === order.id ? (
                                <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin" /></div>
                            ) : (
                                orderDetails && expandedOrder === order.id && (
                                    <div className="space-y-2">
                                        <p className="text-sm font-semibold text-muted-foreground mb-2">Selecione uma seção para iniciar:</p>
                                        {getSections(orderDetails.items).map(([sectionName, items]) => (
                                            <Card key={sectionName} className="cursor-pointer hover:bg-accent transition-colors"
                                                onClick={() => handleStartPicking(order, sectionName, items)}>
                                                <CardContent className="flex items-center justify-between p-4">
                                                    <div className="flex items-center space-x-3">
                                                        <MapPin className="h-5 w-5 text-primary" />
                                                        <div>
                                                            <p className="font-bold text-lg">{sectionName}</p>
                                                            <p className="text-xs text-muted-foreground">{items.length} itens</p>
                                                        </div>
                                                    </div>
                                                    <Button size="sm">Iniciar</Button>
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </div>
                                )
                            )}
                        </AccordionContent>
                    </AccordionItem>
                ))}
            </Accordion>
        </div>
    );
}
