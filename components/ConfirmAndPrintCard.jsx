'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTicketWizardStore } from '@/lib/store';
import { useRouter } from 'next/navigation';
import { CheckCircle, Printer, Home } from 'lucide-react';

export function ConfirmAndPrintCard() {
  const {
    selectedTrip,
    selectedSeat,
    passenger,
    payment,
    setCreatedTicketId,
    reset
  } = useTicketWizardStore();

  const router = useRouter();
  const [creating, setCreating] = useState(true);
  const [ticketId, setTicketId] = useState(null);
  const [ticketNumber, setTicketNumber] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    createTicket();
  }, []);

  const createTicket = async () => {
    try {
      setCreating(true);
      const ticketData = {
        trip_id: selectedTrip.id,
        passenger_id: passenger.id,
        seat_number: selectedSeat,
        payment_method: payment.method,
        payment_reference: payment.reference || null,
      };

      const response = await fetch('/api/create-ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ticketData),
      });

      const data = await response.json();

      if (response.ok) {
        setTicketId(data.ticket_id);
        setTicketNumber(data.ticket_number);
        setCreatedTicketId(data.ticket_id);
        setError(null);
      } else {
        setError(data.error || 'Erro ao criar bilhete');
      }
    } catch (err) {
      console.error('Error creating ticket:', err);
      setError('Erro de conexão. Tente novamente.');
    } finally {
      setCreating(false);
    }
  };

  const handlePrint = () => {
    if (ticketId) {
      router.push(`/print/${ticketId}`);
    }
  };

  const handleGoHome = () => {
    reset(); // Clear wizard state
    router.push('/dashboard');
  };

  if (creating) {
    return (
      <div className="text-center py-16">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500 mx-auto mb-4"></div>
        <h3 className="text-lg font-medium mb-2">Criando bilhete...</h3>
        <p className="text-gray-600">Aguarde enquanto processamos sua venda</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-6">
            <div className="text-center">
              <div className="text-red-500 text-5xl mb-4">⚠️</div>
              <h3 className="text-lg font-medium text-red-800 mb-2">Erro na Criação do Bilhete</h3>
              <p className="text-red-600 mb-4">{error}</p>
              <Button onClick={createTicket} className="bg-red-600 hover:bg-red-700">
                Tentar Novamente
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Success Message */}
      <Card className="border-green-200 bg-green-50">
        <CardContent className="p-6">
          <div className="text-center">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-2xl font-bold text-green-800 mb-2">Bilhete Criado com Sucesso!</h3>
            <p className="text-green-700 mb-4">
              O bilhete foi criado e o SMS foi enviado para o passageiro.
            </p>
            {ticketNumber && (
              <div className="text-lg font-mono bg-white p-2 rounded border">
                {ticketNumber}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Order Summary */}
      <Card>
        <CardContent className="p-6">
          <h3 className="font-semibold mb-4">Detalhes do Bilhete</h3>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-gray-600">Viagem:</span>
                <p className="font-medium">{selectedTrip.route}</p>
              </div>
              <div>
                <span className="text-gray-600">Lugar:</span>
                <p className="font-bold text-lg">{selectedSeat}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-gray-600">Passageiro:</span>
                <p className="font-medium">{passenger.first_name} {passenger.last_name}</p>
              </div>
              <div>
                <span className="text-gray-600">Telefone:</span>
                <p className="font-medium">{passenger.phone_number}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-gray-600">Pagamento:</span>
                <p className="font-medium">
                  {payment.method === 'cash' ? 'Dinheiro (Pago)' : 'Referência (Pendente)'}
                </p>
              </div>
              <div>
                <span className="text-gray-600">Total:</span>
                <p className="font-bold text-lg text-brand-600">
                  {selectedTrip.price_kz.toLocaleString()} Kz
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex gap-4 justify-center">
        <Button
          onClick={handlePrint}
          className="bg-brand-500 hover:bg-brand-600 flex items-center gap-2"
          size="lg"
        >
          <Printer className="h-5 w-5" />
          Imprimir Bilhete
        </Button>

        <Button
          onClick={handleGoHome}
          variant="outline"
          size="lg"
          className="flex items-center gap-2"
        >
          <Home className="h-5 w-5" />
          Voltar ao Painel
        </Button>
      </div>
    </div>
  );
}
