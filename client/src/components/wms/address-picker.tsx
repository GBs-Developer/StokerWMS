import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { MapPin, CheckCircle2, XCircle } from "lucide-react";

interface WmsAddress {
  id: string;
  bairro: string;
  rua: string;
  bloco: string;
  nivel: string;
  code: string;
}

interface AddressPickerProps {
  availableAddresses: WmsAddress[];
  onAddressSelect: (addressId: string) => void;
  onClear: () => void;
  value?: string;
}

export function AddressPicker({ availableAddresses, onAddressSelect, onClear, value }: AddressPickerProps) {
  const [bairro, setBairro] = useState("");
  const [rua, setRua] = useState("");
  const [bloco, setBloco] = useState("");
  const [nivel, setNivel] = useState("");
  
  const ruaRef = useRef<HTMLInputElement>(null);
  const blocoRef = useRef<HTMLInputElement>(null);
  const nivelRef = useRef<HTMLInputElement>(null);
  const bairroRef = useRef<HTMLInputElement>(null);

  // Parse code if provided by some quick-scan mechanism or value prop
  useEffect(() => {
    if (value) {
      const match = availableAddresses.find(a => a.id === value);
      if (match) {
        setBairro(match.bairro);
        setRua(match.rua);
        setBloco(match.bloco);
        setNivel(match.nivel);
      }
    }
  }, [value, availableAddresses]);

  const findMatch = (b: string, r: string, bl: string, n: string) => {
    return availableAddresses.find(
      a => a.bairro === b && a.rua === r && a.bloco === bl && a.nivel === n
    );
  };

  const handleBairroChange = (v: string) => {
    setBairro(v);
    if (v.length >= 1) {
      const match = findMatch(v, rua, bloco, nivel);
      if (match) onAddressSelect(match.id);
      // Auto focus next if scanned (usually scanners send tab/enter, but we can detect length if fixed)
      // For now, let user tab or we can add a smart move if needed
    } else {
      onClear();
    }
  };

  const currentMatch = findMatch(bairro, rua, bloco, nivel);

  useEffect(() => {
    if (currentMatch) {
      onAddressSelect(currentMatch.id);
    } else {
      onClear();
    }
  }, [bairro, rua, bloco, nivel, currentMatch]);

  const clearAll = () => {
    setBairro("");
    setRua("");
    setBloco("");
    setNivel("");
    onClear();
    bairroRef.current?.focus();
  };

  return (
    <div className="space-y-4 p-4 border rounded-xl bg-muted/20">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2 text-primary">
          <MapPin className="h-4 w-4" /> Endereço de Destino (Bipe ou digite)
        </Label>
        {currentMatch ? (
          <span className="text-[10px] font-bold text-green-600 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> LOCALIZADO: {currentMatch.code}
          </span>
        ) : (
          (bairro || rua || bloco || nivel) && (
            <span className="text-[10px] font-bold text-red-500 flex items-center gap-1">
              <XCircle className="h-3 w-3" /> ENDEREÇO NÃO ENCONTRADO
            </span>
          )
        )}
      </div>

      <div className="grid grid-cols-4 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground uppercase">Bairro</Label>
          <Input 
            ref={bairroRef}
            placeholder="B" 
            value={bairro} 
            onChange={e => setBairro(e.target.value)}
            className="text-center font-bold"
            onKeyDown={e => e.key === "Enter" && ruaRef.current?.focus()}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground uppercase">Rua</Label>
          <Input 
            ref={ruaRef}
            placeholder="R" 
            value={rua} 
            onChange={e => setRua(e.target.value)}
            className="text-center font-bold"
            onKeyDown={e => e.key === "Enter" && blocoRef.current?.focus()}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground uppercase">Bloco</Label>
          <Input 
            ref={blocoRef}
            placeholder="Bl" 
            value={bloco} 
            onChange={e => setBloco(e.target.value)}
            className="text-center font-bold"
            onKeyDown={e => e.key === "Enter" && nivelRef.current?.focus()}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground uppercase">Nível</Label>
          <Input 
            ref={nivelRef}
            placeholder="N" 
            value={nivel} 
            onChange={e => setNivel(e.target.value)}
            className="text-center font-bold"
            onKeyDown={e => e.key === "Enter" && !currentMatch && bairroRef.current?.focus()}
          />
        </div>
      </div>

      {(bairro || rua || bloco || nivel) && (
        <Button variant="ghost" size="sm" className="w-full text-xs h-7 text-muted-foreground" onClick={clearAll}>
          Limpar endereço
        </Button>
      )}
    </div>
  );
}
