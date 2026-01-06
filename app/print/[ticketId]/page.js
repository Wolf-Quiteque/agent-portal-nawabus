"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer, Usb } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { toast } from "sonner";
import Script from "next/script";

import thermalPrinter from "@/utils/printer";
import { bixolonPrintTicket } from "@/utils/bixolonWebPrint";

function isBixolonReadyNow() {
  return (
    typeof window !== "undefined" &&
    typeof window.requestPrint === "function" &&
    typeof window.getPosData === "function" &&
    typeof window.printText === "function"
  );
}

export default function PrintTicketPage() {
  const params = useParams();
  const ticketId = params?.ticketId;
  const router = useRouter();

  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Track script loads separately
  const [bxlCommonLoaded, setBxlCommonLoaded] = useState(false);
  const [bxlPosLoaded, setBxlPosLoaded] = useState(false);

  // Final readiness flag (scripts loaded + SDK functions present)
  const [bixolonReady, setBixolonReady] = useState(false);

  const printRef = useRef(null);

  useEffect(() => {
    loadTicket();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  const loadTicket = async () => {
    try {
      const response = await fetch(`/api/get-ticket/${ticketId}`);
      if (!response.ok) {
        setError("Bilhete não encontrado");
        return;
      }
      const data = await response.json();
      setTicket(data.ticket);
    } catch (err) {
      console.error("Error loading ticket:", err);
      setError("Erro ao carregar bilhete");
    } finally {
      setLoading(false);
    }
  };

  // Once both scripts are loaded, wait a moment until the SDK functions appear
  useEffect(() => {
    if (!bxlCommonLoaded || !bxlPosLoaded) {
      setBixolonReady(false);
      return;
    }

    let alive = true;
    const start = Date.now();

    const tick = () => {
      if (!alive) return;

      if (isBixolonReadyNow()) {
        setBixolonReady(true);
        return;
      }

      // give it up to ~3 seconds to attach globals
      if (Date.now() - start < 3000) {
        setTimeout(tick, 150);
      } else {
        setBixolonReady(false);
      }
    };

    tick();

    return () => {
      alive = false;
    };
  }, [bxlCommonLoaded, bxlPosLoaded]);

  const handleBack = () => router.push("/dashboard");

  const handleUSBPrint = async () => {
    if (!ticket) return;

    try {
      toast.loading("Conectando à impressora USB...");
      const result = await thermalPrinter.printTicket(ticket);
      toast.dismiss();

      if (result?.success) toast.success("Bilhete impresso com sucesso na impressora USB!");
      else toast.error("Erro ao imprimir: " + (result?.error || "Erro desconhecido"));
    } catch (err) {
      toast.dismiss();
      console.error("USB print error:", err);
      toast.error("Erro ao conectar impressora: " + (err?.message || "Erro"));
    }
  };

  const handleBixolonPrint = async () => {
    if (!ticket) return;

    // If user is on mobile normal Chrome/Safari, this will never be ready.
    if (!bixolonReady) {
      toast.error(
        "BIXOLON Web Print não está disponível aqui. No mobile, abra o link dentro do app BIXOLON Web Print SDK e registre a impressora (Printer1)."
      );
      return;
    }

    try {
      toast.loading("Imprimindo (BIXOLON Web Print SDK)...");
      await bixolonPrintTicket(ticket, {
        logicalName: process.env.NEXT_PUBLIC_BXL_LOGICAL_NAME || "Printer1",
        host: process.env.NEXT_PUBLIC_BXL_HOST || "127.0.0.1",
        port: Number(process.env.NEXT_PUBLIC_BXL_PORT || "18080"),
      });

      toast.dismiss();
      toast.success("Bilhete impresso!");
    } catch (err) {
      toast.dismiss();
      console.error("BIXOLON print error:", err);
      toast.error(err?.message || "Falha ao imprimir");
    }
  };

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
      {/* IMPORTANT: these files must exist in /public/bixolon/
          /public/bixolon/bxlcommon.js
          /public/bixolon/bxlpos.js
      */}
      <Script
        src="/bixolon/bxlcommon.js"
        strategy="afterInteractive"
        onLoad={() => setBxlCommonLoaded(true)}
        onError={() => setBxlCommonLoaded(false)}
      />
      <Script
        src="/bixolon/bxlpos.js"
        strategy="afterInteractive"
        onLoad={() => setBxlPosLoaded(true)}
        onError={() => setBxlPosLoaded(false)}
      />

      <div className="min-h-screen bg-gray-50 p-4">
        <div className="print:hidden flex flex-wrap gap-4 mb-6">
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
            onClick={handleBixolonPrint}
            variant="outline"
            disabled={!bixolonReady}
            title={
              bixolonReady
                ? "Pronto"
                : "Se estiver no mobile, abra este link dentro do app BIXOLON Web Print SDK. No PC, confirme que bxlcommon.js e bxlpos.js carregaram."
            }
          >
            <Printer className="h-4 w-4 mr-2" />
            Imprimir Bluetooth (BIXOLON)
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
              <div className="text-xl font-bold bg-gray-100 p-2 rounded">
                {ticket.ticket_number}
              </div>
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
