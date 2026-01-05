import { NextResponse } from 'next/server';
import { requireAgentRole } from '@/lib/server-auth';
import crypto from 'crypto';

// POST /api/create-passenger
// body JSON esperado (mínimo):
// {
//   "first_name": "João",
//   "last_name": "Silva",
//   "phone_number": "923000111",
//   // opcional:
//   "national_id": "123456789LA045",
//   "date_of_birth": "1995-01-20",
//   "emergency_contact_name": "Mãe",
//   "emergency_contact_phone": "923111222",
//   "passport_number": "AB123456",
//   "nationality": "AO"
// }
export async function POST(req) {
  try {
    const { supabase } = await requireAgentRole();
    const body = await req.json();

    const {
      first_name,
      last_name,
      phone_number,
      national_id,
      date_of_birth,
      emergency_contact_name,
      emergency_contact_phone,
      passport_number,
      nationality,
    } = body;

    if (!first_name || !last_name || !phone_number) {
      return NextResponse.json(
        { error: 'first_name, last_name e phone_number são obrigatórios' },
        { status: 400 }
      );
    }

    // Normalize phone numbers to include Angola country code
    const normalizePhoneNumber = (phone) => {
      if (!phone) return phone;
      const cleaned = phone.replace(/\D/g, '');
      // If it doesn't start with 244 and is 9 digits starting with 9, add 244
      if (!cleaned.startsWith('244') && cleaned.length === 9 && cleaned.startsWith('9')) {
        return `244${cleaned}`;
      }
      return cleaned;
    };

    const normalizedPhoneNumber = normalizePhoneNumber(phone_number);
    const normalizedEmergencyPhone = normalizePhoneNumber(emergency_contact_phone);

    // Ver se já existe um passageiro com este número (usar número normalizado)
    const { data: existingProfile, error: existingErr } = await supabase
      .from('profiles')
      .select('id, phone_number, role, first_name, last_name')
      .eq('phone_number', normalizedPhoneNumber)
      .eq('role', 'passenger')
      .limit(1)
      .maybeSingle();

    if (existingErr && existingErr.code !== 'PGRST116') {
      console.error('existingErr:', existingErr);
    }

    if (existingProfile) {
      // Já existe, então só garante que há linha em passengers
      await supabase
        .from('passengers')
        .upsert({
          id: existingProfile.id,
          emergency_contact_name: emergency_contact_name || null,
          emergency_contact_phone: emergency_contact_phone || null,
          passport_number: passport_number || null,
          nationality: nationality || null,
        });

      return NextResponse.json({
        passenger_id: existingProfile.id,
        first_name: existingProfile.first_name,
        last_name: existingProfile.last_name,
        phone_number: existingProfile.phone_number,
        already_existed: true,
      });
    }

    // 1) Criar utilizador no Auth
    // Vamos gerar um email fake só para satisfazer createUser()
    const randomSuffix = crypto.randomUUID();
    const pseudoEmail = `passageiro+${phone_number}-${randomSuffix}@temp.local`;

    const { data: userRes, error: userErr } =
      await supabase.auth.admin.createUser({
        email: pseudoEmail,
        email_confirm: true,
        user_metadata: {
          role: 'passenger',
          first_name,
          last_name,
          phone_number: normalizedPhoneNumber,
        },
      });

    if (userErr) {
      console.error('userErr:', userErr);
      return NextResponse.json(
        { error: 'Erro ao criar utilizador/passenger' },
        { status: 500 }
      );
    }

    const passengerId = userRes.user.id;

    // 2) Atualizar profile criado pelo trigger com info extra (national_id, dob, etc)
    await supabase
      .from('profiles')
      .update({
        national_id: national_id || null,
        date_of_birth: date_of_birth || null,
      })
      .eq('id', passengerId);

    // 3) Criar/atualizar row em passengers (contacto emergência etc)
    await supabase.from('passengers').upsert({
      id: passengerId,
      emergency_contact_name: emergency_contact_name || null,
      emergency_contact_phone: normalizedEmergencyPhone || null,
      passport_number: passport_number || null,
      nationality: nationality || null,
    });

    return NextResponse.json({
      passenger_id: passengerId,
      first_name,
      last_name,
      phone_number: normalizedPhoneNumber,
      already_existed: false,
    });
  } catch (err) {
    console.error('Unhandled /create-passenger error:', err);
    return NextResponse.json(
      { error: 'Erro interno ao criar passageiro' },
      { status: 500 }
    );
  }
}
