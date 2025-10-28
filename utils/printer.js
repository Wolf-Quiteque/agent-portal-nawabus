/**
 * Printer utility for thermal ticket printing
 * Supports WebUSB integration for direct printer connection
 * Falls back to browser print
 */

class ThermalPrinter {
  constructor() {
    this.device = null;
    this.interface = null;
    this.connected = false;
  }

  /**
   * Check if WebUSB is supported
   */
  isWebUSBSupported() {
    return 'usb' in navigator;
  }

  /**
   * Request permission and connect to USB printer
   */
  async connectPrinter() {
    if (!this.isWebUSBSupported()) {
      throw new Error('WebUSB não é suportado neste navegador');
    }

    try {
      // Request device (thermal printers typically use class 7 - printer class)
      this.device = await navigator.usb.requestDevice({
        filters: [
          { vendorId: 0x04b8, productId: 0x0202 }, // Epson TM-series example
          { vendorId: 0x04b8, productId: 0x0e03 }, // Epson TM-T88 series
          { classCode: 7 }, // Printer class
        ]
      });

      await this.device.open();

      // Select configuration and interface
      if (this.device.configuration === null) {
        await this.device.selectConfiguration(1);
      }

      this.interface = this.device.configuration.interfaces.find(iface => iface.alternates.length > 0);
      if (!this.interface) {
        throw new Error('Nenhuma interface adequada encontrada');
      }

      await this.device.claimInterface(this.interface.interfaceNumber);
      await this.device.selectAlternateInterface(this.interface.interfaceNumber, 0);

      this.connected = true;
      return true;
    } catch (error) {
      console.error('Erro ao conectar impressora:', error);
      this.connected = false;
      throw error;
    }
  }

  /**
   * Disconnect from printer
   */
  async disconnectPrinter() {
    if (this.device && this.connected) {
      try {
        await this.device.close();
        this.connected = false;
      } catch (error) {
        console.error('Erro ao desconectar impressora:', error);
      }
    }
  }

  /**
   * Send ESC/POS commands directly to printer
   */
  async sendToPrinter(data) {
    if (!this.connected || !this.device) {
      throw new Error('Impressora não conectada');
    }

    try {
      const endpoint = this.interface.endpoints.find(endpoint => endpoint.direction === 'out');
      if (!endpoint) {
        throw new Error('Endpoint de saída não encontrado');
      }

      await this.device.transferOut(endpoint.endpointNumber, data);
    } catch (error) {
      console.error('Erro ao enviar dados para impressora:', error);
      throw error;
    }
  }

  /**
   * ESC/POS command constants
   */
  static ESC_POS = {
    INIT: [0x1B, 0x40],                    // Initialize printer
    CUT: [0x1D, 0x56, 0x42, 0x00],        // Full cut
    FEED: [0x1B, 0x64, 0x04],             // Feed 4 lines
    ALIGN_CENTER: [0x1B, 0x61, 0x01],     // Center alignment
    ALIGN_LEFT: [0x1B, 0x61, 0x00],       // Left alignment
    BOLD_ON: [0x1B, 0x45, 0x01],          // Bold on
    BOLD_OFF: [0x1B, 0x45, 0x00],         // Bold off
    FONT_A: [0x1B, 0x4D, 0x00],           // Font A
    FONT_B: [0x1B, 0x4D, 0x01],           // Font B (smaller)
  };

  /**
   * Convert text to ESC/POS format with UTF-8 encoding
   */
  textToEscPos(text) {
    const encoder = new TextEncoder('utf-8');
    const utf8Bytes = encoder.encode(text);

    // For simple ASCII text, we can limit to basic characters
    // For proper ESC/POS UTF-8 support, additional command sequences may be needed
    return Array.from(utf8Bytes);
  }

