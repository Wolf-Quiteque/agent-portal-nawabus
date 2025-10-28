'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Printer, Usb } from 'lucide-react';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode.react';
import { toast } from 'sonner';
import thermalPrinter from '@/utils/printer';

export default function PrintTicketPage() {
  const params = useParams();
  const ticketId = params.ticketId;
  const router = useRouter();
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const printRef = useRef();

  useEffect(() => {
    loadTicket();
  }, [ticketId]);

  const loadTicket = async () => {
    try {
      const response = await fetch(`/api/get-ticket/${ticketId}`);
      if (response.ok) {
        const data = await response.json();
        setTicket(data.ticket);
      } else {
        setError('Bilhete não encontrado');
      }
    } catch (err) {
      console.error('Error loading ticket:', err);
      setError('Erro ao carregar bilhete');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleUSBPrint = async () => {
    try {
      toast.loading('Conectando à impressora...');

      const result = await thermalPrinter.printTicket(ticket);

      if (result.success) {
        toast.dismiss();
        if (result.method === 'usb') {
          toast.success('Bilhete impresso com sucesso na impressora USB!');
        } else {
          toast.success('Bilhete enviado para impressão!');
        }
      } else {
        toast.dismiss();
        toast.error('Erro ao imprimir: ' + result.error);
      }
    } catch (error) {
      toast.dismiss();
      console.error('USB print error:', error);
      toast.error('Erro ao conectar impressora: ' + error.message);
    }
  };

  const handleBack = () => {
    router.push('/dashboard');
  };

  useEffect(() => {
    // Auto-print when ticket loads
    if (ticket && !loading) {
      setTimeout(() => {
        handlePrint();
      }, 500);
    }
  }, [ticket, loading]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500 mx-auto mb-4"></div>
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
            <p className="text-gray-600 mb-6">{error || 'Bilhete não encontrado'}</p>
            <Button onClick={handleBack} variant="outline">
              Voltar ao Painel
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      {/* Print Controls - Hidden in print */}
      <div className="print:hidden flex flex-wrap gap-4 mb-6">
        <Button onClick={handlePrint} className="bg-brand-500 hover:bg-brand-600">
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
          {!thermalPrinter.isWebUSBSupported() && ' (Indisponível)'}
        </Button>
        <Button onClick={handleBack} variant="outline">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
      </div>

      {/* Ticket Layout - Optimized for thermal printer */}
      <div ref={printRef} className="max-w-xs mx-auto bg-white border-2 border-gray-300">
        {/* Header */}
        <div className="text-center p-4 border-b-2 border-gray-300">
          <h1 className="text-2xl font-bold">NAWABUS</h1>
          <h2 className="text-lg font-semibold">Bilhete de Viagem</h2>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3">
          {/* Ticket Number */}
          <div className="text-center">
            <div className="text-xl font-bold bg-gray-100 p-2 rounded">
              {ticket.ticket_number}
            </div>
          </div>

          {/* Passenger Info */}
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

          {/* Trip Info */}
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="font-medium">Origem → Destino:</span>
              <span className="text-right">{ticket.origin} → {ticket.destination}</span>
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

          {/* Payment Info */}
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="font-medium">Valor Pago:</span>
              <span className="font-bold text-lg">{ticket.price_kz.toLocaleString()} Kz</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Pagamento:</span>
              <span>{ticket.payment_status}</span>
            </div>
          </div>

          {/* QR Code */}
          <div className="flex justify-center py-4">
            <QRCode value={ticket.qr_code_data} size={120} />
          </div>

          {/* Footer */}
          <div className="text-center text-sm pt-4 border-t">
            <p>Viajar aqui é fácil!</p>
            <p className="text-xs mt-2">NawaBus - Angola</p>
          </div>
        </div>
      </div>
    </div>
  );
}
