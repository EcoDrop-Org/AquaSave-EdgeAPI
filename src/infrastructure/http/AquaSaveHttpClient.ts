import axios, { type AxiosInstance } from 'axios';

export type TelemetryPayload = {
  soilMoisturePct: number;
  temperatureC?: number;
  humidityPct?: number;
  pumpOn?: boolean;
  flowRateLMin?: number;
  batteryPct?: number;
  recordedAt?: string;
};

export type DeviceStatusPayload = {
  status: 'online' | 'offline' | 'connecting' | 'error';
  firmwareVersion?: string;
};

export type EdgeCommand = {
  id: string;
  deviceId: string;
  type: 'open-valve' | 'close-valve';
  status: 'pending' | 'acknowledged' | 'failed';
  issuedAt: string;
  acknowledgedAt?: string;
};

/**
 * Infraestructura: cliente HTTP del backend AquaSave.
 *
 * Encapsula todas las llamadas REST a /api/edge/* para que los handlers
 * de aplicacion no conozcan detalles de transporte. La API key se envia
 * en el header `x-edge-api-key` (ver EDGE_API_KEY en el backend).
 */
export class AquaSaveHttpClient {
  private readonly http: AxiosInstance;

  constructor(baseURL: string, edgeApiKey?: string) {
    this.http = axios.create({
      baseURL,
      timeout: 10_000,
      headers: {
        'Content-Type': 'application/json',
        ...(edgeApiKey ? { 'x-edge-api-key': edgeApiKey } : {}),
      },
    });
  }

  /** POST /api/edge/devices/{id}/telemetry — reporta lecturas del ESP32 */
  async postTelemetry(
    deviceId: string,
    payload: TelemetryPayload,
  ): Promise<void> {
    await this.http.post(`/api/edge/devices/${deviceId}/telemetry`, payload);
  }

  /** POST /api/edge/devices/{id}/status — reporta online/offline */
  async postStatus(
    deviceId: string,
    payload: DeviceStatusPayload,
  ): Promise<void> {
    await this.http.post(`/api/edge/devices/${deviceId}/status`, payload);
    console.log(`[HTTP] Estado '${payload.status}' reportado (${deviceId}).`);
  }

  /** GET /api/edge/devices/{id}/commands/pending — comandos en cola */
  async getPendingCommands(deviceId: string): Promise<EdgeCommand[]> {
    const res = await this.http.get(
      `/api/edge/devices/${deviceId}/commands/pending`,
    );
    return (res.data as { commands: EdgeCommand[] }).commands ?? [];
  }

  /** POST /api/edge/devices/{id}/commands/{commandId}/ack */
  async acknowledgeCommand(deviceId: string, commandId: string): Promise<void> {
    await this.http.post(
      `/api/edge/devices/${deviceId}/commands/${commandId}/ack`,
    );
    console.log(`[HTTP] Comando ${commandId} confirmado al backend.`);
  }
}
