"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer, Usb } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { toast } from "sonner";
import thermalPrinter from "@/utils/printer";
import Script from "next/script";

// ---- BIXOLON helpers (JS) ----
function hasBixolonFunctions() {
  if (typeof window === "undefined") return false;
  return (
    typeof window.requestPrint === "function" &&
    typeof window.getPosData === "function" &&
    typeof window.printText === "function"
  );
}

function configureBixolonServerUrl() {
  // Default for Windows Web Print SDK is typically this local URL.
  // You can override in .env.local with NEXT_PUBLIC_BXL_SERVER_URL if needed.
  const defaultUrl = "http://127.0.0.1:18080/WebPrintSDK/";
  const url = process.env.NEXT_PUBLIC_BXL_SERVER_URL || defaultUrl;

  // Many SDK builds rely on global serverURL
  window.serverURL = url;

  // Some builds also expose setter functions (if yours does, this helps)
  if (typeof window.setWebServerUrl === "function") {
    try {
      window.setWebServerUrl(url);
    } catch {}
  }
}

async function bixolonPrintTicket(ticket, logicalName = "printer1") {
  if (!hasBixolonFunctions()) {
    throw new Error(
      "BIXOLON Web Print SDK não está pronto. Verifique se bxlcommon.js e bxlpos.js carregaram e se o Web Print SDK (Windows/app) está ativo."
    );
  }

  configureBixolonServerUrl();

  // Build receipt
  window.printText("NAWABUS\n", 1, 0, true, false, false, 0, 1);
  window.printText("Bilhete de Viagem\n\n", 1, 0, true, false, false, 0, 0);

  window.printText(`Bilhete: ${ticket.ticket_number}\n`, 0, 0, false, false, false, 0, 0);
  window.printText(`Passageiro: ${ticket.passenger_name}\n`, 0, 0, false, false, false, 0, 0);
  window.printText(`Telefone: ${ticket.passenger_phone}\n\n`, 0, 0, false, false, false, 0, 0);

  window.printText(`Rota: ${ticket.origin} -> ${ticket.destination}\n`, 0, 0, false, false, false, 0, 0);
  window.printText(`Partida: ${ticket.departure_time}\n`, 0, 0, false, false, false, 0, 0);
  window.printText(`Lugar: ${ticket.seat_number}\n\n`, 0, 0, true, false, false, 0, 0);

  window.printText(
    `Valor: ${Number(ticket.price_kz).toLocaleString()} Kz\n`,
    0,
    0,
    true,
    false,
    false,
    0,
    0
  );
  window.printText(`Pagamento: ${ticket.payment_status}\n\n`, 0, 0, false, false, false, 0, 0);

  if (typeof window.printQRCode === "function") {
    window.printQRCode(String(ticket.id), 0, 1, 7, 0);
  } else {
    // QR fallback (still prints ticket even if QR function isn't available)
    window.printText(`QR: ${ticket.id}\n`, 0, 0, false, false, false, 0, 0);
  }

  window.printText("\n\n", 0, 0, false, false, false, 0, 0);

  const data = window.getPosData();
  if (!data) throw new Error("Falha ao gerar dados (getPosData retornou vazio).");

  // Send print
  await new Promise((resolve, reject) => {
    try {
      window.requestPrint(logicalName, data, (result) => {
        // Many SDKs return strings like "Cannot connect to server"
        const msg = typeof result === "string" ? result : JSON.stringify(result || {});
        if (msg && msg.toLowerCase().includes("cannot connect")) {
          reject(
            new Error(
              "Cannot connect to server. Confirme que o Windows Web Print SDK está rodando (porta 18080) e que o printer1 está configurado."
            )
          );
          return;
        }
        resolve(result);
      });
    } catch (e) {
      reject(e);
    }
  });
}

