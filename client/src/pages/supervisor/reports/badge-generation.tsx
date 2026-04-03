import { useQuery } from "@tanstack/react-query";
import { User } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Printer, ArrowLeft, AlertTriangle } from "lucide-react";
import { useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export default function BadgeGeneration() {
    const { data: users, isLoading } = useQuery<User[]>({
        queryKey: ["/api/users"],
    });

    const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
    const printRef = useRef<HTMLDivElement>(null);

    // Filter active users
    const activeUsers = users?.filter(u => u.active) || [];

    // Determine which users to display: selected ones, or all if none selected
    const usersToDisplay = selectedUserIds.length > 0
        ? activeUsers.filter(u => selectedUserIds.includes(u.id))
        : activeUsers;

    const handlePrint = () => {
        window.print();
    };

    const toggleUserSelection = (userId: string) => {
        setSelectedUserIds(prev =>
            prev.includes(userId)
                ? prev.filter(id => id !== userId)
                : [...prev, userId]
        );
    };

    const handleBackfill = async () => {
        try {
            await fetch("/api/admin/backfill-badges-dev", { method: "POST" });
            window.location.reload();
        } catch (e) {
            console.error(e);
        }
    };

    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-screen">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="p-8 max-w-7xl mx-auto min-h-screen bg-background">
            <div className="print:hidden space-y-6 mb-8">
                <div className="flex items-center justify-between">
                    <div>
                        <Link href="/supervisor/reports">
                            <Button variant="ghost" className="mb-2 pl-0 hover:pl-2 transition-all">
                                <ArrowLeft className="mr-2 h-4 w-4" />
                                Voltar para Relatórios
                            </Button>
                        </Link>
                        <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                            Gerar Crachás de Acesso (QR Code)
                        </h1>
                        <p className="text-muted-foreground mt-2">
                            Selecione os usuários para imprimir os cartões de acesso.
                        </p>
                    </div>
                    <div className="flex gap-2">
                        {/* Dev helper button */}
                        <Button variant="ghost" size="sm" onClick={handleBackfill} className="text-xs text-muted-foreground">
                            Regenerar (Dev)
                        </Button>
                        <Button variant="outline" onClick={() => setSelectedUserIds([])} disabled={selectedUserIds.length === 0}>
                            Limpar Seleção
                        </Button>
                        <Button onClick={handlePrint} className="hidden sm:inline-flex">
                            <Printer className="mr-2 h-4 w-4" />
                            Imprimir {selectedUserIds.length > 0 ? `(${selectedUserIds.length})` : "Todos"}
                        </Button>
                    </div>
                </div>

                <div className="w-full max-w-sm">
                    <label className="text-sm font-medium mb-1 block">Filtrar Usuários</label>
                    <div className="relative">
                        <select
                            className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            onChange={(e) => {
                                const val = e.target.value;
                                if (val) toggleUserSelection(val);
                            }}
                            value=""
                        >
                            <option value="">Selecione para adicionar...</option>
                            {activeUsers
                                .filter(u => !selectedUserIds.includes(u.id))
                                .map((user) => (
                                    <option key={user.id} value={user.id}>
                                        {user.name}
                                    </option>
                                ))}
                        </select>
                    </div>
                    {selectedUserIds.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                            {selectedUserIds.map(id => {
                                const u = activeUsers.find(user => user.id === id);
                                if (!u) return null;
                                return (
                                    <Badge key={id} variant="secondary" className="cursor-pointer" onClick={() => toggleUserSelection(id)}>
                                        {u.name} <span className="ml-1 text-muted-foreground">×</span>
                                    </Badge>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            <div ref={printRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 print:block print:w-full">
                {usersToDisplay.length === 0 && (
                    <div className="col-span-full text-center text-muted-foreground py-10">
                        Nenhum usuário selecionado.
                    </div>
                )}

                {usersToDisplay.map((user) => (
                    <div key={user.id} className="break-inside-avoid print:mb-4 print:inline-block print:w-[32%] print:mr-2">
                        <Card className="border-2 border-primary/20 overflow-hidden relative h-full rounded-2xl">
                            <div className="absolute top-0 left-0 w-2 h-full bg-primary" />
                            <CardContent className="p-6 flex flex-col items-center text-center gap-4 h-full justify-between">
                                <div className="flex flex-col items-center gap-4 w-full">
                                    <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary">
                                        {user.name.charAt(0).toUpperCase()}
                                    </div>

                                    <div className="space-y-1 w-full">
                                        <h3 className="font-bold text-xl truncate px-2">{user.name}</h3>
                                        <Badge variant="secondary" className="uppercase tracking-wider">
                                            {user.role}
                                        </Badge>
                                    </div>
                                </div>

                                <div className="mt-4 p-4 bg-white rounded border border-gray-200 w-full flex items-center justify-center min-h-[160px]">
                                    {user.badgeCode ? (
                                        <QRCodeSVG value={user.badgeCode} size={128} level="H" />
                                    ) : (
                                        <div className="flex flex-col items-center gap-2 text-amber-600">
                                            <AlertTriangle className="h-8 w-8" />
                                            <span className="text-xs font-semibold">Código não gerado</span>
                                            <span className="text-[10px] text-muted-foreground leading-tight px-2">
                                                Atualize a senha do usuário
                                            </span>
                                        </div>
                                    )}
                                </div>

                                <div className="text-xs text-muted-foreground font-mono mt-1 w-full border-t pt-2">
                                    ID: {user.username}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                ))}
            </div>

            <style>{`
                @media print {
                    @page { margin: 0.5cm; size: auto; }
                    body * {
                        visibility: hidden;
                    }
                    .print\\:block, .print\\:block * {
                        visibility: visible;
                    }
                    .print\\:block {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                    }
                    .print\\:hidden {
                        display: none !important;
                    }
                    /* Ensure background colors/graphics print */
                    * {
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                }
            `}</style>
        </div>
    );
}
