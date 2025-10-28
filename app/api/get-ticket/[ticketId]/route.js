import { requireAgentRole } from '@/lib/server-auth';

const EXCHANGE_RATE_USD_TO_KZ = 1;

export async function GET(request, { params }) {
  try {
    const { supabase, user } = await requireAgentRole();
    const { ticketId } = params;

    if (!ticketId) {
      return Response.json({ error: 'Ticket ID is required' }, { status: 400 });
    }

    // Get ticket with related data
    const { data: ticket, error } = await supabase
      .from('tickets')
      .select(`
        id,
        ticket_number,
        seat_number,
        price_paid_usd,
        payment_method,
        payment_status,
        payment_reference,
        qr_code_data,
        booking_time,
        trips!inner(
          departure_time,
          arrival_time,
          routes!inner(origin, destination)
        ),
        profiles!passenger_id(id, first_name, last_name, phone_number)
      `)
      .eq('id', ticketId)
      .single();

    if (error || !ticket) {
      return Response.json({ error: 'Ticket not found' }, { status: 404 });
    }

    // Format the data for printing
    const formattedTicket = {
      ticket_number: ticket.ticket_number,
      passenger_name: `${ticket.profiles.first_name} ${ticket.profiles.last_name}`,
      passenger_phone: ticket.profiles.phone_number,
      origin: ticket.trips.routes.origin,
      destination: ticket.trips.routes.destination,
      departure_time: new Date(ticket.trips.departure_time).toLocaleString('pt-AO', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Africa/Luanda',
      }),
      seat_number: ticket.seat_number,
      price_kz: Math.round(ticket.price_paid_usd * EXCHANGE_RATE_USD_TO_KZ),
      payment_status: ticket.payment_status === 'paid' ? 'Pago' : 'Pendente',
      payment_method: ticket.payment_method === 'cash' ? 'Dinheiro' : 'Referência',
      qr_code_data: ticket.qr_code_data,
      booking_time: ticket.booking_time,
    };

    return Response.json({ ticket: formattedTicket });

  } catch (err) {
    console.error('API Error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
