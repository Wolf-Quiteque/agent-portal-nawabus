'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTicketWizardStore } from '@/lib/store';

// this component does 3 things:
// 1. procura passageiro por número
// 2. se já existe -> usa esse passageiro
// 3. se não existe -> deixa criar e só então avança

export function PassengerFormCard() {
  const {
    passenger,
    setPassenger,
    nextStep,
  } = useTicketWizardStore();

  // local UI state
  const [searchPhone, setSearchPhone] = useState('');
  const [searching, setSearching] = useState(false);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [foundExisting, setFoundExisting] = useState(false);
  const [creating, setCreating] = useState(false);

  // local draft for new passenger fields
  // (mirror of what's in store, but we mutate locally before final save)
  const [firstName, setFirstName] = useState(passenger.first_name || '');
  const [lastName, setLastName] = useState(passenger.last_name || '');
  const [phoneNumber, setPhoneNumber] = useState(passenger.phone_number || '');
  const [passportNumber, setPassportNumber] = useState(passenger.passport_number || '');
  const [nationality, setNationality] = useState(passenger.nationality || '');
  const [emergencyName, setEmergencyName] = useState(passenger.emergency_contact_name || '');
  const [emergencyPhone, setEmergencyPhone] = useState(passenger.emergency_contact_phone || '');

  // 1. Procurar passageiro existente
  const handleSearch = async () => {
    if (!searchPhone.trim()) return;

    setSearching(true);
    try {
      const res = await fetch(
        `/api/search-passenger?phone=${encodeURIComponent(searchPhone.trim())}`
      );
      const data = await res.json();

      if (data.found) {
        // passageiro JÁ existe
        // data.passenger vem com { id, first_name, last_name, phone_number, ... }
        setPassenger(data.passenger);

        // reflect in our local form just for display if we want
        setFirstName(data.passenger.first_name || '');
        setLastName(data.passenger.last_name || '');
        setPhoneNumber(data.passenger.phone_number || '');
        setPassportNumber(data.passenger.passport_number || '');
        setNationality(data.passenger.nationality || '');
        setEmergencyName(data.passenger.emergency_contact_name || '');
        setEmergencyPhone(data.passenger.emergency_contact_phone || '');

        setFoundExisting(true);
        setShowCreateForm(false);
      } else {
        // não existe. vamos preparar criação
        setFoundExisting(false);
        setShowCreateForm(true);

        // pré-preencher telefone
        setPhoneNumber(searchPhone.trim());
        setFirstName('');
        setLastName('');
        setPassportNumber('');
        setNationality('');
        setEmergencyName('');
        setEmergencyPhone('');

        // também limpar no store por segurança
        setPassenger({
          id: undefined,
          first_name: '',
          last_name: '',
          phone_number: searchPhone.trim(),
          passport_number: '',
          nationality: '',
          emergency_contact_name: '',
          emergency_contact_phone: '',
        });
      }
    } catch (err) {
      console.error('Erro ao procurar passageiro:', err);
      // fallback: se falhou a procura tratamos como "não existe"
      setFoundExisting(false);
      setShowCreateForm(true);
      setPhoneNumber(searchPhone.trim());
    } finally {
      setSearching(false);
    }
  };

  // 2. Criar passageiro novo SE ele não existe
  const createPassengerIfNeeded = async () => {
    // se já existe, não criamos nada
    if (foundExisting && passenger?.id) {
      return { ok: true, id: passenger.id };
    }

    // se não existe, precisamos dos campos obrigatórios
    if (!firstName || !lastName || !phoneNumber) {
      return { ok: false, error: 'Campos obrigatórios em falta' };
    }

    setCreating(true);
    try {
      const res = await fetch('/api/create-passenger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          phone_number: phoneNumber,
          passport_number: passportNumber || '',
          nationality: nationality || '',
          emergency_contact_name: emergencyName || '',
          emergency_contact_phone: emergencyPhone || '',
          // national_id / BI, date_of_birth, etc, se quiseres enviar mais tarde
        }),
      });

      if (!res.ok) {
        console.error('Falha ao criar passageiro');
        return { ok: false, error: 'Falha ao criar passageiro' };
      }

      const data = await res.json();
      // resposta esperada:
      // {
      //   passenger_id: "...uuid...",
      //   first_name: "...",
      //   last_name: "...",
      //   phone_number: "...",
      //   already_existed: false | true
      // }

      // garante que o wizard store tem o ID certo
      setPassenger({
        id: data.passenger_id,
        first_name: firstName,
        last_name: lastName,
        phone_number: phoneNumber,
        passport_number: passportNumber || '',
        nationality: nationality || '',
        emergency_contact_name: emergencyName || '',
        emergency_contact_phone: emergencyPhone || '',
      });

      return { ok: true, id: data.passenger_id };
    } catch (err) {
      console.error('Erro ao criar passageiro:', err);
      return { ok: false, error: 'Erro ao criar passageiro' };
    } finally {
      setCreating(false);
    }
  };

  // 3. Continuar para o próximo passo do wizard
  const handleContinue = async () => {
    const result = await createPassengerIfNeeded();
    if (result.ok) {
      // temos passageiro válido no store, com .id
      nextStep();
    } else {
      console.warn('Não foi possível continuar:', result.error);
    }
  };

  // UI states:
  // - estado inicial: barra de pesquisa
  // - se foundExisting === true: já temos passageiro, só mostrar o resumo + botão continuar
  // - se foundExisting === false && showCreateForm === true: mostramos formulário para criar

  return (
    <div className="space-y-6">
      {/* Pesquisa pelo telefone */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <h3 className="font-semibold">Passageiro</h3>
          <p className="text-sm text-gray-600">
            Procura pelo número de telefone do passageiro. Se não existir, vais poder registar.
          </p>

          <div className="flex gap-2">
            <Input
              placeholder="Telefone do Passageiro"
              value={searchPhone}
              onChange={(e) => setSearchPhone(e.target.value)}
              className="max-w-[200px]"
            />
            <Button
              onClick={handleSearch}
              disabled={searching || !searchPhone.trim()}
              className="bg-brand-500 hover:bg-brand-600"
            >
              {searching ? 'A procurar...' : 'Procurar'}
            </Button>
          </div>

          {foundExisting && passenger?.id && (
            <div className="text-sm bg-brand-50 border border-brand-200 rounded p-3 text-brand-700">
              Passageiro encontrado:
              <div className="font-medium">
                {passenger.first_name} {passenger.last_name}
              </div>
              <div>{passenger.phone_number}</div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Formulário só se NÃO encontrou */}
      {!foundExisting && showCreateForm && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <h4 className="font-semibold">Novo Passageiro</h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Nome</Label>
                <Input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Nome próprio"
                />
              </div>

              <div>
                <Label>Apelido</Label>
                <Input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Apelido"
                />
              </div>

              <div>
                <Label>Telefone</Label>
                <Input
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="Telefone"
                />
              </div>

              <div>
                <Label>Passaporte / BI (opcional)</Label>
                <Input
                  value={passportNumber}
                  onChange={(e) => setPassportNumber(e.target.value)}
                  placeholder="Documento"
                />
              </div>

              <div>
                <Label>Nacionalidade (opcional)</Label>
                <Input
                  value={nationality}
                  onChange={(e) => setNationality(e.target.value)}
                  placeholder="Ex: AO"
                />
              </div>

              <div>
                <Label>Contacto de Emergência (Nome)</Label>
                <Input
                  value={emergencyName}
                  onChange={(e) => setEmergencyName(e.target.value)}
                  placeholder="Mãe / Esposo / etc"
                />
              </div>

              <div>
                <Label>Contacto de Emergência (Telefone)</Label>
                <Input
                  value={emergencyPhone}
                  onChange={(e) => setEmergencyPhone(e.target.value)}
                  placeholder="Contacto emergência"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Botão continuar */}
      <div className="flex justify-center">
        <Button
          onClick={handleContinue}
          disabled={creating || (!foundExisting && !firstName) || (!foundExisting && !lastName) || (!foundExisting && !phoneNumber)}
          className="bg-brand-500 hover:bg-brand-600 px-8"
        >
          {creating ? 'A criar...' : 'Continuar'}
        </Button>
      </div>
    </div>
  );
}
