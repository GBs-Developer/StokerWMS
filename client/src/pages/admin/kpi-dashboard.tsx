import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { GradientHeader } from "@/components/ui/gradient-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import {
  ArrowLeft, Users, Clock, Package, AlertTriangle, CheckCircle2,
  TrendingUp, Minus, BarChart3, Trophy,
  ChevronDown, ChevronUp, RefreshCw, Boxes,
} from "lucide-react";
import { format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";

interface OperatorKPI {
  userId: string;
  userName: string;
  username: string;
  role: string;
  pedidosSeparados: number;
  pedidosAndamento: number;
  tempoMedioSepMin: number | null;
  pedidosConferidos: number;
  tempoMedioConfMin: number | null;
  totalItens: number;
  totalQtyPicked: number;
  totalQtyEsperada: number;
  itensExcedidos: number;
  totalExcecoes: number;
  taxaExcecao: number;
  excNaoEncontrado: number;
  excAvariado: number;
  excVencido: number;
  pedidosComVolume: number;
  totalVolumes: number;
  diario: { dia: string; sep: number; conf: number }[];
}

interface KPIResponse {
  operators: OperatorKPI[];
  from: string;
  to: string;
  companyId: number;
}

const ROLE_LABELS: Record<string, string> = {
  separacao: "Separação",
  conferencia: "Conferência",
  supervisor: "Supervisor",
  administrador: "Admin",
  balcao: "Balcão",
  recebedor: "Recebedor",
  empilhador: "Empilhador",
  conferente_wms: "WMS",
};

const ROLE_COLORS: Record<string, string> = {
  separacao:   "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  conferencia: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  supervisor:  "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  administrador:"bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
};

function fmtTime(min: number | null): string {
  if (min === null || min === undefined) return "—";
  if (min < 1) return `${Math.round(min * 60)}s`;
  if (min < 60) return `${min.toFixed(0)}min`;
  return `${(min / 60).toFixed(1)}h`;
}

function RateIndicator({ pct }: { pct: number }) {
  if (pct === 0) return <span className="text-xs text-green-600 font-semibold flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />0%</span>;
  if (pct <= 2) return <span className="text-xs text-amber-600 font-semibold flex items-center gap-1"><Minus className="h-3 w-3" />{pct}%</span>;
  return <span className="text-xs text-red-600 font-semibold flex items-center gap-1"><TrendingUp className="h-3 w-3" />{pct}%</span>;
}

function MiniBar({ values, max }: { values: { dia: string; v: number }[]; max: number }) {
  if (!values.length) return <p className="text-xs text-muted-foreground/40 italic">sem dados</p>;
  return (
    <div className="flex items-end gap-0.5 h-8">
      {values.map(({ dia, v }) => (
        <div key={dia} className="flex-1 relative group" title={`${dia}: ${v}`}>
          <div
            className="bg-blue-500/70 rounded-sm w-full"
            style={{ height: max > 0 ? `${Math.max(4, (v / max) * 32)}px` : "4px" }}
          />
        </div>
      ))}
    </div>
  );
}

function OperatorCard({ op, rank }: { op: OperatorKPI; rank: number }) {
  const [expanded, setExpanded] = useState(false);
  const last7 = op.diario.slice(-7);
  const maxDia = Math.max(...last7.map(d => d.sep + d.conf), 1);

  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden" data-testid={`card-kpi-${op.userId}`}>
      {/* Header do card */}
      <div className="px-4 py-3 flex items-center gap-3">
        {/* Rank medal */}
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-extrabold shrink-0
          ${rank === 1 ? "bg-amber-100 text-amber-600 dark:bg-amber-900/40" :
            rank === 2 ? "bg-slate-100 text-slate-500 dark:bg-slate-800" :
            rank === 3 ? "bg-orange-100 text-orange-500 dark:bg-orange-900/40" :
            "bg-muted text-muted-foreground"}`}>
          {rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-sm truncate">{op.userName}</p>
            <Badge className={`text-[10px] px-2 py-0 h-5 ${ROLE_COLORS[op.role] ?? "bg-muted text-muted-foreground"}`}>
              {ROLE_LABELS[op.role] ?? op.role}
            </Badge>
          </div>
          <p className="text-[11px] text-muted-foreground">@{op.username}</p>
        </div>

        {/* Mini chart */}
        <div className="w-20 shrink-0">
          <MiniBar values={last7.map(d => ({ dia: d.dia, v: d.sep + d.conf }))} max={maxDia} />
        </div>

        <button onClick={() => setExpanded(p => !p)} className="text-muted-foreground hover:text-foreground ml-1">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {/* KPI pills row */}
      <div className="px-4 pb-3 grid grid-cols-4 gap-2">
        <div className="rounded-xl bg-blue-50 dark:bg-blue-950/30 px-2 py-2 text-center">
          <p className="text-[11px] text-blue-600/70 dark:text-blue-400/60 leading-tight">Separados</p>
          <p className="text-xl font-extrabold text-blue-700 dark:text-blue-300 tabular-nums">{op.pedidosSeparados}</p>
        </div>
        <div className="rounded-xl bg-green-50 dark:bg-green-950/30 px-2 py-2 text-center">
          <p className="text-[11px] text-green-600/70 dark:text-green-400/60 leading-tight">Conferidos</p>
          <p className="text-xl font-extrabold text-green-700 dark:text-green-300 tabular-nums">{op.pedidosConferidos}</p>
        </div>
        <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 px-2 py-2 text-center">
          <p className="text-[11px] text-amber-600/70 dark:text-amber-400/60 leading-tight">T.Médio</p>
          <p className="text-base font-extrabold text-amber-700 dark:text-amber-300">{fmtTime(op.tempoMedioSepMin)}</p>
        </div>
        <div className={`rounded-xl px-2 py-2 text-center ${op.totalExcecoes > 0 ? "bg-red-50 dark:bg-red-950/30" : "bg-muted"}`}>
          <p className={`text-[11px] leading-tight ${op.totalExcecoes > 0 ? "text-red-600/70 dark:text-red-400/60" : "text-muted-foreground"}`}>Exceções</p>
          <p className={`text-xl font-extrabold tabular-nums ${op.totalExcecoes > 0 ? "text-red-700 dark:text-red-300" : "text-muted-foreground"}`}>{op.totalExcecoes}</p>
        </div>
      </div>

      {/* Expandido */}
      {expanded && (
        <div className="border-t border-border/50 px-4 py-4 space-y-4 bg-muted/20">
          {/* Separação detalhada */}
          {op.pedidosSeparados > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Separação</p>
              <div className="grid grid-cols-2 gap-2">
                <DetailPill label="Pedidos" value={op.pedidosSeparados} />
                <DetailPill label="T. Médio" value={fmtTime(op.tempoMedioSepMin)} />
                <DetailPill label="Itens coletados" value={op.totalItens} />
                <DetailPill label="Qtd coletada" value={op.totalQtyPicked.toFixed(0)} />
                <DetailPill label="Itens excedidos" value={op.itensExcedidos} accent={op.itensExcedidos > 0 ? "amber" : undefined} />
                <DetailPill label="Em andamento" value={op.pedidosAndamento} />
              </div>
            </div>
          )}

          {/* Conferência detalhada */}
          {op.pedidosConferidos > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Conferência</p>
              <div className="grid grid-cols-2 gap-2">
                <DetailPill label="Pedidos" value={op.pedidosConferidos} />
                <DetailPill label="T. Médio" value={fmtTime(op.tempoMedioConfMin)} />
                <DetailPill label="Volumes gerados" value={op.totalVolumes} />
                <DetailPill label="Pedidos c/ volume" value={op.pedidosComVolume} />
              </div>
            </div>
          )}

          {/* Exceções detalhadas */}
          {op.totalExcecoes > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Exceções</p>
              <div className="grid grid-cols-3 gap-2">
                <DetailPill label="Não encontrado" value={op.excNaoEncontrado} accent={op.excNaoEncontrado > 0 ? "red" : undefined} />
                <DetailPill label="Avariado" value={op.excAvariado} accent={op.excAvariado > 0 ? "red" : undefined} />
                <DetailPill label="Vencido" value={op.excVencido} accent={op.excVencido > 0 ? "red" : undefined} />
              </div>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-xs text-muted-foreground">Taxa de erro:</p>
                <RateIndicator pct={op.taxaExcecao} />
              </div>
            </div>
          )}

          {/* Atividade diária */}
          {op.diario.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Atividade diária (últ. 7 dias)</p>
              <div className="grid grid-cols-7 gap-1">
                {last7.map(d => (
                  <div key={d.dia} className="text-center">
                    <p className="text-[10px] text-muted-foreground/60">{format(new Date(d.dia + "T12:00:00"), "dd/MM", { locale: ptBR })}</p>
                    <div className="mt-1 space-y-0.5">
                      {d.sep > 0 && <p className="text-[11px] font-bold text-blue-600 dark:text-blue-400">{d.sep}s</p>}
                      {d.conf > 0 && <p className="text-[11px] font-bold text-green-600 dark:text-green-400">{d.conf}c</p>}
                      {d.sep === 0 && d.conf === 0 && <p className="text-[11px] text-muted-foreground/30">—</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DetailPill({ label, value, accent }: { label: string; value: string | number; accent?: "red" | "amber" | "green" }) {
  const colorMap = {
    red:   "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300",
    amber: "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300",
    green: "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300",
  };
  return (
    <div className={`rounded-xl px-3 py-2 flex justify-between items-center ${accent ? colorMap[accent] : "bg-background border border-border/50"}`}>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`text-sm font-bold tabular-nums ${accent ? "" : "text-foreground"}`}>{value}</p>
    </div>
  );
}

export default function KpiDashboardPage() {
  const [, navigate] = useLocation();
  const { companyId } = useAuth();
  const [from, setFrom] = useState(() => format(subDays(new Date(), 29), "yyyy-MM-dd"));
  const [to, setTo]     = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [fromInput, setFromInput] = useState(from);
  const [toInput, setToInput]     = useState(to);

  const kpiUrl = companyId
    ? `/api/kpi/operators?companyId=${companyId}&from=${from}&to=${to}`
    : null;

  const { data, isLoading, isError, refetch, isFetching } = useQuery<KPIResponse>({
    queryKey: [kpiUrl],
    enabled: !!kpiUrl,
  });

  const applyFilter = () => {
    setFrom(fromInput);
    setTo(toInput);
  };

  const ops = data?.operators ?? [];
  const totalPedidosSep   = ops.reduce((s, o) => s + o.pedidosSeparados, 0);
  const totalPedidosConf  = ops.reduce((s, o) => s + o.pedidosConferidos, 0);
  const totalExcecoes     = ops.reduce((s, o) => s + o.totalExcecoes, 0);
  const mediaTempoSep     = ops.filter(o => o.tempoMedioSepMin !== null).map(o => o.tempoMedioSepMin as number);
  const avgTempo          = mediaTempoSep.length ? (mediaTempoSep.reduce((a, b) => a + b, 0) / mediaTempoSep.length) : null;

  return (
    <div className="min-h-[100dvh] bg-background pb-safe">
      <GradientHeader compact>
        <div className="relative flex items-center gap-3">
          <button onClick={() => navigate("/")} className="text-white/70 hover:text-white -ml-1 p-1">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-white text-lg leading-tight">Dashboard de KPIs</h1>
            <p className="text-white/60 text-xs">Desempenho dos operadores</p>
          </div>
          <button
            onClick={() => refetch()}
            className="text-white/70 hover:text-white p-1"
            title="Atualizar"
            data-testid="btn-kpi-refresh"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>
      </GradientHeader>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {/* Filtro de período */}
        <div className="rounded-2xl border border-border/50 bg-card p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Período de análise</p>
          <div className="flex gap-2">
            <div className="flex-1">
              <p className="text-[11px] text-muted-foreground mb-1">De</p>
              <Input
                type="date"
                value={fromInput}
                onChange={e => setFromInput(e.target.value)}
                className="h-10 rounded-xl text-sm"
                data-testid="input-kpi-from"
              />
            </div>
            <div className="flex-1">
              <p className="text-[11px] text-muted-foreground mb-1">Até</p>
              <Input
                type="date"
                value={toInput}
                onChange={e => setToInput(e.target.value)}
                className="h-10 rounded-xl text-sm"
                data-testid="input-kpi-to"
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={applyFilter}
                className="h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white"
                disabled={isFetching}
                data-testid="btn-kpi-filter"
              >
                {isFetching ? <RefreshCw className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {[
              { label: "7 dias", days: 7 },
              { label: "15 dias", days: 15 },
              { label: "30 dias", days: 30 },
              { label: "90 dias", days: 90 },
            ].map(({ label, days }) => (
              <button
                key={days}
                onClick={() => {
                  const f = format(subDays(new Date(), days - 1), "yyyy-MM-dd");
                  const t = format(new Date(), "yyyy-MM-dd");
                  setFromInput(f); setToInput(t); setFrom(f); setTo(t);
                }}
                className="text-xs px-3 py-1.5 rounded-lg border border-border/50 hover:bg-muted transition-colors"
                data-testid={`btn-kpi-preset-${days}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Resumo geral */}
        {!isLoading && ops.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            <SummaryCard icon={Users} label="Operadores ativos" value={ops.length} color="blue" />
            <SummaryCard icon={Package} label="Pedidos separados" value={totalPedidosSep} color="green" />
            <SummaryCard icon={CheckCircle2} label="Pedidos conferidos" value={totalPedidosConf} color="emerald" />
            <SummaryCard icon={Clock} label="T. médio separação" value={fmtTime(avgTempo)} color="amber" />
            <SummaryCard icon={AlertTriangle} label="Total exceções" value={totalExcecoes} color={totalExcecoes > 0 ? "red" : "slate"} />
            <SummaryCard icon={Boxes} label="Volumes gerados" value={ops.reduce((s, o) => s + o.totalVolumes, 0)} color="violet" />
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-2xl border border-border/50 bg-card p-4 space-y-3">
                <Skeleton className="h-5 w-40" />
                <div className="grid grid-cols-4 gap-2">
                  {[1, 2, 3, 4].map(j => <Skeleton key={j} className="h-14 rounded-xl" />)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {isError && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
            <AlertTriangle className="h-8 w-8 text-destructive/60 mx-auto mb-2" />
            <p className="text-sm text-destructive font-medium">Falha ao carregar KPIs</p>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-3">
              Tentar novamente
            </Button>
          </div>
        )}

        {/* Sem dados */}
        {!isLoading && !isError && ops.length === 0 && (
          <div className="rounded-2xl border border-border/50 bg-card p-10 text-center">
            <Trophy className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Nenhum operador com atividade no período selecionado.</p>
          </div>
        )}

        {/* Cards de operadores */}
        {!isLoading && ops.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-500" />
              <p className="text-sm font-semibold">Ranking de operadores</p>
              <Badge variant="outline" className="ml-auto text-xs">{ops.length} operadores</Badge>
            </div>
            {ops.map((op, i) => (
              <OperatorCard key={op.userId} op={op} rank={i + 1} />
            ))}
          </div>
        )}

        {/* Legenda de atividade diária */}
        {!isLoading && ops.length > 0 && (
          <div className="rounded-2xl border border-border/50 bg-card px-4 py-3 flex gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500/70 inline-block" />Separação (s)</div>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-green-500/70 inline-block" />Conferência (c)</div>
            <div className="ml-auto">Barras = últ. 7 dias</div>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, color }: {
  icon: any; label: string; value: string | number; color: string;
}) {
  const colors: Record<string, string> = {
    blue:    "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300",
    green:   "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300",
    emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300",
    amber:   "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300",
    red:     "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300",
    slate:   "bg-slate-50 text-slate-600 dark:bg-slate-800/50 dark:text-slate-300",
    violet:  "bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300",
  };
  return (
    <div className={`rounded-2xl px-4 py-3 flex items-center gap-3 ${colors[color] ?? colors.slate}`}>
      <Icon className="h-5 w-5 shrink-0 opacity-70" />
      <div className="min-w-0">
        <p className="text-[11px] opacity-70 leading-tight truncate">{label}</p>
        <p className="text-xl font-extrabold tabular-nums">{value}</p>
      </div>
    </div>
  );
}
