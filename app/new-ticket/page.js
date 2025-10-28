'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { useTicketWizardStore } from '@/lib/store';
import { TripPickerCard } from '@/components/TripPickerCard';
import { SeatPickerCard } from '@/components/SeatPickerCard';
import { PassengerFormCard } from '@/components/PassengerFormCard';
import { PaymentMethodCard } from '@/components/PaymentMethodCard';
import { ConfirmAndPrintCard } from '@/components/ConfirmAndPrintCard';
import { supabase } from '@/lib/supabase';

const steps = [
  { id: 1, title: 'Viagem', component: TripPickerCard },
  { id: 2, title: 'Assento', component: SeatPickerCard },
  { id: 3, title: 'Passageiro', component: PassengerFormCard },
  { id: 4, title: 'Pagamento', component: PaymentMethodCard },
  { id: 5, title: 'Confirmar', component: ConfirmAndPrintCard },
];

export default function NewTicketPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tripIdParam = searchParams.get('tripId');

  const {
    currentStep,
    setTrip,
    setSeat,
    setPassenger,
    setPayment,
    nextStep,
    prevStep,
    setStep,
    reset,
    selectedTrip,
    selectedSeat,
    passenger,
    payment,
    isTripSelected,
    isSeatSelected,
    isPassengerComplete,
    isPaymentValid,
  } = useTicketWizardStore();

  const [loading, setLoading] = useState(false);

  const loadTripFromParam = async (tripId) => {
    try {
      // Load trip details from API
      const response = await fetch(`/api/get-trip?tripId=${tripId}`);
      if (response.ok) {
        const data = await response.json();
        setTrip(data.trip);
      }
    } catch (error) {
      console.error('Error loading trip:', error);
    }
  };

  useEffect(() => {
    // If tripId is provided in URL, load it and set as selected
    if (tripIdParam && !selectedTrip) {
      loadTripFromParam(tripIdParam);
    }
  }, [tripIdParam, selectedTrip]);

  const currentStepData = steps.find(s => s.id === currentStep);
  const CurrentComponent = currentStepData?.component;

  const handleNext = () => {
    if (currentStep < 5) {
      nextStep();
    }
  };

  const handlePrev = () => {
    if (currentStep > 1) {
      prevStep();
    }
  };

  const canProceedToNext = () => {
    switch (currentStep) {
      case 1: return isTripSelected;
      case 2: return isSeatSelected;
      case 3: return isPassengerComplete;
      case 4: return isPaymentValid;
      case 5: return true;
      default: return false;
    }
  };

  const progressValue = (currentStep / steps.length) * 100;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Progress Indicator */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-gray-900">Nova Venda de Bilhete</h1>
            <div className="text-sm text-gray-500">
              Passo {currentStep} de {steps.length}
            </div>
          </div>

          <Progress value={progressValue} className="w-full mb-4" />

          <div className="flex justify-between">
            {steps.map((step) => (
              <div key={step.id} className="flex items-center">
                <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                  step.id < currentStep
                    ? 'bg-brand-500 text-white'
                    : step.id === currentStep
                    ? 'bg-brand-100 text-brand-700 border-2 border-brand-500'
                    : 'bg-gray-200 text-gray-600'
                }`}>
                  {step.id < currentStep ? <Check className="w-4 h-4" /> : step.id}
                </div>
                <span className={`ml-2 text-sm ${
                  step.id <= currentStep ? 'text-gray-900 font-medium' : 'text-gray-500'
                }`}>
                  {step.title}
                </span>
                {step.id < steps.length && (
                  <div className={`w-12 h-0.5 mx-2 ${
                    step.id < currentStep ? 'bg-brand-500' : 'bg-gray-200'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Current Step Content */}
      <Card>
        <CardHeader>
          <CardTitle>{currentStepData?.title}</CardTitle>
        </CardHeader>
        <CardContent>
          {CurrentComponent && <CurrentComponent />}
        </CardContent>
      </Card>

      {/* Navigation Buttons */}
      <div className="flex justify-between">
        <Button
          onClick={handlePrev}
          disabled={currentStep === 1}
          variant="outline"
          className="flex items-center"
        >
          <ChevronLeft className="w-4 h-4 mr-2" />
          Anterior
        </Button>

        <Button
          onClick={
            currentStep === 5
              ? () => router.push('/dashboard')
              : handleNext
          }
          disabled={!canProceedToNext() || (currentStep === 5 && loading)}
          className="bg-brand-500 hover:bg-brand-600"
        >
          {currentStep === 5 ? 'Ir para Painel' : 'Próximo'}
          {currentStep < 5 && <ChevronRight className="w-4 h-4 ml-2" />}
        </Button>
      </div>
    </div>
  );
}
