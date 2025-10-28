'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, Calendar, Printer, FileText, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

const formatDate = (dateString) => {
  return new Date(dateString).toLocaleDateString('pt-AO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Luanda',
  });
};

const exportToCSV = async (tickets, filters) => {
  try {
    const headers = [
      'Número Bilhete',
      'Passageiro',
      'Origem',
      'Destino',
      'Partida',
      'Lugar',
      'Valor (Kz)',
      'Pagamento',
      'Data Venda'
    ];

    const rows = tickets.map(ticket => [
      ticket.ticket_number,
      ticket.passenger_name,
      ticket.origin,
      ticket.destination,
      formatDate(ticket.departure_time),
      ticket.seat_number,
      ticket.price_kz,
      ticket.payment_status,
      formatDate(ticket.booking_time)
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `historico-vendas-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success('Ficheiro CSV exportado com sucesso!');
  } catch (error) {
    console.error('Export error:', error);
    toast.error('Erro ao exportar ficheiro');
  }
};

export default function HistoryClient({ initialTickets, initialTotal }) {
  const [tickets, setTickets] = useState(initialTickets);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    origin: '',
    destination: '',
    paymentStatus: 'all'
  });
  const router = useRouter();

  const fetchTickets = async (currentFilters = filters) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      Object.entries(currentFilters).forEach(([key, value]) => {
        if (value && value !== 'all') params.append(key, value);
      });

      const response = await fetch(`/api/get-agent-history?${params}`);
      if (!response.ok) throw new Error('Failed to fetch tickets');

      const data = await response.json();
      setTickets(data.tickets || []);
      setTotal(data.total || 0);
    } catch (error) {
      console.error('Error fetching tickets:', error);
      toast.error('Erro ao carregar bilhetes');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key, value) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    fetchTickets(newFilters);
  };

  const handlePrintTicket = (ticketId) => {
    router.push(`/print/${ticketId}`);
  };

  const handleExport = () => {
    if (tickets.length === 0) {
      toast.error('Não há dados para exportar');
      return;
    }
    exportToCSV(tickets, filters);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* Filters Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Data Início</label>
              <Input
                type="date"
                value={filters.startDate}
                onChange={(e) => handleFilterChange('startDate', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Data Fim</label>
              <Input
                type="date"
                value={filters.endDate}
                onChange={(e) => handleFilterChange('endDate', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Origem</label>
              <Input
                type="text"
                placeholder="Ex: Luanda"
                value={filters.origin}
                onChange={(e) => handleFilterChange('origin', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Destino</label>
              <Input
                type="text"
                placeholder="Ex: Benguela"
                value={filters.destination}
                onChange={(e) => handleFilterChange('destination', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Estado Pagamento</label>
              <Select value={filters.paymentStatus} onValueChange={(value) => handleFilterChange('paymentStatus', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="paid">Pago</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-between items-center mt-4">
            <p className="text-sm text-gray-600">
              Total: {total} bilhete{total !== 1 ? 's' : ''}
            </p>
            <Button
              onClick={handleExport}
              variant="outline"
              className="flex items-center gap-2"
            >
              <FileText className="h-4 w-4" />
              Exportar CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tickets Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center">
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                <div className="animate-spin w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full mx-auto"></div>
                <p className="mt-2 text-sm text-gray-600">Carregando...</p>
              </motion.div>
            </div>
          ) : tickets.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <div className="mb-4">
                <FileText className="h-12 w-12 mx-auto text-gray-400" />
              </div>
              <p>Nenhum bilhete encontrado com os filtros atuais.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nº Bilhete</TableHead>
                    <TableHead>Passageiro</TableHead>
                    <TableHead>Rota</TableHead>
                    <TableHead>Partida</TableHead>
                    <TableHead>Lugar</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Pagamento</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tickets.map((ticket, index) => (
                    <motion.tr
                      key={ticket.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.05 }}
                      className="border-b"
                    >
                      <TableCell className="font-mono font-bold">{ticket.ticket_number}</TableCell>
                      <TableCell>{ticket.passenger_name}</TableCell>
                      <TableCell>{ticket.origin} → {ticket.destination}</TableCell>
                      <TableCell>{formatDate(ticket.departure_time)}</TableCell>
                      <TableCell>{ticket.seat_number}</TableCell>
                      <TableCell>{ticket.price_kz.toLocaleString('pt-AO')} Kz</TableCell>
                      <TableCell>
                        <Badge variant={ticket.payment_status === 'Pago' ? 'default' : 'secondary'}>
                          {ticket.payment_status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handlePrintTicket(ticket.id)}
                          className="flex items-center gap-1"
                        >
                          <Printer className="h-3 w-3" />
                          Imprimir
                        </Button>
                      </TableCell>
                    </motion.tr>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
