import { requireAgentRole } from '@/lib/server-auth';

const EXCHANGE_RATE_USD_TO_KZ = 1;

export async function GET(request) {
  try {
    const { supabase, user } = await requireAgentRole();
    const { searchParams } = new URL(request.url);

    const filters = {
      startDate: searchParams.get('startDate'),
      endDate: searchParams.get('endDate'),
      origin: searchParams.get('origin'),
      destination: searchParams.get('destination'),
      paymentStatus: searchParams.get('paymentStatus'),
    };

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
          routes!inner(origin, destination)
        ),
        profiles!passenger_id(first_name, last_name)
      `)
      .eq('booked_by', user.id)
      .order('booking_time', { ascending: false });

    // Apply filters server-side for better performance
    if (filters.startDate) {
      query = query.gte('booking_time', new Date(filters.startDate).toISOString());
    }
    if (filters.endDate) {
      const endOfDay = new Date(filters.endDate);
      endOfDay.setHours(23, 59, 59, 999);
      query = query.lte('booking_time', endOfDay.toISOString());
    }
    if (filters.origin) {
      query = query.ilike('trips.routes.origin', `%${filters.origin}%`);
    }
    if (filters.destination) {
      query = query.ilike('trips.routes.destination', `%${filters.destination}%`);
    }
    if (filters.paymentStatus && filters.paymentStatus !== 'all') {
      query = query.eq('payment_status', filters.paymentStatus);
    }

    // For now, get all results. In production, implement pagination with limit/offset
    const { data: tickets, error } = await query;

    if (error) {
      console.error('Database error:', error);
      return Response.json({ error: 'Erro na base de dados' }, { status: 500 });
    }

    // Convert prices to Kz and format data
    const formattedTickets = tickets.map(ticket => ({
      id: ticket.id,
      ticket_number: ticket.ticket_number,
      passenger_name: `${ticket.profiles.first_name} ${ticket.profiles.last_name}`,
      origin: ticket.trips.routes.origin,
      destination: ticket.trips.routes.destination,
      departure_time: ticket.trips.departure_time,
      seat_number: ticket.seat_number,
      price_kz: Math.round(ticket.price_paid_usd * EXCHANGE_RATE_USD_TO_KZ),
      payment_status: ticket.payment_status === 'paid' ? 'Pago' : 'Pendente',
      booking_time: ticket.booking_time,
    }));

    return Response.json({
      tickets: formattedTickets,
      total: formattedTickets.length,
    });

  } catch (err) {
    console.error('API Error:', err);
    return Response.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
