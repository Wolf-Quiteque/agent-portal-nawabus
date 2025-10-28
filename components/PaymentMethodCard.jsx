'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTicketWizardStore } from '@/lib/store';
import { CreditCard, DollarSign } from 'lucide-react';

// gera referência automática (numérica) para pagamento tipo Multicaixa / banco
function generateReferenceCode() {
  // Exemplo: últimos 8 dígitos do timestamp + 3 dígitos aleatórios
  const ts = Date.now().toString(); // ex: 1730112345678
  const tail = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return ts.slice(-8) + tail; // tipo "12345678901"
}

export function PaymentMethodCard() {
  const {
    selectedTrip,
    selectedSeat,
    passenger,
    payment,
    setPayment,
    nextStep,
  } = useTicketWizardStore();

  const [referenceCode, setReferenceCode] = useState(payment.reference || '');

  const handlePaymentMethodChange = (method) => {
    if (method === 'referencia') {
      // gerar automaticamente referência única
      const newRef = generateReferenceCode();
      setReferenceCode(newRef);
      setPayment({
        method: 'referencia',
        reference: newRef,
      });
    } else {
      // pagamento em dinheiro não precisa referência
      setReferenceCode('');
      setPayment({
        method: 'cash',
        reference: '',
      });
    }
  };

  const handleContinue = () => {
    // Já temos method + reference gravados no estado global
    nextStep();
  };

  if (!selectedTrip || !passenger.first_name) {
    return (
      <div className="text-center py-8 text-gray-500">
        Informações incompletas. Volte aos passos anteriores.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Método de Pagamento */}
      <Card>
        <CardContent className="p-6">
          <h3 className="font-semibold mb-4">Método de Pagamento</h3>

          <div className="space-y-4">
            {/* Dinheiro */}
            <div
              className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
                payment.method === 'cash'
                  ? 'border-brand-500 bg-brand-50'
                  : 'border-gray-300 hover:border-brand-400'
              }`}
              onClick={() => handlePaymentMethodChange('cash')}
            >
              <div className="flex items-center gap-3">
                <DollarSign
                  className={`h-6 w-6 ${
                    payment.method === 'cash'
                      ? 'text-brand-600'
                      : 'text-gray-600'
                  }`}
                />
                <div>
                  <h4 className="font-medium">Dinheiro (Pago agora)</h4>
                  <p className="text-sm text-gray-600">
                    Pagamento em dinheiro efetuado imediatamente
                  </p>
                </div>
              </div>
            </div>

            {/* Referência */}
            <div
              className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
                payment.method === 'referencia'
                  ? 'border-brand-500 bg-brand-50'
                  : 'border-gray-300 hover:border-brand-400'
              }`}
              onClick={() => handlePaymentMethodChange('referencia')}
            >
              <div className="flex items-center gap-3">
                <CreditCard
                  className={`h-6 w-6 ${
                    payment.method === 'referencia'
                      ? 'text-brand-600'
                      : 'text-gray-600'
                  }`}
                />
                <div className="flex-1">
                  <h4 className="font-medium">Referência (Pendente)</h4>
                  <p className="text-sm text-gray-600">
                    Pagamento via referência bancária / Multicaixa
                  </p>

                  {payment.method === 'referencia' && (
                    <div className="mt-2">
                      <Label htmlFor="reference">Referência Gerada</Label>
                      <Input
                        id="reference"
                        value={referenceCode}
                        readOnly
                        className="font-mono"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Este código foi gerado automaticamente. Dê ao
                        passageiro para pagar.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resumo da Venda */}
      <Card>
        <CardContent className="p-6">
          <h3 className="font-semibold mb-4">Detalhes do Bilhete</h3>

          <div className="space-y-3">
            <div className="flex justify-between">
              <span>Viagem:</span>
              <span className="font-medium">{selectedTrip.route}</span>
            </div>
            <div className="flex justify-between">
              <span>Lugar:</span>
              <span className="font-medium">{selectedSeat}</span>
            </div>
            <div className="flex justify-between">
              <span>Passageiro:</span>
              <span className="font-medium">
                {passenger.first_name} {passenger.last_name}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Método:</span>
              <span className="font-medium">
                {payment.method === 'cash'
                  ? 'Dinheiro (Pago agora)'
                  : 'Referência (Pendente)'}
              </span>
            </div>

            {payment.method === 'referencia' && (
              <div className="flex justify-between">
                <span>Referência:</span>
                <span className="font-mono font-semibold text-brand-600">
                  {referenceCode}
                </span>
              </div>
            )}

            <hr />

            <div className="flex justify-between text-lg font-bold">
              <span>Total:</span>
              <span className="text-brand-600">
                {selectedTrip.price_kz.toLocaleString()} Kz
              </span>
            </div>

            {payment.method === 'referencia' && (
              <p className="text-sm text-amber-600 bg-amber-50 p-2 rounded">
                ⚠️ Pagamento pendente. O bilhete será emitido mas o lugar
                só será bloqueado depois de confirmado o pagamento.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Botão Continuar */}
      <div className="flex justify-center">
        <Button
          onClick={handleContinue}
          disabled={!payment.method}
          className="bg-brand-500 hover:bg-brand-600 px-8"
        >
          Confirmar Bilhete
        </Button>
      </div>
    </div>
  );
}
