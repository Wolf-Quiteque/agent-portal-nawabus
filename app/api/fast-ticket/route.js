import { NextResponse } from 'next/server';
import { requireAgentRole } from '@/lib/server-auth';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const pricingAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// Reuses the same normalization rule as /api/create-passenger so existing
// passengers stored as 244XXXXXXXXX are matched when an agent types the
// 9-digit form.
function normalizePhoneNumber(phone) {
  if (!phone) return phone;
  const cleaned = String(phone).replace(/\D/g, '');
  if (!cleaned.startsWith('244') && cleaned.length === 9 && cleaned.startsWith('9')) {
    return `244${cleaned}`;
  }
  return cleaned;
}

function generateReferenceCode() {
  const ts = Date.now().toString();
  const tail = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return ts.slice(-8) + tail;
}

// Splits a full-name string into first/last. Empty last_name falls back to '-'
// so we don't violate the NOT NULL constraint on profiles.last_name.
function splitName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/);
  if (parts.length <= 1) return { first_name: parts[0] || '', last_name: '-' };
  return { first_name: parts[0], last_name: parts.slice(1).join(' ') };
}

export async function POST(req) {
  try {
    const { supabase, user } = await requireAgentRole();
    const body = await req.json();

    const {
      trip_id,
      phone,
      name,
      payment_method = 'cash',
      payment_reference,
      promotion_code,
    } = body;

    if (!trip_id || !phone || !name) {
      return NextResponse.json(
        { error: 'trip_id, phone e name são obrigatórios' },
        { status: 400 }
      );
    }
    if (!['cash', 'referencia'].includes(payment_method)) {
      return NextResponse.json(
        { error: 'payment_method inválido' },
        { status: 400 }
      );
    }

    const normalizedPhone = normalizePhoneNumber(phone);
    const { first_name, last_name } = splitName(name);
    if (!first_name) {
      return NextResponse.json({ error: 'Nome em falta' }, { status: 400 });
    }

    // 1. Buscar a viagem + capacidade do autocarro
    const { data: trip, error: tripErr } = await supabase
      .from('trips')
      .select('id, seat_class, price_usd, bus_id, departure_time, buses!inner(capacity)')
      .eq('id', trip_id)
      .single();

    if (tripErr || !trip) {
      return NextResponse.json({ error: 'Viagem não encontrada' }, { status: 404 });
    }
    const busCapacity = trip.buses?.capacity ?? 0;
    if (busCapacity <= 0) {
      return NextResponse.json({ error: 'Autocarro sem capacidade definida' }, { status: 409 });
    }

    // 2. Procurar passageiro existente pelo telefone normalizado
    let passengerId = null;
    let passengerAlreadyExisted = false;
    const { data: existing, error: existingErr } = await supabase
      .from('profiles')
      .select('id')
      .eq('phone_number', normalizedPhone)
      .eq('role', 'passenger')
      .limit(1)
      .maybeSingle();

    if (existingErr && existingErr.code !== 'PGRST116') {
      console.error('[fast-ticket] profile lookup:', existingErr);
      return NextResponse.json({ error: 'Erro ao procurar passageiro' }, { status: 500 });
    }

    if (existing?.id) {
      passengerId = existing.id;
      passengerAlreadyExisted = true;
    } else {
      // 2b. Criar utilizador + profile (espelha /api/create-passenger)
      const pseudoEmail = `passageiro+${normalizedPhone}-${crypto.randomUUID()}@temp.local`;
      const { data: userRes, error: userErr } = await supabase.auth.admin.createUser({
        email: pseudoEmail,
        email_confirm: true,
        user_metadata: {
          role: 'passenger',
          first_name,
          last_name,
          phone_number: normalizedPhone,
        },
      });
      if (userErr || !userRes?.user?.id) {
        console.error('[fast-ticket] createUser:', userErr);
        return NextResponse.json({ error: 'Erro ao criar passageiro' }, { status: 500 });
      }
      passengerId = userRes.user.id;
    }

    // 3. Determinar assentos ocupados no pool partilhado do autocarro
    //    (todas as trips "irmãs" — mesmo bus + janela [dep,arr] sobreposta).
    const { data: siblings, error: sibErr } = await supabase
      .rpc('get_overlapping_trip_ids', { p_trip_id: trip_id });

    if (sibErr) {
      console.error('[fast-ticket] siblings:', sibErr);
      return NextResponse.json({ error: 'Falha ao resolver viagens irmãs' }, { status: 500 });
    }
    const siblingIds = siblings?.map(s => s.id) ?? [trip_id];
    const nowIso = new Date().toISOString();

    const [{ data: taken, error: takenErr }, { data: holds, error: holdsErr }] =
      await Promise.all([
        supabase
          .from('tickets')
          .select('seat_number')
          .in('trip_id', siblingIds)
          .in('status', ['active', 'pending', 'used']),
        supabase
          .from('online_bookings')
          .select('seat_number, expires_at')
          .in('trip_id', siblingIds)
          .gt('expires_at', nowIso),
      ]);

    if (takenErr || holdsErr) {
      console.error('[fast-ticket] occupancy:', takenErr || holdsErr);
      return NextResponse.json({ error: 'Falha ao ler ocupação' }, { status: 500 });
    }

    const occupied = new Set();
    for (const t of taken || []) occupied.add(t.seat_number);
    for (const h of holds || []) occupied.add(h.seat_number);

    const freeSeats = [];
    for (let n = 2; n <= busCapacity; n++) {
      if (!occupied.has(n)) freeSeats.push(n);
    }
    if (freeSeats.length === 0) {
      return NextResponse.json({ error: 'Viagem cheia — sem lugares' }, { status: 409 });
    }

    // 4. Escolher um assento aleatório livre
    const seat_number = freeSeats[Math.floor(Math.random() * freeSeats.length)];

    // 5. Criar o bilhete (triggers da DB geram ticket_number e SMS)
    const payment_status = payment_method === 'cash' ? 'paid' : 'pending';
    const finalReference =
      payment_method === 'referencia'
        ? (payment_reference || generateReferenceCode())
        : null;

    let promotion = null;
    if (String(promotion_code || '').trim()) {
      const { data, error } = await pricingAdmin.rpc('resolve_promotion_for_ticket', {
        p_code: String(promotion_code).trim().toUpperCase(),
        p_base_fare_kz: Number(trip.price_usd),
        p_passenger_id: passengerId,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      promotion = Array.isArray(data) ? data[0] : data;
    }
    const amountDue = Number(promotion?.amount_due_kz ?? trip.price_usd);

    const { data: newTicket, error: ticketErr } = await supabase
      .from('tickets')
      .insert({
        trip_id,
        passenger_id: passengerId,
        booked_by: user.id,
        booking_source: 'agent',
        seat_class: trip.seat_class,
        seat_number,
        qr_code_data: crypto.randomUUID(),
        price_paid_usd: amountDue,
        promotion_code_id: promotion?.promotion_code_id || null,
        promotion_code_snapshot: promotion?.normalized_code || null,
        base_fare_kz: Number(trip.price_usd),
        passenger_discount_kz: Number(promotion?.passenger_discount_kz || 0),
        affiliate_commission_kz: Number(promotion?.commission_amount_kz || 0),
        attribution_source: promotion ? 'agent_web' : null,
        payment_status,
        payment_method,
        payment_reference: finalReference,
      })
      .select('id, ticket_number')
      .single();

    if (ticketErr || !newTicket) {
      console.error('[fast-ticket] ticket insert:', ticketErr);
      const limitReached = ticketErr?.code === 'P0001' && /sales limit/i.test(ticketErr.message || '');
      return NextResponse.json(
        { error: limitReached ? 'A viagem atingiu o limite de vendas definido.' : 'Erro ao criar bilhete' },
        { status: limitReached ? 409 : 500 }
      );
    }

    // 6. Transação de pagamento (auditoria — mesmo padrão que /api/create-ticket)
    const { error: payErr } = await supabase
      .from('payment_transactions')
      .insert({
        ticket_id: newTicket.id,
        amount_usd: amountDue,
        currency: 'AOA',
        payment_method,
        transaction_id: finalReference || null,
        status: payment_method === 'cash' ? 'completed' : 'pending',
        promotion_code_id: promotion?.promotion_code_id || null,
        base_amount_kz: Number(trip.price_usd),
        discount_amount_kz: Number(promotion?.passenger_discount_kz || 0),
        affiliate_commission_kz: Number(promotion?.commission_amount_kz || 0),
        attribution_source: promotion ? 'agent_web' : null,
      });
    if (payErr) {
      console.error('[fast-ticket] payment_transactions:', payErr);
      // bilhete já existe, só logar
    }

    return NextResponse.json({
      ticket_id: newTicket.id,
      ticket_number: newTicket.ticket_number,
      passenger_id: passengerId,
      passenger_already_existed: passengerAlreadyExisted,
      seat_number,
      payment_reference: finalReference,
    });
  } catch (err) {
    console.error('[fast-ticket] unhandled:', err);
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 });
  }
}
