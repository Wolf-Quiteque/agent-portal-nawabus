import { create } from 'zustand';

const useTicketWizardStore = create((set, get) => ({
  // Selected trip
  selectedTrip: null,
  
  // Selected seat
  selectedSeat: null,
  
  // Passenger info
  passenger: {
    id: null,
    first_name: '',
    last_name: '',
    phone_number: '',
    document: '',
    passport: '',
  },
  
  // Payment details
  payment: {
    method: 'cash', // 'cash' or 'referencia'
    reference: '',
  },
  
  // Created ticket
  createdTicketId: null,
  
  // Wizard step
  currentStep: 1,
  
  // Actions
  setTrip: (trip) => set({ selectedTrip: trip }),
  setSeat: (seat) => set({ selectedSeat: seat }),
  setPassenger: (passenger) => set({ passenger }),
  setPayment: (payment) => set({ payment }),
  setCreatedTicketId: (id) => set({ createdTicketId: id }),
  nextStep: () => set((state) => ({ currentStep: Math.min(state.currentStep + 1, 5) })),
  prevStep: () => set((state) => ({ currentStep: Math.max(state.currentStep - 1, 1) })),
  setStep: (step) => set({ currentStep: step }),
  
  // Reset wizard
  reset: () => set({
    selectedTrip: null,
    selectedSeat: null,
    passenger: {
      id: null,
      first_name: '',
      last_name: '',
      phone_number: '',
      document: '',
      passport: '',
    },
    payment: {
      method: 'cash',
      reference: '',
    },
    createdTicketId: null,
    currentStep: 1,
  }),
  
  // Computed properties
  isTripSelected: () => !!get().selectedTrip,
  isSeatSelected: () => !!get().selectedSeat,
  isPassengerComplete: () => get().passenger.first_name && get().passenger.phone_number,
  isPaymentValid: () => {
    const payment = get().payment;
    if (payment.method === 'referencia') {
      return payment.reference.trim() !== '';
    }
    return true; // cash is always valid
  },
}));

export { useTicketWizardStore };
