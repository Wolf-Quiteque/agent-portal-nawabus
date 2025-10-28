'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { Plus, Search, Printer } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getCurrentUserProfile } from '@/lib/client-auth';

const EXCHANGE_RATE_USD_TO_KZ = 850; // Should come from env

export default function Dashboard() {
  const [trips, setTrips] = useState([]);
  const [recentTickets, setRecentTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [agentProfile, setAgentProfile] = useState(null);
  const [filters, setFilters] = useState({
    origin: '',
    destination: '',
    date: format(new Date(), 'yyyy-MM-dd'),
  });

  const router = useRouter();

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const profile = await getCurrentUserProfile();
      setAgentProfile(profile);

      // Load recent trips that are scheduled in the next few days
      await loadTrips();

      // Load recent tickets by this agent
      await loadRecentTickets();
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTrips = async () => {
    try {
      const response = await fetch(`/api/search-trips?origin=${encodeURIComponent(filters.origin)}&destination=${encodeURIComponent(filters.destination)}&date=${filters.date}`);
      if (response.ok) {
        const data = await response.json();
        setTrips(data.trips || []);
      }
    } catch (error) {
      console.error('Error loading trips:', error);
    }
  };

  const loadRecentTickets = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: tickets } = await supabase
        .from('tickets')
        .select(`
          id,
          ticket_number,
          seat_number,
          payment_status,
          booking_time,
          profiles!passenger_id(first_name, last_name)
        `)
        .eq('booked_by', user.id)
        .order('booking_time', { ascending: false })
        .limit(5);

      setRecentTickets(tickets || []);
    } catch (error) {
      console.error('Error loading recent tickets:', error);
    }
  };

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const handleSearchTrips = () => {
    loadTrips();
  };

  const handleSelectTrip = (trip) => {
    router.push(`/new-ticket?tripId=${trip.id}`);
  };

  const handlePrintTicket = (ticketId) => {
    router.push(`/print/${ticketId}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-600">A carregar...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Nova Venda Card */}
      <Card className="bg-brand-500 text-white">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold mb-2">Nova Venda</h2>
              <p className="text-brand-100">Vender um bilhete de autocarro</p>
            </div>
            <Button
              size="lg"
              variant="secondary"
              onClick={() => router.push('/new-ticket')}
              className="bg-white text-brand-600 hover:bg-gray-50"
            >
              <Plus className="h-5 w-5 mr-2" />
              Iniciar Nova Venda
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Section: Próximas Viagens */}
      <Card>
        <CardHeader>
          <CardTitle>Próximas Viagens Disponíveis</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div>
              <Label htmlFor="origin">Origem</Label>
              <Input
                id="origin"
                placeholder="Ex: Luanda"
                value={filters.origin}
                onChange={(e) => handleFilterChange('origin', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="destination">Destino</Label>
              <Input
                id="destination"
                placeholder="Ex: Benguela"
                value={filters.destination}
                onChange={(e) => handleFilterChange('destination', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="date">Data</Label>
              <Input
                id="date"
                type="date"
                value={filters.date}
                onChange={(e) => handleFilterChange('date', e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={handleSearchTrips} className="w-full">
                <Search className="h-4 w-4 mr-2" />
                Procurar
              </Button>
            </div>
          </div>

          {/* Trips Table */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rota</TableHead>
                <TableHead>Partida</TableHead>
                <TableHead>Lugares Disponíveis</TableHead>
                <TableHead>Preço (Kz)</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trips.map(trip => (
                <TableRow key={trip.id}>
                  <TableCell className="font-medium">{trip.route}</TableCell>
                  <TableCell>
                    {format(new Date(trip.departure_time), 'dd/MM/yyyy HH:mm', { locale: pt })}
                  </TableCell>
                  <TableCell>{trip.available_seats}</TableCell>
                  <TableCell>{trip.price_kz.toLocaleString()} Kz</TableCell>
                  <TableCell>
                    <Button
                      onClick={() => handleSelectTrip(trip)}
                      disabled={trip.available_seats <= 0}
                    >
                      Selecionar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {trips.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              Nenhuma viagem encontrada. Ajuste os filtros.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section: Últimas Vendas */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Últimas Vendas</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/history')}
              className="flex items-center gap-2"
            >
              <Printer className="h-4 w-4" />
              Ver Histórico Completo
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nº Bilhete</TableHead>
                <TableHead>Passageiro</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentTickets.map(ticket => (
                <TableRow key={ticket.id}>
                  <TableCell className="font-mono">{ticket.ticket_number}</TableCell>
                  <TableCell>
                    {ticket.profiles?.first_name} {ticket.profiles?.last_name}
                  </TableCell>
                  <TableCell>
                    {format(new Date(ticket.booking_time), 'dd/MM/yyyy HH:mm', { locale: pt })}
                  </TableCell>
                  <TableCell>
                    <Badge variant={ticket.payment_status === 'paid' ? 'default' : 'secondary'}>
                      {ticket.payment_status === 'paid' ? 'Pago' : 'Pendente'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePrintTicket(ticket.id)}
                    >
                      <Printer className="h-4 w-4 mr-2" />
                      Imprimir
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {recentTickets.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              Ainda não há vendas registradas.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