  /**
   * Generate ESC/POS data for ticket printing
   */
  generateTicketEscPos(ticketData) {
    const commands = [];

    // Initialize
    commands.push(...ThermalPrinter.ESC_POS.INIT);

    // Center align header
    commands.push(...ThermalPrinter.ESC_POS.ALIGN_CENTER);
    commands.push(...ThermalPrinter.ESC_POS.BOLD_ON);

    // Header
    commands.push(...this.textToEscPos('NAWABUS\n'));
    commands.push(...this.textToEscPos('Bilhete de Viagem\n'));

    // Line separator
    commands.push(0x0A, 0x0A); // Two line feeds

    // Left align for details
    commands.push(...ThermalPrinter.ESC_POS.ALIGN_LEFT);
    commands.push(...ThermalPrinter.ESC_POS.FONT_A);

    // Ticket details
    const details = [
      `No Bilhete: ${ticketData.ticket_number}`,
      `Passageiro: ${ticketData.passenger_name}`,
      `Telefone: ${ticketData.passenger_phone}`,
      `Origem -> Destino: ${ticketData.origin} -> ${ticketData.destination}`,
      `Partida: ${ticketData.departure_time}`,
      `Lugar: ${ticketData.seat_number}`,
      `Valor Pago: ${ticketData.price_kz} Kz`,
      `Pagamento: ${ticketData.payment_status}`,
    ];

    details.forEach(line => {
      commands.push(...this.textToEscPos(line));
      commands.push(0x0A); // Line feed
    });

    // Bold on for footer
    commands.push(...ThermalPrinter.ESC_POS.BOLD_ON);
    commands.push(...ThermalPrinter.ESC_POS.ALIGN_CENTER);
    commands.push(...this.textToEscPos('Viajar aqui e facil!'));

    // Feed and cut
    commands.push(...ThermalPrinter.ESC_POS.FEED);
    commands.push(...ThermalPrinter.ESC_POS.CUT);

    return new Uint8Array(commands);
  }

  /**
   * Print ticket using direct USB connection
   */
  async printTicketUSB(ticketData) {
    try {
      if (!this.connected) {
        await this.connectPrinter();
      }

      const escPosData = this.generateTicketEscPos(ticketData);
      await this.sendToPrinter(escPosData);

      console.log('Bilhete enviado para impressora USB');
      return true;
    } catch (error) {
      console.error('Erro ao imprimir na USB:', error);
      throw error;
    }
  }

  /**
   * Fallback browser print method
   */
  printTicketBrowser(ticketData) {
    // Create a hidden iframe for printing
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

    // Generate simplified HTML for thermal printer (58mm width)
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>NawaBus Bilhete</title>
        <style>
          @media print {
            @page {
              size: 58mm auto;
              margin: 0;
            }
            body {
              margin: 0;
              font-family: monospace;
              font-size: 12px;
              line-height: 1.2;
            }
          }
          .ticket {
            width: 48mm;
            padding: 5mm;
            text-align: center;
          }
          .header {
            font-weight: bold;
            margin-bottom: 5px;
          }
          .details {
            text-align: left;
            margin: 5px 0;
          }
          .footer {
            font-weight: bold;
            margin-top: 10px;
          }
        </style>
      </head>
      <body>
        <div class="ticket">
          <div class="header">
            NAWABUS<br>
            Bilhete de Viagem
          </div>
          <div class="details">
            <br>№ Bilhete: ${ticketData.ticket_number}
            <br>Passageiro: ${ticketData.passenger_name}
            <br>Telefone: ${ticketData.passenger_phone}
            <br>Origem → Destino: ${ticketData.origin} → ${ticketData.destination}
            <br>Partida: ${ticketData.departure_time}
            <br>Lugar: ${ticketData.seat_number}
            <br>Valor Pago: ${ticketData.price_kz} Kz
            <br>Pagamento: ${ticketData.payment_status}
          </div>
          <div class="footer">
            Viajar aqui é fácil!
          </div>
        </div>
      </body>
      </html>
    `;

    iframeDoc.open();
    iframeDoc.write(htmlContent);
    iframeDoc.close();

    // Wait for content to load then print
    iframe.onload = () => {
      iframe.contentWindow.print();
      document.body.removeChild(iframe);
    };

    return true;
  }

  /**
   * Main print method with automatic fallback
   */
  async printTicket(ticketData) {
    try {
      // Try USB printing first
      if (this.isWebUSBSupported()) {
        try {
          await this.printTicketUSB(ticketData);
          return { success: true, method: 'usb' };
        } catch (usbError) {
          console.warn('USB printing failed, falling back to browser print:', usbError);
          // Fall through to browser print
        }
      }

      // Fallback to browser print
      await this.printTicketBrowser(ticketData);
      return { success: true, method: 'browser' };
    } catch (error) {
      console.error('Erro ao imprimir bilhete:', error);
      return { success: false, error: error.message };
    }
  }
}

// Create singleton instance
const thermalPrinter = new ThermalPrinter();

export default thermalPrinter;
