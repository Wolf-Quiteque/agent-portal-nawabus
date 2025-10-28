import { Suspense } from 'react';
import { requireAgentRole } from '@/lib/server-auth';
import HistoryClient from './HistoryClient';

async function getAgentHistory(filters = {}) {
  try {
    const { supabase, user } = await requireAgentRole();

    let query = supabase
      .from('tickets')
      .select(`
        id,
        ticket_number,
        seat_number,
        price_paid_usd,
        payment_method,
        payment_status,
        payment_reference,
        booking_time,
        trips!inner(
          departure_time,
          routes!inner(
            origin:origin_city,
            destination:destination_city
          )
        ),
        passenger:profiles!fk_passenger_id(
          first_name,
          last_name
        )
      `)
      // only show tickets sold by THIS agent
      .eq('booked_by', user.id)
      .order('booking_time', { ascending: false });

    // Apply filters
    if (filters.startDate) {
      query = query.gte(
        'booking_time',
        new Date(filters.startDate).toISOString()
      );
    }

    if (filters.endDate) {
      const endOfDay = new Date(filters.endDate);
      endOfDay.setHours(23, 59, 59, 999);
      query = query.lte('booking_time', endOfDay.toISOString());
    }

    if (filters.origin) {
      // matches routes.origin_city
      query = query.ilike(
        'trips.routes.origin_city',
        `%${filters.origin}%`
      );
    }

    if (filters.destination) {
      // matches routes.destination_city
      query = query.ilike(
        'trips.routes.destination_city',
        `%${filters.destination}%`
      );
    }

    if (filters.paymentStatus && filters.paymentStatus !== 'all') {
      query = query.eq('payment_status', filters.paymentStatus);
    }

    const { data: tickets, error } = await query;

    if (error) throw error;

    // TODO: replace with real USD→KZ rate
    const exchangeRate = 1;

    const formattedTickets = tickets.map((ticket) => ({
      id: ticket.id,
      ticket_number: ticket.ticket_number,
      passenger_name: `${ticket.passenger?.first_name ?? ''} ${ticket.passenger?.last_name ?? ''}`.trim(),
      origin: ticket.trips.routes.origin,
      destination: ticket.trips.routes.destination,
      departure_time: ticket.trips.departure_time,
      seat_number: ticket.seat_number,
      price_kz: Math.round(Number(ticket.price_paid_usd || 0) * exchangeRate),
      payment_status:
        ticket.payment_status === 'paid'
          ? 'Pago'
          : ticket.payment_status === 'pending'
          ? 'Pendente'
          : ticket.payment_status,
      booking_time: ticket.booking_time,
    }));

    return {
      tickets: formattedTickets,
      total: formattedTickets.length,
    };
  } catch (error) {
    console.log('Error fetching agent history:', error);
    return { tickets: [], total: 0 };
  }
}

export default async function HistoryPage() {
  const { tickets, total } = await getAgentHistory();

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Histórico de Vendas</h1>
        <p className="text-gray-600 mt-1">
          Veja todas as vendas realizadas por si
        </p>
      </div>

      <Suspense fallback={<div>Carregando...</div>}>
        <HistoryClient initialTickets={tickets} initialTotal={total} />
      </Suspense>
    </div>
  );
}