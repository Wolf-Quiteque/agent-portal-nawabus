// src/utils/bixolonWebPrint.js

function isBixolonSdkAvailable() {
  return (
    typeof window !== "undefined" &&
    typeof window.requestPrint === "function" &&
    typeof window.getPosData === "function" &&
    typeof window.printText === "function"
  );
}

function buildServerUrl(proto, host, port) {
  return `${proto}://${host}:${port}/WebPrintSDK/`;
}

function configureBixolonConnection({ host, port, preferredProtocols }) {
  for (const proto of preferredProtocols) {
    const url = buildServerUrl(proto, host, port);

    // Some versions expose these setters
    if (typeof window.setConnectionMode === "function") {
      try { window.setConnectionMode(proto); } catch {}
    }
    if (typeof window.setWebServerUrl === "function") {
      try { window.setWebServerUrl(url); } catch {}
    }

    // Many builds rely on a global variable
    window.serverURL = url;
  }
}

function buildTicketCommands(ticket) {
  if (typeof window.clearBuffer === "function") {
    try { window.clearBuffer(); } catch {}
  }

  window.printText("NAWABUS\n", 1, 1, true, false, false, 0, 1);
  window.printText("Bilhete de Viagem\n\n", 1, 1, true, false, false, 0, 0);

  window.printText(`Bilhete: ${ticket.ticket_number}\n`, 0, 0, true, false, false, 0, 0);
  window.printText(`Passageiro: ${ticket.passenger_name}\n`, 0, 0, false, false, false, 0, 0);
  window.printText(`Telefone: ${ticket.passenger_phone}\n\n`, 0, 0, false, false, false, 0, 0);

  window.printText(`Rota: ${ticket.origin} -> ${ticket.destination}\n`, 0, 0, false, false, false, 0, 0);
  window.printText(`Partida: ${ticket.departure_time}\n`, 0, 0, false, false, false, 0, 0);
  window.printText(`Lugar: ${ticket.seat_number}\n\n`, 0, 0, true, false, false, 0, 0);

  window.printText(`Valor: ${Number(ticket.price_kz).toLocaleString()} Kz\n`, 0, 0, true, false, false, 0, 0);
  window.printText(`Pagamento: ${ticket.payment_status}\n\n`, 0, 0, false, false, false, 0, 0);

  window.printQRCode(String(ticket.id), 0, 1, 7, 1);
  window.printText("\n\n", 0, 0, false, false, false, 0, 0);
}

export async function bixolonPrintTicket(ticket, options = {}) {
  const logicalName = options.logicalName || process.env.NEXT_PUBLIC_BXL_LOGICAL_NAME || "Printer1";
  const host = options.host || process.env.NEXT_PUBLIC_BXL_HOST || "127.0.0.1";
  const port = Number(options.port || process.env.NEXT_PUBLIC_BXL_PORT || "18080");
  const timeoutMs = Number(options.timeoutMs || 7000);

  if (!isBixolonSdkAvailable()) {
    throw new Error(
      "BIXOLON Web Print SDK não disponível. Abra esta página dentro do app BIXOLON Web Print SDK e registre a impressora (Logical Name)."
    );
  }

  const pageIsHttps = window.location.protocol === "https:";
  const preferredProtocols = pageIsHttps
    ? ["wss", "https", "ws", "http"]
    : ["ws", "http", "wss", "https"];

  configureBixolonConnection({ host, port, preferredProtocols });

  if (typeof window.setPosId === "function") {
    try { window.setPosId("POSPrinter"); } catch {}
  }

  buildTicketCommands(ticket);

  const data = window.getPosData();
  if (!data) throw new Error("Falha ao gerar dados (getPosData retornou vazio).");

  await new Promise((resolve, reject) => {
    let done = false;

    const t = setTimeout(() => {
      if (done) return;
      done = true;
      reject(
        new Error(
          "Timeout no Web Print SDK. Verifique no app: porta do Web Server, Use Certificate (se site é HTTPS) e o Logical Name."
        )
      );
    }, timeoutMs);

    try {
      window.requestPrint(logicalName, data, (result) => {
        if (done) return;
        done = true;
        clearTimeout(t);
        resolve(result);
      });
    } catch (err) {
      if (done) return;
      done = true;
      clearTimeout(t);
      reject(err);
    }
  });

  return { success: true };
}
