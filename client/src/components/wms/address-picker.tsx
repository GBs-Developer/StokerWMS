import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { MapPin, CheckCircle2, XCircle, Keyboard } from "lucide-react";

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
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  const ruaRef = useRef<HTMLInputElement>(null);
  const blocoRef = useRef<HTMLInputElement>(null);
  const nivelRef = useRef<HTMLInputElement>(null);
  const bairroRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (value) {
      const match = availableAddresses.find(a => a.id === value);
      if (match) {
        setBairro(match.bairro);
        setRua(match.rua);
        setBloco(match.bloco);
        setNivel(match.nivel);
      }
    } else {
      setBairro("");
      setRua("");
      setBloco("");
      setNivel("");
    }
  }, [value, availableAddresses]);

  const alphaNumOnly = (v: string) => v.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();

  const findMatch = (b: string, r: string, bl: string, n: string) => {
    return availableAddresses.find(
      a => a.bairro === b && a.rua === r && a.bloco === bl && a.nivel === n
    );
  };

  const currentMatch = findMatch(bairro, rua, bloco, nivel);

  useEffect(() => {
    if (currentMatch) {
      onAddressSelect(currentMatch.id);
    } else {
      onClear();
    }
  }, [bairro, rua, bloco, nivel]);

  const clearAll = () => {
    setBairro("");
    setRua("");
    setBloco("");
    setNivel("");
    onClear();
    bairroRef.current?.focus();
  };

  const inputMode = keyboardOpen ? "text" : "none";

  const fieldClass = `text-center font-bold text-lg h-12 ${!keyboardOpen ? "cursor-default" : ""}`;

  return (
    <div className="space-y-3 p-4 border rounded-xl bg-muted/20">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2 text-primary font-semibold">
          <MapPin className="h-4 w-4" /> Endereço de Destino
        </Label>
        <div className="flex items-center gap-2">
          {currentMatch ? (
            <span className="text-xs font-bold text-green-600 flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> {currentMatch.code}
            </span>
          ) : (
            (bairro || rua || bloco || nivel) && (
              <span className="text-xs font-bold text-red-500 flex items-center gap-1">
                <XCircle className="h-3.5 w-3.5" /> Não encontrado
              </span>
            )
          )}
          <Button
            variant={keyboardOpen ? "default" : "outline"}
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setKeyboardOpen(v => !v)}
            title={keyboardOpen ? "Fechar teclado" : "Abrir teclado para digitar"}
            data-testid="button-toggle-keyboard"
          >
            <Keyboard className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Bairro", ref: bairroRef, value: bairro, set: setBairro, next: ruaRef },
          { label: "Rua", ref: ruaRef, value: rua, set: setRua, next: blocoRef },
          { label: "Bloco", ref: blocoRef, value: bloco, set: setBloco, next: nivelRef },
          { label: "Nível", ref: nivelRef, value: nivel, set: setNivel, next: null },
        ].map(({ label, ref, value: val, set, next }) => (
          <div key={label} className="space-y-1">
            <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</Label>
            <Input
              ref={ref}
              placeholder=""
              value={val}
              onChange={e => set(alphaNumOnly(e.target.value))}
              className={fieldClass}
              inputMode={inputMode}
              readOnly={!keyboardOpen}
              onKeyDown={e => e.key === "Enter" && next && next.current?.focus()}
              data-testid={`input-address-${label.toLowerCase()}`}
            />
          </div>
        ))}
      </div>

      {!keyboardOpen && (
        <p className="text-[10px] text-muted-foreground text-center">
          Bipe o endereço ou toque em <Keyboard className="h-3 w-3 inline" /> para digitar
        </p>
      )}

      {(bairro || rua || bloco || nivel) && (
        <Button variant="ghost" size="sm" className="w-full text-xs h-7 text-muted-foreground" onClick={clearAll}>
          Limpar endereço
        </Button>
      )}
    </div>
  );
}
