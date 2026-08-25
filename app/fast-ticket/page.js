'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { Clock, Users, MapPin, Zap } from 'lucide-react';

export default function FastTicketPage() {
  const router = useRouter();

  // trip search
  const [filters, setFilters] = useState({
    origin: '',
    destination: '',
    date: format(new Date(), 'yyyy-MM-dd'),
  });
  const [trips, setTrips] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedTrip, setSelectedTrip] = useState(null);

  // passenger + payment form
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentReference, setPaymentReference] = useState('');
  const [promotionCode, setPromotionCode] = useState('');

  // submit state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSearch = async () => {
    if (!filters.origin || !filters.destination) return;
    setSearching(true);
    setError(null);
    try {
      const params = new URLSearchParams(filters);
      const res = await fetch(`/api/search-trips?${params}`);
      const data = await res.json();
      setTrips(res.ok ? (data.trips || []) : []);
      setSelectedTrip(null);
    } catch {
      setTrips([]);
    } finally {
      setSearching(false);
    }
  };

  const canSubmit =
    selectedTrip &&
    phone.trim() &&
    name.trim() &&
    (paymentMethod === 'cash' || paymentReference.trim() || paymentMethod === 'referencia');

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/fast-ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trip_id: selectedTrip.id,
          phone: phone.trim(),
          name: name.trim(),
          payment_method: paymentMethod,
          payment_reference: paymentMethod === 'referencia' ? paymentReference.trim() : null,
          promotion_code: promotionCode.trim() || null,
          attribution_source: 'agent_web',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Erro ao criar bilhete');
        return;
      }
      router.push(`/print/${data.ticket_id}`);
    } catch (err) {
      console.error(err);
      setError('Erro de conexão. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Card className="bg-brand-500 text-white">
        <CardContent className="p-4 flex items-center gap-3">
          <Zap className="h-6 w-6" />
          <div>
            <h1 className="text-xl font-bold">Venda Rápida</h1>
            <p className="text-sm text-brand-100">Telefone + nome, assento automático, direto ao pagamento.</p>
          </div>
        </CardContent>
      </Card>

      {/* 1. Viagem */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Escolher viagem</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <Label>Origem</Label>
              <Input
                placeholder="Luanda"
                value={filters.origin}
                onChange={(e) => setFilters(f => ({ ...f, origin: e.target.value }))}
              />
            </div>
            <div>
              <Label>Destino</Label>
              <Input
                placeholder="Benguela"
                value={filters.destination}
                onChange={(e) => setFilters(f => ({ ...f, destination: e.target.value }))}
              />
            </div>
            <div>
              <Label>Data</Label>
              <Input
                type="date"
                value={filters.date}
                onChange={(e) => setFilters(f => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={handleSearch} disabled={searching} className="w-full">
                {searching ? 'A procurar...' : 'Procurar'}
              </Button>
            </div>
          </div>

          {trips.length > 0 && (
            <div className="space-y-2 max-h-72 overflow-auto">
              {trips.map(t => {
                const picked = selectedTrip?.id === t.id;
                return (
                  <button
                    type="button"
                    key={t.id}
                    onClick={() => setSelectedTrip(t)}
                    className={`w-full text-left border rounded-lg p-3 transition ${
                      picked ? 'border-brand-500 bg-brand-50' : 'hover:bg-gray-50'
                    }`}
                    disabled={t.available_seats === 0}
                  >
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        <span className="font-medium">{t.route}</span>
                        {t.is_campaign && (
                          <Badge variant="outline" className="text-orange-600 border-orange-400">
                            Campanha
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm font-semibold">
                        {t.is_campaign ? 'Gratuito' : `${t.price_kz.toLocaleString()} Kz`}
                      </div>
                    </div>
                    <div className="mt-1 text-sm text-gray-600 flex gap-4">
                      <span>
                        <Clock className="inline h-3 w-3 mr-1" />
                        {format(new Date(t.departure_time), 'dd/MM HH:mm', { locale: pt })}
                      </span>
                      <span>
                        <Users className="inline h-3 w-3 mr-1" />
                        {t.available_seats} livres
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {!searching && trips.length === 0 && filters.origin && filters.destination && (
            <p className="text-sm text-gray-500">Nenhuma viagem encontrada.</p>
          )}
        </CardContent>
      </Card>

      {/* 2. Passageiro + Pagamento (revelado quando há viagem) */}
      {selectedTrip && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Passageiro &amp; Pagamento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Telefone</Label>
                <Input
                  placeholder="9XXXXXXXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  inputMode="tel"
                  autoFocus
                />
                <p className="text-xs text-gray-500 mt-1">
                  Se já existir, reutilizamos o passageiro. Caso contrário, criamos.
                </p>
              </div>
              <div>
                <Label>Nome</Label>
                <Input
                  placeholder="João Silva"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            </div>

            <div>
              <Label>Pagamento</Label>
              <div className="flex gap-2 mt-1">
                <Button
                  type="button"
                  variant={paymentMethod === 'cash' ? 'default' : 'outline'}
                  onClick={() => setPaymentMethod('cash')}
                  className={paymentMethod === 'cash' ? 'bg-brand-500 hover:bg-brand-600' : ''}
                >
                  Dinheiro
                </Button>
                <Button
                  type="button"
                  variant={paymentMethod === 'referencia' ? 'default' : 'outline'}
                  onClick={() => setPaymentMethod('referencia')}
                  className={paymentMethod === 'referencia' ? 'bg-brand-500 hover:bg-brand-600' : ''}
                >
                  Referência
                </Button>
              </div>
              {paymentMethod === 'referencia' && (
                <Input
                  className="mt-2"
                  placeholder="Referência (opcional — gerada automaticamente se vazia)"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                />
              )}
            </div>

            <div>
              <Label>Codigo promocional (opcional)</Label>
              <Input
                className="mt-1 font-mono uppercase"
                placeholder="Ex.: MARIA500"
                value={promotionCode}
                onChange={(event) => setPromotionCode(event.target.value.toUpperCase())}
                maxLength={32}
              />
              <p className="mt-1 text-xs text-gray-500">
                O servidor valida o codigo e calcula o desconto com a tarifa actual.
              </p>
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
                {error}
              </div>
            )}

            <Button
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              className="w-full bg-brand-500 hover:bg-brand-600"
              size="lg"
            >
              {submitting ? 'A criar bilhete...' : 'Criar Bilhete e Imprimir'}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