// ---- Page ----
export default function PrintTicketPage() {
  const params = useParams();
  const ticketId = params?.ticketId;
  const router = useRouter();

  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Track script readiness properly
  const [commonLoaded, setCommonLoaded] = useState(false);
  const [posLoaded, setPosLoaded] = useState(false);
  const [bixolonReady, setBixolonReady] = useState(false);

  const printRef = useRef(null);

  useEffect(() => {
    loadTicket();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  const loadTicket = async () => {
    try {
      const response = await fetch(`/api/get-ticket/${ticketId}`);
      if (response.ok) {
        const data = await response.json();
        setTicket(data.ticket);
      } else {
        setError("Bilhete não encontrado");
      }
    } catch (err) {
      console.error("Error loading ticket:", err);
      setError("Erro ao carregar bilhete");
    } finally {
      setLoading(false);
    }
  };

  // After both scripts load, poll briefly until functions exist
  useEffect(() => {
    if (!commonLoaded || !posLoaded) {
      setBixolonReady(false);
      return;
    }

    let alive = true;
    const started = Date.now();

    const check = () => {
      if (!alive) return;

      if (hasBixolonFunctions()) {
        setBixolonReady(true);
        return;
      }

      if (Date.now() - started < 2500) {
        setTimeout(check, 150);
      } else {
        setBixolonReady(false);
      }
    };

    check();

    return () => {
      alive = false;
    };
  }, [commonLoaded, posLoaded]);

  const handlePrintBrowser = () => window.print();

  const handleUSBPrint = async () => {
    if (!ticket) return;

    try {
      toast.loading("Conectando à impressora...");
      const result = await thermalPrinter.printTicket(ticket);

      toast.dismiss();
      if (result?.success) {
        toast.success("Bilhete impresso com sucesso na impressora USB!");
      } else {
        toast.error("Erro ao imprimir: " + (result?.error || "Erro desconhecido"));
      }
    } catch (err) {
      toast.dismiss();
      console.error("USB print error:", err);
      toast.error("Erro ao conectar impressora: " + (err?.message || "Erro"));
    }
  };

  const handleBixolon = async () => {
    if (!ticket) return;

    try {
      toast.loading("Imprimindo (BIXOLON)...");
      await bixolonPrintTicket(ticket, process.env.NEXT_PUBLIC_BXL_LOGICAL_NAME || "printer1");
      toast.dismiss();
      toast.success("Bilhete impresso!");
    } catch (err) {
      toast.dismiss();
      console.error("BIXOLON print error:", err);
      toast.error(err?.message || "Falha ao imprimir");
    }
  };

  const handleBack = () => router.push("/dashboard");

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500 mx-auto mb-4" />
          <p>Carregando bilhete...</p>
        </div>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <div className="text-red-500 text-5xl mb-4">⚠️</div>
            <h3 className="text-xl font-bold mb-4">Erro</h3>
            <p className="text-gray-600 mb-6">{error || "Bilhete não encontrado"}</p>
            <Button onClick={handleBack} variant="outline">
              Voltar ao Painel
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      {/* These MUST exist:
          /public/bxlcommon.js
          /public/bxlpos.js
      */}
      <Script
        src="/bxlcommon.js"
        strategy="afterInteractive"
        onLoad={() => setCommonLoaded(true)}
        onError={() => setCommonLoaded(false)}
      />
      <Script
        src="/bxlpos.js"
        strategy="afterInteractive"
        onLoad={() => setPosLoaded(true)}
        onError={() => setPosLoaded(false)}
      />

      <div className="min-h-screen bg-gray-50 p-4">
        <div className="print:hidden flex flex-wrap gap-4 mb-6">
          <Button onClick={handlePrintBrowser} className="bg-brand-500 hover:bg-brand-600">
            <Printer className="h-4 w-4 mr-2" />
            Imprimir Browser
          </Button>

          <Button
            onClick={handleUSBPrint}
            variant="outline"
            disabled={!thermalPrinter.isWebUSBSupported()}
            className="flex items-center gap-2"
          >
            <Usb className="h-4 w-4" />
            Imprimir USB
            {!thermalPrinter.isWebUSBSupported() && " (Indisponível)"}
          </Button>

          <Button
            onClick={handleBixolon}
            variant="outline"
            disabled={!bixolonReady}
            title={
              bixolonReady
                ? "Pronto"
                : "SDK ainda não está pronto. Verifique se bxlcommon.js/bxlpos.js estão carregando (sem 404)."
            }
          >
            <Printer className="h-4 w-4 mr-2" />
            Imprimir Bluetooth (Bixolon)
            {!bixolonReady ? " (Aguardando SDK)" : ""}
          </Button>

          <Button onClick={handleBack} variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
        </div>

        <div ref={printRef} className="max-w-xs mx-auto bg-white border-2 border-gray-300">
          <div className="text-center p-4 border-b-2 border-gray-300">
            <h1 className="text-2xl font-bold">NAWABUS</h1>
            <h2 className="text-lg font-semibold">Bilhete de Viagem</h2>
          </div>

          <div className="p-4 space-y-3">
            <div className="text-center">
              <div className="text-xl font-bold bg-gray-100 p-2 rounded">{ticket.ticket_number}</div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="font-medium">Passageiro:</span>
                <span className="text-right">{ticket.passenger_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Telefone:</span>
                <span>{ticket.passenger_phone}</span>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="font-medium">Origem → Destino:</span>
                <span className="text-right">
                  {ticket.origin} → {ticket.destination}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Partida:</span>
                <span>{ticket.departure_time}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Lugar:</span>
                <span className="font-bold text-lg">{ticket.seat_number}</span>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="font-medium">Valor Pago:</span>
                <span className="font-bold text-lg">
                  {Number(ticket.price_kz).toLocaleString()} Kz
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Pagamento:</span>
                <span>{ticket.payment_status}</span>
              </div>
            </div>

            <div className="flex justify-center py-4">
              <QRCodeCanvas value={ticket.id} size={120} />
            </div>

            <div className="text-center text-sm pt-4 border-t">
              <p>Viajar aqui é fácil!</p>
              <p className="text-xs mt-2">NawaBus - Angola</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
